// Parent portal screens — redesigned to match adviser workspace visual design.
// Read-only, child-scoped via /api/parent/*.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../shared/date_strip_selector.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../services/portal_service.dart';
import '../adviser/schedule_timing.dart';
import '../home/overview_components.dart';
import '../portal/portal_widgets.dart';
import 'parent_link_prompt.dart';

// ---------------------------------------------------------------------------
// Parent Home Page (Dashboard)
// ---------------------------------------------------------------------------

class ParentOverviewPage extends ConsumerStatefulWidget {
  const ParentOverviewPage({super.key});
  @override
  ConsumerState<ParentOverviewPage> createState() => _ParentOverviewState();
}

class _ParentOverviewState extends ConsumerState<ParentOverviewPage> {
  Future<void> _refresh() async {
    final childId = ref.read(selectedChildProvider);
    ref.invalidate(parentChildrenProvider);
    ref.invalidate(parentLinkRequestsProvider);
    ref.invalidate(parentMeProvider);
    if (childId != null) {
      ref.invalidate(parentHomeProvider(childId));
      try {
        await ref.read(parentHomeProvider(childId).future);
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    final childId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);

    Widget frame(Widget child) => Theme(
      data: theme,
      child: ColoredBox(color: theme.scaffoldBackgroundColor, child: child),
    );

    if (childId == null) {
      return frame(
        children.when(
          loading: () => const ScreenSkeleton(
            layout: SkeletonLayout.overview,
            label: 'Loading overview',
          ),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentChildrenProvider),
              ),
            ],
          ),
          data: (_) => _noChildBody(),
        ),
      );
    }

    return frame(
      RefreshIndicator(
        onRefresh: _refresh,
        child: ref.watch(parentHomeProvider(childId)).when(
          loading: () => const ScreenSkeleton(
            layout: SkeletonLayout.overview,
            label: 'Loading overview',
          ),
          error: (error, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentHomeProvider(childId)),
              ),
            ],
          ),
          data: (home) => _body(context, home),
        ),
      ),
    );
  }

  /// No approved child yet: the same link prompt every parent desk shows.
  /// Approval makes [parentChildrenProvider] return the learner on the next
  /// poll, which auto-selects them and loads their overview.
  Widget _noChildBody() {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: const [
          SizedBox(height: 24),
          ParentLinkPrompt(),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, PortalHome home) {
    final parent = ref.watch(parentMeProvider).asData?.value;
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    final now = philippineTime(DateTime.now());
    final dayConfig = SchoolDayConfig.tryFromJson(home.config);
    final slots = home.todaySlots
        .where((s) => query.isEmpty || s.subjectName.toLowerCase().contains(query))
        .toList();
    final sessions = home.upcomingSessions
        .where((s) => query.isEmpty || s.sessionType.toLowerCase().contains(query))
        .toList();

    final inProgress = home.grades.where((g) => !g.isFinal).length;
    final attention = <Widget>[
      if (home.moduleCounts.overdue > 0)
        OverviewAttentionRow(
          icon: LucideIcons.folderOpen,
          title:
              '${home.moduleCounts.overdue} overdue module${home.moduleCounts.overdue == 1 ? '' : 's'}',
          subtitle: 'Past the due date — follow up with your child.',
          onTap: () => context.go('/parent/modules'),
        ),
      if (home.attendance.hasMarks && home.attendance.isRisk)
        OverviewAttentionRow(
          icon: LucideIcons.clipboardCheck,
          title: 'Attendance below 80%',
          subtitle: 'Term attendance is ${home.attendance.percent}%.',
          onTap: () => context.go('/parent/attendance'),
        ),
      if (inProgress > 0)
        OverviewAttentionRow(
          icon: LucideIcons.award,
          title: '$inProgress grade${inProgress == 1 ? '' : 's'} in progress',
          subtitle: 'Waiting for the teacher to finalize them.',
          onTap: () => context.go('/parent/grades'),
        ),
    ];

    return SingleChildScrollView(
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
              _welcome(home, parent),
              const SizedBox(height: 16),
              OverviewBoard(
                icon: LucideIcons.bell,
                title: 'Needs attention',
                count: attention.isEmpty ? null : attention.length,
                child: attention.isEmpty
                    ? const OverviewAllClear(
                        text: 'Nothing needs your attention right now.',
                      )
                    : Column(children: attention),
              ),
              const SizedBox(height: 16),
              OverviewBoard(
                icon: LucideIcons.clock,
                title: 'Up next',
                action: 'View schedule',
                onAction: () => context.go('/parent/schedule'),
                child: _upNext(context, home, slots, dayConfig, now),
              ),
              const SizedBox(height: 16),
              OverviewBoard(
                icon: LucideIcons.activity,
                title: 'At a glance',
                child: OverviewStatsGrid(
                  columns: 2,
                  items: [
                    OverviewStatItem(
                      label: 'Average',
                      value: home.average?.round(),
                      path: '/parent/grades',
                    ),
                    OverviewStatItem(
                      label: 'Attendance',
                      value: home.attendance.hasMarks
                          ? home.attendance.percent
                          : null,
                      path: '/parent/attendance',
                    ),
                    OverviewStatItem(
                      label: 'Overdue',
                      value: home.moduleCounts.overdue,
                      path: '/parent/modules',
                    ),
                    OverviewStatItem(
                      label: 'Classes',
                      value: home.classCount,
                      path: '/parent/schedule',
                    ),
                  ],
                  onOpen: (path) => context.go(path),
                ),
              ),
              const SizedBox(height: 16),
              OverviewBoard(
                icon: LucideIcons.calendarCheck,
                title: 'Upcoming sessions',
                action: 'View all',
                onAction: () => context.go('/parent/sessions'),
                child: sessions.isEmpty
                    ? const OverviewBoardNote('No upcoming sessions.')
                    : Column(
                        children: [
                          for (final session in sessions)
                            PortalSessionRow(
                              session: session,
                              onTap: () => context.go('/parent/sessions'),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _welcome(PortalHome home, PortalParent? parent) {
    final theme = Theme.of(context);
    final learner = home.learner;
    final parentName = parent?.name.trim() ?? '';
    final gradeSection = [
      if (learner.gradeLevel.isNotEmpty)
        learner.gradeLevel.replaceFirst(
          RegExp(r'^Grade\s*', caseSensitive: false),
          'G',
        ),
      if (learner.sectionName != null) learner.sectionName!,
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          parentName.isEmpty ? 'Welcome back.' : 'Welcome back,\n$parentName.',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontSize: 21,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(
              'Monitoring',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: ZScopePill(
                text: learner.name,
                kind: ScopePillKind.learner,
                label: 'Learner',
                compact: true,
                maxLines: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            ZScopePill(
              text: home.term.schoolYearName,
              kind: ScopePillKind.schoolYear,
              compact: true,
            ),
            ZScopePill(
              text: 'Term ${home.term.termNumber}',
              kind: ScopePillKind.term,
              compact: true,
            ),
            if (gradeSection.isNotEmpty)
              ZScopePill(
                text: gradeSection,
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
          ],
        ),
      ],
    );
  }

  Widget _upNext(
    BuildContext context,
    PortalHome home,
    List<PortalScheduleSlot> slots,
    SchoolDayConfig? config,
    DateTime now,
  ) {
    if (slots.isEmpty) {
      final weekday = DateFormat('EEEE').format(now);
      return ZEmpty(
        icon: LucideIcons.calendarDays,
        title: 'No classes',
        subtitle: home.todaySlots.isEmpty
            ? 'No scheduled classes on $weekday.'
            : 'No classes match your search.',
      );
    }
    final windows = <({PortalScheduleSlot slot, int start, int end})>[];
    if (config != null) {
      for (final slot in slots) {
        if (slot.period < 0 || slot.period >= config.periods.length) continue;
        final window = config.periods[slot.period];
        windows.add((slot: slot, start: window.start, end: window.end));
      }
    }
    windows.sort((a, b) => a.start.compareTo(b.start));
    if (windows.isEmpty) {
      // No timing config in the payload: still show the first class.
      return PortalUpNextClass(slot: slots.first, live: false);
    }
    final minutes = now.hour * 60 + now.minute;
    final next = windows.where((w) => w.end > minutes).firstOrNull;
    if (next == null) {
      return const OverviewBoardNote('No more scheduled classes today.');
    }
    return PortalUpNextClass(
      slot: next.slot,
      start: next.start,
      end: next.end,
      live: minutes >= next.start && minutes < next.end,
    );
  }
}

// ---------------------------------------------------------------------------
// Parent Grades Page
// ---------------------------------------------------------------------------

class ParentGradesPage extends ConsumerStatefulWidget {
  const ParentGradesPage({super.key});
  @override
  ConsumerState<ParentGradesPage> createState() => _ParentGradesState();
}

class _ParentGradesState extends ConsumerState<ParentGradesPage> {
  String _lastQuery = '';
  String _lastTerm = '';
  bool _descending = false;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentGradesProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
        child: LayoutBuilder(
          builder: (context, constraints) =>
              _content(context, compact: constraints.maxHeight < 650),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, {required bool compact}) {
    final term = portalScopeTerm(ref);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }

    // Show child selection prompt when no child is selected
    if (selectedChildId == null) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                child: _header(context, const AsyncValue.data(null), compact: compact),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: ParentLinkPrompt(),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
            ),
          ],
        ),
      );
    }

    final gradesAsync = ref.watch(parentGradesProvider(selectedChildId));
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _header(context, gradesAsync, compact: compact),
            ),
          ),
          gradesAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
            ),
            error: (error, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentGradesProvider(selectedChildId)),
              ),
            ),
            data: (data) => _list(context, data, query),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }

  Widget _header(
    BuildContext context,
    AsyncValue<PortalGrades?> gradesAsync, {
    required bool compact,
  }) {
    final term = portalScopeTerm(ref);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Grades',
            icon: Icons.grade_outlined,
            description: 'All subjects for your child this term. Tap one to see assessment scores.',
          ),
          const SizedBox(height: 12),
        ],
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
      ],
    );
  }

  Widget _list(BuildContext context, PortalGrades data, String query) {
    final theme = Theme.of(context);
    final grades = data.grades
        .where((g) => query.isEmpty || g.subjectName.toLowerCase().contains(query))
        .toList()
      ..sort(
        (a, b) => _descending
            ? b.subjectName.toLowerCase().compareTo(a.subjectName.toLowerCase())
            : a.subjectName.toLowerCase().compareTo(b.subjectName.toLowerCase()),
      );
    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: PortalGradeSummaryCard(grades: data.grades),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Showing ${grades.length} subjects',
                    style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => setState(() => _descending = !_descending),
                  icon: const Icon(LucideIcons.listFilter, size: 14),
                  label: Text(
                    _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: theme.colorScheme.onSurface,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (grades.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: ZEmpty(
                icon: Icons.grade_outlined,
                title: data.grades.isEmpty ? 'No subjects yet' : 'No subjects match',
                subtitle: data.grades.isEmpty
                    ? 'No published subjects for this term. Ask the school office to check your section schedule.'
                    : 'Try a different search.',
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: grades.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final grade = grades[index];
                final childId = ref.read(selectedChildProvider);
                return PortalGradeCard(
                  grade: grade,
                  onTap: childId == null
                      ? null
                      : () => context.push(
                            '/parent/children/${Uri.encodeComponent(childId)}/grades/'
                            '${Uri.encodeComponent(grade.subjectId)}',
                            extra: grade.subjectName,
                          ),
                );
              },
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Parent Attendance Page
// ---------------------------------------------------------------------------

class ParentAttendancePage extends ConsumerStatefulWidget {
  const ParentAttendancePage({super.key});
  @override
  ConsumerState<ParentAttendancePage> createState() => _ParentAttendanceState();
}

class _ParentAttendanceState extends ConsumerState<ParentAttendancePage> {
  String _lastQuery = '';
  String _lastTerm = '';
  bool _descending = false;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentAttendanceProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
        child: LayoutBuilder(
          builder: (context, constraints) =>
              _content(context, compact: constraints.maxHeight < 650),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, {required bool compact}) {
    final term = portalScopeTerm(ref);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }

    // Show child selection prompt when no child is selected
    if (selectedChildId == null) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                child: _header(context, const AsyncValue.data(null), compact: compact),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: ParentLinkPrompt(),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
            ),
          ],
        ),
      );
    }

    final attendanceAsync = ref.watch(parentAttendanceProvider(selectedChildId));
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _header(context, attendanceAsync, compact: compact),
            ),
          ),
          attendanceAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
            ),
            error: (error, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentAttendanceProvider(selectedChildId)),
              ),
            ),
            data: (data) => _list(context, data, query),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }

  Widget _header(
    BuildContext context,
    AsyncValue<PortalAttendance?> attendanceAsync, {
    required bool compact,
  }) {
    final term = portalScopeTerm(ref);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Attendance',
            icon: Icons.fact_check_outlined,
            description: "Your child's attendance by class. Tap a class to see its log and heatmap.",
          ),
          const SizedBox(height: 12),
        ],
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
      ],
    );
  }

  Widget _list(BuildContext context, PortalAttendance data, String query) {
    final theme = Theme.of(context);
    final s = data.summary;
    final bySubject = data.bySubject
        .where((sub) => query.isEmpty || sub.subjectName.toLowerCase().contains(query))
        .toList()
      ..sort(
        (a, b) => _descending
            ? b.subjectName.toLowerCase().compareTo(a.subjectName.toLowerCase())
            : a.subjectName.toLowerCase().compareTo(b.subjectName.toLowerCase()),
      );

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: PortalAttendanceRateCard(summary: s),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Showing ${bySubject.length} classes',
                    style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => setState(() => _descending = !_descending),
                  icon: const Icon(LucideIcons.listFilter, size: 14),
                  label: Text(
                    _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: theme.colorScheme.onSurface,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (bySubject.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: bySubject.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final sub = bySubject[index];
                return PortalSubjectCard(
                  seed: sub.subjectId,
                  title: sub.subjectName,
                  subtitle: sub.teacherName != null && sub.teacherName!.isNotEmpty
                      ? sub.teacherName!
                      : sub.subjectCode,
                  trailing: ZStatusPill(
                    text: sub.hasMarks ? '${sub.percent}%' : 'No marks',
                    tone: !sub.hasMarks
                        ? StatusTone.neutral
                        : sub.percent < 80
                            ? StatusTone.red
                            : StatusTone.green,
                    label: 'Present rate',
                  ),
                  footer: sub.hasMarks ? '' : 'No attendance marks yet',
                  footerChild: sub.hasMarks
                      ? PortalAttendanceBreakdown(
                          present: sub.present,
                          absent: sub.absent,
                          late: sub.late,
                          excused: sub.excused,
                        )
                      : null,
                  onTap: () {
                    final childId = ref.read(selectedChildProvider);
                    if (childId == null) return;
                    context.push(
                      '/parent/children/${Uri.encodeComponent(childId)}/attendance/'
                      '${Uri.encodeComponent(sub.subjectId)}',
                      extra: sub.subjectName,
                    );
                  },
                );
              },
            ),
          )
        else
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: ZEmpty(
                icon: Icons.calendar_month_outlined,
                title: data.bySubject.isEmpty ? 'No classes yet' : 'No matching classes',
                subtitle: data.bySubject.isEmpty
                    ? 'No published classes for this term. Ask the school office to check your section schedule.'
                    : 'Try a different search.',
              ),
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Parent Schedule Page
// ---------------------------------------------------------------------------

