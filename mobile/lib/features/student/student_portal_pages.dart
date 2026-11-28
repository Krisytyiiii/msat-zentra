// Student portal screens — redesigned to match adviser workspace visual design.
// Read-only, self-scoped via /api/student/*.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../features/student/module_submission.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../services/portal_service.dart';
import '../adviser/schedule_timing.dart';
import '../home/overview_components.dart';

class StudentOverviewPage extends ConsumerStatefulWidget {
  const StudentOverviewPage({super.key});
  @override
  ConsumerState<StudentOverviewPage> createState() => _StudentOverviewState();
}

class _StudentOverviewState extends ConsumerState<StudentOverviewPage> {
  Future<void> _refresh() async {
    ref.invalidate(studentHomeProvider);
    try {
      await ref.read(studentHomeProvider.future);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ref.watch(studentHomeProvider).when(
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
                  onRetry: () => ref.invalidate(studentHomeProvider),
                ),
              ],
            ),
            data: (home) => _body(context, home),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, PortalHome home) {
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
          subtitle: 'Past the due date — submit as soon as you can.',
          onTap: () => context.go('/student/modules'),
        ),
      if (home.attendance.hasMarks && home.attendance.isRisk)
        OverviewAttentionRow(
          icon: LucideIcons.clipboardCheck,
          title: 'Attendance below 80%',
          subtitle: 'Your term attendance is ${home.attendance.percent}%.',
          onTap: () => context.go('/student/attendance'),
        ),
      if (inProgress > 0)
        OverviewAttentionRow(
          icon: LucideIcons.award,
          title: '$inProgress grade${inProgress == 1 ? '' : 's'} in progress',
          subtitle: 'Waiting for your teacher to finalize them.',
          onTap: () => context.go('/student/grades'),
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
              _welcome(home),
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
                onAction: () => context.go('/student/schedule'),
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
                      path: '/student/grades',
                    ),
                    OverviewStatItem(
                      label: 'Attendance',
                      value: home.attendance.hasMarks
                          ? home.attendance.percent
                          : null,
                      path: '/student/attendance',
                    ),
                    OverviewStatItem(
                      label: 'Overdue',
                      value: home.moduleCounts.overdue,
                      path: '/student/modules',
                    ),
                    OverviewStatItem(
                      label: 'Classes',
                      value: home.classCount,
                      path: '/student/schedule',
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
                onAction: () => context.go('/student/sessions'),
                child: sessions.isEmpty
                    ? const OverviewBoardNote('No upcoming sessions.')
                    : Column(
                        children: [
                          for (final session in sessions)
                            _PortalSessionRow(
                              session: session,
                              onTap: () => context.go('/student/sessions'),
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

  Widget _welcome(PortalHome home) {
    final theme = Theme.of(context);
    final learner = home.learner;
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
          learner.name.trim().isEmpty
              ? 'Welcome back.'
              : 'Welcome back,\n${learner.name}.',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontSize: 21,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
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
      return _UpNextClass(slot: slots.first, live: false);
    }
    final minutes = now.hour * 60 + now.minute;
    final next = windows.where((w) => w.end > minutes).firstOrNull;
    if (next == null) {
      return const OverviewBoardNote('No more scheduled classes today.');
    }
    return _UpNextClass(
      slot: next.slot,
      start: next.start,
      end: next.end,
      live: minutes >= next.start && minutes < next.end,
    );
  }
}

class _UpNextClass extends StatelessWidget {
  const _UpNextClass({
    required this.slot,
    this.start,
    this.end,
    required this.live,
  });

  final PortalScheduleSlot slot;
  final int? start;
  final int? end;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final parts = start == null ? const <String>[] : clockLabel(start!).split(' ');
    return Row(
      children: [
        if (parts.isNotEmpty) ...[
          Container(
            constraints: const BoxConstraints(minWidth: 66, minHeight: 64),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: accent.withValues(alpha: 0.30)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  parts.first,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: accent,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  live ? 'Now' : (parts.length > 1 ? parts[1] : ''),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                slot.subjectName,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                [
                  if (slot.teacherName != null) slot.teacherName!,
                  'Period ${slot.period + 1}',
                  if (start != null && end != null)
                    '${clockLabel(start!)} – ${clockLabel(end!)}',
                ].join(' · '),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PortalSessionRow extends StatelessWidget {
  const _PortalSessionRow({required this.session, required this.onTap});

  final PortalSession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = session.track == 'ADM'
        ? 'Parent conference'
        : session.sessionType.replaceAll('_', ' ');
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(
              session.track == 'ADM'
                  ? Icons.family_restroom
                  : Icons.support_agent,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${formatPortalDate(session.scheduledAt)} · ${session.venue.isEmpty ? 'Venue TBA' : session.venue}',
                    style: theme.textTheme.labelSmall,
                  ),
                ],
              ),
            ),
            Icon(
              LucideIcons.chevronRight,
              size: 18,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

class _GradeCard extends StatelessWidget {
  final PortalGrade grade;
  final VoidCallback? onTap;
  const _GradeCard({required this.grade, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ZCard(
      padding: const EdgeInsets.all(12),
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(grade.subjectName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text(grade.subjectCode, style: theme.textTheme.labelSmall),
                if (grade.teacherName != null && grade.teacherName!.isNotEmpty)
                  Text(grade.teacherName!, style: theme.textTheme.labelSmall),
                if (grade.remarks != null) Text(grade.remarks!, style: theme.textTheme.labelSmall),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (grade.isFinal)
                Text(
                  grade.transmutedGrade?.toStringAsFixed(0) ?? '—',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    color: (grade.transmutedGrade ?? 100) < 75 ? theme.colorScheme.error : null,
                  ),
                )
              else
                const ZStatusPill(text: 'In progress', tone: StatusTone.amber),
              Text(
                grade.isFinal ? 'Final' : 'Not yet final',
                style: theme.textTheme.labelSmall,
              ),
            ],
          ),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right, size: 18, color: theme.colorScheme.onSurfaceVariant),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Grades Page
// ---------------------------------------------------------------------------

class StudentGradesPage extends ConsumerStatefulWidget {
  const StudentGradesPage({super.key});
  @override
  ConsumerState<StudentGradesPage> createState() => _StudentGradesState();
}

class _StudentGradesState extends ConsumerState<StudentGradesPage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    ref.invalidate(studentGradesProvider);
    try {
      await ref.read(studentGradesProvider.future);
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
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final gradesAsync = ref.watch(studentGradesProvider);
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
                onRetry: () => ref.invalidate(studentGradesProvider),
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
    AsyncValue<PortalGrades> gradesAsync, {
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
            description: 'All your subjects this term. Tap one to see assessment scores.',
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
    final grades = data.grades.where((g) => query.isEmpty || g.subjectName.toLowerCase().contains(query)).toList();
    if (grades.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: Icons.grade_outlined,
            title: data.grades.isEmpty ? 'No subjects for this term' : 'No subjects match',
            subtitle: data.grades.isEmpty
                ? 'Your class load appears here once your section is linked.'
                : 'Try a different search.',
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      sliver: SliverList.separated(
        itemCount: grades.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final grade = grades[index];
          return _GradeCard(
            grade: grade,
            onTap: () => context.push(
              '/student/grades/${Uri.encodeComponent(grade.subjectId)}',
              extra: grade.subjectName,
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Attendance Page
// ---------------------------------------------------------------------------

class StudentAttendancePage extends ConsumerStatefulWidget {
  const StudentAttendancePage({super.key});
  @override
  ConsumerState<StudentAttendancePage> createState() => _StudentAttendanceState();
}

class _StudentAttendanceState extends ConsumerState<StudentAttendancePage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    ref.invalidate(studentAttendanceProvider);
    try {
      await ref.read(studentAttendanceProvider.future);
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
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final attendanceAsync = ref.watch(studentAttendanceProvider);
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
                onRetry: () => ref.invalidate(studentAttendanceProvider),
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
    AsyncValue<PortalAttendance> attendanceAsync, {
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
            description: 'Your attendance by class. Tap a class to see its log and heatmap.',
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
        .toList();
    final recent = data.recent
        .where((r) => query.isEmpty || (r.subjectName ?? 'Daily attendance').toLowerCase().contains(query))
        .toList();

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: ZCard(
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Overall attendance', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      Text(
                        s.hasMarks ? '${s.percent}%' : 'No marks',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 20,
                          color: s.hasMarks && s.isRisk ? theme.colorScheme.error : null,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(value: s.hasMarks ? s.rate.clamp(0, 1) : 0, minHeight: 8),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _stat(theme, 'Present', s.present),
                      _stat(theme, 'Absent', s.absent),
                      _stat(theme, 'Late', s.late),
                      _stat(theme, 'Excused', s.excused),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        if (bySubject.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: Text('Classes', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: bySubject.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final sub = bySubject[index];
                return ZCard(
                  padding: const EdgeInsets.all(12),
                  onTap: () => context.push(
                    '/student/attendance/${Uri.encodeComponent(sub.subjectId)}',
                    extra: sub.subjectName,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(sub.subjectName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            Text(
                              [
                                if (sub.subjectCode.isNotEmpty) sub.subjectCode,
                                if (sub.teacherName != null && sub.teacherName!.isNotEmpty) sub.teacherName!,
                              ].join(' · '),
                              style: theme.textTheme.labelSmall,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              sub.hasMarks
                                  ? 'P ${sub.present} · A ${sub.absent} · L ${sub.late}'
                                  : 'No attendance marks yet',
                              style: theme.textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        sub.hasMarks ? '${sub.percent}%' : 'No marks',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: sub.hasMarks ? 15 : 12,
                          color: sub.hasMarks && sub.percent < 80 ? theme.colorScheme.error : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: theme.colorScheme.onSurfaceVariant),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: Text('Recent records', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          ),
        ),
        if (recent.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: ZEmpty(icon: Icons.fact_check_outlined, title: 'No attendance records yet', compact: true),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: recent.take(20).length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final r = recent[index];
                return ZCard(
                  padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
                  child: ListTile(
                    dense: true,
                    title: Text(r.subjectName ?? 'Daily attendance', style: const TextStyle(fontSize: 13)),
                    subtitle: Text(formatPortalDate(r.date), style: const TextStyle(fontSize: 11)),
                    trailing: _statusChip(theme, r.status),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }

  Widget _stat(ThemeData theme, String label, int value) => Column(
    children: [
      Text('$value', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
      Text(label, style: theme.textTheme.labelSmall),
    ],
  );

  Widget _statusChip(ThemeData theme, String status) {
    final color = switch (status) {
      'present' => Colors.green,
      'absent' => theme.colorScheme.error,
      'late' => Colors.orange,
      _ => theme.colorScheme.onSurfaceVariant,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(status, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

// ---------------------------------------------------------------------------
// Schedule Page
// ---------------------------------------------------------------------------

class StudentSchedulePage extends ConsumerStatefulWidget {
  const StudentSchedulePage({super.key});
  @override
  ConsumerState<StudentSchedulePage> createState() => _StudentScheduleState();
}

class _StudentScheduleState extends ConsumerState<StudentSchedulePage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    ref.invalidate(studentScheduleProvider);
    try {
      await ref.read(studentScheduleProvider.future);
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
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final scheduleAsync = ref.watch(studentScheduleProvider);
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
                onRetry: () => ref.invalidate(studentScheduleProvider),
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
    AsyncValue<PortalSchedule> scheduleAsync, {
    required bool compact,
  }) {
    final term = portalScopeTerm(ref);
    final sectionName = scheduleAsync.asData?.value.sectionName;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Class Schedule',
            icon: Icons.calendar_month_outlined,
            description: 'Your designated classes for this term.',
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
    SchoolDayConfig? config;
    try {
      if (data.config != null) {
        config = SchoolDayConfig.fromJson(data.config!);
      }
    } catch (_) {
      config = null;
    }
    final slots = data.slots
        .where((s) => query.isEmpty || s.subjectName.toLowerCase().contains(query))
        .toList();
    if (slots.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: Icons.calendar_month_outlined,
            title: data.slots.isEmpty ? 'No schedule published yet' : 'No classes match',
            subtitle: data.slots.isEmpty ? null : 'Try a different search.',
          ),
        ),
      );
    }
    final byDay = <int, List<PortalScheduleSlot>>{};
    for (final s in slots) {
      byDay.putIfAbsent(s.day, () => []).add(s);
    }
    final days = byDay.keys.toList()..sort();
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
      sliver: SliverList.separated(
        itemCount: days.length,
        separatorBuilder: (_, _) => const SizedBox(height: 16),
        itemBuilder: (context, dayIndex) {
          final day = days[dayIndex];
          final daySlots = byDay[day]!;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(_dayName(day), style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Column(
                children: [
                  for (final slot in daySlots)
                    Builder(
                      builder: (context) {
                        final window =
                            config != null &&
                                slot.period >= 0 &&
                                slot.period < config.periods.length
                            ? config.periods[slot.period]
                            : null;
                        final time = window == null
                            ? null
                            : '${clockLabel(window.start)} – ${clockLabel(window.end)}';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: ZCard(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  radius: 14,
                                  backgroundColor:
                                      theme.colorScheme.surfaceContainerLow,
                                  child: Text(
                                    '${slot.period + 1}',
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        slot.subjectName,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      Text(
                                        slot.teacherName ?? slot.subjectCode,
                                        style: theme.textTheme.labelSmall,
                                      ),
                                    ],
                                  ),
                                ),
                                if (time != null)
                                  Text(
                                    time,
                                    style: theme.textTheme.labelSmall,
                                  ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  String _dayName(int day) => const ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day.clamp(0, 7)];
}

// ---------------------------------------------------------------------------
// Modules Page
// ---------------------------------------------------------------------------

class StudentModulesPage extends ConsumerStatefulWidget {
  const StudentModulesPage({super.key});
  @override
  ConsumerState<StudentModulesPage> createState() => _StudentModulesState();
}

class _StudentModulesState extends ConsumerState<StudentModulesPage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    ref.invalidate(studentModulesProvider);
    try {
      await ref.read(studentModulesProvider.future);
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
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final modulesAsync = ref.watch(studentModulesProvider);
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
                onRetry: () => ref.invalidate(studentModulesProvider),
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
    AsyncValue<PortalModules> modulesAsync, {
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
            description: 'Your learning modules for this term.',
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
          data: (data) => _counterStrip(context, data.counts),
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
    final activeTermId =
        ref.watch(portalTermsResultProvider).asData?.value.activeTermId;
    final selectedTermId = ref.watch(portalTermIdProvider);
    // Historical terms stay read-only; answers only belong to the open term.
    final canSubmit =
        selectedTermId == null || selectedTermId == activeTermId;
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
              return _ModuleCard(module: m, canSubmit: canSubmit);
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

class _ModuleCard extends ConsumerWidget {
  final PortalModule module;
  final bool canSubmit;
  const _ModuleCard({required this.module, this.canSubmit = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return ZCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(module.moduleName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
              _status(theme, module.status),
            ],
          ),
          if (module.description != null) ...[
            const SizedBox(height: 4),
            Text(module.description!, style: theme.textTheme.bodySmall),
          ],
          const SizedBox(height: 4),
          Text(
            module.dueDate == null ? 'No due date' : 'Due ${formatPortalDate(module.dueDate)}',
            style: theme.textTheme.labelSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (module.moduleUrl != null)
                OutlinedButton.icon(
                  onPressed: () => _open(module.moduleUrl!),
                  icon: const Icon(Icons.open_in_new, size: 14),
                  label: const Text('Open module', style: TextStyle(fontSize: 12)),
                ),
              if (module.submitted)
                Text('Submitted ${formatPortalDate(module.submittedAt)}', style: theme.textTheme.labelSmall)
              else if (module.tracked)
                Text('Not yet submitted', style: theme.textTheme.labelSmall),
            ],
          ),
          if (canSubmit && module.tracked && module.moduleUrl != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              icon: const Icon(Icons.upload_outlined, size: 16),
              label: Text(module.submitted ? 'Update answer' : 'Submit answer'),
              onPressed: () => showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                builder: (_) => ModuleSubmissionSheet(module: module),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _status(ThemeData theme, String status) {
    final color = switch (status) {
      'submitted' => Colors.green,
      'overdue' => theme.colorScheme.error,
      'pending' => Colors.orange,
      _ => theme.colorScheme.onSurfaceVariant,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
      child: Text(status, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

// ---------------------------------------------------------------------------
// Sessions Page
// ---------------------------------------------------------------------------

class StudentSessionsPage extends ConsumerStatefulWidget {
  const StudentSessionsPage({super.key});
  @override
  ConsumerState<StudentSessionsPage> createState() => _StudentSessionsState();
}

class _StudentSessionsState extends ConsumerState<StudentSessionsPage> {
  String _lastQuery = '';
  String _lastTerm = '';

  Future<void> _refresh() async {
    ref.invalidate(studentSessionsProvider);
    try {
      await ref.read(studentSessionsProvider.future);
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
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final sessionsAsync = ref.watch(studentSessionsProvider);
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
                onRetry: () => ref.invalidate(studentSessionsProvider),
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
    AsyncValue<List<PortalSession>> sessionsAsync, {
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
            description: 'Your upcoming sessions.',
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