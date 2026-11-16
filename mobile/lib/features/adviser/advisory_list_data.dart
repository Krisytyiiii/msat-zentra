import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/models.dart';

enum AdvisoryLearnerType { regular, transferee }

class AdvisorySection {
  const AdvisorySection({required this.id, required this.name});
  final String id;
  final String name;
  factory AdvisorySection.fromJson(Map<String, dynamic> json) =>
      AdvisorySection(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
      );
}

class AdvisoryRoster {
  const AdvisoryRoster({required this.students, required this.sections});
  final List<AdvisoryStudent> students;
  final List<AdvisorySection> sections;

  factory AdvisoryRoster.fromJson(Map<String, dynamic> json) {
    if (json['students'] is! List) {
      throw const FormatException('Invalid advisory roster');
    }
    return AdvisoryRoster(
      students: [
        for (final raw in json['students'] as List)
          AdvisoryStudent.fromJson({
            ...Map<String, dynamic>.from(raw as Map),
            // The current web roster uses a ratio; retain legacy percentage
            // compatibility without changing the shared learner detail DTO.
            if (raw['attendancePercentage'] == null &&
                raw['attendanceRate'] is num)
              'attendancePercentage': (raw['attendanceRate'] as num) * 100,
          }),
      ],
      sections: [
        for (final raw in json['advisorySections'] as List? ?? [])
          AdvisorySection.fromJson(Map<String, dynamic>.from(raw as Map)),
      ],
    );
  }
}

/// Archive identity is distinct from learner identity (including roster: IDs).
/// The archive endpoint has no risk, attendance or grade fields.
class ArchivedAdvisoryStudent {
  const ArchivedAdvisoryStudent({
    required this.archiveId,
    required this.studentId,
    required this.name,
    required this.lrn,
    required this.section,
    required this.archivedAt,
    required this.hasAccount,
  });
  final String archiveId;
  final String studentId;
  final String name;
  final String lrn;
  final String section;
  final DateTime? archivedAt;
  final bool hasAccount;

  factory ArchivedAdvisoryStudent.fromJson(Map<String, dynamic> json) {
    final archiveId = json['archiveId'] as String;
    if (archiveId.isEmpty) {
      throw const FormatException('Missing archive identity');
    }
    return ArchivedAdvisoryStudent(
      archiveId: archiveId,
      studentId: json['studentId'] as String,
      name: json['name'] as String? ?? '',
      lrn: json['lrn'] as String? ?? '',
      section: json['section'] as String? ?? '',
      archivedAt: DateTime.tryParse(json['archivedAt']?.toString() ?? ''),
      hasAccount: json['hasAccount'] == true,
    );
  }
}

// Exact contracts used by frontend/src/services/teacher/advisory.service.ts.
class AdvisoryListService {
  AdvisoryListService(this.api);
  final ApiClient api;

  Future<AdvisoryRoster> active() async {
    try {
      final response = await api.dio.get('/api/teacher/advisory/students');
      return AdvisoryRoster.fromJson(
        Map<String, dynamic>.from(response.data as Map),
      );
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }

  Future<List<ArchivedAdvisoryStudent>> archived() async {
    try {
      final response = await api.dio.get('/api/teacher/advisory/archived');
      final data = Map<String, dynamic>.from(response.data as Map);
      if (data['students'] is! List) {
        throw const FormatException('Invalid archived roster');
      }
      return [
        for (final raw in data['students'] as List)
          ArchivedAdvisoryStudent.fromJson(
            Map<String, dynamic>.from(raw as Map),
          ),
      ];
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }

  Future<void> archive(String studentId) async {
    try {
      await api.dio.delete(
        '/api/teacher/advisory/roster/${Uri.encodeComponent(studentId)}',
      );
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }

  Future<void> restore(String archiveId) async {
    try {
      await api.dio.post(
        '/api/teacher/advisory/archived/${Uri.encodeComponent(archiveId)}/restore',
      );
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }

  Future<void> enlist({
    required String fullName,
    required String lrn,
    required String sectionId,
    AdvisoryLearnerType learnerType = AdvisoryLearnerType.regular,
  }) async {
    try {
      await api.dio.post(
        '/api/teacher/advisory/roster',
        data: {
          'fullName': fullName,
          'lrn': lrn,
          'sectionId': sectionId,
          'learnerType': learnerType.name,
        },
      );
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }
}

final advisoryListServiceProvider = Provider(
  (ref) => AdvisoryListService(ref.watch(apiClientProvider)),
);

final advisoryProvider = FutureProvider<AdvisoryRoster>((ref) async {
  final term = ref.watch(termProvider);
  final signedIn = ref.watch(authProvider.select((state) => state.loggedIn));
  if (!signedIn) {
    throw ApiException('UNAUTHORIZED', 'Sign in to view your advisees.');
  }
  if (term == null) {
    throw ApiException('NO_TERM', 'Select a school year and term.');
  }
  return ref.watch(advisoryListServiceProvider).active();
});

final archivedAdvisoryProvider = FutureProvider<List<ArchivedAdvisoryStudent>>((
  ref,
) async {
  final term = ref.watch(termProvider);
  final signedIn = ref.watch(authProvider.select((state) => state.loggedIn));
  if (!signedIn) {
    throw ApiException('UNAUTHORIZED', 'Sign in to view archived advisees.');
  }
  if (term == null) {
    throw ApiException('NO_TERM', 'Select a school year and term.');
  }
  return ref.watch(advisoryListServiceProvider).archived();
});