class ParentSchedulePage extends ConsumerStatefulWidget {
  const ParentSchedulePage({super.key});
  @override
  ConsumerState<ParentSchedulePage> createState() => _ParentScheduleState();
}

class _ParentScheduleState extends ConsumerState<ParentSchedulePage> {
  String _lastQuery = '';
  String _lastTerm = '';
  late final DateTime _dateAnchor;
  late DateTime _selectedDate;
  String _classFilter = 'All';

  @override
  void initState() {
    super.initState();
    final now = philippineTime(DateTime.now());
    _dateAnchor = DateTime.utc(now.year, now.month, now.day);
    _selectedDate = _dateAnchor;
    _lastTerm = '';
  }

  (DateTime, DateTime) _bounds(PortalTerm? term) {
    var first = _dateAnchor.subtract(const Duration(days: 10000));
    var last = DateTime.utc(9999, 12, 31);
    final start = term?.startDate;
    final end = term?.endDate;
    if (start != null) {
      final parsed = DateTime.tryParse(start);
      if (parsed != null) first = DateTime.utc(parsed.year, parsed.month, parsed.day);
    }
    if (end != null) {
      final parsed = DateTime.tryParse(end);
      if (parsed != null) last = DateTime.utc(parsed.year, parsed.month, parsed.day);
    }
    return (first, last);
  }

