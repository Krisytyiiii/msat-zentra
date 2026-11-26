import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../design/tokens.dart';
import '../../shared/widgets.dart';
import '../auth/link_classes_card.dart';
import 'class_schedule_data.dart';
import 'schedule_timing.dart';

export 'class_schedule_data.dart' show adviserScheduleProvider;

const _days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/// The advisory view mirrors web Class Schedule; the workspace view keeps
/// subject teachers scoped to their own teaching load.
class AdviserSchedulePage extends ConsumerStatefulWidget {
  const AdviserSchedulePage({super.key, this.advisory = true});
  final bool advisory;

  @override
  ConsumerState<AdviserSchedulePage> createState() => _ScheduleState();
}

class _ScheduleState extends ConsumerState<AdviserSchedulePage>
    with WidgetsBindingObserver {
  Timer? _timer;
  Future<void>? _refreshFlight;
  DateTime _now = DateTime.now();
  late int _day;

  @override
  void initState() {
    super.initState();
    final today = philippineTime(_now).weekday;
    _day = today <= 5 ? today : 1;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_visible) unawaited(_refresh());
    });
  }

  bool get _visible =>
      mounted &&
      (WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState ==
              AppLifecycleState.resumed) &&
      ModalRoute.of(context)?.isCurrent == true &&
      TickerMode.valuesOf(context).enabled;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _visible) unawaited(_refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _refresh() =>
      _refreshFlight ??= _reload().whenComplete(() => _refreshFlight = null);

  Future<void> _reload() async {
    if (!mounted) return;
    setState(() => _now = DateTime.now());
    if (!widget.advisory) ref.invalidate(adviserScheduleProvider);
    try {
      await ref
          .refresh(classScheduleProvider(widget.advisory).future)
          .then<void>((_) {});
    } catch (_) {
      // Provider displays the user-safe failure; pull-to-refresh still settles.
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (_, _) {
      final today = philippineTime(DateTime.now()).weekday;
      setState(() => _day = today <= 5 ? today : 1);
    });
    final schedule = ref.watch(classScheduleProvider(widget.advisory));
    final link = ref.watch(teacherLinkProvider).valueOrNull;
    if (!widget.advisory && link?.linked == false) {
      return TeacherLinkPlaceholder(onLinked: _reload);
    }
    return schedule.when(
      skipLoadingOnRefresh: true,
      // Do not show a different term's cached schedule while it is loading.
      skipLoadingOnReload: false,
      loading: () =>
          const Padding(padding: EdgeInsets.all(16), child: ZSkeletonList()),
      error: (error, _) => ErrorView(message: error, onRetry: _refresh),
      data: (data) => _content(data),
    );
  }

  Widget _content(ClassSchedule data) {
    final theme = Theme.of(context);
    if (widget.advisory && data.sectionName == null) {
      return ZEmptyPage(
        icon: Icons.calendar_month_outlined,
        title: 'No advisory section',
        subtitle:
            'No advisory section is assigned to you for '
            '${data.term.schoolYearName} · Term ${data.term.termNumber}.',
        onRefresh: _refresh,
      );
    }
    if (data.entries.isEmpty) {
      return ZEmptyPage(
        icon: Icons.calendar_month_outlined,
        title: 'No published timetable',
        subtitle: widget.advisory
            ? 'Classes for ${data.sectionName} will appear once the Master Teacher publishes the timetable.'
            : 'Your teaching timetable will appear once it is published.',
        onRefresh: _refresh,
      );
    }
    final entries = data.entries.where((e) => e.slot.day == _day).toList();
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (ScreenSearchScope.maybeOf(context) == null)
                    ZContentHeader(title: 'Class Schedule',
                      icon: Icons.calendar_month_outlined,
                      description: data.sectionName ?? 'My teaching timetable')
                  else Text(
                    data.sectionName ?? 'My teaching timetable',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${data.term.schoolYearName} · Term ${data.term.termNumber}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (var day = 1; day <= 5; day++)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Semantics(
                        selected: day == _day,
                        label:
                            '${_days[day - 1]}, '
                            '${data.entries.where((e) => e.slot.day == day).length} classes',
                        child: TextButton(
                          onPressed: () => setState(() => _day = day),
                          style: TextButton.styleFrom(
                            minimumSize: const Size(48, 48),
                            backgroundColor: day == _day
                                ? theme.colorScheme.primary.withValues(
                                    alpha: 0.12,
                                  )
                                : theme.colorScheme.surfaceContainerLow,
                            side: BorderSide(
                              color: day == _day
                                  ? theme.colorScheme.primary
                                  : theme.colorScheme.outlineVariant,
                            ),
                          ),
                          child: Text(
                            '${_days[day - 1].substring(0, 3)} '
                            '${data.entries.where((e) => e.slot.day == day).length}',
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                '${_days[_day - 1]} · ${entries.length} '
                '${entries.length == 1 ? 'class' : 'classes'}',
                style: theme.textTheme.labelLarge,
              ),
            ),
            Expanded(
              child: entries.isEmpty
                  ? ZEmptyPage(
                      icon: Icons.free_breakfast_outlined,
                      title: 'No classes on ${_days[_day - 1]}',
                      subtitle: 'Choose another day to view its timetable.',
                      onRefresh: _refresh,
                    )
                  : RefreshIndicator(
                      onRefresh: _refresh,
                      child: ListView.separated(
                        key: ValueKey('${data.term.id}:$_day'),
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        itemCount: entries.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _ClassCard(
                          entry: entries[i],
                          config: data.config!,
                          now: data.isNow(entries[i], _now),
                          advisory: widget.advisory,
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

String _clock(int minute) {
  final hour = (minute ~/ 60) % 24;
  return '${hour % 12 == 0 ? 12 : hour % 12}:'
      '${(minute % 60).toString().padLeft(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}';
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({
    required this.entry,
    required this.config,
    required this.now,
    required this.advisory,
  });
  final ClassScheduleEntry entry;
  final SchoolDayConfig config;
  final bool now;
  final bool advisory;

  @override
  Widget build(BuildContext context) {
    final slot = entry.slot;
    final period = slot.period >= 0 && slot.period < config.periods.length
        ? config.periods[slot.period]
        : null;
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(ZTokens.radiusLg),
        color: now
            ? theme.colorScheme.primary.withValues(alpha: 0.08)
            : theme.colorScheme.surface,
        border: Border.all(
          color: now
              ? theme.colorScheme.primary
              : theme.colorScheme.outlineVariant,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (now) ...[
            const ZStatusPill(text: 'Now', tone: StatusTone.green),
            const SizedBox(height: 8),
          ],
          Text(
            slot.subjectName,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          if (slot.subjectCode.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(slot.subjectCode, style: theme.textTheme.bodySmall),
          ],
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.schedule_outlined, size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  period == null
                      ? 'Period ${slot.period + 1}'
                      : '${_clock(period.start)} – ${_clock(period.end)}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (period != null)
                ZStatusPill(
                  text: '${period.end - period.start} min',
                  tone: StatusTone.amber,
                ),
              ZStatusPill(text: entry.teacher),
              if (!advisory) ZStatusPill(text: slot.sectionName),
            ],
          ),
        ],
      ),
    );
  }
}
