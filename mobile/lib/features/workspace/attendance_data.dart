import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../adviser/schedule_timing.dart';
import '../teacher/gradebook_data.dart' show RecordLearner;

const attendanceLabels = {
  'present': 'Present',
  'absent': 'Absent',
  'late': 'Late',
  'excused': 'Excused',
};

final attendanceClockProvider = Provider<DateTime Function()>(
  (_) => DateTime.now,
);

String attendanceDay(DateTime date) => date.toIso8601String().substring(0, 10);

class AttendancePair {
  AttendancePair(
    this.sectionId,
    this.sectionName,
    this.subjectId,
    this.subjectName, {
    this.gradeLevel,
  });
  final String sectionId, sectionName, subjectId, subjectName;
  final String? gradeLevel;
  final slots = <({int day, int period})>[];
  String get key => '$sectionId|$subjectId';
}

class AttendanceAccess {
  AttendanceAccess(this.me, this.pairs, this.config, this.advisoryIds);
  final Map me;
  final List<AttendancePair> pairs;
  final SchoolDayConfig? config;
  final Set<String> advisoryIds;
  bool get linked => me['teacherName'] is Map;
  bool get entered => me['termGrant'] is Map;
  String get teacherId => (me['teacherName'] as Map?)?['id']?.toString() ?? '';
  bool canMark(AttendancePair pair) =>
      entered &&
      ((me['termGrant'] as Map)['attendanceVerified'] == true ||
          advisoryIds.contains(pair.sectionId));
}

class AttendanceGate {
  const AttendanceGate(
    this.slot,
    this.message, {
    this.locked = true,
    this.pastDue = false,
  });
  final int slot;
  final String message;
  final bool locked, pastDue;
}

/// Same week/date and live-period rules as web, always in Philippine time.
AttendanceGate attendanceGate(
  AttendancePair pair,
  SchoolDayConfig? config,
  String date,
  String? start,
  String? end,
  DateTime instant,
) {
  final now = philippineTime(instant);
  final today = attendanceDay(now);
  final selected = DateTime.parse(date);
  if (start == null || end == null) {
    return const AttendanceGate(
      1,
      'Term dates are unavailable. Refresh to try again.',
    );
  }
  if (date.compareTo(start) < 0 || date.compareTo(end) > 0) {
    return const AttendanceGate(1, 'This date is outside the selected term.');
  }
  if (selected.weekday > 5 ||
      !pair.slots.any((s) => s.day == selected.weekday)) {
    return const AttendanceGate(1, 'No scheduled meetup on this date.');
  }
  if (date.compareTo(today) > 0) {
    return const AttendanceGate(1, 'Future sheets are not available.');
  }
  final monday = attendanceDay(
    DateTime.utc(
      now.year,
      now.month,
      now.day,
    ).subtract(Duration(days: now.weekday - 1)),
  );
  if (date.compareTo(monday) < 0) {
    return const AttendanceGate(
      1,
      'Previous-week attendance is read-only.',
      pastDue: true,
    );
  }
  // Web uses slot 1 for editable historical dates.
  if (date.compareTo(today) < 0) {
    return const AttendanceGate(
      1,
      'Past meetup · editable this week.',
      locked: false,
      pastDue: true,
    );
  }
  if (config == null) {
    return const AttendanceGate(
      1,
      'Schedule times are unavailable. Refresh to try again.',
    );
  }
  final timed =
      pair.slots
          .where(
            (s) =>
                s.day == now.weekday &&
                s.period >= 0 &&
                s.period < config.periods.length,
          )
          .toList()
        ..sort((a, b) => a.period.compareTo(b.period));
  if (timed.isEmpty) return const AttendanceGate(1, 'No meetup today.');
  final minute = now.hour * 60 + now.minute;
  final todayEnd = timed
      .map((s) => config.periods[s.period].end)
      .reduce((a, b) => a > b ? a : b);
  String clock(int m) =>
      '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
  for (final s in timed) {
    final t = config.periods[s.period];
    if (minute >= t.start && minute < t.end) {
      return AttendanceGate(
        s.period + 1,
        'Live now · ends ${clock(t.end)}',
        locked: false,
      );
    }
  }
  final done = timed
      .where((s) => minute >= config.periods[s.period].end)
      .lastOrNull;
  if (done != null) {
    return AttendanceGate(
      done.period + 1,
      'Class ended · you can still edit today.',
      locked: false,
      pastDue: minute >= todayEnd,
    );
  }
  final next = timed.first;
  return AttendanceGate(
    next.period + 1,
    'Opens at ${clock(config.periods[next.period].start)}.',
  );
}

