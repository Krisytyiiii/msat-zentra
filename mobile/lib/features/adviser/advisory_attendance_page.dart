// Advisory attendance — mobile port of the web `/teacher/advisory/attendance`
// desk (read-only analytics, not attendance taking).
//
// Sections come from the advisory roster; rates come from the same
// `section-subject-matrix` contract the web desk reads, so the transferred
// meetup window, "no marks yet" state and overall average never drift. Tapping
// a learner pushes the subject board outside the shell.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../design/tokens.dart';
import '../../shared/names.dart';
import '../../shared/models.dart' show Term;
import '../../shared/widgets.dart';
import '../../shared/identity_tile.dart';
import 'advisory_attendance_board.dart';
import 'advisory_attendance_data.dart';
import 'advisory_attendance_detail_page.dart';
import 'advisory_list_data.dart';
import '../../design/desk_theme.dart';

const _pageSize = 15;

class AdvisoryAttendancePage extends ConsumerStatefulWidget {
  const AdvisoryAttendancePage({super.key});

  @override
  ConsumerState<AdvisoryAttendancePage> createState() =>
      _AdvisoryAttendanceState();
}

class _AdvisoryAttendanceState extends ConsumerState<AdvisoryAttendancePage>
    with WidgetsBindingObserver {
  String _q = '';
  String? _sectionId;
  int _page = 0;
  String? _scopeQuery;
  Timer? _timer;
  Future<void>? _refreshFlight;

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
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The staff shell owns the search field; a new query always starts at the
    // first page instead of clamping to a page that may no longer exist.
    final query = ScreenSearchScope.maybeOf(context)?.query ?? '';
    if (query != _scopeQuery) {
      _scopeQuery = query;
      _page = 0;
    }
  }

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

  String? _resolvedSection(List<AdvisorySection> sections) {
    if (sections.isEmpty) return null;
    final selected = _sectionId;
    if (selected != null && sections.any((section) => section.id == selected)) {
      return selected;
    }
    // A term/section change can retire the previous pick; fall back to the
    // first advisory section instead of fetching a section from another term.
    return sections.first.id;
  }

  String _sectionNameFor(List<AdvisorySection> sections, String sectionId) {
    for (final section in sections) {
      if (section.id == sectionId) return section.name;
    }
    return 'Advisory section';
  }

  Future<void> _refresh() =>
      _refreshFlight ??= _reload().whenComplete(() => _refreshFlight = null);

  Future<void> _reload() async {
    final sections =
        ref.read(advisoryProvider).asData?.value.sections ??
        const <AdvisorySection>[];
    final section = _resolvedSection(sections);
    final futures = <Future<Object?>>[ref.refresh(advisoryProvider.future)];
    if (section != null) {
      futures.add(ref.refresh(sectionAttendanceMatrixProvider(section).future));
    }
    // Each section presents its own retryable error; a completed refresh still
    // settles the indicator when one of them fails.
    await Future.wait(
      futures.map(
        (future) =>
            future.then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ),
    );
  }

  Future<void> _pickSection(
    List<AdvisorySection> sections,
    String currentId,
  ) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
      ),
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
              child: Text(
                'Advisory section',
                style: Theme.of(ctx).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            for (final section in sections)
              ListTile(
                dense: true,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(ZTokens.radiusLg),
                ),
                title: Text(
                  [
                    if (section.gradeLevel != null)
                      section.gradeLevel!.replaceFirst(
                        RegExp(r'^Grade\s*', caseSensitive: false),
                        'G',
                      ),
                    section.name,
                  ].where((value) => value.isNotEmpty).join(' · '),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                trailing: section.id == currentId
                    ? const Icon(Icons.check, size: 18)
                    : null,
                onTap: () => Navigator.pop(ctx, section.id),
              ),
          ],
        ),
      ),
    );
    if (!mounted || selected == null || selected == currentId) return;
    setState(() {
      _sectionId = selected;
      _page = 0;
    });
  }

  void _openStudent(
    AdvisoryAttendanceStudent student,
    List<AdvisoryAttendanceSubject> subjects,
    String sectionId,
  ) {
    context.push(
      '/adviser/advisory/attendance/${Uri.encodeComponent(student.studentId)}'
      '?section=${Uri.encodeComponent(sectionId)}',
      extra: AdvisoryAttendanceSelection(student: student, subjects: subjects),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: overviewScreenTheme(Theme.of(context)).copyWith(
        cardTheme: CardThemeData(
          color: zCard(context),
          elevation: 1,
          shadowColor: const Color(0x140F172A),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(color: zLine(context)),
          ),
        ),
      ),
      child: ColoredBox(
        color: zSoft(context),
        child: Builder(builder: _content),
      ),
    );
  }

  Widget _content(BuildContext context) {
    final roster = ref.watch(advisoryProvider);
    // The staff shell supplies the header search; standalone stays local.
    final scope = ScreenSearchScope.maybeOf(context);
    final query = (scope?.query ?? _q).trim().toLowerCase();

    return Column(
      children: [
        Expanded(
          child: roster.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: ZSkeletonList(),
            ),
            error: (error, _) => ErrorView(
              message: error,
              onRetry: () => ref.invalidate(advisoryProvider),
            ),
            data: (data) {
              final sections = data.sections;
              final sectionId = _resolvedSection(sections);
              if (sectionId == null) {
                return ZEmptyPage(
                  icon: Icons.group_outlined,
                  title: 'No advisory section',
                  subtitle: 'Advisory attendance appears here once a section is assigned to you.',
                  onRefresh: _refresh,
                );
              }
              final matrix = ref.watch(
                sectionAttendanceMatrixProvider(sectionId),
              );
              final loaded = matrix.asData?.value;
              final sectionName = loaded == null || loaded.sectionName.isEmpty
                  ? _sectionNameFor(sections, sectionId)
                  : loaded.sectionName;
              final sectionGradeLevel = sections
                  .where((s) => s.id == sectionId)
                  .map((s) => s.gradeLevel)
                  .firstWhere(
                    (g) => g != null && g.isNotEmpty,
                    orElse: () => null,
                  );
              return Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: _Header(
                      count: loaded?.students.length,
                      term: ref.watch(termProvider),
                      sectionName: sectionName,
                      sectionGradeLevel: sectionGradeLevel,
                      sections: sections,
                      sectionId: sectionId,
                      onPick: () => _pickSection(sections, sectionId),
                    ),
                  ),
                  if (scope == null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: ZSearchField(
                        hint: 'Search name or LRN',
                        onChanged: (value) => setState(() {
                          _q = value;
                          _page = 0;
                        }),
                      ),
                    ),
                  Expanded(
                    child: matrix.when(
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: ZSkeletonList(),
                      ),
                      error: (error, _) => ErrorView(
                        message: error,
                        onRetry: () => ref.invalidate(
                          sectionAttendanceMatrixProvider(sectionId),
                        ),
                      ),
                      data: (matrixData) =>
                          _list(context, matrixData, sectionId, query),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _list(
    BuildContext context,
    SectionAttendanceMatrix data,
    String sectionId,
    String query,
  ) {
    final theme = Theme.of(context);
    final students = [...data.students]
      ..sort((a, b) => compareSurnameFirst(a.name, b.name));
    final rows = students
        .where(
          (student) =>
              query.isEmpty ||
              student.name.toLowerCase().contains(query) ||
              student.lrn.toLowerCase().contains(query),
        )
        .toList();

    if (students.isEmpty) {
      return ZEmptyPage(
        icon: Icons.group_outlined,
        title: 'No advisory students yet',
        subtitle:
            '${data.sectionName.isEmpty ? 'Your advisory section' : data.sectionName} has no enlisted learners this term.',
        onRefresh: _refresh,
      );
    }
    if (rows.isEmpty) {
      return ZEmptyPage(
        icon: Icons.search_off,
        title: 'No students match',
        subtitle: 'Try a different name or LRN, or clear the filter.',
        onRefresh: _refresh,
      );
    }

    final pages = (rows.length + _pageSize - 1) ~/ _pageSize;
    final page = _page.clamp(0, pages - 1);
    final slice = rows.skip(page * _pageSize).take(_pageSize).toList();
    final rates = [
      for (final student in students)
        attendanceOverall(student.rates, data.subjects.length),
    ];
    final measured = rates.whereType<double>().toList();
    final average = measured.isEmpty
        ? null
        : measured.reduce((a, b) => a + b) / measured.length;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: ZCard(
            child: Row(
              children: [
                for (final metric in [
                  ('${students.length}', 'Advisees'),
                  (
                    average == null
                        ? '—'
                        : '${(average * 100).toStringAsFixed(1)}%',
                    'Present',
                  ),
                  ('${rates.where((rate) => rate == null).length}', 'No marks'),
                ])
                  Expanded(
                    child: Column(
                      children: [
                        Text(
                          metric.$1,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          metric.$2,
                          style: TextStyle(
                            fontSize: 12,
                            color: zMutedInk(context),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Showing ${slice.length} of ${rows.length} advisees',
                  style: TextStyle(fontSize: 12, color: zMutedInk(context)),
                ),
              ),
              const Text('Name (A-Z)', style: TextStyle(fontSize: 12)),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.separated(
              key: const PageStorageKey('advisory-attendance-list'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 112),
              itemCount: slice.length,
              separatorBuilder: (_, _) => const SizedBox(height: 14),
              itemBuilder: (context, index) =>
                  _row(context, slice[index], data.subjects, sectionId),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${rows.length} student${rows.length == 1 ? '' : 's'}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              if (pages > 1) ...[
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: page > 0
                      ? () => setState(() => _page = page - 1)
                      : null,
                  icon: const Icon(Icons.chevron_left, size: 20),
                ),
                Text(
                  '${page + 1} / $pages',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: page < pages - 1
                      ? () => setState(() => _page = page + 1)
                      : null,
                  icon: const Icon(Icons.chevron_right, size: 20),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(
    BuildContext context,
    AdvisoryAttendanceStudent student,
    List<AdvisoryAttendanceSubject> subjects,
    String sectionId,
  ) {
    final theme = Theme.of(context);
    final overall = attendanceOverall(student.rates, subjects.length);
    final pct = attendancePercent(overall);
    return ZCard(
      padding: const EdgeInsets.all(14),
      onTap: () => _openStudent(student, subjects, sectionId),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ZIdentityTile(
                name: student.name,
                seed: student.studentId.isEmpty
                    ? student.lrn
                    : student.studentId,
                size: 46,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      formatSurnameFirst(student.name),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ZStatusPill(
                          text: 'LRN ${student.lrn}',
                          tone: StatusTone.neutral,
                        ),
                        if (student.isTransferee)
                          const ZStatusPill(
                            text: 'Transferee',
                            tone: StatusTone.amber,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: zMutedInk(context),
              ),
            ],
          ),
          Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: Divider(height: 1, color: zLine(context)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                pct == null ? '—' : '$pct%',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: attendanceTextColor(context, overall),
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              Text(
                'Present',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.count,
    required this.sectionName,
    required this.sectionGradeLevel,
    required this.sections,
    required this.sectionId,
    required this.onPick,
    required this.term,
  });

  final int? count;
  final String sectionName;
  final String? sectionGradeLevel;
  final List<AdvisorySection> sections;
  final String sectionId;
  final VoidCallback onPick;
  final Term? term;

  String get _combinedSection => [
    if (sectionGradeLevel != null)
      sectionGradeLevel!.replaceFirst(
        RegExp(r'^Grade\s*', caseSensitive: false),
        'G',
      ),
    sectionName,
  ].where((value) => value.isNotEmpty).join(' · ');

  @override
  Widget build(BuildContext context) {
    final subtitle = count == null
        ? 'Loading this section\'s attendance...'
        : count == 0
        ? 'No enlisted learners this term · $_combinedSection'
        : 'Tap a learner to inspect - $count student${count == 1 ? '' : 's'} · $_combinedSection';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ZContentHeader(
          title: 'Advisory Attendance',
          icon: Icons.calendar_month_outlined,
          description: subtitle,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (term != null) ...[
              ZScopePill(
                text: term!.schoolYearName,
                kind: ScopePillKind.schoolYear,
                compact: true,
              ),
              ZScopePill(
                text: 'Term ${term!.termNumber}',
                kind: ScopePillKind.term,
                compact: true,
              ),
            ],
            ZScopePill(
              text: _combinedSection,
              kind: ScopePillKind.grade,
              label: 'Grade and section',
              compact: true,
            ),
          ],
        ),
        if (sections.length > 1) ...[
          const SizedBox(height: 10),
          OutlinedButton.icon(
            key: const ValueKey('advisory-attendance-section'),
            onPressed: onPick,
            icon: const Icon(Icons.swap_horiz, size: 16),
            label: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 220),
              child: Text(
                _combinedSection,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
