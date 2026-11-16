import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/widget_previews.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/session.dart';
import '../../design/screen_search.dart';
import '../../design/theme.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import '../adviser/adviser_schedule_page.dart';
import 'overview_data.dart';

/// A compact staff landing page, not a second reporting dashboard.
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
    final term = ref.watch(termProvider);
    final adviser =
        summary.asData?.value.isAdviser ??
        (ref.watch(authProvider).role == 'adviser');
    final section = summary.asData?.value.sectionName;
    final theme = Theme.of(context);
    // The staff shell already names this screen in the header.
    final inShell = ScreenSearchScope.maybeOf(context) != null;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!inShell) ...[
                  Text('Overview', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 6),
                ],
                summary.when(
                  data: (data) => Text(
                    data.teacherName.trim().isEmpty
                        ? 'Welcome back.'
                        : 'Welcome back, ${data.teacherName}.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  loading: () => const Text('Welcome back.'),
                  error: (error, _) => _InlineError(
                    error: error,
                    retry: () => ref.invalidate(overviewProvider),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  [
                    if (term != null)
                      '${term.schoolYearName.isEmpty ? 'Selected school year' : term.schoolYearName} · Term ${term.termNumber}',
                    if (section != null && section.isNotEmpty) section,
                  ].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 20),
                const _Heading('Quick actions'),
                const SizedBox(height: 10),
                OverviewQuickActions(isAdviser: adviser, onOpen: _open),
                const SizedBox(height: 24),
                _Heading(
                  'Up next',
                  action: 'View schedule',
                  onAction: () => _open(
                    adviser ? '/adviser/schedule' : '/workspace/schedule',
                  ),
                ),
                const SizedBox(height: 10),
                _OverviewPanel(
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
                const SizedBox(height: 24),
                const _Heading('Needs attention'),
                const SizedBox(height: 10),
                _attention(summary, attention),
                const SizedBox(height: 24),
                const _Heading('At a glance'),
                const SizedBox(height: 10),
                summary.when(
                  loading: () => const ZSkeletonRow(),
                  error: (error, _) => _InlineError(
                    error: error,
                    retry: () => ref.invalidate(overviewProvider),
                  ),
                  data: (data) => OverviewStats(summary: data, onOpen: _open),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _upNext(OverviewSchedule schedule) {
    final notice = schedule.scopeNotice(_now);
    final next = schedule.nextClass(_now);
    if (notice != null || next == null) {
      return Text(
        notice ?? 'No upcoming confirmed classes in this term.',
        style: Theme.of(context).textTheme.bodySmall,
      );
    }
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
        Icon(
          Icons.schedule_outlined,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                next.slot.subjectName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                next.slot.sectionName,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Text(
                '${today ? 'Today' : DateFormat('EEE, MMM d').format(start)} · ${DateFormat('h:mm a').format(start)} – ${DateFormat('h:mm a').format(end)} · PH',
                style: Theme.of(context).textTheme.bodySmall,
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
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Grading summary is unavailable.'),
                  TextButton(
                    onPressed: () => _open('/workspace/gradebook'),
                    child: const Text('Check Gradebook'),
                  ),
                ],
              );
            }
            if (count == 0) return const SizedBox.shrink();
            return _AttentionCard(
              icon: Icons.edit_note_outlined,
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
                top: pending != null && pending > 0 ? 10 : 0,
              ),
              child: _AttentionCard(
                icon: Icons.support_agent_outlined,
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
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              data.isAdviser
                  ? 'No missing scores or advisory risk alerts from these checks.'
                  : 'No missing scores from these checks.',
            ),
          ),
      ],
    );
  }
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
          constraints.maxWidth >= 330 &&
          MediaQuery.textScalerOf(context).scale(13) <= 16;
      final theme = Theme.of(context);
      final actions = [
        (
          label: 'Chat with Bama',
          icon: Icons.chat_bubble_outline,
          path: '/adviser/bama',
          enabled: isAdviser,
          accent: theme.colorScheme.primary,
        ),
        (
          label: 'Enter grades',
          icon: Icons.edit_note_outlined,
          path: '/workspace/gradebook',
          enabled: true,
          accent: theme.colorScheme.secondary,
        ),
        (
          label: 'Take attendance',
          icon: Icons.fact_check_outlined,
          path: '/workspace/attendance',
          enabled: true,
          accent: theme.colorScheme.onSurfaceVariant,
        ),
      ];
      final tiles = [
        for (final action in actions)
          _OverviewActionTile(
            label: action.label,
            icon: action.icon,
            accent: action.accent,
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
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.value?.toString() ?? '—',
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
                            fontSize: 25,
                            color: Theme.of(context).colorScheme.primary,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item.label,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (item.value == null)
                      Text(
                        'Unavailable',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
            ),
          ),
      ];
      final dividerColor = theme.colorScheme.outline.withValues(alpha: 0.55);
      return _OverviewPanel(
        key: const ValueKey('overview-stats-panel'),
        padding: EdgeInsets.zero,
        child: row
            ? IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < tiles.length; i++) ...[
                      if (i > 0)
                        VerticalDivider(
                          width: 1,
                          thickness: 1,
                          indent: 16,
                          endIndent: 16,
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
                        indent: 16,
                        endIndent: 16,
                        color: dividerColor,
                      ),
                    tiles[i],
                  ],
                ],
              ),
      );
    },
  );
}

