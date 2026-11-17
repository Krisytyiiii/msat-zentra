// Advisory attendance analytics — mobile port of the web advisory desk
// (`frontend/src/app/teacher/advisory/attendance/*`).
//
// Contracts mirror the web service exactly:
//   GET /api/teacher/advisory/students          → advisory sections
//   GET /api/attendance/section-subject-matrix  → per-learner subject rates
// The matrix counts elapsed meetups inside each learner's own window
// (transferees start the day after enlistment), so nothing is recomputed here.

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/models.dart' show ApiException;

class AdvisoryAttendanceSubject {
  const AdvisoryAttendanceSubject({
    required this.id,
    required this.name,
    required this.code,
  });
  final String id;
  final String name;
  final String code;

  factory AdvisoryAttendanceSubject.fromJson(Map<String, dynamic> json) =>
      AdvisoryAttendanceSubject(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        code: json['code']?.toString() ?? '',
      );
}

class AdvisoryAttendanceStudent {
  const AdvisoryAttendanceStudent({
    required this.studentId,
    required this.name,
    required this.lrn,
    required this.mascot,
    required this.learnerType,
    required this.rates,
    required this.meetups,
    required this.presentMeetups,
  });
  final String studentId;
  final String name;
  final String lrn;

  /// Persisted sprite mascot (StudentMascot pool); null falls back to the
  /// derived avatar. Kept so the list can render it later without a re-parse.
  final String? mascot;

  /// Transferees are rated from their enlistment date, not the term start.
  final String? learnerType;

  /// Present rate per subject id; null means no marks (never a fabricated 0%).
  final Map<String, double?> rates;

  /// Elapsed meetups in this learner's own window, per subject.
  final Map<String, int> meetups;

  /// Meetups attended out of [meetups], per subject.
  final Map<String, int> presentMeetups;

  bool get isTransferee => learnerType == 'transferee';

  factory AdvisoryAttendanceStudent.fromJson(Map<String, dynamic> json) =>
      AdvisoryAttendanceStudent(
        studentId: json['studentId']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        lrn: json['lrn']?.toString() ?? '',
        mascot: json['mascot']?.toString(),
        learnerType: json['learnerType']?.toString(),
        rates: _rateMap(json['rates']),
        meetups: _countMap(json['meetups']),
        presentMeetups: _countMap(json['presentMeetups']),
      );
}

class SectionAttendanceMatrix {
  const SectionAttendanceMatrix({
    required this.sectionId,
    required this.sectionName,
    required this.termId,
    required this.subjects,
    required this.students,
  });
  final String sectionId;
  final String sectionName;
  final String? termId;
  final List<AdvisoryAttendanceSubject> subjects;
  final List<AdvisoryAttendanceStudent> students;

  factory SectionAttendanceMatrix.fromJson(Map<String, dynamic> json) {
    final rawStudents = json['students'];
    if (rawStudents != null && rawStudents is! List) {
      throw const FormatException('Invalid advisory attendance matrix');
    }
    return SectionAttendanceMatrix(
      sectionId: json['sectionId']?.toString() ?? '',
      sectionName: json['sectionName']?.toString() ?? '',
      termId: json['termId']?.toString(),
      subjects: [
        for (final raw in json['subjects'] as List? ?? [])
          if (raw is Map)
            AdvisoryAttendanceSubject.fromJson(
              Map<String, dynamic>.from(raw),
            ),
      ],
      students: [
        for (final raw in rawStudents as List? ?? [])
          if (raw is Map)
            AdvisoryAttendanceStudent.fromJson(
              Map<String, dynamic>.from(raw),
            ),
      ],
    );
  }
}

Map<String, double?> _rateMap(Object? raw) {
  final out = <String, double?>{};
  if (raw is Map) {
    for (final entry in raw.entries) {
      final key = entry.key;
      if (key is! String || key.isEmpty) continue;
      final value = entry.value;
      out[key] = value is num ? value.toDouble() : null;
    }
  }
  return out;
}

Map<String, int> _countMap(Object? raw) {
  final out = <String, int>{};
  if (raw is Map) {
    for (final entry in raw.entries) {
      final key = entry.key;
      if (key is! String || key.isEmpty) continue;
      final value = entry.value;
      if (value is num) out[key] = value.toInt();
    }
  }
  return out;
}

/// Mean present rate across subjects that actually have marks, matching the
/// web board (`attendanceOverall`).
double? attendanceOverall(Map<String, double?> rates, int subjectCount) {
  if (subjectCount == 0) return null;
  var sum = 0.0;
  var measured = 0;
  for (final rate in rates.values) {
    if (rate == null || !rate.isFinite) continue;
    sum += rate;
    measured += 1;
  }
  if (measured == 0) return null;
  return sum / measured;
}

/// Same totals the web board reports: every subject's elapsed meetups in this
/// learner's window (transferees start the day after enlistment).
({int present, int total}) attendanceMeetupTotals(
  AdvisoryAttendanceStudent student,
) {
  var present = 0;
  var total = 0;
  for (final count in student.meetups.values) {
    total += count;
  }
  for (final count in student.presentMeetups.values) {
    present += count;
  }
  return (present: present, total: total);
}

/// Integer percent used by every surface (web rounds once, in the cell).
int? attendancePercent(double? rate) =>
    rate == null || !rate.isFinite ? null : (rate * 100).round();

class AdvisoryAttendanceService {
  AdvisoryAttendanceService(this.api);
  final ApiClient api;

  Future<SectionAttendanceMatrix> matrix(String sectionId) async {
    if (sectionId.isEmpty) {
      throw ApiException('NO_SECTION', 'Choose an advisory section.');
    }
    try {
      final response = await api.dio.get(
        '/api/attendance/section-subject-matrix',
        queryParameters: {'sectionId': sectionId},
      );
      return SectionAttendanceMatrix.fromJson(
        Map<String, dynamic>.from(response.data as Map),
      );
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }
}

final advisoryAttendanceServiceProvider = Provider(
  (ref) => AdvisoryAttendanceService(ref.watch(apiClientProvider)),
);

/// Keyed by section so a slow response for the previously selected section can
/// never repaint the board with another section's learners.
final sectionAttendanceMatrixProvider =
    FutureProvider.family<SectionAttendanceMatrix, String>((
      ref,
      sectionId,
    ) async {
      final term = ref.watch(termProvider);
      final signedIn = ref.watch(
        authProvider.select((state) => state.loggedIn),
      );
      if (!signedIn) {
        throw ApiException(
          'UNAUTHORIZED',
          'Sign in to view advisory attendance.',
        );
      }
      if (term == null) {
        throw ApiException('NO_TERM', 'Select a school year and term.');
      }
      return ref
          .watch(advisoryAttendanceServiceProvider)
          .matrix(sectionId);
    });
