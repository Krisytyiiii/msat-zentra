// Parent portal screens — redesigned to match adviser workspace visual design.
// Read-only, child-scoped via /api/parent/*.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../services/portal_service.dart';

// ---------------------------------------------------------------------------
// Parent Home Page (Dashboard)
// ---------------------------------------------------------------------------

class ParentHomePage extends ConsumerStatefulWidget {
  const ParentHomePage({super.key});
  @override
  ConsumerState<ParentHomePage> createState() => _ParentHomeState();
}

class _ParentHomeState extends ConsumerState<ParentHomePage> {
  String _lastQuery = '';
  String _lastTerm = '';
  String? _lastChildId;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentHomeProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) => _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    if (_lastChildId != selectedChildId) {
      _lastChildId = selectedChildId;
    }
    final query = (ScreenSearchScope.maybeOf(context)?.query ?? '')
        .trim()
        .toLowerCase();
    if (_lastQuery != query) {
      _lastQuery = query;
    }
    final homeAsync = selectedChildId != null ? ref.watch(parentHomeProvider(selectedChildId)) : const AsyncValue.data(null);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _header(context, homeAsync, compact: compact),
            ),
          ),
          homeAsync.when(
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
                onRetry: selectedChildId != null ? () => ref.invalidate(parentHomeProvider(selectedChildId)) : null,
              ),
            ),
            data: (home) => home != null ? _body(context, home, query) : SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Text('Select a child to view their dashboard')),
            ),
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
    AsyncValue<PortalHome?> homeAsync, {
    required bool compact,
  }) {
    final term = ref.watch(termProvider);
    final selectedChildId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);
    PortalChild? child;
    if (selectedChildId != null) {
      child = children.when(
        data: (list) {
          try {
            return list.firstWhere((c) => c.studentId == selectedChildId);
          } catch (_) {
            return null;
          }
        },
        loading: () => null,
        error: (_, _) => null,
      );
    } else {
      child = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Home',
            icon: Icons.home_outlined,
            description: 'Overview for ${child?.name ?? 'your child'}.',
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
            if (child != null)
              ZScopePill(
                text: [
                  if (child.gradeLevel.isNotEmpty)
                    child.gradeLevel.replaceFirst(RegExp(r'^Grade\s*', caseSensitive: false), 'G'),
                  child.sectionName ?? '',
                ].where((v) => v.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
          ],
        ),
      ],
    );
  }

  Widget _body(BuildContext context, PortalHome home, String query) {
    final theme = Theme.of(context);
    final l = home.learner;
    final grades = home.grades.where((g) => query.isEmpty || g.subjectName.toLowerCase().contains(query)).toList();
    final todaySlots = home.todaySlots.where((s) => query.isEmpty || s.subjectName.toLowerCase().contains(query)).toList();
    final sessions = home.upcomingSessions.where((s) => query.isEmpty || s.sessionType.toLowerCase().contains(query)).toList();

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ZCard(
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 26,
                        backgroundColor: theme.colorScheme.surfaceContainerLow,
                        child: Text(
                          l.name.isEmpty ? '?' : l.name.substring(0, 1).toUpperCase(),
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(l.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                            Text(
                              '${l.gradeLevel}${l.sectionName == null ? '' : ' · ${l.sectionName}'}',
                              style: theme.textTheme.bodySmall,
                            ),
                            if (l.adviserName != null)
                              Text('Adviser: ${l.adviserName}', style: theme.textTheme.labelSmall),
                            Text(home.term.label, style: theme.textTheme.labelSmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ZKpi(
                        value: home.average == null ? '—' : home.average!.toStringAsFixed(1),
                        label: 'Average',
                        icon: Icons.grade_outlined,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ZKpi(
                        value: '${home.attendance.percent}%',
                        label: 'Attendance',
                        icon: Icons.fact_check_outlined,
                        desc: home.attendance.isRisk ? 'Below 80%' : null,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ZKpi(
                        value: '${home.moduleCounts.overdue}',
                        label: 'Overdue',
                        icon: Icons.folder_off_outlined,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (todaySlots.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: Text("Today's classes", style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: todaySlots.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final slot = todaySlots[index];
                return ZCard(
                  padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
                  child: ListTile(
                    dense: true,
                    leading: CircleAvatar(
                      radius: 14,
                      backgroundColor: theme.colorScheme.surfaceContainerLow,
                      child: Text('${slot.period}', style: const TextStyle(fontSize: 11)),
                    ),
                    title: Text(slot.subjectName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    subtitle: Text(slot.teacherName ?? slot.subjectCode, style: const TextStyle(fontSize: 11)),
                    trailing: _slotStatusChip(context, slot.status),
                  ),
                );
              },
            ),
          ),
        ],
        if (grades.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: Text('Grades', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: grades.take(6).length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final g = grades[index];
                return _GradeCard(grade: g, compact: true);
              },
            ),
          ),
        ] else ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: ZEmpty(icon: Icons.grade_outlined, title: 'No grades yet for this term', compact: true),
            ),
          ),
        ],
        if (sessions.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: Text('Upcoming sessions', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            sliver: SliverList.separated(
              itemCount: sessions.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final s = sessions[index];
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
          ),
        ],
      ],
    );
  }

  Widget _slotStatusChip(BuildContext context, String status) {
    final theme = Theme.of(context);
    final label = status.isEmpty ? 'scheduled' : status.replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: theme.textTheme.labelSmall),
    );
  }
}

