// One subject's assessment record for the signed-in learner.
// Read-only mirror of the adviser Grade Record: components, weights, every
// assessment score, and the term grade. Data: GET /api/student/subjects/:id/record

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../services/portal_service.dart';

const _categories = [
  ('WRITTEN_WORK', 'WRITTEN', Color(0xFF355CEC), Color(0xFFF3F6FF)),
  ('PERFORMANCE_TASK', 'PERFORM', Color(0xFFB96C13), Color(0xFFFFFBEB)),
  ('EXAM', 'EXAM', Color(0xFFC31850), Color(0xFFFFF2F5)),
];

const _categoryLabels = {
  'WRITTEN_WORK': 'Written Work',
  'PERFORMANCE_TASK': 'Performance Task',
  'EXAM': 'Exam',
};

String _number(num value) {
  final rounded = (value * 100).roundToDouble() / 100;
  if (rounded == rounded.truncateToDouble()) return rounded.toInt().toString();
  final text = rounded.toStringAsFixed(2);
  return text.endsWith('0') ? text.substring(0, text.length - 1) : text;
}

String _percent(double? value) => value == null ? '—' : '${_number(value)}%';

String _dateLabel(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final date = DateTime.tryParse(iso);
  if (date == null) return '';
  return '${date.month}/${date.day}/${date.year}';
}

PortalSubjectComponent? _componentOf(
  List<PortalSubjectComponent> components,
  String type,
) {
  for (final component in components) {
    if (component.type == type) return component;
  }
  return null;
}

class StudentSubjectRecordPage extends ConsumerStatefulWidget {
  const StudentSubjectRecordPage({
    super.key,
    required this.subjectId,
    this.subjectName,
  });

  final String subjectId;
  final String? subjectName;

  @override
  ConsumerState<StudentSubjectRecordPage> createState() =>
      _StudentSubjectRecordState();
}

