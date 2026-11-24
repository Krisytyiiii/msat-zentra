import 'package:flutter/material.dart';

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

  Future<void> _open(
    BuildContext context,
    List<RecordAssessment> assessments,
  ) async {
    if (assessments.isEmpty) return;
    if (assessments.length == 1) {
      onOpen(assessments.single);
      return;
    }
    final selected = await showModalBottomSheet<RecordAssessment>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final assessment in assessments)
              ListTile(
                title: Text(assessment.title),
                subtitle: Text('Max ${gradeNumber(assessment.maxScore)}'),
                onTap: () => Navigator.pop(context, assessment),
              ),
          ],
        ),
      ),
    );
    if (selected != null && context.mounted) onOpen(selected);
  }

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
      final words = learner.displayName
          .split(RegExp(r'[\s,]+'))
          .where((w) => w.isNotEmpty)
          .toList();
      final initials = words.isEmpty
          ? '?'
          : '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
                .toUpperCase();
      final hasQueued = record.assessments.any(
        (a) =>
            a.audience == audience &&
            queued.containsKey('${a.id}|${learner.id}'),
      );
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE6ECF4)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x09000000),
              blurRadius: 10,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 19,
                  backgroundColor: index.isEven
                      ? const Color(0xFFEDE9FF)
                      : const Color(0xFFDCFCE7),
                  foregroundColor: index.isEven
                      ? const Color(0xFF6435E9)
                      : const Color(0xFF438466),
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        learner.displayName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF172033),
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
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF71809B),
                            ),
                          ),
                          if (learner.isAdm) ...[
                            const Text(
                              '•',
                              style: TextStyle(color: Color(0xFFCBD5E1)),
                            ),
                            _badge('ADM'),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                _badge(
                  hasQueued
                      ? 'Queued'
                      : hasGrade
                      ? (grade >= 75 ? 'Passed' : 'Needs support')
                      : 'No grades',
                ),
              ],
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Divider(height: 1, color: Color(0xFFF0F3F8)),
            ),
            for (final entry in const [
              ('WRITTEN_WORK', 'Written'),
              ('PERFORMANCE_TASK', 'Performance'),
              ('EXAM', 'Exam'),
            ])
              _component(context, learner, entry.$1, entry.$2),
            const Divider(height: 8, color: Color(0xFFE6ECF4)),
            _tile(
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
    return Material(
      key: ValueKey('category-$type-${learner.id}'),
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: assessments.isEmpty ? null : () => _open(context, assessments),
        child: _tile(
          title: '$label (${_twoDecimals(earned)}/${_twoDecimals(possible)} pts)',
          value: scored && possible > 0
              ? '${_twoDecimals(earned / possible * 100)}%'
              : '—',
          footer: pending ? 'Queued' : '',
        ),
      ),
    );
  }

  static Widget _badge(String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: const Color(0xFFF1F5F9),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 12,
        color: Color(0xFF697791),
        fontWeight: FontWeight.w500,
      ),
    ),
  );

  static Widget _tile({
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
              color: total ? const Color(0xFF172033) : const Color(0xFF71809B),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF52627C),
              ),
            ),
            if (footer.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                footer,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: const Color(0xFF8B9BBA),
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}
