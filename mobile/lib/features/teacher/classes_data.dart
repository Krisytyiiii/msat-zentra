import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/models.dart';
import '../adviser/schedule_timing.dart';

class TeachingClass {
  TeachingClass(Map<String, dynamic> json)
    : subjectId = json['subjectId'] as String,
      sectionId = json['sectionId'] as String,
      subject = json['subjectName'] as String,
      section = json['sectionName'] as String,
      grade = json['gradeLevel'] as String;

  final String subjectId, sectionId, subject, section, grade;
  String get id => '$subjectId|$sectionId';
}

class TeachingPeriod {
  TeachingPeriod(Map<String, dynamic> json)
    : day = json['day'] as int,
      period = json['period'] as int,
      subjectId = (json['subject'] as Map)['id'] as String,
      sectionId = (json['section'] as Map)['id'] as String;

  final int day, period;
  final String subjectId, sectionId;
  String get classId => '$subjectId|$sectionId';
}

class TeachingWeek {
  TeachingWeek({
    required this.classes,
    required this.periods,
    required this.config,
  });
  final List<TeachingClass> classes;
  final List<TeachingPeriod> periods;
  final SchoolDayConfig config;
}

final teachingWeekProvider = FutureProvider.autoDispose<TeachingWeek>((
  ref,
) async {
  final auth = ref.watch(authProvider);
  final term = ref.watch(termProvider);
  if (!auth.loggedIn ||
      (auth.role != 'adviser' && auth.role != 'subject_teacher')) {
    throw ApiException(
      'FORBIDDEN',
      'Sign in as a teacher to view your classes.',
    );
  }
  if (term == null) {
    throw ApiException('NO_TERM', 'Select a school year and term.');
  }
  final api = ref.watch(apiClientProvider);
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  try {
    final response = await api.dio.get(
      '/api/teacher/my-load',
      cancelToken: cancel,
      options: Options(headers: {'x-zentra-fresh': '1'}),
    );
    final json = Map<String, dynamic>.from(response.data as Map);
    final classes = [
      for (final raw in json['classes'] as List)
        TeachingClass(Map<String, dynamic>.from(raw as Map)),
    ];
    final periods =
        [
          for (final raw in json['slots'] as List)
            TeachingPeriod(Map<String, dynamic>.from(raw as Map)),
        ]..sort((a, b) {
          final day = a.day.compareTo(b.day);
          return day == 0 ? a.period.compareTo(b.period) : day;
        });
    final config = SchoolDayConfig.fromJson(
      Map<String, dynamic>.from(json['config'] as Map),
    );
    if (periods.any(
      (slot) =>
          slot.day < 1 ||
          slot.day > 7 ||
          slot.period < 0 ||
          slot.period >= config.periods.length ||
          !classes.any((entry) => entry.id == slot.classId),
    )) {
      throw const FormatException('Invalid published teaching schedule');
    }
    return TeachingWeek(classes: classes, periods: periods, config: config);
  } on DioException catch (error) {
    throw api.toApiException(error);
  }
});