class _StudentSubjectRecordState extends ConsumerState<StudentSubjectRecordPage> {
  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/student/grades');
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(studentSubjectRecordProvider(widget.subjectId));
    try {
      await ref.read(studentSubjectRecordProvider(widget.subjectId).future);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    final record = ref.watch(studentSubjectRecordProvider(widget.subjectId));
    return Theme(
      data: theme,
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          title: const Text('Grade Record'),
          leading: ZBackButton(
            tooltip: context.canPop() ? 'Back' : 'Close',
            icon: const Icon(Icons.chevron_left),
            onPressed: _close,
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Container(height: 1, color: theme.colorScheme.outline),
          ),
        ),
        body: record.when(
          loading: () => const LoadingView(layout: SkeletonLayout.record),
          error: (error, _) => ErrorView(
            message: error,
            onRetry: () =>
                ref.invalidate(studentSubjectRecordProvider(widget.subjectId)),
          ),
          data: (data) => RefreshIndicator(
            onRefresh: _refresh,
            child: _body(context, data),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, PortalSubjectRecord record) {
    final theme = Theme.of(context);
    final term = record.term ?? portalScopeTerm(ref);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
      children: [
        ZContentHeader(
          title: record.subjectName.isEmpty
              ? (widget.subjectName ?? 'Subject')
              : record.subjectName,
          icon: Icons.menu_book_outlined,
          description: 'Every assessment score for this subject.',
        ),
        const SizedBox(height: 12),
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
            if (record.gradeLevel != null || record.sectionName != null)
              ZScopePill(
                text: [
                  if (record.gradeLevel != null)
                    record.gradeLevel!.replaceFirst(
                      RegExp(r'^Grade\s*', caseSensitive: false),
                      'G',
                    ),
                  if (record.sectionName != null) record.sectionName!,
                ].where((value) => value.isNotEmpty).join(' · '),
                kind: ScopePillKind.grade,
                label: 'Grade and section',
                compact: true,
              ),
            if (record.subjectCode.isNotEmpty)
              ZPill(
                label: 'Subject code',
                tone: StatusTone.neutral,
                child: Text(record.subjectCode),
              ),
          ],
        ),
        const SizedBox(height: 16),
        _weights(record),
        const SizedBox(height: 16),
        for (final category in _categories) ...[
          _componentCard(
            context,
            category,
            _componentOf(record.components, category.$1),
          ),
          const SizedBox(height: 12),
        ],
        _finalCard(context, record),
        const SizedBox(height: 8),
        Text(
          'Scores are entered by your teacher. Your term grade becomes official once it is finalized.',
          style: theme.textTheme.labelSmall,
        ),
      ],
    );
  }

  Widget _weights(PortalSubjectRecord record) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'GRADING WEIGHTS',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            for (final category in _categories) ...[
              Expanded(
                child: Container(
                  key: ValueKey('student-record-weight-${category.$1}'),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                  decoration: BoxDecoration(
                    color: dark ? category.$4.withValues(alpha: 0.12) : category.$4,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: (dark ? category.$3.withValues(alpha: 0.5) : category.$3.withValues(alpha: 0.15)),
                    ),
                  ),
                  child: Column(
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          category.$2,
                          maxLines: 1,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: dark ? category.$3 : category.$3,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_number(_componentOf(record.components, category.$1)?.weight ?? 0)}%',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: category.$3,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (category != _categories.last) const SizedBox(width: 8),
            ],
          ],
        ),
      ],
    );
  }

  Widget _componentCard(
    BuildContext context,
    (String, String, Color, Color) category,
    PortalSubjectComponent? component,
  ) {
    final theme = Theme.of(context);
    final accent = category.$3;
    final label = _categoryLabels[category.$1] ?? component?.label ?? category.$1;
    final assessments = component?.assessments ?? const <PortalSubjectAssessment>[];
    final weight = component?.weight ?? 0;
    final earned = component?.earned ?? 0;
    final possible = component?.possible ?? 0;
    return ZCard(
      key: ValueKey('student-record-component-${category.$1}'),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              ZPill(
                label: 'Weight',
                tone: StatusTone.neutral,
                child: Text('${_number(weight)}%'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (assessments.isEmpty)
            Text(
              'No assessments yet.',
              style: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            )
          else
            for (final assessment in assessments) ...[
              _assessmentRow(context, assessment),
              if (assessment != assessments.last)
                Divider(height: 12, color: theme.colorScheme.outline),
            ],
          const SizedBox(height: 8),
          Divider(height: 1, color: theme.colorScheme.outline),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Total (${_number(earned)}/${_number(possible)} pts)',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                _percent(component?.percentage),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _assessmentRow(BuildContext context, PortalSubjectAssessment assessment) {
    final theme = Theme.of(context);
    final date = _dateLabel(assessment.dateGiven);
    final scored = assessment.rawScore != null;
    return Row(
      key: ValueKey('student-record-assessment-${assessment.id}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                assessment.title,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              ),
              Text(
                date.isEmpty ? 'No date' : date,
                style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              scored
                  ? '${_number(assessment.rawScore!)} / ${_number(assessment.maxScore)}'
                  : '— / ${_number(assessment.maxScore)}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: scored ? theme.colorScheme.onSurface : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            Text(
              scored ? _percent(assessment.percentage) : 'Not scored',
              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ],
    );
  }

  Widget _finalCard(BuildContext context, PortalSubjectRecord record) {
    final theme = Theme.of(context);
    final finalGrade = record.finalGrade;
    return ZCard(
      key: const ValueKey('student-record-final'),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Term Grade', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  record.isFinal
                      ? 'Official for this term'
                      : 'In progress — your teacher has not finalized it yet',
                  style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                ),
                if (finalGrade?['remarks'] != null)
                  Text(
                    finalGrade!['remarks'].toString(),
                    style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (record.isFinal && record.transmutedGrade != null)
            Text(
              _number(record.transmutedGrade!),
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: record.transmutedGrade! < 75 ? theme.colorScheme.error : null,
              ),
            )
          else
            ZStatusPill(
              text: 'In progress',
              tone: record.computedAverage == null ? StatusTone.neutral : StatusTone.amber,
            ),
        ],
      ),
    );
  }
}
