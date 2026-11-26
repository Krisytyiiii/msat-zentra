// Gradebook dashboard — web teacher/grading/page.tsx parity.
// Critical (classes) paints first; secondary (assessments + standings)
// streams in. Cards mirror GradebookCards.tsx: subject initials avatar,
// Students / Assessments rows, assessed progress bar, Open workspace.
// Tapping opens the existing workspace detail (composite-safe ids).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../auth/link_classes_card.dart';

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  final first = parts[0][0];
  final second = parts.length > 1 ? parts.last[0] : '';
  return '$first$second'.toUpperCase();
}

class GradebookDashboardPage extends ConsumerStatefulWidget {
  const GradebookDashboardPage({super.key});
  @override
  ConsumerState<GradebookDashboardPage> createState() =>
      _GradebookDashboardState();
}

class _GradebookDashboardState extends ConsumerState<GradebookDashboardPage> {
  int _sortMode = 0;
  static const _sortLabels = [
    'Name (A-Z)',
    'Name (Z-A)',
    'Grade (Low-High)',
    'Grade (High-Low)',
  ];

  @override
  Widget build(BuildContext context) {
    final critical = ref.watch(overviewProvider);
    final secondary = ref.watch(overviewSecondaryProvider);
    final term = ref.watch(termProvider);
    final link = ref.watch(teacherLinkProvider).valueOrNull;
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: ColoredBox(
        color: Colors.white,
        child: Builder(
          builder: (context) => link?.linked == false
              ? TeacherLinkPlaceholder(
                  onLinked: () async {
                    ref.invalidate(overviewProvider);
                    ref.invalidate(overviewSecondaryProvider);
                    try {
                      await ref.read(overviewProvider.future);
                    } catch (_) {
                      // The desk renders its own retryable error.
                    }
                  },
                )
              : critical.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: ZSkeletonList(count: 4),
            ),
            error: (e, _) => ErrorView(
              message: e,
              onRetry: () => ref.invalidate(overviewProvider),
            ),
            data: (data) {
              final classes =
                  [
                    for (final c in (data['classes'] as List? ?? []))
                      ClassSlot.fromJson(c as Map<String, dynamic>),
                  ]..sort((a, b) {
                    if (_sortMode >= 2) {
                      int grade(String value) =>
                          int.tryParse(
                            RegExp(r'\d+').firstMatch(value)?.group(0) ?? '',
                          ) ??
                          0;
                      final order = grade(a.gradeLevel)
                          .compareTo(grade(b.gradeLevel));
                      if (order != 0) return _sortMode == 3 ? -order : order;
                    }
                    var order = a.subject.toLowerCase().compareTo(
                      b.subject.toLowerCase(),
                    );
                    if (order == 0) {
                      order = a.section.toLowerCase().compareTo(
                        b.section.toLowerCase(),
                      );
                    }
                    return _sortMode == 1 ? -order : order;
                  });
              final assessments = secondary.maybeWhen(
                data: (s) => [
                  for (final a in (s['assessments'] as List? ?? []))
                    Map<String, dynamic>.from(a as Map),
                ],
                orElse: () => const <Map<String, dynamic>>[],
              );
              final standings = secondary.maybeWhen(
                data: (s) => [
                  for (final st in (s['standings'] as List? ?? []))
                    Map<String, dynamic>.from(st as Map),
                ],
                orElse: () => const <Map<String, dynamic>>[],
              );
              final secondaryReady = secondary.hasValue && !secondary.hasError;
              if (classes.isEmpty) {
                return ZEmptyPage(
                  icon: Icons.grade_outlined,
                  title: 'No classes assigned yet',
                  subtitle: 'Ask your registrar to assign your subjects and sections first.',
                  onRefresh: () async {
                    ref.invalidate(overviewProvider);
                    ref.invalidate(overviewSecondaryProvider);
                  },
                );
              }
              return RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(overviewProvider);
                  ref.invalidate(overviewSecondaryProvider);
                },
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 120),
                  children: [
                    const ZContentHeader(
                      title: 'Gradebook', icon: Icons.menu_book_outlined,
                      description: 'Manage assessments and scores.',
                    ),
                    const SizedBox(height: 12),
                    if (term != null)
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
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
                      ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF9F9FA),
                        border: Border.all(color: const Color(0xFFE8E8ED)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          for (final entry in [
                            ('${classes.length}', 'Classes'),
                            (
                              '${classes.map((c) => c.section).toSet().length}',
                              'Sections',
                            ),
                            (
                              secondaryReady ? '${assessments.length}' : '—',
                              'Assessments',
                            ),
                          ].indexed) ...[
                            if (entry.$1 > 0)
                              const SizedBox(
                                height: 30,
                                child: VerticalDivider(width: 16),
                              ),
                            Expanded(
                              child: Column(
                                children: [
                                  Text(
                                    entry.$2.$1,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      height: 1.6,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF1E293B),
                                    ),
                                  ),
                                  Text(
                                    entry.$2.$2,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      height: 1.6,
                                      color: Color(0xFF71809B),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Showing ${classes.length} records',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF9999A6),
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () => setState(
                            () => _sortMode =
                                (_sortMode + 1) % _sortLabels.length,
                          ),
                          icon: const Icon(LucideIcons.listFilter, size: 14),
                          label: Text(
                            _sortLabels[_sortMode],
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
                    if (secondary.isLoading) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Loading assessments…',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    if (secondary.hasError)
                      TextButton.icon(
                        onPressed: () =>
                            ref.invalidate(overviewSecondaryProvider),
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text(
                          'Assessment counts unavailable. Retry',
                        ),
                      ),
                    const SizedBox(height: 12),
                    for (final c in classes)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _GradebookCard(
                          slot: c,
                          assessmentCount: secondaryReady
                              ? assessments
                                    .where(
                                      (a) =>
                                          a['subject'] == c.subject &&
                                          a['section'] == c.section,
                                    )
                                    .length
                              : null,
                          standing: standings
                              .where(
                                (s) =>
                                    s['subject'] == c.subject &&
                                    s['section'] == c.section,
                              )
                              .toList()
                              .firstOrNull,
                          secondaryLoading: secondary.isLoading,
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _GradebookCard extends StatelessWidget {
  final ClassSlot slot;
  final int? assessmentCount;
  final Map<String, dynamic>? standing;
  final bool secondaryLoading;
  const _GradebookCard({
    required this.slot,
    required this.assessmentCount,
    required this.standing,
    required this.secondaryLoading,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final assessed = standing?['assessed'] as int?;
    final students = ((standing?['students'] ?? slot.studentCount)) as int;
    final pct = assessed != null && students > 0
        ? (assessed / students).clamp(0, 1).toDouble()
        : null;
    void openRecord() => context.push(
      '/workspace/classes/${Uri.encodeComponent(slot.id)}?title=${Uri.encodeComponent('${slot.subject} · ${slot.section}')}',
    );
    return Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: openRecord,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: const [
                      Color(0xFFF1F5F9),
                      Color(0xFFEFF6FF),
                      Color(0xFFFFFBEB),
                      Color(0xFFFAF5FF),
                      Color(0xFFFFF1F2),
                    ][slot.id.codeUnits.fold(0, (a, b) => a + b) % 5],
                    foregroundColor: const Color(0xFF52627C),
                    child: Text(
                      _initials(slot.subject),
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
                          slot.subject,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF172033),
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(slot.section, style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ZStatusPill(
                    text: slot.gradeLevel.replaceFirst(
                      RegExp(r'^Grade\s*', caseSensitive: false),
                      'G',
                    ),
                    tone: StatusTone.blue,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text('Students', style: theme.textTheme.bodySmall),
                  ),
                  Text(
                    '$students',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      secondaryLoading ? 'Assessments…' : 'Assessments',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                  Text(
                    assessmentCount?.toString() ?? '—',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (pct != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(value: pct, minHeight: 6),
                ),
              const SizedBox(height: 4),
              Text(
                assessed == null
                    ? 'Assessment coverage unavailable'
                    : '$assessed of $students assessed',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
