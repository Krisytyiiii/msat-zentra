// Gradebook dashboard — web teacher/grading/page.tsx parity.
// Critical (classes) paints first; secondary (assessments + standings)
// streams in. Cards mirror GradebookCards.tsx: subject initials avatar,
// Students / Assessments rows, assessed progress bar, Open workspace.
// Tapping opens the existing workspace detail (composite-safe ids).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = parts[0][0];
  final second = parts.length > 1 ? parts[1][0] : (parts[0].length > 1 ? parts[0][1] : '');
  return '$first$second'.toUpperCase();
}

class GradebookDashboardPage extends ConsumerWidget {
  const GradebookDashboardPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final critical = ref.watch(overviewProvider);
    final secondary = ref.watch(overviewSecondaryProvider);
    return critical.when(
      loading: () => const Padding(padding: EdgeInsets.all(16), child: ZSkeletonList(count: 4)),
      error: (e, _) => ErrorView(message: e, onRetry: () => ref.invalidate(overviewProvider)),
      data: (data) {
        final classes = [for (final c in (data['classes'] as List? ?? [])) ClassSlot.fromJson(c as Map<String, dynamic>)];
        final assessments = secondary.maybeWhen(
          data: (s) => [for (final a in (s['assessments'] as List? ?? [])) Map<String, dynamic>.from(a as Map)],
          orElse: () => const <Map<String, dynamic>>[],
        );
        final standings = secondary.maybeWhen(
          data: (s) => [for (final st in (s['standings'] as List? ?? [])) Map<String, dynamic>.from(st as Map)],
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
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
            children: [
              Text(
                '${classes.length} subject${classes.length == 1 ? '' : 's'} this term. Open a Class Record to enter scores.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (secondary.isLoading) ...[
                const SizedBox(height: 8),
                Text('Loading assessments…', style: Theme.of(context).textTheme.bodySmall),
              ],
              if (secondary.hasError)
                TextButton.icon(
                  onPressed: () => ref.invalidate(overviewSecondaryProvider),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Assessment counts unavailable. Retry'),
                ),
              const SizedBox(height: 12),
              for (final c in classes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _GradebookCard(
                    slot: c,
                    assessmentCount: secondaryReady
                        ? assessments.where((a) => a['subject'] == c.subject && a['section'] == c.section).length
                        : null,
                    standing: standings.where((s) => s['subject'] == c.subject && s['section'] == c.section).toList().firstOrNull,
                    secondaryLoading: secondary.isLoading,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _GradebookCard extends StatelessWidget {
  final ClassSlot slot;
  final int? assessmentCount;
  final Map<String, dynamic>? standing;
  final bool secondaryLoading;
  const _GradebookCard({required this.slot, required this.assessmentCount, required this.standing, required this.secondaryLoading});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final assessed = standing?['assessed'] as int?;
    final students = ((standing?['students'] ?? slot.studentCount)) as int;
    final pct = assessed != null && students > 0 ? (assessed / students).clamp(0, 1).toDouble() : null;
    return ZCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), color: theme.colorScheme.surfaceContainerLow),
            child: Center(child: Text(_initials(slot.subject), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(slot.subject, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(height: 3),
              Text('${slot.section} · ${slot.gradeLevel}', style: theme.textTheme.bodySmall),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: Text('Students', style: theme.textTheme.bodySmall)),
          Text('$students', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
        ]),
        Row(children: [
          Expanded(child: Text(secondaryLoading ? 'Assessments…' : 'Assessments', style: theme.textTheme.bodySmall)),
          Text(assessmentCount?.toString() ?? '—', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
        ]),
        const SizedBox(height: 8),
        if (pct != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(value: pct, minHeight: 6),
          ),
        const SizedBox(height: 4),
        Text(assessed == null ? 'Assessment coverage unavailable' : '$assessed of $students assessed',
            style: theme.textTheme.bodySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            onPressed: () => context.push(
              '/workspace/classes/${Uri.encodeComponent(slot.id)}?title=${Uri.encodeComponent('${slot.subject} · ${slot.section}')}',
            ),
            child: const Text('Open Class Record'),
          ),
        ),
      ]),
    );
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
