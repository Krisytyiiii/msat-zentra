import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/widget_previews.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/screen_search.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../shared/models.dart' show Term;
import '../../shared/widgets.dart';
import '../teacher/classes_data.dart';
import 'overview_components.dart';
import 'overview_data.dart';
import 'overview_insights.dart';

/// A compact staff landing page, not a second reporting dashboard.
///
/// Presentation follows the web teacher overview: amber figures and board
/// icons, monochrome ink for copy, bordered boards with a title row and a
/// counts/actions slot. Data sources are unchanged.
class OverviewPage extends ConsumerStatefulWidget {
  const OverviewPage({super.key});
  @override
  ConsumerState<OverviewPage> createState() => _OverviewPageState();
}

class _OverviewPageState extends ConsumerState<OverviewPage>
    with WidgetsBindingObserver {
  Timer? _timer;
  Future<void>? _refreshFlight;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _now = ref.read(overviewClockProvider)();
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
    setState(() => _now = ref.read(overviewClockProvider)());
    // Share Class's published load and timing configuration.
    ref.invalidate(teachingWeekProvider);
    final futures = <Future<Object?>>[
      ref.refresh(overviewProvider.future),
      ref.refresh(overviewSecondaryProvider.future),
      ref.refresh(overviewScheduleProvider.future),
      ref.refresh(overviewInsightsProvider.future),
    ];
    // Each section owns its error; keep the refresh indicator until all settle.
    await Future.wait(
      futures.map(
        (future) =>
            future.then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ),
    );
  }

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(overviewSummaryProvider);
    final attention = ref.watch(overviewAttentionProvider);
    final schedule = ref.watch(overviewScheduleProvider);
    final insights = ref.watch(overviewInsightsProvider);
    final term = ref.watch(termProvider);
    // The staff shell already names this screen in the header.
    final inShell = ScreenSearchScope.maybeOf(context) != null;
    final pending = attention.asData?.value.pendingAssessments;
    final support = summary.asData?.value.isAdviser == true
        ? summary.asData?.value.supportCount
        : null;
    final attentionCount = (pending ?? 0) + (support ?? 0);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          112 + MediaQuery.paddingOf(context).bottom,
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!inShell) ...[
                  const ZContentHeader(
                    title: 'Overview',
                    icon: LucideIcons.layoutDashboard,
                  ),
                  const SizedBox(height: 10),
                ],
                _welcome(summary, term),
                const SizedBox(height: 16),
                OverviewBoard(
                  icon: LucideIcons.bell,
                  title: 'Needs attention',
                  count: attentionCount > 0 ? attentionCount : null,
                  child: _attention(summary, attention),
                ),
                const SizedBox(height: 16),
                OverviewBoard(
                  icon: LucideIcons.clock,
                  title: 'Up next',
                  action: 'View schedule',
                  onAction: () => _open('/workspace/classes'),
                  child: schedule.when(
                    loading: () => const ZSkeletonRow(),
                    error: (error, _) => OverviewInlineError(
                      error: error,
                      retry: () {
                        ref.invalidate(teachingWeekProvider);
                        ref.invalidate(schoolYearsProvider);
                        ref.invalidate(overviewScheduleProvider);
                      },
                    ),
                    data: _upNext,
                  ),
                ),
                const SizedBox(height: 16),
                OverviewBoard(
                  key: const ValueKey('overview-stats-panel'),
                  icon: LucideIcons.activity,
                  title: 'At a glance',
                  child: summary.when(
                    loading: () => const ScreenSkeleton(
                      layout: SkeletonLayout.summary,
                      section: true,
                    ),
                    error: (error, _) => OverviewInlineError(
                      error: error,
                      retry: () => ref.invalidate(overviewProvider),
                    ),
                    data: (data) => OverviewStats(summary: data, onOpen: _open),
                  ),
                ),
                const SizedBox(height: 16),
                OverviewBoard(
                  icon: LucideIcons.chartPie,
                  title: 'Risk mix',
                  child: insights.when(
                    loading: () => const ScreenSkeleton(
                      layout: SkeletonLayout.chart,
                      section: true,
                    ),
                    error: (error, _) => OverviewInlineError(
                      error: error,
                      retry: () => ref.invalidate(overviewInsightsProvider),
                    ),
                    data: (data) => OverviewRiskMix(insights: data),
                  ),
                ),
                const SizedBox(height: 16),
                OverviewBoard(
                  icon: LucideIcons.chartColumn,
                  title: 'Attendance, day by day',
                  child: insights.when(
                    loading: () => const ScreenSkeleton(
                      layout: SkeletonLayout.chart,
                      section: true,
                    ),
                    error: (error, _) => OverviewInlineError(
                      error: error,
                      retry: () => ref.invalidate(overviewInsightsProvider),
                    ),
                    data: (data) => OverviewDailyAttendance(insights: data),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _welcome(AsyncValue<OverviewSummary> summary, Term? term) {
    final theme = Theme.of(context);
    final schoolYear = term == null
        ? null
        : term.schoolYearName.isEmpty
        ? 'Selected school year'
        : term.schoolYearName;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        summary.when(
          data: (data) => Text(
            data.teacherName.trim().isEmpty
                ? 'Welcome back.'
                : 'Welcome back,\n${data.teacherName}.',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontSize: 21,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
          loading: () => const SkeletonBox(height: 48),
          error: (error, _) => OverviewInlineError(
            error: error,
            retry: () => ref.invalidate(overviewProvider),
          ),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (schoolYear != null)
              ZScopePill(
                text: schoolYear,
                kind: ScopePillKind.schoolYear,
                compact: true,
              ),
            if (term != null)
              ZScopePill(
                text: 'Term ${term.termNumber}',
                kind: ScopePillKind.term,
                compact: true,
              ),
          ],
        ),
      ],
    );
  }

  Widget _upNext(OverviewSchedule schedule) {
    final notice = schedule.scopeNotice(_now);
    final next = schedule.nextClass(_now);
    if (notice != null || next == null) {
      final ph = philippineTime(_now);
      final hadClasses = schedule.slots.any(
        (slot) => slot.day == ph.weekday && slot.status == 'APPROVED',
      );
      return notice != null
          ? OverviewBoardNote(notice)
          : ZEmpty(
              icon: LucideIcons.calendarDays,
              title: 'No classes',
              subtitle: hadClasses
                  ? 'No more scheduled classes today.'
                  : 'No scheduled classes on ${DateFormat('EEEE').format(ph)}.',
            );
    }
    final theme = Theme.of(context);
    const accent = Color(0xffb45309);
    final start = philippineTime(next.startsAt);
    final end = philippineTime(next.endsAt);
    final now = philippineTime(_now);
    final today =
        start.year == now.year &&
        start.month == now.month &&
        start.day == now.day;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          constraints: const BoxConstraints(minWidth: 60, minHeight: 64),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xfffff8eb),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xfffde0b4)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                DateFormat('h:mm').format(start),
                style: theme.textTheme.titleSmall?.copyWith(
                  color: accent,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              Text(
                DateFormat('a').format(start),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: accent,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                next.slot.subjectName,
                style: theme.textTheme.titleSmall?.copyWith(
                  color: const Color(0xff080d23),
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                next.slot.sectionName,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  _ScheduleMeta(
                    icon: LucideIcons.calendar,
                    text:
                        !_now.isBefore(next.startsAt) &&
                            _now.isBefore(next.endsAt)
                        ? 'Now'
                        : today
                        ? 'Today'
                        : DateFormat('EEE, MMM d').format(start),
                  ),
                  _ScheduleMeta(
                    icon: LucideIcons.clock,
                    text:
                        '${DateFormat('h:mm a').format(start)} – ${DateFormat('h:mm a').format(end)}',
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _attention(
    AsyncValue<OverviewSummary> summary,
    AsyncValue<OverviewAttention> attention,
  ) {
    final data = summary.asData?.value;
    final pending = attention.asData?.value.pendingAssessments;
    final support = data?.isAdviser == true ? data?.supportCount : null;
    final clear =
        pending == 0 && data != null && (!data.isAdviser || support == 0);
    // Two supported, actionable summaries. Never enumerate learners/history here.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        attention.when(
          loading: () => const ZSkeletonRow(),
          error: (error, _) => OverviewInlineError(
            error: error,
            retry: () => ref.invalidate(overviewSecondaryProvider),
          ),
          data: (data) {
            final count = data.pendingAssessments;
            if (count == null) {
              return OverviewActionRequired(
                message: 'Grading summary is unavailable.',
                action: 'Check Gradebook',
                onAction: () => _open('/workspace/gradebook'),
              );
            }
            if (count == 0) return const SizedBox.shrink();
            return OverviewAttentionRow(
              icon: LucideIcons.notebookPen,
              title:
                  '$count assessment${count == 1 ? '' : 's'} with missing scores',
              subtitle: 'Review and enter scores in Gradebook.',
              onTap: () => _open('/workspace/gradebook'),
            );
          },
        ),
        if (data?.isAdviser == true) ...[
          if (support == null)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('Your advisory support summary is unavailable.'),
            ),
          if (support != null && support > 0)
            Padding(
              padding: EdgeInsets.only(
                top: pending != null && pending > 0 ? 8 : 0,
              ),
              child: OverviewAttentionRow(
                icon: LucideIcons.heart,
                title:
                    '$support learner${support == 1 ? '' : 's'} may need support',
                subtitle: 'Review your advisory list and risk indicators.',
                onTap: () => _open('/adviser/advisory'),
              ),
            ),
        ],
        if (data == null && summary.hasError)
          const Text(
            'Learner support checks are unavailable. Retry the overview summary above.',
          ),
        if (clear)
          OverviewAllClear(
            text: data.isAdviser
                ? 'No missing scores or advisory risk alerts from these checks.'
                : 'No missing scores from these checks.',
          ),
      ],
    );
  }
}

