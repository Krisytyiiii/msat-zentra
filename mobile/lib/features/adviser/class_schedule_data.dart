import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/models.dart';
import 'schedule_timing.dart';

/// Own teaching slots remain separate from the advisory section's timetable.
/// Overview's Up next must never contain other teachers' classes.
final adviserScheduleProvider = FutureProvider<List<TimetableSlot>>((
  ref,
) async {
  ref.watch(termProvider);
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.dio.get('/api/teacher/schedule/my-slots');
    final data = res.data;
    final List raw;
    if (data is List) {
      raw = data;
    } else if (data is Map && data['slots'] is List) {
      raw = data['slots'] as List;
    } else {
      raw = [];
    }
    return [
      for (final s in raw)
        TimetableSlot.fromJson(Map<String, dynamic>.from(s as Map)),
    ];
  } on DioException catch (e) {
    throw api.toApiException(e);
  }
});

class ClassScheduleEntry {
  const ClassScheduleEntry({required this.slot, required this.teacher});
  final TimetableSlot slot;
  final String teacher;

  factory ClassScheduleEntry.fromJson(
    Map<String, dynamic> json,
    String section,
  ) {
    final name =
        (json['teacherName'] as Map?)?['name']?.toString().trim() ?? '';
    return ClassScheduleEntry(
      slot: TimetableSlot.fromJson({...json, 'sectionName': section}),
      teacher: name.isEmpty ? 'Unassigned' : name,
    );
  }
}

class ClassSchedule {
  const ClassSchedule({
    required this.term,
    required this.entries,
    this.sectionName,
    this.config,
  });
  final Term term;
  final String? sectionName;
  final List<ClassScheduleEntry> entries;
  final SchoolDayConfig? config;

  bool isNow(ClassScheduleEntry entry, DateTime now) {
    final start = term.startDate;
    final end = term.endDate;
    if (start == null ||
        end == null ||
        end.isBefore(start) ||
        now.isBefore(start) ||
        now.isAfter(end)) {
      return false;
    }
    final local = philippineTime(now);
    final period = entry.slot.period;
    final periods = config?.periods;
    if (periods == null ||
        period < 0 ||
        period >= periods.length ||
        local.weekday != entry.slot.day) {
      return false;
    }
    final minute = local.hour * 60 + local.minute;
    return minute >= periods[period].start && minute < periods[period].end;
  }
}

/// Mirrors web AdvisorySectionSchedule: lightweight advisory-section lookup,
/// section timetable and server timing config. No roster/overview fallback.
final classScheduleProvider = FutureProvider.autoDispose
    .family<ClassSchedule, bool>((ref, advisory) async {
      final signedIn = ref.watch(
        authProvider.select((state) => state.loggedIn),
      );
      if (!signedIn) {
        throw ApiException(
          'UNAUTHORIZED',
          'Sign in to view your class schedule.',
        );
      }
      final selected = ref.watch(termProvider);
      if (selected == null) {
        throw ApiException('NO_TERM', 'Select a school year and term.');
      }
      final api = ref.watch(apiClientProvider);
      final yearsFuture = ref.watch(schoolYearsProvider.future);
      // Watch before awaiting so term/account changes invalidate the entire read.
      final ownFuture = advisory
          ? null
          : ref.watch(adviserScheduleProvider.future);
      try {
        final dependencies = await Future.wait<Object>([
          yearsFuture,
          ?ownFuture,
        ]);
        final years = dependencies[0] as List<SchoolYear>;
        String? sectionId;
        String? sectionName;
        if (advisory) {
          final res = await api.dio.get('/api/teacher/advisory/sections');
          final sections = (res.data as Map)['advisorySections'] as List;
          // The web uses the first advisory section too.
          if (sections.isEmpty) {
            return ClassSchedule(term: selected, entries: const []);
          }
          final section = sections.first as Map;
          sectionId = section['id'] as String;
          sectionName = section['name'] as String;
        }
        final results = await Future.wait<Object>([
          Future.value(years),
          api.dio.get('/api/teacher/schedule/config'),
          if (advisory)
            api.dio.get(
              '/api/teacher/schedule',
              queryParameters: {'sectionId': sectionId},
            )
          else
            Future.value(dependencies[1]),
        ]);
        final term = (results[0] as List<SchoolYear>)
            .expand((year) => year.terms)
            .where(
              (term) =>
                  term.id == selected.id &&
                  term.schoolYearId == selected.schoolYearId,
            )
            .firstOrNull;
        if (term == null) {
          throw ApiException('NOT_FOUND', 'Selected term no longer exists.');
        }
        final configData = (results[1] as Response).data as Map;
        final config = SchoolDayConfig.fromJson(
          Map<String, dynamic>.from(configData['config'] as Map),
        );
        final entries = <ClassScheduleEntry>[];
        if (advisory) {
          final sections =
              ((results[2] as Response).data as Map)['sections'] as List;
          final matching = sections
              .cast<Map>()
              .where((s) => s['id'] == sectionId)
              .firstOrNull;
          // A missing requested section is not a successfully loaded empty grid.
          if (matching == null) {
            throw ApiException(
              'SCHEDULE_UNAVAILABLE',
              'Your class schedule is unavailable for this account. '
                  'Ask the school office to check your schedule access.',
            );
          }
          for (final row in matching['timetableEntries'] as List) {
            final json = Map<String, dynamic>.from(row as Map);
            if (json['status'] != 'SUBMITTED' && json['status'] != 'APPROVED') {
              continue;
            }
            entries.add(ClassScheduleEntry.fromJson(json, sectionName!));
          }
        } else {
          entries.addAll(
            (results[2] as List<TimetableSlot>).map(
              (slot) => ClassScheduleEntry(slot: slot, teacher: 'You'),
            ),
          );
        }
        entries.sort((a, b) {
          final day = a.slot.day.compareTo(b.slot.day);
          return day != 0 ? day : a.slot.period.compareTo(b.slot.period);
        });
        return ClassSchedule(
          term: term,
          entries: entries,
          sectionName: sectionName,
          config: config,
        );
      } on DioException catch (error) {
        throw api.toApiException(error);
      }
    });