  void _syncTerm(PortalTerm? term) {
    final (first, last) = _bounds(term);
    var target = _dateAnchor;
    if (target.isBefore(first)) target = first;
    if (target.isAfter(last)) target = last;
    _selectedDate = target;
  }

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId == null) return;
    ref.invalidate(parentScheduleProvider(selectedChildId));
    try {
      await ref.read(parentScheduleProvider(selectedChildId).future);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
        child: LayoutBuilder(
          builder: (context, constraints) =>
              _content(context, compact: constraints.maxHeight < 650),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, {required bool compact}) {
    final term = portalScopeTerm(ref);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
      _syncTerm(term);
      _classFilter = 'All';
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final selectedChildId = ref.watch(selectedChildProvider);

    if (selectedChildId == null) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                child: _header(context, const AsyncValue.data(null), compact: compact),
              ),
            ),
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: ParentLinkPrompt(),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
            ),
          ],
        ),
      );
    }

    final scheduleAsync = ref.watch(parentScheduleProvider(selectedChildId));
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _header(context, scheduleAsync, compact: compact),
            ),
          ),
          scheduleAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
            ),
            error: (error, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentScheduleProvider(selectedChildId)),
              ),
            ),
            data: (data) => _list(context, data, query),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }

  Widget _header(
    BuildContext context,
    AsyncValue<PortalSchedule?> scheduleAsync, {
    required bool compact,
  }) {
    final term = portalScopeTerm(ref);
    final sectionName = scheduleAsync.asData?.value?.sectionName;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Class Schedule',
            icon: LucideIcons.bookOpen,
            description: "Your child's classes and weekly schedule.",
          ),
          const SizedBox(height: 12),
        ],
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
            if (sectionName != null)
              ZScopePill(
                text: sectionName,
                kind: ScopePillKind.grade,
                label: 'Section',
                compact: true,
              ),
          ],
        ),
      ],
    );
  }

  Widget _list(BuildContext context, PortalSchedule data, String query) {
    final theme = Theme.of(context);
    final today = _dateAnchor;
    final now = philippineTime(DateTime.now());
    final nowMinute = now.hour * 60 + now.minute;
    final day = _selectedDate.weekday;
    final config = SchoolDayConfig.tryFromJson(data.config);
    final (first, last) = _bounds(portalScopeTerm(ref));

    final searchMatches = data.slots
        .where((s) => query.isEmpty || s.subjectName.toLowerCase().contains(query))
        .toList();
    final daySlots = searchMatches.where((s) => s.day == day).toList()
      ..sort((a, b) => a.period.compareTo(b.period));

    bool completed(PortalScheduleSlot slot) {
      final window = config != null &&
              slot.period >= 0 &&
              slot.period < config.periods.length
          ? config.periods[slot.period]
          : null;
      if (window == null) return _selectedDate.isBefore(today);
      if (_selectedDate.isBefore(today)) return true;
      return _selectedDate.isAtSameMomentAs(today) && nowMinute >= window.end;
    }

    final filtered = daySlots.where((slot) {
      if (_classFilter == 'All') return true;
      final done = completed(slot);
      return _classFilter == 'Completed' ? done : !done;
    }).toList();
    final count = filtered.length;

    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DateStripSelector(
              selectedDate: _selectedDate,
              today: today,
              firstDate: first,
              lastDate: last,
              stripKey: const ValueKey('parent-class-date-selector'),
              pickerHelpText: 'Choose class date',
              hasEvent: (date) =>
                  data.slots.any((slot) => slot.day == date.weekday),
              onChanged: (date) => setState(
                () => _selectedDate = DateTime.utc(date.year, date.month, date.day),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Showing $count ${count == 1 ? 'class' : 'classes'}',
                    style: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => setState(() {
                    const options = ['All', 'Completed', 'Pending'];
                    _classFilter =
                        options[(options.indexOf(_classFilter) + 1) %
                            options.length];
                  }),
                  icon: const Icon(LucideIcons.listFilter, size: 14),
                  label: Text(
                    _classFilter,
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: theme.colorScheme.onSurface,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 0,
                    ),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (count == 0)
              ZEmpty(
                icon: LucideIcons.calendarDays,
                title: data.slots.isEmpty
                    ? 'No classes yet'
                    : query.isNotEmpty
                        ? 'No classes match'
                        : _classFilter == 'All'
                            ? 'No classes'
                            : 'No ${_classFilter.toLowerCase()} classes',
                subtitle: data.slots.isEmpty
                    ? "No published classes for this term. Ask the school office to check your child's section schedule."
                    : query.isNotEmpty
                        ? 'Try a different search.'
                        : _classFilter != 'All'
                            ? 'No ${_classFilter.toLowerCase()} classes for this date.'
                            : 'No scheduled classes on ${const ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day - 1]}.',
              )
            else
              for (final slot in filtered) ...[
                _classCard(context, slot, config),
                const SizedBox(height: 12),
              ],
          ],
        ),
      ),
    );
  }

  Widget _classCard(
    BuildContext context,
    PortalScheduleSlot slot,
    SchoolDayConfig? config,
  ) {
    final window = config != null &&
            slot.period >= 0 &&
            slot.period < config.periods.length
        ? config.periods[slot.period]
        : null;
    final timing = window == null
        ? 'Time not configured'
        : '${clockLabel(window.start)} – ${clockLabel(window.end)}';
    return PortalSubjectCard(
      seed: slot.subjectId,
      title: slot.subjectName,
      subtitle: slot.teacherName ?? slot.subjectCode,
      trailing: ZStatusPill(
        text: 'P${slot.period + 1}',
        tone: StatusTone.blue,
        label: 'Period',
      ),
      footer: timing,
    );
  }
}

