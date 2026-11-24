import 'package:flutter/material.dart';
import 'package:flutter/widget_previews.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../design/theme.dart';
import '../../shared/widgets.dart';
import 'advisory_list_data.dart';

// Keep existing imports in the academic/settings/Bama screens compatible.
export 'advisory_list_data.dart';

class AdvisoryListPage extends ConsumerStatefulWidget {
  const AdvisoryListPage({super.key});
  @override
  ConsumerState<AdvisoryListPage> createState() => _AdvisoryListState();
}

class _AdvisoryListState extends ConsumerState<AdvisoryListPage> {
  final _rosterScroll = ScrollController();
  String _risk = '', _factor = '';
  bool _descending = false;
  String _lastQuery = '', _lastTerm = '';

  @override
  void dispose() {
    _rosterScroll.dispose();
    super.dispose();
  }

  void _scrollToTop() {
    if (_rosterScroll.hasClients) _rosterScroll.jumpTo(0);
  }

  Future<void> _refresh() async {
    ref.invalidate(overviewProvider);
    try {
      ref.invalidate(advisoryProvider);
      await ref.read(advisoryProvider.future);
    } catch (_) {
      // The roster provider owns the retryable error presentation.
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, constraints) =>
            _content(context, compact: constraints.maxHeight < 650),
      ),
    ),
  );

  Widget _content(BuildContext context, {required bool compact}) {
    final term = ref.watch(termProvider);
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
    final active = ref.watch(advisoryProvider);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        controller: _rosterScroll,
        key: const PageStorageKey('active-advisees'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
              child: _activeHeader(
                context,
                active.asData?.value,
                compact: compact,
              ),
            ),
          ),
          active.when(
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
                onRetry: () => ref.invalidate(advisoryProvider),
              ),
            ),
            data: (roster) => _activeList(context, roster, query),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: 112 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }

  Widget _activeHeader(
    BuildContext context,
    AdvisoryRoster? roster, {
    required bool compact,
  }) {
    final term = ref.watch(termProvider);
    final measured =
        roster?.students
            .map((s) => s.attendancePercentage)
            .whereType<double>()
            .toList() ??
        <double>[];
    final attendance = measured.isEmpty
        ? null
        : measured.reduce((a, b) => a + b) / measured.length;
    final flagged = roster?.students
        .where((s) => s.riskLevel == 'High' || s.riskLevel == 'Moderate')
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) ...[
          const ZContentHeader(
            title: 'Advisory list',
            icon: Icons.people_outline,
            description: 'Your advisees, attendance and academic progress for this term.',
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
            for (final section in roster?.sections ?? <AdvisorySection>[])
              ZScopePill(
                text: [
                  if (section.gradeLevel != null)
                    section.gradeLevel!.replaceFirst(
                      RegExp(r'^Grade\s*', caseSensitive: false),
                      'G',
                    ),
                  section.name,
                ].where((value) => value.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
          ],
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFF9F9FA),
            border: Border.all(color: const Color(0xFFE8E8ED)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: IntrinsicHeight(
            child: Row(
              children: [
                for (final entry in [
                  (value: flagged?.toString() ?? '—', label: 'Flagged'),
                  (
                    value: roster?.students.length.toString() ?? '—',
                    label: 'Advisees',
                  ),
                  (
                    value: attendance == null
                        ? '—'
                        : '${attendance.toStringAsFixed(1)}%',
                    label: 'Avg Attendance',
                  ),
                ].indexed) ...[
                  if (entry.$1 > 0)
                    const SizedBox(
                      height: 30,
                      child: VerticalDivider(width: 16),
                    ),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Tooltip(
                          message: '${entry.$2.value} ${entry.$2.label}',
                          child: Text(
                            entry.$2.value,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.6,
                              fontWeight: FontWeight.w700,
                              color: const Color(0xFF1E293B),
                            ),
                          ),
                        ),
                        Tooltip(
                          message: entry.$2.label,
                          child: Text(
                            entry.$1 == 2 ? 'Avg Att.' : entry.$2.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.6,
                              color: Color(0xFF71809B),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'FILTER ADVISEES',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: Color(0xFF929FB5),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: _filterPill(
                context,
                'Risk level',
                _risk,
                {
                  '': 'All Risk Levels',
                  'High': 'High risk',
                  'Moderate': 'Moderate risk',
                  'Low': 'Low risk',
                },
                (value) => _risk = value,
                primary: true,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _filterPill(context, 'Factor', _factor, {
                '': 'All',
                'academic': 'Academic',
                'attendance': 'Attendance',
                'behavioral': 'Behavior',
              }, (value) => _factor = value),
            ),
          ],
        ),
      ],
    );
  }

  Widget _filterPill(
    BuildContext context,
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> update, {
    bool primary = false,
  }) {
    final blue = statusColors(StatusTone.blue, Theme.of(context));
    final active = primary || value.isNotEmpty;
    return PopupMenuButton<String>(
      tooltip: label,
      initialValue: value,
      onSelected: (next) {
        setState(() => update(next));
        _scrollToTop();
      },
      itemBuilder: (_) => [
        for (final option in options.entries)
          PopupMenuItem(value: option.key, child: Text(option.value)),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Center(
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: active ? blue.background : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active
                    ? blue.foreground.withValues(alpha: 0.25)
                    : const Color(0xFFE5E5EA),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label == 'Factor'
                        ? 'Factor: ${options[value]}'
                        : options[value]!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: active ? blue.foreground : const Color(0xFF7185A4),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: active ? blue.foreground : const Color(0xFF7185A4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _activeList(
    BuildContext context,
    AdvisoryRoster roster,
    String query,
  ) {
    final shown =
        roster.students
            .where(
              (student) =>
                  (query.isEmpty ||
                      student.name.toLowerCase().contains(query) ||
                      student.lrn.contains(query)) &&
                  (_risk.isEmpty || student.riskLevel == _risk) &&
                  (_factor.isEmpty || student.flags.contains(_factor)),
            )
            .toList()
          ..sort(
            (a, b) => _descending
                ? b.name.toLowerCase().compareTo(a.name.toLowerCase())
                : a.name.toLowerCase().compareTo(b.name.toLowerCase()),
          );
    if (shown.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: LucideIcons.users,
            title: roster.students.isEmpty
                ? 'No advisees yet'
                : 'No students match',
            subtitle: roster.students.isEmpty
                ? 'Learners assigned to your advisory section will appear here.'
                : 'Try a different name, LRN or risk filter.',
          ),
        ),
      );
    }
    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Showing ${shown.length} students',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF71809B),
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () {
                    setState(() => _descending = !_descending);
                    _scrollToTop();
                  },
                  icon: const Icon(LucideIcons.listFilter, size: 14),
                  label: Text(
                    _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                    maxLines: 1,
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
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
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
          sliver: SliverList.separated(
            itemCount: shown.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final student = shown[index];
              final words = student.name
                  .trim()
                  .split(RegExp(r'\s+'))
                  .where((word) => word.isNotEmpty)
                  .toList();
              final initials = words.isEmpty
                  ? '?'
                  : '${words.first[0]}${words.length > 1 ? words.last[0] : ''}'
                        .toUpperCase();
              return _LearnerCard(
                key: ValueKey('active-${student.studentId}'),
                onTap: () => context.push(
                  '/adviser/students/${Uri.encodeComponent(student.studentId)}',
                  extra: student,
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 19,
                          backgroundColor:
                              [
                                const Color(0xFFF1F5F9),
                                const Color(0xFFEFF6FF),
                                const Color(0xFFFFFBEB),
                                const Color(0xFFFAF5FF),
                                const Color(0xFFFFF1F2),
                              ][student.studentId.codeUnits.fold(
                                    0,
                                    (a, b) => a + b,
                                  ) %
                                  5],
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
                          child: _Identity(
                            name: student.name,
                            lrn: student.lrn,
                          ),
                        ),
                        const SizedBox(width: 8),
                        RiskBadge(
                          key: ValueKey('risk-${student.studentId}'),
                          level: student.riskLevel,
                        ),
                      ],
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 10),
                      child: Divider(height: 1),
                    ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 12,
                        runSpacing: 4,
                        children: [
                          Text(
                            'Att ${student.attendancePercentage == null ? '—' : '${student.attendancePercentage!.toStringAsFixed(1)}%'}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF334155),
                            ),
                          ),
                          Text(
                            'Avg ${student.academicGrade?.toStringAsFixed(1) ?? '—'}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF52627C),
                            ),
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
    );
  }
}

class _Identity extends StatelessWidget {
  const _Identity({required this.name, required this.lrn});
  final String name;
  final String lrn;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        name,
        style: Theme.of(context).textTheme.titleSmall
            ?.copyWith(fontSize: 13, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 3),
      Text(
        'LRN $lrn',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    ],
  );
}

class _LearnerCard extends StatelessWidget {
  const _LearnerCard({super.key, required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).cardTheme.color,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: BorderSide(
        color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.72),
      ),
    ),
    clipBehavior: Clip.antiAlias,
    elevation: 1,
    shadowColor: Colors.black.withValues(alpha: 0.06),
    child: InkWell(
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.all(12), child: child),
    ),
  );
}

@Preview(
  name: 'Read-only advisory learner',
  group: 'Advisory',
  size: Size(390, 160),
)
Widget advisoryLearnerPreview() => MaterialApp(
  theme: overviewScreenTheme(zWorkspaceTheme()),
  home: const Scaffold(
    body: Padding(
      padding: EdgeInsets.all(12),
      child: _LearnerCard(
        child: Row(
          children: [
            Expanded(
              child: _Identity(name: 'Preview learner', lrn: '000000000000'),
            ),
            RiskBadge(level: 'Low'),
          ],
        ),
      ),
    ),
  ),
);
