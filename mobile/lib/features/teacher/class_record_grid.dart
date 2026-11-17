import 'package:flutter/material.dart';

import 'gradebook_data.dart';

class ClassRecordGrid extends StatefulWidget {
  const ClassRecordGrid({
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
  State<ClassRecordGrid> createState() => _GridState();
}

class _GridState extends State<ClassRecordGrid> {
  final _names = ScrollController();
  final _scores = ScrollController();
  final _horizontal = ScrollController();
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _names.addListener(() => _sync(_names, _scores));
    _scores.addListener(() => _sync(_scores, _names));
  }

  void _sync(ScrollController source, ScrollController target) {
    if (_syncing || !source.hasClients || !target.hasClients) return;
    _syncing = true;
    target.jumpTo(source.offset.clamp(0, target.position.maxScrollExtent));
    _syncing = false;
  }

  @override
  void dispose() {
    _names.dispose();
    _scores.dispose();
    _horizontal.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scale = MediaQuery.textScalerOf(context).scale(12) / 12;
    final rowHeight = 68.0 * scale;
    final groupHeight = 36.0 * scale;
    final assessmentHeight = 76.0 * scale;
    final width = 112.0 * scale.clamp(1, 1.6);
    final groups = {
      for (final type in assessmentTypes.keys)
        type: widget.record.assessments
            .where((a) => a.type == type && a.audience == widget.audience)
            .toList(),
    };
    final columnCount = groups.values.fold<int>(
      1,
      (n, a) => n + (a.isEmpty ? 1 : a.length),
    );
    final border = theme.colorScheme.outlineVariant;
    Widget box(Widget child, {double? height, Color? color}) => Container(
      height: height,
      width: width,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: color,
        border: Border(
          right: BorderSide(color: border),
          bottom: BorderSide(color: border),
        ),
      ),
      alignment: Alignment.center,
      child: child,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final nameWidth = constraints.maxWidth < 600 ? 144.0 : 210.0;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: nameWidth,
              child: Column(
                children: [
                  Container(
                    height: groupHeight + assessmentHeight,
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    alignment: Alignment.centerLeft,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerLow,
                      border: Border(
                        right: BorderSide(color: border),
                        bottom: BorderSide(color: border),
                      ),
                    ),
                    child: Text('Learner', style: theme.textTheme.labelLarge),
                  ),
                  Expanded(
                    child: ListView.builder(
                      key: const ValueKey('record-names'),
                      controller: _names,
                      itemExtent: rowHeight,
                      padding: const EdgeInsets.only(bottom: 168),
                      itemCount: widget.learners.length,
                      itemBuilder: (context, index) {
                        final learner = widget.learners[index];
                        return Container(
                          key: ValueKey('learner-${learner.id}'),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: index.isEven
                                ? theme.colorScheme.surface
                                : theme.colorScheme.surfaceContainerLow,
                            border: Border(
                              right: BorderSide(color: border),
                              bottom: BorderSide(color: border),
                            ),
                          ),
                          alignment: Alignment.centerLeft,
                          child: Tooltip(
                            message:
                                '${learner.displayName}\n${learner.lrn}${learner.locked ? '\nGrades locked' : ''}',
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  learner.displayName,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  learner.locked
                                      ? 'Locked · ${learner.lrn}'
                                      : learner.lrn,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.labelSmall,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Scrollbar(
                controller: _horizontal,
                thumbVisibility: true,
                child: SingleChildScrollView(
                  key: const ValueKey('record-horizontal'),
                  controller: _horizontal,
                  scrollDirection: Axis.horizontal,
                  child: SizedBox(
                    width: columnCount * width,
                    child: Column(
                      children: [
                        Row(
                          children: [
                            for (final entry in groups.entries)
                              Container(
                                width:
                                    (entry.value.isEmpty
                                        ? 1
                                        : entry.value.length) *
                                    width,
                                height: groupHeight,
                                alignment: Alignment.center,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: _color(entry.key)
                                      .withValues(alpha: 0.14),
                                  border: Border(
                                    right: BorderSide(color: border),
                                    bottom: BorderSide(color: border),
                                  ),
                                ),
                                child: Text(
                                  '${assessmentTypes[entry.key]} · ${gradeNumber(widget.record.weights[entry.key] ?? 0)}%',
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            box(
                              const Text(
                                'Grade',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              height: groupHeight,
                              color: theme.colorScheme.surfaceContainerLow,
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            for (final list in groups.values)
                              if (list.isEmpty)
                                box(
                                  const Text(
                                    'No assessments',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(fontSize: 11),
                                  ),
                                  height: assessmentHeight,
                                )
                              else
                                for (final assessment in list)
                                  box(
                                    InkWell(
                                      key: ValueKey(
                                        'open-assessment-${assessment.id}',
                                      ),
                                      onTap: () => widget.onOpen(assessment),
                                      child: Tooltip(
                                        message: assessment.title,
                                        child: Column(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Text(
                                              assessment.title,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              'Max ${gradeNumber(assessment.maxScore)}',
                                              style: const TextStyle(
                                                fontSize: 11,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                    height: assessmentHeight,
                                  ),
                            box(
                              const Text(
                                'Server grade',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 11),
                              ),
                              height: assessmentHeight,
                            ),
                          ],
                        ),
                        Expanded(
                          child: ListView.builder(
                            key: const ValueKey('record-scores'),
                            controller: _scores,
                            itemExtent: rowHeight,
                            padding: const EdgeInsets.only(bottom: 168),
                            itemCount: widget.learners.length,
                            itemBuilder: (context, index) {
                              final learner = widget.learners[index];
                              return Row(
                                children: [
                                  for (final list in groups.values)
                                    if (list.isEmpty)
                                      box(const Text('—'), height: rowHeight)
                                    else
                                      for (final assessment in list)
                                        SizedBox(
                                          width: width,
                                          height: rowHeight,
                                          child: _ScoreCell(
                                            learner: learner,
                                            assessment: assessment,
                                            queued: widget
                                                .queued['${assessment.id}|${learner.id}'],
                                            onTap: () =>
                                                widget.onOpen(assessment),
                                          ),
                                        ),
                                  box(
                                    Text(
                                      learner.finalGrade?['transmutedGrade']
                                              is num
                                          ? gradeNumber(
                                              learner.finalGrade!['transmutedGrade']
                                                  as num,
                                            )
                                          : '—',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    height: rowHeight,
                                  ),
                                ],
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

Color _color(String type) => switch (type) {
  'WRITTEN_WORK' => const Color(0xFF3B82F6),
  'PERFORMANCE_TASK' => const Color(0xFFF59E0B),
  _ => const Color(0xFFEF4444),
};

class _ScoreCell extends StatelessWidget {
  const _ScoreCell({
    required this.learner,
    required this.assessment,
    required this.queued,
    required this.onTap,
  });
  final RecordLearner learner;
  final RecordAssessment assessment;
  final double? queued;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final score = queued ?? assessment.scores[learner.id];
    final description =
        '${learner.displayName} · ${assessment.title}: '
        '${score == null ? 'Missing' : gradeNumber(score)} / ${gradeNumber(assessment.maxScore)}'
        '${learner.locked
            ? '. Grades locked'
            : queued != null
            ? '. Queued offline'
            : '. Open assessment'}';
    return Semantics(
      button: true,
      label: description,
      child: Tooltip(
        message: description,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            key: ValueKey('score-${assessment.id}-${learner.id}'),
            onTap: onTap,
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border(
                  right: BorderSide(
                    color: Theme.of(context).colorScheme.outlineVariant,
                  ),
                  bottom: BorderSide(
                    color: Theme.of(context).colorScheme.outlineVariant,
                  ),
                ),
              ),
              child: ExcludeSemantics(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      score == null ? '—' : gradeNumber(score),
                      style: TextStyle(
                        fontSize: 14,
                        color: score == null
                            ? Theme.of(context).colorScheme.onSurfaceVariant
                            : null,
                      ),
                    ),
                    if (queued != null)
                      const Text('Queued', style: TextStyle(fontSize: 10)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