class _ScheduleMeta extends StatelessWidget {
  const _ScheduleMeta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 16, color: const Color(0xff52647b)),
      const SizedBox(width: 5),
      Flexible(
        child: Text(
          text,
          style: const TextStyle(fontSize: 12, color: Color(0xff52647b)),
        ),
      ),
    ],
  );
}

class OverviewQuickActions extends StatelessWidget {
  const OverviewQuickActions({
    super.key,
    required this.isAdviser,
    required this.onOpen,
  });
  final bool isAdviser;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final row =
          constraints.maxWidth >= 260 &&
          MediaQuery.textScalerOf(context).scale(13) <= 16;
      final actions = [
        (
          label: 'Chat with Bama',
          icon: LucideIcons.messageCircle,
          path: '/adviser/bama',
          enabled: isAdviser,
        ),
        (
          label: 'Enter grades',
          icon: LucideIcons.notebookPen,
          path: '/workspace/gradebook',
          enabled: true,
        ),
        (
          label: 'Take attendance',
          icon: LucideIcons.clipboardCheck,
          path: '/workspace/attendance',
          enabled: true,
        ),
      ];
      final tiles = [
        for (final action in actions)
          _OverviewActionTile(
            label: action.label,
            icon: action.icon,
            stacked: !row,
            onTap: action.enabled ? () => onOpen(action.path) : null,
          ),
      ];
      if (row) {
        // Three small tiles only: intrinsic sizing keeps their borders aligned,
        // including when the Bama restriction adds a second line of text.
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < tiles.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(child: tiles[i]),
              ],
            ],
          ),
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < tiles.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            tiles[i],
          ],
        ],
      );
    },
  );
}

