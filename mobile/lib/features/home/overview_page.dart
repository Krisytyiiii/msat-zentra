import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/widget_previews.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../shared/models.dart' show Term;
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import '../adviser/adviser_schedule_page.dart';
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
    // Reuse the schedule screen's provider instead of fetching a second roster.
    ref.invalidate(adviserScheduleProvider);
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
    final adviser =
        summary.asData?.value.isAdviser ??
        (ref.watch(authProvider).role == 'adviser');
    final section = summary.asData?.value.sectionName;
    final theme = Theme.of(context);
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
                  Text('Overview', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 10),
                ],
                _welcome(summary, term, section),
                const SizedBox(height: 16),
                _Board(
                  icon: LucideIcons.bell,
                  title: 'Needs attention',
                  count: attentionCount > 0 ? attentionCount : null,
                  child: _attention(summary, attention),
                ),
                const SizedBox(height: 16),
                _Board(
                  icon: LucideIcons.clock,
                  title: 'Up next',
                  action: 'View schedule',
                  onAction: () => _open(
                    adviser ? '/adviser/schedule' : '/workspace/schedule',
                  ),
                  child: schedule.when(
                    loading: () => const ZSkeletonRow(),
                    error: (error, _) => _InlineError(
                      error: error,
                      retry: () {
                        ref.invalidate(adviserScheduleProvider);
                        ref.invalidate(schoolYearsProvider);
                        ref.invalidate(overviewScheduleProvider);
                      },
                    ),
                    data: _upNext,
                  ),
                ),
                const SizedBox(height: 16),
                _Board(
                  key: const ValueKey('overview-stats-panel'),
                  icon: LucideIcons.activity,
                  title: 'At a glance',
                  child: summary.when(
                    loading: () => const ZSkeletonRow(),
                    error: (error, _) => _InlineError(
                      error: error,
                      retry: () => ref.invalidate(overviewProvider),
                    ),
                    data: (data) => OverviewStats(summary: data, onOpen: _open),
                  ),
                ),
                const SizedBox(height: 16),
                _Board(
                  icon: LucideIcons.chartPie,
                  title: 'Risk mix',
                  child: insights.when(
                    loading: () => const ZSkeletonRow(),
                    error: (error, _) => _InlineError(
                      error: error,
                      retry: () => ref.invalidate(overviewInsightsProvider),
                    ),
                    data: (data) => OverviewRiskMix(insights: data),
                  ),
                ),
                const SizedBox(height: 16),
                _Board(
                  icon: LucideIcons.chartColumn,
                  title: 'Attendance, day by day',
                  child: insights.when(
                    loading: () => const ZSkeletonRow(),
                    error: (error, _) => _InlineError(
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

  Widget _welcome(
    AsyncValue<OverviewSummary> summary,
    Term? term,
    String? section,
  ) {
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
          loading: () => Text(
            'Welcome back.',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontSize: 21,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
          error: (error, _) => _InlineError(
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
              ZPill(
                tone: StatusTone.blue,
                label: 'School year',
                child: Text(schoolYear),
              ),
            if (term != null)
              ZPill(
                tone: StatusTone.amber,
                label: 'Term',
                child: Text('Term ${term.termNumber}'),
              ),
            if (section != null && section.isNotEmpty)
              ZPill(
                tone: StatusTone.violet,
                label: 'Section',
                child: Text(section),
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
      return _BoardNote(
        notice ?? 'No upcoming confirmed classes in this term.',
      );
    }
    final theme = Theme.of(context);
    final accent = ZDesk.dataAccent(context);
    final start = philippineTime(next.startsAt);
    final end = philippineTime(next.endsAt);
    final now = philippineTime(_now);
    final today =
        start.year == now.year &&
        start.month == now.month &&
        start.day == now.day;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(ZTokens.radiusMd),
            border: Border.all(color: accent.withValues(alpha: 0.28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                DateFormat('h:mm').format(start),
                style: theme.textTheme.titleSmall?.copyWith(
                  color: accent,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              Text(
                DateFormat('a').format(start),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: accent,
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
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                next.slot.sectionName,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${today ? 'Today' : DateFormat('EEE, MMM d').format(start)} · ${DateFormat('h:mm a').format(start)} – ${DateFormat('h:mm a').format(end)} · PH',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
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
          error: (error, _) => _InlineError(
            error: error,
            retry: () => ref.invalidate(overviewSecondaryProvider),
          ),
          data: (data) {
            final count = data.pendingAssessments;
            if (count == null) {
              return _ActionRequired(
                message: 'Grading summary is unavailable.',
                action: 'Check Gradebook',
                onAction: () => _open('/workspace/gradebook'),
              );
            }
            if (count == 0) return const SizedBox.shrink();
            return _AttentionRow(
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
              child: _AttentionRow(
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
          _AllClear(
            text: data.isAdviser
                ? 'No missing scores or advisory risk alerts from these checks.'
                : 'No missing scores from these checks.',
          ),
      ],
    );
  }
}

/// Web `KanbanBoard` chrome: amber icon + title + counts/action slot, a
/// hairline under the title, and the body on the card surface.
class _Board extends StatelessWidget {
  const _Board({
    super.key,
    required this.icon,
    required this.title,
    required this.child,
    this.count,
    this.action,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final Widget child;
  final int? count;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final hairline = theme.colorScheme.outline.withValues(alpha: 0.7);
    return Material(
      color: theme.cardTheme.color ?? theme.colorScheme.surface,
      elevation: 1,
      shadowColor: Colors.black.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(14, 8, action == null ? 14 : 6, 8),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(icon, size: 18, color: accent),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (count != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      '$count',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                if (action != null)
                  // Keep the action at the trailing edge, while allowing
                  // its label to shrink on narrow or large-text layouts.
                  Flexible(
                    flex: 3,
                    fit: FlexFit.loose,
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: onAction,
                        style: TextButton.styleFrom(
                          minimumSize: const Size(0, 40),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          foregroundColor: theme.colorScheme.onSurfaceVariant,
                          textStyle: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        child: Text(
                          action!,
                          maxLines: 1,
                          softWrap: false,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // Hairline as a plain box: a header `Divider` would be counted as a
          // stats row separator elsewhere and can't be themed per board.
          Container(height: 1, color: hairline),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// Quiet body copy for an empty board.
class _BoardNote extends StatelessWidget {
  const _BoardNote(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: Theme.of(context).colorScheme.surfaceContainerLow,
          child: Icon(
            LucideIcons.calendarDays,
            size: 18,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    ),
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
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final items = [
        (
          label: 'Classes',
          value: summary.classCount,
          path: '/workspace/classes',
        ),
        (
          label: summary.isAdviser ? 'Advisees' : 'Learners',
          value: summary.learnerCount,
          path: summary.isAdviser ? '/adviser/advisory' : '/workspace/classes',
        ),
        if (summary.isAdviser)
          (
            label: 'Need support',
            value: summary.supportCount,
            path: '/adviser/advisory',
          ),
      ];
      final row =
          constraints.maxWidth >= 330 &&
          MediaQuery.textScalerOf(context).scale(13) <= 16;
      final theme = Theme.of(context);
      final accent = theme.colorScheme.primary;
      final tiles = [
        for (final item in items)
          Semantics(
            button: true,
            child: InkWell(
              onTap: () => onOpen(item.path),
              focusColor: theme.colorScheme.primary.withValues(alpha: 0.12),
              hoverColor: theme.colorScheme.primary.withValues(alpha: 0.04),
              highlightColor: theme.colorScheme.primary.withValues(alpha: 0.08),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(6, 10, 6, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      item.value?.toString() ?? '—',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color: accent,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.label.toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.7,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (item.value == null)
                      Text(
                        'Unavailable',
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
      ];
      final dividerColor = theme.colorScheme.outline.withValues(alpha: 0.7);
      return row
          ? IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < tiles.length; i++) ...[
                    if (i > 0)
                      VerticalDivider(
                        width: 1,
                        thickness: 1,
                        indent: 10,
                        endIndent: 10,
                        color: dividerColor,
                      ),
                    Expanded(child: tiles[i]),
                  ],
                ],
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < tiles.length; i++) ...[
                  if (i > 0)
                    Divider(
                      height: 1,
                      indent: 14,
                      endIndent: 14,
                      color: dividerColor,
                    ),
                  tiles[i],
                ],
              ],
            );
    },
  );
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = ZDesk.dataAccent(context);
    return Material(
      color: Colors.transparent,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ZTokens.radiusMd),
          focusColor: accent.withValues(alpha: 0.12),
          hoverColor: accent.withValues(alpha: 0.04),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(ZTokens.radiusMd),
                  ),
                  child: Icon(icon, size: 17, color: accent),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: theme.textTheme.titleSmall),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronRight,
                  size: 18,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionRequired extends StatelessWidget {
  const _ActionRequired({
    required this.message,
    required this.action,
    required this.onAction,
  });
  final String message;
  final String action;
  final VoidCallback onAction;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(message),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton(onPressed: onAction, child: Text(action)),
      ),
    ],
  );
}

/// Amber-tinted "nothing needs action" callout — the web `InsightCallout`
/// shape, one message per board.
class _AllClear extends StatelessWidget {
  const _AllClear({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const accent = Color(0xFF059669);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: ZDesk.isDark(context) ? 0.10 : 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.32)),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.circleCheck, size: 16, color: accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodySmall?.copyWith(height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
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

class _InlineError extends StatelessWidget {
  const _InlineError({required this.error, required this.retry});
  final Object error;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          userMessage(error),
          style: Theme.of(context).textTheme.bodySmall
              ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        TextButton(onPressed: retry, child: const Text('Try again')),
      ],
    ),
  );
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
