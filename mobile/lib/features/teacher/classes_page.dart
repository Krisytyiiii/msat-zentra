import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import '../adviser/schedule_timing.dart';
import 'classes_data.dart';

class ClassesPage extends ConsumerStatefulWidget {
  const ClassesPage({super.key});

  @override
  ConsumerState<ClassesPage> createState() => _ClassesPageState();
}

class _ClassesPageState extends ConsumerState<ClassesPage>
    with WidgetsBindingObserver {
  late int _day;
  static const _todayPage = 10000;
  late final DateTime _dateAnchor;
  final _dates = PageController(
    initialPage: _todayPage,
    viewportFraction: 1 / 6,
  );
  int _selectedPage = _todayPage;
  Timer? _poll;
  bool _refreshing = false;
  String _classFilter = 'All';

  bool get _visible => mounted && (ModalRoute.of(context)?.isCurrent ?? true);

  @override
  void initState() {
    super.initState();
    _day = philippineTime(DateTime.now()).weekday;
    final now = philippineTime(DateTime.now());
    _dateAnchor = DateTime.utc(now.year, now.month, now.day);
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
    _dates.dispose();
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

  DateTime get _selectedDate =>
      _dateAnchor.add(Duration(days: _selectedPage - _todayPage));

  Future<void> _pickDate(BuildContext context) async {
    final selected = _selectedDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: selected,
      firstDate: _dateAnchor.subtract(const Duration(days: _todayPage)),
      lastDate: DateTime(9999, 12, 31),
      helpText: 'Choose class date',
    );
    if (picked == null || !mounted || !_dates.hasClients) return;
    final date = DateTime.utc(picked.year, picked.month, picked.day);
    _dates.jumpToPage(_todayPage + date.difference(_dateAnchor).inDays);
  }

  @override
  Widget build(BuildContext context) {
    final week = ref.watch(teachingWeekProvider);
    final term = ref.watch(termProvider);
    final now = philippineTime(DateTime.now());
    final today = DateTime.utc(now.year, now.month, now.day);
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: ColoredBox(
        color: Colors.white,
        child: Builder(
          builder: (context) {
            final data = week.asData?.value;
            final dateControlHeight =
                16 + MediaQuery.textScalerOf(context).scale(12) * 1.5;
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
                  const Text(
                    'Class',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Your teaching classes and weekly schedule for this term.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: Color(0xFF81818F),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (term != null) ...[
                        ZStatusPill(
                          text: term.schoolYearName,
                          tone: StatusTone.blue,
                        ),
                        ZStatusPill(
                          text: 'Term ${term.termNumber}',
                          tone: StatusTone.amber,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: const Color(0xFFE6ECF4)),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x06000000),
                          blurRadius: 6,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            IconButton.outlined(
                              tooltip: 'Previous day',
                              onPressed: () => _dates.previousPage(
                                duration: const Duration(milliseconds: 150),
                                curve: Curves.easeOut,
                              ),
                              icon: const Icon(Icons.chevron_left, size: 18),
                              style: IconButton.styleFrom(
                                minimumSize: Size(32, dateControlHeight),
                                maximumSize: Size(32, dateControlHeight),
                                padding: EdgeInsets.zero,
                                tapTargetSize: MaterialTapTargetSize.padded,
                                foregroundColor: const Color(0xFF52627C),
                                side: const BorderSide(
                                  color: Color(0xFFE6ECF4),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Material(
                                color: const Color(0xFFF8F9FB),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: const BorderSide(
                                    color: Color(0xFFE6ECF4),
                                  ),
                                ),
                                child: InkWell(
                                  onTap: () => _pickDate(context),
                                  borderRadius: BorderRadius.circular(12),
                                  child: SizedBox(
                                    height: dateControlHeight,
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        const Icon(
                                          Icons.calendar_today_outlined,
                                          size: 14,
                                          color: Color(0xFF52627C),
                                        ),
                                        const SizedBox(width: 6),
                                        Flexible(
                                          child: Text(
                                            DateFormat('EEE, MMM d, yyyy')
                                                .format(_selectedDate),
                                            textAlign: TextAlign.center,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: Color(0xFF192034),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            IconButton.outlined(
                              tooltip: 'Next day',
                              onPressed: () => _dates.nextPage(
                                duration: const Duration(milliseconds: 150),
                                curve: Curves.easeOut,
                              ),
                              icon: const Icon(Icons.chevron_right, size: 18),
                              style: IconButton.styleFrom(
                                minimumSize: Size(32, dateControlHeight),
                                maximumSize: Size(32, dateControlHeight),
                                padding: EdgeInsets.zero,
                                tapTargetSize: MaterialTapTargetSize.padded,
                                foregroundColor: const Color(0xFF52627C),
                                side: const BorderSide(
                                  color: Color(0xFFE6ECF4),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: () => _dates.animateToPage(
                                _todayPage,
                                duration: const Duration(milliseconds: 150),
                                curve: Curves.easeOut,
                              ),
                              style: TextButton.styleFrom(
                                minimumSize: const Size(48, 48),
                                foregroundColor: const Color(0xFF2563EB),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                ),
                              ),
                              child: Text(
                                'Today',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                        const Divider(height: 12, color: Color(0xFFF0F3F8)),
                        SizedBox(
                          height:
                              24 +
                              MediaQuery.textScalerOf(context).scale(12) * 3,
                          child: PageView.builder(
                            key: const ValueKey('class-date-selector'),
                            controller: _dates,
                            onPageChanged: (index) => setState(() {
                              _selectedPage = index;
                              _day = _dateAnchor
                                  .add(Duration(days: index - _todayPage))
                                  .weekday;
                            }),
                            itemBuilder: (context, index) {
                              final day = _dateAnchor.add(
                                Duration(days: index - _todayPage),
                              );
                              return SizedBox(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 2,
                                    vertical: 2,
                                  ),
                                  child: TextButton(
                                    onPressed: () => _dates.animateToPage(
                                      index,
                                      duration: const Duration(
                                        milliseconds: 150,
                                      ),
                                      curve: Curves.easeOut,
                                    ),
                                    style: TextButton.styleFrom(
                                      minimumSize: const Size(48, 48),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 2,
                                      ),
                                      backgroundColor: _selectedPage == index
                                        ? const Color(0xFF4060EF)
                                          : const Color(0xFFF8F9FB),
                                      foregroundColor: _selectedPage == index
                                          ? Colors.white
                                          : const Color(0xFF71809B),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                    ),
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          DateFormat('EEE')
                                              .format(day)
                                              .toUpperCase(),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          DateFormat('d').format(day),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: _selectedPage == index
                                                ? Colors.white
                                                : const Color(0xFF263045),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Container(
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color:
                                                data?.periods.any(
                                                      (slot) =>
                                                          slot.day ==
                                                          day.weekday,
                                                    ) ==
                                                    true
                                                ? (_selectedPage == index
                                                      ? const Color(0xFFF59E0B)
                                                      : const Color(0xFFCBD5E1))
                                                : (_selectedPage == index
                                                      ? const Color(0xFFF59E0B)
                                                      : const Color(
                                                          0xFFE6ECF4,
                                                        )),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
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
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: Color(0xFF9999A6),
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
                                  foregroundColor: const Color(0xFF334155),
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
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 24,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                border: Border.all(
                                  color: const Color(0xFFDFE7F5),
                                ),
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Column(
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: const BoxDecoration(
                                      color: Color(0xFFEAF0FF),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      LucideIcons.calendarDays,
                                      size: 20,
                                      color: Color(0xFF4263F0),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    _classFilter == 'All'
                                        ? 'No classes'
                                        : 'No ${_classFilter.toLowerCase()} classes',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF192034),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    week.classes.isEmpty
                                        ? 'No published classes for this term. Ask the school office to check your teaching load.'
                                        : _classFilter != 'All'
                                        ? 'No ${_classFilter.toLowerCase()} classes for this date.'
                                        : 'No scheduled classes on ${const ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][_day - 1]}.',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      height: 1.5,
                                      color: Color(0xFF71809B),
                                    ),
                                  ),
                                ],
                              ),
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
    final words = entry.subject
        .trim()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();
    final initials = words.isEmpty
        ? '?'
        : '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
              .toUpperCase();
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
      shadowColor: Colors.black.withValues(alpha: 0.06),
      child: InkWell(
        onTap: () async {
          await context.push(
            '/workspace/classes/${Uri.encodeComponent(entry.id)}?title=${Uri.encodeComponent('${entry.subject} · ${entry.section}')}',
          );
          if (mounted) unawaited(_refresh());
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: const [
                      Color(0xFFF1F5F9),
                      Color(0xFFEFF6FF),
                      Color(0xFFFFFBEB),
                      Color(0xFFFAF5FF),
                      Color(0xFFFFF1F2),
                    ][entry.id.codeUnits.fold(0, (a, b) => a + b) % 5],
                    foregroundColor: const Color(0xFF52627C),
                    child: Text(
                      initials,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
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
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF334155),
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
