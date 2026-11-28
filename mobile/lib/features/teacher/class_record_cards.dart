import 'package:flutter/material.dart';

import '../../shared/identity_tile.dart';
import 'gradebook_data.dart';

String _twoDecimals(num value) {
  final rounded = (value * 100).roundToDouble() / 100;
  if (rounded == rounded.truncateToDouble()) return rounded.toInt().toString();
  final text = rounded.toStringAsFixed(2);
  return text.endsWith('0') ? text.substring(0, text.length - 1) : text;
}

class ClassRecordCards extends StatelessWidget {
  const ClassRecordCards({
    super.key,
    required this.record,
    required this.learners,
    required this.audience,
    required this.queued,
    required this.onOpen,
  });

  final ClassRecord record;
  final List<RecordLearner> learners;
  final String audience;
  final Map<String, double> queued;
  final ValueChanged<RecordAssessment> onOpen;

  @override
  Widget build(BuildContext context) => ListView.separated(
    key: const ValueKey('class-record-cards'),
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 168),
    itemCount: learners.length,
    separatorBuilder: (_, _) => const SizedBox(height: 12),
    itemBuilder: (context, index) {
      final learner = learners[index];
      final grade = learner.finalGrade?['transmutedGrade'];
      final hasGrade = grade is num;
      final hasQueued = record.assessments.any(
        (a) =>
            a.audience == audience &&
            queued.containsKey('${a.id}|${learner.id}'),
      );
      final theme = Theme.of(context);
      final dark = theme.brightness == Brightness.dark;
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outline),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: dark ? 0.35 : 0.035),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ZIdentityTile(
                  name: learner.displayName,
                  seed: learner.id,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        learner.displayName,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            'LRN ${learner.lrn}',
                            style: TextStyle(
                              fontSize: 12,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          if (learner.isAdm) ...[
                            Text(
                              '•',
                              style: TextStyle(
                                color: theme.colorScheme.outline,
                              ),
                            ),
                            _badge(context, 'ADM'),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                _badge(
                  context,
                  hasQueued
                      ? 'Queued'
                      : hasGrade
                      ? (grade >= 75 ? 'Passed' : 'Needs support')
                      : 'No grades',
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Divider(height: 1, color: theme.colorScheme.outline),
            ),
            for (final entry in const [
              ('WRITTEN_WORK', 'Written'),
              ('PERFORMANCE_TASK', 'Performance'),
              ('EXAM', 'Exam'),
            ])
              _component(context, learner, entry.$1, entry.$2),
            Divider(height: 8, color: theme.colorScheme.outline),
            _tile(
              context,
              title: 'Term Grade',
              value: hasGrade ? _twoDecimals(grade) : '—',
              footer: hasQueued
                  ? 'Queued'
                  : hasGrade
                  ? (learner.locked ? 'Locked' : '')
                  : '',
              total: true,
            ),
          ],
        ),
      );
    },
  );

  Widget _component(
    BuildContext context,
    RecordLearner learner,
    String type,
    String label,
  ) {
    final assessments = record.assessments
        .where((a) => a.type == type && a.audience == audience)
        .toList();
    double earned = 0;
    double possible = 0;
    var scored = false;
    for (final assessment in assessments) {
      possible += assessment.maxScore;
      final score = assessment.scores[learner.id];
      if (score != null) {
        scored = true;
        earned += score;
      }
    }
    final pending = assessments.any(
      (a) => queued.containsKey('${a.id}|${learner.id}'),
    );
    return Container(
      key: ValueKey('category-$type-${learner.id}'),
      child: _tile(
        context,
        title: '$label (${_twoDecimals(earned)}/${_twoDecimals(possible)} pts)',
        value: scored && possible > 0
            ? '${_twoDecimals(earned / possible * 100)}%'
            : '—',
        footer: pending ? 'Queued' : '',
      ),
    );
  }

  static Widget _badge(BuildContext context, String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 12,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        fontWeight: FontWeight.w500,
      ),
    ),
  );

  static Widget _tile(
    BuildContext context, {
    required String title,
    required String value,
    required String footer,
    bool total = false,
  }) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: 12,
              height: 1.5,
              fontWeight: total ? FontWeight.w600 : FontWeight.w400,
              color: total
                  ? Theme.of(context).colorScheme.onSurface
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            if (footer.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                footer,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}