// ---------------------------------------------------------------------------
// Parent Modules Page
// ---------------------------------------------------------------------------

class ParentModulesPage extends ConsumerStatefulWidget {
  const ParentModulesPage({super.key});
  @override
  ConsumerState<ParentModulesPage> createState() => _ParentModulesState();
}

class _ParentModulesState extends ConsumerState<ParentModulesPage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentModulesProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
        child: LayoutBuilder(
          builder: (context, constraints) =>
              _content(context, compact: constraints.maxHeight < 650),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, {required bool compact}) {
    final term = portalScopeTerm(ref);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }

    // Show child selection prompt when no child is selected
    if (selectedChildId == null) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                child: _header(context, const AsyncValue.data(null), compact: compact),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: ParentLinkPrompt(),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
            ),
          ],
        ),
      );
    }

    final modulesAsync = ref.watch(parentModulesProvider(selectedChildId));
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _header(context, modulesAsync, compact: compact),
            ),
          ),
          modulesAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
            ),
            error: (error, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentModulesProvider(selectedChildId)),
              ),
            ),
            data: (data) => _list(context, data, query),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }

  Widget _header(
    BuildContext context,
    AsyncValue<PortalModules?> modulesAsync, {
    required bool compact,
  }) {
    final term = portalScopeTerm(ref);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Modules',
            icon: Icons.folder_shared_outlined,
            description: "Your child's learning modules for this term.",
          ),
          const SizedBox(height: 12),
        ],
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
        const SizedBox(height: 12),
        modulesAsync.when(
          data: (data) {
            if (data != null) return _counterStrip(context, data.counts);
            return const SizedBox();
          },
          loading: () => const SizedBox(),
          error: (_, _) => const SizedBox(),
        ),
      ],
    );
  }

  Widget _counterStrip(BuildContext context, PortalModuleCounts counts) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(child: _count(theme, '${counts.all}', 'All')),
        Expanded(child: _count(theme, '${counts.submitted}', 'Submitted')),
        Expanded(child: _count(theme, '${counts.pending}', 'Pending')),
        Expanded(child: _count(theme, '${counts.overdue}', 'Overdue')),
      ],
    );
  }

  Widget _count(ThemeData theme, String value, String label) => Column(
    children: [
      Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
      Text(label, style: theme.textTheme.labelSmall),
    ],
  );

  Widget _list(BuildContext context, PortalModules data, String query) {
    final modules = data.modules
        .where((m) => query.isEmpty || m.moduleName.toLowerCase().contains(query))
        .toList();
    if (modules.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: Icons.folder_shared_outlined,
            title: data.modules.isEmpty ? 'No modules released yet' : 'No modules match',
            subtitle: data.modules.isEmpty ? null : 'Try a different search.',
          ),
        ),
      );
    }
    return SliverMainAxisGroup(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          sliver: SliverList.separated(
            itemCount: modules.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final m = modules[index];
              return PortalModuleCard(module: m);
            },
          ),
        ),
        if (data.totalPages > 1)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    tooltip: 'Previous page',
                    onPressed: data.page > 1
                        ? () => ref.read(portalModulePageProvider.notifier).state = data.page - 1
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text('${data.page} / ${data.totalPages}'),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: data.page < data.totalPages
                        ? () => ref.read(portalModulePageProvider.notifier).state = data.page + 1
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Parent Sessions Page
// ---------------------------------------------------------------------------

