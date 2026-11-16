import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/models.dart';
import '../adviser/class_schedule_data.dart';
import '../adviser/schedule_timing.dart';

export '../adviser/schedule_timing.dart' show SchoolDayConfig, philippineTime;

int? _count(Object? value) => value is int && value >= 0 ? value : null;

class OverviewSummary {
  const OverviewSummary({
    required this.teacherName,
    required this.isAdviser,
    this.sectionName,
    this.classCount,
    this.learnerCount,
    this.supportCount,
  });
  final String teacherName;
  final bool isAdviser;
  final String? sectionName;
  final int? classCount;
  final int? learnerCount;
  final int? supportCount;

  factory OverviewSummary.fromJson(Map<String, dynamic> json) {
    final kpi = json['kpi'] is Map ? json['kpi'] as Map : const {};
    final section = json['advisorySection'] is Map
        ? json['advisorySection'] as Map
        : const {};
    final adviser = json['isAdviser'] == true;
    return OverviewSummary(
      teacherName: json['teacherName'] as String? ?? '',
      isAdviser: adviser,
      sectionName: section['name'] as String?,
      classCount: _count(kpi['classCount']),
      // Never infer totals from the (possibly paginated) learner rows.
      learnerCount: _count(
        adviser ? json['advisoryTotal'] : kpi['studentCount'],
      ),
      supportCount: adviser ? _count(json['atRiskStudents']) : null,
    );
  }
}

class OverviewAttention {
  const OverviewAttention({this.pendingAssessments});
  final int? pendingAssessments;
  // Secondary pendingAssessments counts unique assessments not fully scored.
  // Critical kpi.pendingAssessments is a placeholder; openFlags is anecdotes.
  factory OverviewAttention.fromJson(Map<String, dynamic> json) =>
      OverviewAttention(pendingAssessments: _count(json['pendingAssessments']));
}

final overviewSummaryProvider =
    Provider.autoDispose<AsyncValue<OverviewSummary>>(
      (ref) => ref.watch(overviewProvider).whenData(OverviewSummary.fromJson),
    );
final overviewAttentionProvider =
    Provider.autoDispose<AsyncValue<OverviewAttention>>(
      (ref) => ref
          .watch(overviewSecondaryProvider)
          .whenData(OverviewAttention.fromJson),
    );

class UpcomingClass {
  const UpcomingClass(this.slot, this.startsAt, this.endsAt);
  final TimetableSlot slot;
  final DateTime startsAt;
  final DateTime endsAt;
}

class OverviewSchedule {
  const OverviewSchedule({
    required this.term,
    required this.slots,
    required this.config,
  });
  final Term term;
  final List<TimetableSlot> slots;
  final SchoolDayConfig config;

  String? scopeNotice(DateTime now) {
    final start = term.startDate;
    final end = term.endDate;
    if (start == null || end == null || end.isBefore(start)) {
      return 'Term dates aren’t available. Open the schedule to check your classes.';
    }
    if (now.isBefore(start) || now.isAfter(end)) {
      return 'You’re viewing a different term. Open its schedule to browse classes.';
    }
    return null;
  }

  UpcomingClass? nextClass(DateTime now) {
    if (scopeNotice(now) != null) return null;
    final ph = philippineTime(now);
    final candidates = <UpcomingClass>[];
    for (var offset = 0; offset <= 7; offset++) {
      final date = DateTime.utc(ph.year, ph.month, ph.day + offset);
      for (final slot in slots) {
        if (slot.status != 'APPROVED' ||
            slot.day != date.weekday ||
            slot.period < 0 ||
            slot.period >= config.periods.length) {
          continue;
        }
        final period = config.periods[slot.period];
        final start = date
            .add(Duration(minutes: period.start))
            .subtract(const Duration(hours: 8));
        final end = date
            .add(Duration(minutes: period.end))
            .subtract(const Duration(hours: 8));
        if (start.isAfter(now) &&
            !start.isAfter(term.endDate!) &&
            !start.isBefore(term.startDate!)) {
          candidates.add(UpcomingClass(slot, start, end));
        }
      }
    }
    candidates.sort((a, b) => a.startsAt.compareTo(b.startsAt));
    return candidates.firstOrNull;
  }
}

final overviewScheduleProvider = FutureProvider.autoDispose<OverviewSchedule>((
  ref,
) async {
  final term = ref.watch(termProvider);
  if (term == null) {
    throw ApiException('NO_TERM', 'Select a school year and term.');
  }
  final slots = ref.watch(adviserScheduleProvider.future);
  final years = ref.watch(schoolYearsProvider.future);
  final api = ref.watch(apiClientProvider);
  try {
    final responses = await Future.wait<Object>([
      slots,
      years,
      api.dio.get('/api/teacher/schedule/config'),
    ]);
    final selected = (responses[1] as List<SchoolYear>)
        .expand((year) => year.terms)
        .where(
          (item) =>
              item.id == term.id && item.schoolYearId == term.schoolYearId,
        )
        .firstOrNull;
    if (selected == null) {
      throw ApiException('NOT_FOUND', 'Selected term no longer exists.');
    }
    final data = (responses[2] as Response).data;
    if (data is! Map || data['config'] is! Map) {
      throw const FormatException('Missing schedule configuration');
    }
    return OverviewSchedule(
      term: selected,
      slots: responses[0] as List<TimetableSlot>,
      config: SchoolDayConfig.fromJson(
        Map<String, dynamic>.from(data['config'] as Map),
      ),
    );
  } on DioException catch (error) {
    throw api.toApiException(error);
  }
});