class _Heading extends StatelessWidget {
  const _Heading(this.title, {this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 12,
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      Text(title, style: Theme.of(context).textTheme.titleMedium),
      if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
    ],
  );
}

class _AttentionCard extends StatelessWidget {
  const _AttentionCard({
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
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      border: Border(
        bottom: BorderSide(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.55),
        ),
      ),
    ),
    child: Material(
      color: Colors.transparent,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          focusColor: Theme.of(context).colorScheme.secondary
              .withValues(alpha: 0.12),
          hoverColor: Theme.of(context).colorScheme.secondary
              .withValues(alpha: 0.04),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
            child: Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.secondary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right, size: 18),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

// Local to Overview: the loading hand-off uses quiet 1px borders and 10px
// corners. Do not change shared ZCard or any other workspace's presentation.
class _OverviewPanel extends StatelessWidget {
  const _OverviewPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.cardTheme.color ?? theme.colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(
          color: theme.colorScheme.outline.withValues(alpha: 0.72),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(padding: padding, child: child),
    );
  }
}

class _OverviewActionTile extends StatelessWidget {
  const _OverviewActionTile({
    required this.label,
    required this.icon,
    required this.accent,
    required this.stacked,
    this.onTap,
  });
  final String label;
  final IconData icon;
  final Color accent;
  final bool stacked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;
    final ink = enabled ? accent : theme.colorScheme.onSurfaceVariant;
    final copy = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.titleSmall),
        if (!enabled) ...[
          const SizedBox(height: 4),
          Text(
            'Advisers only',
            style: theme.textTheme.bodySmall?.copyWith(
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
        padding: const WidgetStatePropertyAll(EdgeInsets.all(14)),
        animationDuration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 150),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? theme.colorScheme.onSurfaceVariant
              : theme.colorScheme.onSurface,
        ),
        backgroundColor: WidgetStatePropertyAll(
          Color.alphaBlend(
            ink.withValues(alpha: enabled ? 0.025 : 0.01),
            theme.cardTheme.color ?? theme.colorScheme.surface,
          ),
        ),
        side: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return BorderSide(
              color: theme.colorScheme.outline.withValues(alpha: 0.6),
            );
          }
          if (states.contains(WidgetState.focused)) {
            return BorderSide(color: accent, width: 1.5);
          }
          if (states.contains(WidgetState.pressed) ||
              states.contains(WidgetState.hovered)) {
            return BorderSide(color: accent.withValues(alpha: 0.65));
          }
          return BorderSide(
            color: Color.alphaBlend(
              accent.withValues(alpha: 0.16),
              theme.colorScheme.outline,
            ),
          );
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
                Icon(icon, size: 22, color: ink),
                const SizedBox(width: 12),
                Expanded(child: copy),
                if (enabled)
                  Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
              ],
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 22, color: ink),
                const SizedBox(height: 10),
                copy,
              ],
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
        Text(userMessage(error), style: Theme.of(context).textTheme.bodySmall),
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
  theme: zWorkspaceTheme(),
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
  theme: zWorkspaceTheme(),
  home: Scaffold(
    body: Padding(
      padding: const EdgeInsets.all(16),
      child: OverviewQuickActions(isAdviser: false, onOpen: (_) {}),
    ),
  ),
);