class _GradeCard extends StatelessWidget {
  final PortalGrade grade;
  final bool compact;
  const _GradeCard({required this.grade, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ZCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(grade.subjectName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text(grade.subjectCode, style: theme.textTheme.labelSmall),
                if (!compact && grade.remarks != null) Text(grade.remarks!, style: theme.textTheme.labelSmall),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                grade.transmutedGrade?.toStringAsFixed(0) ?? '—',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                  color: (grade.transmutedGrade ?? 100) < 75 ? theme.colorScheme.error : null,
                ),
              ),
              Text(grade.lockStatus.replaceAll('_', ' '), style: theme.textTheme.labelSmall),
            ],
          ),
        ],
      ),
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
  String? _lastChildId;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentGradesProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) => _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    if (_lastChildId != selectedChildId) {
      _lastChildId = selectedChildId;
    }
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
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ZEmpty(
                  icon: Icons.family_restroom_outlined,
                  title: 'Select a child',
                  subtitle: 'Choose a child from the header to view their grades.',
                  compact: true,
                ),
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
    final term = ref.watch(termProvider);
    final selectedChildId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);
    PortalChild? child;
    if (selectedChildId != null) {
      child = children.when(
        data: (list) {
          try {
            return list.firstWhere((c) => c.studentId == selectedChildId);
          } catch (_) {
            return null;
          }
        },
        loading: () => null,
        error: (_, _) => null,
      );
    } else {
      child = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Grades',
            icon: Icons.grade_outlined,
            description: 'Subject grades for ${child?.name ?? 'your child'}.',
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
            if (child != null)
              ZScopePill(
                text: [
                  if (child.gradeLevel.isNotEmpty)
                    child.gradeLevel.replaceFirst(RegExp(r'^Grade\s*', caseSensitive: false), 'G'),
                  child.sectionName ?? '',
                ].where((v) => v.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
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
            title: data.grades.isEmpty ? 'No grades for this term' : 'No grades match',
            subtitle: data.grades.isEmpty ? null : 'Try a different search.',
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      sliver: SliverList.separated(
        itemCount: grades.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) => _GradeCard(grade: grades[index]),
      ),
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
  String? _lastChildId;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentAttendanceProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) => _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    if (_lastChildId != selectedChildId) {
      _lastChildId = selectedChildId;
    }
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
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ZEmpty(
                  icon: Icons.family_restroom_outlined,
                  title: 'Select a child',
                  subtitle: 'Choose a child from the header to view their attendance.',
                  compact: true,
                ),
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
    final term = ref.watch(termProvider);
    final selectedChildId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);
    PortalChild? child;
    if (selectedChildId != null) {
      child = children.when(
        data: (list) {
          try {
            return list.firstWhere((c) => c.studentId == selectedChildId);
          } catch (_) {
            return null;
          }
        },
        loading: () => null,
        error: (_, _) => null,
      );
    } else {
      child = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Attendance',
            icon: Icons.fact_check_outlined,
            description: 'Attendance summary for ${child?.name ?? 'your child'}.',
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
            if (child != null)
              ZScopePill(
                text: [
                  if (child.gradeLevel.isNotEmpty)
                    child.gradeLevel.replaceFirst(RegExp(r'^Grade\s*', caseSensitive: false), 'G'),
                  child.sectionName ?? '',
                ].where((v) => v.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
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
                        '${s.percent}%',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 20,
                          color: s.isRisk ? theme.colorScheme.error : null,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(value: s.rate.clamp(0, 1), minHeight: 8),
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
              child: Text('By subject', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
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
                  child: Row(
                    children: [
                      Expanded(child: Text(sub.subjectName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                      Text(
                        '${sub.percent}%',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: sub.percent < 80 ? theme.colorScheme.error : null,
                        ),
                      ),
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
  String? _lastChildId;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentScheduleProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) => _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    if (_lastChildId != selectedChildId) {
      _lastChildId = selectedChildId;
    }
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
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ZEmpty(
                  icon: Icons.family_restroom_outlined,
                  title: 'Select a child',
                  subtitle: 'Choose a child from the header to view their schedule.',
                  compact: true,
                ),
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
    final term = ref.watch(termProvider);
    final selectedChildId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);
    PortalChild? child;
    if (selectedChildId != null) {
      child = children.when(
        data: (list) {
          try {
            return list.firstWhere((c) => c.studentId == selectedChildId);
          } catch (_) {
            return null;
          }
        },
        loading: () => null,
        error: (_, _) => null,
      );
    } else {
      child = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Schedule',
            icon: Icons.calendar_month_outlined,
            description: 'Class schedule for ${child?.name ?? 'your child'}.',
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
            if (child != null)
              ZScopePill(
                text: [
                  if (child.gradeLevel.isNotEmpty)
                    child.gradeLevel.replaceFirst(RegExp(r'^Grade\s*', caseSensitive: false), 'G'),
                  child.sectionName ?? '',
                ].where((v) => v.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
          ],
        ),
      ],
    );
  }

  Widget _list(BuildContext context, PortalSchedule data, String query) {
    final theme = Theme.of(context);
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
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ZCard(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 14,
                              backgroundColor: theme.colorScheme.surfaceContainerLow,
                              child: Text('${slot.period}', style: const TextStyle(fontSize: 11)),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(slot.subjectName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                  Text(slot.teacherName ?? slot.subjectCode, style: theme.textTheme.labelSmall),
                                ],
                              ),
                            ),
                            if (slot.status.isNotEmpty) Text(slot.status.replaceAll('_', ' '), style: theme.textTheme.labelSmall),
                          ],
                        ),
                      ),
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
  String? _lastChildId;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentModulesProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) => _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    if (_lastChildId != selectedChildId) {
      _lastChildId = selectedChildId;
    }
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
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ZEmpty(
                  icon: Icons.family_restroom_outlined,
                  title: 'Select a child',
                  subtitle: 'Choose a child from the header to view their modules.',
                  compact: true,
                ),
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
    final term = ref.watch(termProvider);
    final selectedChildId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);
    PortalChild? child;
    if (selectedChildId != null) {
      child = children.when(
        data: (list) {
          try {
            return list.firstWhere((c) => c.studentId == selectedChildId);
          } catch (_) {
            return null;
          }
        },
        loading: () => null,
        error: (_, _) => null,
      );
    } else {
      child = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Modules',
            icon: Icons.folder_shared_outlined,
            description: 'Learning modules for ${child?.name ?? 'your child'}.',
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
            if (child != null)
              ZScopePill(
                text: [
                  if (child.gradeLevel.isNotEmpty)
                    child.gradeLevel.replaceFirst(RegExp(r'^Grade\s*', caseSensitive: false), 'G'),
                  child.sectionName ?? '',
                ].where((v) => v.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
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
              return _ModuleCard(module: m);
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

class _ModuleCard extends StatelessWidget {
  final PortalModule module;
  const _ModuleCard({required this.module});

  @override
  Widget build(BuildContext context) {
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
  String? _lastChildId;

  Future<void> _refresh() async {
    final selectedChildId = ref.read(selectedChildProvider);
    if (selectedChildId != null) {
      ref.invalidate(parentSessionsProvider(selectedChildId));
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) => _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
    final termKey = '${term?.schoolYearId}:${term?.id}';
    if (_lastTerm != termKey) {
      _lastTerm = termKey;
    }
    final selectedChildId = ref.watch(selectedChildProvider);
    if (_lastChildId != selectedChildId) {
      _lastChildId = selectedChildId;
    }
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
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ZEmpty(
                  icon: Icons.family_restroom_outlined,
                  title: 'Select a child',
                  subtitle: 'Choose a child from the header to view their sessions.',
                  compact: true,
                ),
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
    final term = ref.watch(termProvider);
    final selectedChildId = ref.watch(selectedChildProvider);
    final children = ref.watch(parentChildrenProvider);
    PortalChild? child;
    if (selectedChildId != null) {
      child = children.when(
        data: (list) {
          try {
            return list.firstWhere((c) => c.studentId == selectedChildId);
          } catch (_) {
            return null;
          }
        },
        loading: () => null,
        error: (_, _) => null,
      );
    } else {
      child = null;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          ZContentHeader(
            title: 'Sessions',
            icon: Icons.event_available_outlined,
            description: 'Upcoming sessions for ${child?.name ?? 'your child'}.',
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
            if (child != null)
              ZScopePill(
                text: [
                  if (child.gradeLevel.isNotEmpty)
                    child.gradeLevel.replaceFirst(RegExp(r'^Grade\s*', caseSensitive: false), 'G'),
                  child.sectionName ?? '',
                ].where((v) => v.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
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