class OverviewStats extends StatelessWidget {
  const OverviewStats({super.key, required this.summary, required this.onOpen});
  final OverviewSummary summary;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) => OverviewStatsGrid(
    items: [
      OverviewStatItem(
        label: 'Classes',
        value: summary.classCount,
        path: '/workspace/classes',
      ),
      OverviewStatItem(
        label: summary.isAdviser ? 'Advisees' : 'Learners',
        value: summary.learnerCount,
        path: summary.isAdviser ? '/adviser/advisory' : '/workspace/classes',
      ),
      if (summary.isAdviser)
        OverviewStatItem(
          label: 'Need support',
          value: summary.supportCount,
          path: '/adviser/advisory',
        ),
    ],
    onOpen: onOpen,
  );
}

class _OverviewActionTile extends StatelessWidget {
  const _OverviewActionTile({
    required this.label,
    required this.icon,
    required this.stacked,
    this.onTap,
  });
  final String label;
  final IconData icon;
  final bool stacked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;
    final accent = ZDesk.dataAccent(context);
    final iconColor = enabled ? accent : theme.colorScheme.onSurfaceVariant;
    final chip = Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: enabled
            ? accent.withValues(alpha: 0.12)
            : theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(ZTokens.radiusMd),
      ),
      child: Icon(icon, size: 17, color: iconColor),
    );
    final copy = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.titleSmall),
        if (!enabled) ...[
          const SizedBox(height: 2),
          Text(
            'Advisers only',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 11,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ],
    );
    return OutlinedButton(
      onPressed: onTap,
      style: ButtonStyle(
        alignment: Alignment.centerLeft,
        minimumSize: const WidgetStatePropertyAll(Size(48, 64)),
        padding: const WidgetStatePropertyAll(EdgeInsets.all(12)),
        animationDuration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : ZTokens.micro,
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ZTokens.radiusXl),
          ),
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? theme.colorScheme.onSurfaceVariant
              : theme.colorScheme.onSurface,
        ),
        backgroundColor: WidgetStatePropertyAll(
          theme.cardTheme.color ?? theme.colorScheme.surface,
        ),
        side: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return BorderSide(
              color: theme.colorScheme.outline.withValues(alpha: 0.8),
            );
          }
          if (states.contains(WidgetState.focused)) {
            return BorderSide(color: accent, width: 1.5);
          }
          if (states.contains(WidgetState.pressed) ||
              states.contains(WidgetState.hovered)) {
            return BorderSide(color: accent.withValues(alpha: 0.65));
          }
          return BorderSide(color: accent.withValues(alpha: 0.30));
        }),
        overlayColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.focused) ||
              states.contains(WidgetState.pressed)) {
            return accent.withValues(alpha: 0.10);
          }
          if (states.contains(WidgetState.hovered)) {
            return accent.withValues(alpha: 0.05);
          }
          return Colors.transparent;
        }),
      ),
      child: stacked
          ? Row(
              children: [
                chip,
                const SizedBox(width: 10),
                Expanded(child: copy),
                if (enabled)
                  Icon(
                    LucideIcons.chevronRight,
                    size: 18,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
              ],
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [chip, const SizedBox(height: 8), copy],
            ),
    );
  }
}

@Preview(
  name: 'Compact Overview actions',
  group: 'Overview',
  size: Size(390, 280),
)
Widget overviewQuickActionsPreview() => MaterialApp(
  theme: zDarkTheme(deskCanvas: true),
  home: Scaffold(
    body: Padding(
      padding: const EdgeInsets.all(16),
      child: OverviewQuickActions(isAdviser: true, onOpen: (_) {}),
    ),
  ),
);

@Preview(
  name: 'Overview actions · subject teacher',
  group: 'Overview',
  size: Size(390, 280),
)
Widget overviewTeacherActionsPreview() => MaterialApp(
  theme: zDarkTheme(deskCanvas: true),
  home: Scaffold(
    body: Padding(
      padding: const EdgeInsets.all(16),
      child: OverviewQuickActions(isAdviser: false, onOpen: (_) {}),
    ),
  ),
);
