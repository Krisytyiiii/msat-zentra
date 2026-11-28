import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import '../../shared/identity_tile.dart';
import '../../shared/date_strip_selector.dart';
import '../adviser/schedule_timing.dart';
import '../auth/link_classes_card.dart';
import 'classes_data.dart';

class ClassesPage extends ConsumerStatefulWidget {
  const ClassesPage({super.key});

  @override
  ConsumerState<ClassesPage> createState() => _ClassesPageState();
}

class _ClassesPageState extends ConsumerState<ClassesPage>
    with WidgetsBindingObserver {
  int get _day => _selectedDate.weekday;
  late final DateTime _dateAnchor;
  late DateTime _selectedDate;
  Timer? _poll;
  bool _refreshing = false;
  String _classFilter = 'All';

  bool get _visible => mounted && (ModalRoute.of(context)?.isCurrent ?? true);

  @override
  void initState() {
    super.initState();
    final now = philippineTime(DateTime.now());
    _dateAnchor = DateTime.utc(now.year, now.month, now.day);
    _selectedDate = _dateAnchor;
    WidgetsBinding.instance.addObserver(this);
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      final lifecycle = WidgetsBinding.instance.lifecycleState;
      if (_visible &&
          (lifecycle == null || lifecycle == AppLifecycleState.resumed)) {
        unawaited(_refresh());
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _visible) unawaited(_refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      ref.invalidate(teachingWeekProvider);
      await ref.read(teachingWeekProvider.future);
    } catch (_) {
      // The provider displays a retryable, user-safe error.
    } finally {
      _refreshing = false;
    }
  }

  String _time(int minute) {
    final hour = minute ~/ 60;
    return '${hour % 12 == 0 ? 12 : hour % 12}:${(minute % 60).toString().padLeft(2, '0')} ${hour < 12 ? 'AM' : 'PM'}';
  }

  @override
  Widget build(BuildContext context) {
    final desk = overviewScreenTheme(Theme.of(context));
    final week = ref.watch(teachingWeekProvider);
    final term = ref.watch(termProvider);
    final link = ref.watch(teacherLinkProvider).valueOrNull;
    final now = philippineTime(DateTime.now());
    final today = DateTime.utc(now.year, now.month, now.day);
    return Theme(
      data: desk,
      child: ColoredBox(
        color: desk.scaffoldBackgroundColor,
        child: Builder(
          builder: (context) {
            if (link?.linked == false) {
              return TeacherLinkPlaceholder(
                onLinked: () async {
                  ref.invalidate(teachingWeekProvider);
                  try {
                    await ref.read(teachingWeekProvider.future);
                  } catch (_) {
                    // The desk renders its own retryable error.
                  }
                },
              );
            }
            final data = week.asData?.value;
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(
                  12,
                  16,
                  12,
                  120 + MediaQuery.paddingOf(context).bottom,
                ),
                children: [
                  const ZContentHeader(
                    title: 'Class',
                    icon: LucideIcons.bookOpen,
                    description: 'Your teaching classes and weekly schedule.',
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (term != null) ...[
                        ZScopePill(
                          text: term.schoolYearName,
                          kind: ScopePillKind.schoolYear,
                          compact: true,
                        ),
                        ZScopePill(
                          text: 'Term ${term.termNumber}',
                          kind: ScopePillKind.term,
                          compact: true,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  DateStripSelector(
                    selectedDate: _selectedDate,
                    today: today,
                    firstDate: _dateAnchor.subtract(
                      const Duration(days: 10000),
                    ),
                    lastDate: DateTime.utc(9999, 12, 31),
                    stripKey: const ValueKey('class-date-selector'),
                    pickerHelpText: 'Choose class date',
                    hasEvent: (date) =>
                        data?.periods.any((slot) => slot.day == date.weekday) ==
                        true,
                    onChanged: (date) => setState(() => _selectedDate = date),
                  ),
                  const SizedBox(height: 8),
                  week.when(
                    loading: () => const ZSkeletonList(),
                    error: (error, _) =>
                        ErrorView(message: error, onRetry: _refresh),
                    data: (week) {
                      final periods = week.periods
                          .where((slot) => slot.day == _day)
                          .where((slot) {
                            if (_classFilter == 'All') return true;
                            final completed =
                                _selectedDate.isBefore(today) ||
                                (_selectedDate == today &&
                                    now.hour * 60 + now.minute >=
                                        week.config.periods[slot.period].end);
                            return _classFilter == 'Completed'
                                ? completed
                                : !completed;
                          })
                          .toList();
                      final unscheduled = week.classes
                          .where(
                            (entry) => !week.periods.any(
                              (slot) => slot.classId == entry.id,
                            ),
                          )
                          .toList();
                      final count =
                          periods.length +
                          (_classFilter == 'All' ? unscheduled.length : 0);
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Showing $count ${count == 1 ? 'class' : 'classes'}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                                ),
                              ),
                              TextButton.icon(
                                onPressed: () => setState(() {
                                  const options = [
                                    'All',
                                    'Completed',
                                    'Pending',
                                  ];
                                  _classFilter =
                                      options[(options.indexOf(_classFilter) +
                                              1) %
                                          options.length];
                                }),
                                icon: const Icon(
                                  LucideIcons.listFilter,
                                  size: 14,
                                ),
                                label: Text(
                                  _classFilter,
                                  style: const TextStyle(fontSize: 12),
                                ),
                                style: TextButton.styleFrom(
                                  foregroundColor: Theme.of(context)
                                      .colorScheme
                                      .onSurface,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 0,
                                  ),
                                  minimumSize: Size.zero,
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                  visualDensity: VisualDensity.compact,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          if (count == 0)
                            ZEmpty(
                              icon: LucideIcons.calendarDays,
                              title: _classFilter == 'All'
                                  ? 'No classes'
                                  : 'No ${_classFilter.toLowerCase()} classes',
                              subtitle: week.classes.isEmpty
                                  ? 'No published classes for this term. Ask the school office to check your teaching load.'
                                  : _classFilter != 'All'
                                  ? 'No ${_classFilter.toLowerCase()} classes for this date.'
                                  : 'No scheduled classes on ${const ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][_day - 1]}.',
                            ),
                          for (final slot in periods) ...[
                            _classCard(
                              context,
                              week.classes.firstWhere(
                                (entry) => entry.id == slot.classId,
                              ),
                              '${_time(week.config.periods[slot.period].start)} – ${_time(week.config.periods[slot.period].end)}',
                            ),
                            const SizedBox(height: 12),
                          ],
                          // A class without published slots must still be reachable.
                          for (final entry
                              in _classFilter == 'All'
                                  ? unscheduled
                                  : <TeachingClass>[]) ...[
                            _classCard(
                              context,
                              entry,
                              'Schedule not published',
                            ),
                            const SizedBox(height: 12),
                          ],
                        ],
                      );
                    },
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _classCard(BuildContext context, TeachingClass entry, String timing) {
    final theme = Theme.of(context);
    return Material(
      color: theme.cardTheme.color,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: theme.colorScheme.outline.withValues(alpha: 0.72),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      elevation: 1,
      shadowColor: Colors.black.withValues(
        alpha: Theme.of(context).brightness == Brightness.dark ? 0.4 : 0.06,
      ),
      child: InkWell(
        onTap: () async {
          await context.push(
            '/workspace/classes/${Uri.encodeComponent(entry.id)}/list',
          );
          if (mounted) unawaited(_refresh());
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Row(
                children: [
                  ZIdentityTile(
                    name: entry.subject,
                    seed: entry.id,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.subject,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          entry.section,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ZStatusPill(
                    text: entry.grade,
                    tone: StatusTone.blue,
                    label: 'Grade level',
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 10),
                child: Divider(height: 1),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  timing,
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