class ParentSessionsPage extends ConsumerStatefulWidget {
  const ParentSessionsPage({super.key});
  @override
  ConsumerState<ParentSessionsPage> createState() => _ParentSessionsState();
}

class _ParentSessionsState extends ConsumerState<ParentSessionsPage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentSessionsProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
        child: LayoutBuilder(
          builder: (context, constraints) =>
              _content(context, compact: constraints.maxHeight < 650),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, {required bool compact}) {
    final term = portalScopeTerm(ref);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }

    // Show child selection prompt when no child is selected
    if (selectedChildId == null) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                child: _header(context, const AsyncValue.data(null), compact: compact),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: ParentLinkPrompt(),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
            ),
          ],
        ),
      );
    }

    final sessionsAsync = ref.watch(parentSessionsProvider(selectedChildId));
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _header(context, sessionsAsync, compact: compact),
            ),
          ),
          sessionsAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
            ),
            error: (error, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorView(
                message: error,
                onRetry: () => ref.invalidate(parentSessionsProvider(selectedChildId)),
              ),
            ),
            data: (sessions) => _list(context, sessions, query),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }

  Widget _header(
    BuildContext context,
    AsyncValue<List<PortalSession>?> sessionsAsync, {
    required bool compact,
  }) {
    final term = portalScopeTerm(ref);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Sessions',
            icon: Icons.event_available_outlined,
            description: "Your child's upcoming sessions.",
          ),
          const SizedBox(height: 12),
        ],
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
      ],
    );
  }

  Widget _list(BuildContext context, List<PortalSession> sessions, String query) {
    final filtered = sessions.where((s) => query.isEmpty || s.sessionType.toLowerCase().contains(query)).toList();
    if (filtered.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: Icons.event_available_outlined,
            title: sessions.isEmpty ? 'No upcoming sessions' : 'No sessions match',
            subtitle: sessions.isEmpty ? null : 'Try a different search.',
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      sliver: SliverList.separated(
        itemCount: filtered.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final s = filtered[index];
          final theme = Theme.of(context);
          return ZCard(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(s.track == 'ADM' ? Icons.family_restroom : Icons.support_agent, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.track == 'ADM' ? 'Parent conference' : s.sessionType.replaceAll('_', ' '),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${formatPortalDate(s.scheduledAt)} · ${s.venue.isEmpty ? 'Venue TBA' : s.venue}',
                        style: theme.textTheme.labelSmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