class AttendanceLearner {
  AttendanceLearner(Map json)
    : id = json['studentId'] as String,
      lrn = json['lrn']?.toString() ?? '',
      exempt = json['admExempt'] == true,
      name = RecordLearner({'id': json['studentId'], 'name': json['name']})
          .displayName;
  final String id, name, lrn;
  final bool exempt;
}

class AttendanceSheet {
  AttendanceSheet({
    required this.learners,
    required this.marks,
    required this.gate,
    required this.termId,
    required this.start,
    required this.end,
    required this.mine,
    required this.canMark,
    this.assignmentId,
    this.owner,
  });
  final List<AttendanceLearner> learners;
  final Map<String, String> marks;
  final AttendanceGate gate;
  final String termId;
  final String? start, end, assignmentId, owner;
  final bool mine, canMark;
}

class AttendanceService {
  AttendanceService(this.api);
  final ApiClient api;

  Future<AttendanceAccess> access() async {
    final me =
        (await api.dio.get('/api/teacher/schedule/teachers/me')).data as Map;
    if (me['teacherName'] == null || me['termGrant'] == null) {
      return AttendanceAccess(me, [], null, {});
    }
    final results = await Future.wait([
      api.dio.get('/api/teacher/my-load'),
      api.dio.get('/api/teacher/advisory/sections'),
    ]);
    final pairs = <String, AttendancePair>{};
    for (final row in (results[0].data as Map)['slots'] as List) {
      if (row['status'] != 'SUBMITTED' && row['status'] != 'APPROVED') continue;
      final section = row['section'] as Map;
      final subject = row['subject'] as Map;
      final key = '${section['id']}|${subject['id']}';
      final pair = pairs.putIfAbsent(
        key,
        () => AttendancePair(
          section['id'] as String,
          section['name'] as String,
          subject['id'] as String,
          subject['name'] as String,
          gradeLevel: section['gradeLevel'] as String?,
        ),
      );
      pair.slots.add((day: row['day'] as int, period: row['period'] as int));
    }
    final config = (results[0].data as Map)['config'];
    return AttendanceAccess(
      me,
      pairs.values.toList(),
      config is Map
          ? SchoolDayConfig.fromJson(Map<String, dynamic>.from(config))
          : null,
      {
        for (final s in (results[1].data as Map)['advisorySections'] as List)
          s['id'] as String,
      },
    );
  }

  Future<AttendanceSheet> sheet(
    AttendanceAccess access,
    AttendancePair pair,
    String date,
    DateTime now,
  ) async {
    final results = await Future.wait([
      api.dio.get(
        '/api/attendance/section-roster',
        queryParameters: {'sectionId': pair.sectionId},
      ),
      api.dio.get(
        '/api/attendance/subject-days',
        queryParameters: {
          'sectionId': pair.sectionId,
          'subjectId': pair.subjectId,
        },
      ),
    ]);
    final roster = results[0].data as Map;
    final days = results[1].data as Map;
    final termId = roster['termId'] as String;
    if (roster['sectionId'] != pair.sectionId || days['termId'] != termId) {
      throw const FormatException('Mismatched attendance scope');
    }
    String? day(Object? value) => value?.toString().substring(0, 10);
    final start = day(days['termStart']);
    final end = day(days['termEnd']);
    final gate = attendanceGate(pair, access.config, date, start, end, now);
    final details = await Future.wait([
      api.dio.get(
        '/api/attendance/subjects',
        queryParameters: {'sectionId': pair.sectionId, 'termId': termId},
      ),
      api.dio.get(
        '/api/teacher/advisory/attendance',
        queryParameters: {
          'date': '${date}T00:00:00Z',
          'sectionId': pair.sectionId,
          'subjectId': pair.subjectId,
          'slot': gate.slot,
        },
      ),
    ]);
    final offered = ((details[0].data as Map)['subjects'] as List)
        .cast<Map>()
        .where((s) => s['subjectId'] == pair.subjectId)
        .firstOrNull;
    final data = details[1].data as Map;
    final learners = [
      for (final s in roster['students'] as List) AttendanceLearner(s as Map),
    ]..sort((a, b) => a.name.compareTo(b.name));
    return AttendanceSheet(
      learners: learners,
      marks: {
        for (final m in data['marks'] as List)
          if (attendanceLabels.containsKey(m['status']))
            m['studentId'] as String: m['status'] as String,
      },
      gate: gate,
      termId: termId,
      start: start,
      end: end,
      mine: data['mine'] != false,
      owner: (data['submittedBy'] as Map?)?['name']?.toString(),
      canMark:
          access.canMark(pair) &&
          offered != null &&
          offered['canMark'] == true &&
          offered['takenByOther'] != true &&
          (offered['isMine'] != false ||
              (offered['myAssignmentId']?.toString().isNotEmpty ?? false)),
      assignmentId: (offered?['myAssignmentId'] ?? offered?['assignmentId'])
          ?.toString(),
    );
  }
}
