// Student portal screens — redesigned to match adviser workspace visual design.
// Read-only, self-scoped via /api/student/*.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../features/student/module_submission.dart';
import '../../shared/date_strip_selector.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../services/portal_service.dart';
import '../adviser/schedule_timing.dart';
import '../home/overview_components.dart';
import '../portal/portal_widgets.dart';

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
                            PortalSessionRow(
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
          return PortalGradeCard(
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
                return PortalSubjectCard(
                  seed: sub.subjectId,
                  title: sub.subjectName,
                  subtitle:
                      sub.teacherName != null && sub.teacherName!.isNotEmpty
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
                  footer: sub.hasMarks
                      ? 'P ${sub.present} · A ${sub.absent} · L ${sub.late}'
                      : 'No attendance marks yet',
                  onTap: () => context.push(
                    '/student/attendance/${Uri.encodeComponent(sub.subjectId)}',
                    extra: sub.subjectName,
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
      _syncTerm(term);
      _classFilter = 'All';
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
            icon: LucideIcons.bookOpen,
            description: 'Your classes and weekly schedule.',
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
              stripKey: const ValueKey('student-class-date-selector'),
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
                    ? 'No published classes for this term. Ask the school office to check your section schedule.'
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
// Modules Page
// ---------------------------------------------------------------------------

class StudentModulesPage extends ConsumerStatefulWidget {
  const StudentModulesPage({super.key, this.kind});
  /// `adm` opens the ADM Modules desk (ADM learners only).
  final String? kind;
  @override
  ConsumerState<StudentModulesPage> createState() => _StudentModulesState();
}

class _StudentModulesState extends ConsumerState<StudentModulesPage> {
  String _lastQuery = '';
  String _lastTerm = '';

  bool get _admOnly => widget.kind == 'adm';

  Future<void> _refresh() async {
    ref.invalidate(studentModulesProvider);
    try {
      await ref.read(studentModulesProvider(widget.kind).future);
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
    final modulesAsync = ref.watch(studentModulesProvider(widget.kind));
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
                onRetry: () =>
                    ref.invalidate(studentModulesProvider(widget.kind)),
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
            title: _admOnly ? 'ADM Modules' : 'Modules',
            icon: Icons.folder_shared_outlined,
            description: _admOnly
                ? 'Your ADM learning modules for this term.'
                : 'Your learning modules for this term.',
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
            title: data.modules.isEmpty
                ? (_admOnly ? 'No ADM modules released yet' : 'No modules released yet')
                : 'No modules match',
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
              return PortalModuleCard(
                module: m,
                onSubmit: canSubmit
                    ? () => showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          showDragHandle: true,
                          builder: (_) => ModuleSubmissionSheet(module: m),
                        )
                    : null,
              );
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
// Sessions Page
// ---------------------------------------------------------------------------

class StudentSessionsPage extends ConsumerStatefulWidget {
  const StudentSessionsPage({super.key, this.admOnly = false});
  /// ADM Sessions desk (ADM learners only).
  final bool admOnly;
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
            title: widget.admOnly ? 'ADM Sessions' : 'Sessions',
            icon: Icons.event_available_outlined,
            description: widget.admOnly
                ? 'Your upcoming ADM meetings and conferences.'
                : 'Your upcoming sessions.',
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
    final source = sessions
        .where((s) => !widget.admOnly || s.track == 'ADM')
        .toList();
    final filtered = source
        .where((s) => query.isEmpty || s.sessionType.toLowerCase().contains(query))
        .toList();
    if (filtered.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: Icons.event_available_outlined,
            title: source.isNotEmpty
                ? 'No ${widget.admOnly ? 'ADM ' : ''}sessions match'
                : 'No upcoming ${widget.admOnly ? 'ADM ' : ''}sessions',
            subtitle: source.isNotEmpty ? 'Try a different search.' : null,
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