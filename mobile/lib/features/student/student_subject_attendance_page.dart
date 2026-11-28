// One subject's attendance record for the signed-in learner.
// Read-only mirror of the adviser record: summary, term heatmap and dated log.
// Data: GET /api/student/subjects/:id/attendance

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../services/portal_service.dart';

class StudentSubjectAttendancePage extends ConsumerStatefulWidget {
  const StudentSubjectAttendancePage({
    super.key,
    required this.subjectId,
    this.subjectName,
  });

  final String subjectId;
  final String? subjectName;

  @override
  ConsumerState<StudentSubjectAttendancePage> createState() =>
      _StudentSubjectAttendanceState();
}

class _StudentSubjectAttendanceState
    extends ConsumerState<StudentSubjectAttendancePage> {
  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/student/attendance');
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(studentSubjectAttendanceProvider(widget.subjectId));
    try {
      await ref.read(studentSubjectAttendanceProvider(widget.subjectId).future);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    final record = ref.watch(studentSubjectAttendanceProvider(widget.subjectId));
    return Theme(
      data: theme,
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          title: const Text('Attendance Record'),
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
                ref.invalidate(studentSubjectAttendanceProvider(widget.subjectId)),
          ),
          data: (data) => RefreshIndicator(
            onRefresh: _refresh,
            child: _body(context, data),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, PortalSubjectAttendanceDetail record) {
    final theme = Theme.of(context);
    final term = record.term ?? portalScopeTerm(ref);
    final unmarked = record.days.where((d) => d.state == 'missing').length;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
      children: [
        ZContentHeader(
          title: record.subjectName.isEmpty
              ? (widget.subjectName ?? 'Subject')
              : record.subjectName,
          icon: Icons.fact_check_outlined,
          description: 'Your present and absent record for this class.',
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
        _summaryCard(context, record),
        const SizedBox(height: 12),
        _heatmapCard(context, record, unmarked: unmarked),
        const SizedBox(height: 16),
        Text(
          'ATTENDANCE LOG',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        _logCard(context, record),
      ],
    );
  }

  Widget _summaryCard(
    BuildContext context,
    PortalSubjectAttendanceDetail record,
  ) {
    final theme = Theme.of(context);
    final summary = record.summary;
    return ZCard(
      key: const ValueKey('student-attendance-summary'),
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Present rate',
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Text(
                summary.hasMarks ? '${summary.percent}%' : 'No marks',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: summary.hasMarks ? 20 : 13,
                  color: summary.hasMarks && summary.isRisk
                      ? theme.colorScheme.error
                      : summary.hasMarks
                          ? null
                          : theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: summary.hasMarks ? summary.rate.clamp(0, 1) : 0,
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _stat(theme, 'Present', summary.present),
              _stat(theme, 'Absent', summary.absent),
              _stat(theme, 'Late', summary.late),
              _stat(theme, 'Excused', summary.excused),
            ],
          ),
          if (!summary.hasMarks) ...[
            const SizedBox(height: 8),
            Text(
              'Marks appear here after your teacher records this class.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }

  Widget _stat(ThemeData theme, String label, int value) => Column(
    children: [
      Text('$value', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
      Text(label, style: theme.textTheme.labelSmall),
    ],
  );

  Widget _heatmapCard(
    BuildContext context,
    PortalSubjectAttendanceDetail record, {
    required int unmarked,
  }) {
    final theme = Theme.of(context);
    final weeks = <String, Map<int, PortalAttendanceHeatDay>>{};
    for (final day in record.days) {
      final date = DateTime.tryParse(day.date);
      if (date == null) continue;
      final monday = date.subtract(Duration(days: date.weekday - 1));
      final key = DateFormat('yyyy-MM-dd').format(monday);
      weeks.putIfAbsent(key, () => {})[date.weekday] = day;
    }
    final keys = weeks.keys
        .where((key) => weeks[key]!.values.any((day) => day.state != 'none'))
        .toList()
      ..sort();
    return ZCard(
      key: const ValueKey('student-attendance-heatmap'),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Attendance heatmap',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            'Each square is a scheduled class day this term.',
            style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const SizedBox(width: 48),
              for (final label in const ['M', 'T', 'W', 'T', 'F'])
                Expanded(
                  child: Center(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          if (keys.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'No scheduled class days for this term yet.',
                style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
              ),
            )
          else
            for (final key in keys) ...[
            Row(
              children: [
                SizedBox(
                  width: 48,
                  child: Text(
                    DateFormat('MMM d').format(DateTime.parse(key)),
                    style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
                for (var weekday = 1; weekday <= 5; weekday += 1)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(2),
                      child: _heatCell(context, weeks[key]?[weekday]),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 6,
            children: [
              for (final entry in const [
                ('present', 'Present'),
                ('absent', 'Absent'),
                ('late', 'Late'),
                ('excused', 'Excused'),
                ('missing', 'No record'),
                ('upcoming', 'Upcoming'),
                ('no-class', 'No class'),
              ])
                _legend(theme, entry.$1, entry.$2),
            ],
          ),
          if (unmarked > 0) ...[
            const SizedBox(height: 8),
            Text(
              '$unmarked scheduled ${unmarked == 1 ? 'day has' : 'days have'} no recorded mark yet.',
              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }

  Widget _heatCell(BuildContext context, PortalAttendanceHeatDay? day) {
    final theme = Theme.of(context);
    if (day == null || day.state == 'none') {
      return const AspectRatio(aspectRatio: 1, child: SizedBox.shrink());
    }
    final date = DateTime.tryParse(day.date);
    final label = _stateLabel(day.state);
    final fill = _stateFill(theme, day.state);
    final border = day.state == 'missing'
        ? Border.all(color: theme.colorScheme.outline)
        : day.state == 'no-class' || day.state == 'upcoming'
            ? Border.all(color: theme.colorScheme.outlineVariant)
            : null;
    return Tooltip(
      message: date == null ? label : '${DateFormat('EEE, MMM d').format(date)} · $label',
      child: AspectRatio(
        aspectRatio: 1,
        child: Semantics(
          label: date == null ? label : '${DateFormat('EEE, MMM d').format(date)} $label',
          child: Container(
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(4),
              border: border,
            ),
          ),
        ),
      ),
    );
  }

  Widget _legend(ThemeData theme, String state, String label) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: _stateFill(theme, state),
          borderRadius: BorderRadius.circular(3),
          border: state == 'missing'
              ? Border.all(color: theme.colorScheme.outline)
              : state == 'no-class' || state == 'upcoming'
                  ? Border.all(color: theme.colorScheme.outlineVariant)
                  : null,
        ),
      ),
      const SizedBox(width: 4),
      Text(label, style: const TextStyle(fontSize: 11)),
    ],
  );

  Color _stateFill(ThemeData theme, String state) => switch (state) {
        'present' => const Color(0xFF16A34A),
        'absent' => const Color(0xFFDC2626),
        'late' => const Color(0xFFD97706),
        'excused' => const Color(0xFF2563EB),
        'missing' => theme.colorScheme.surfaceContainerLow,
        'upcoming' => theme.colorScheme.surfaceContainerLowest,
        'no-class' => theme.colorScheme.surfaceContainerHighest,
        _ => Colors.transparent,
      };

  String _stateLabel(String state) => switch (state) {
        'present' => 'Present',
        'absent' => 'Absent',
        'late' => 'Late',
        'excused' => 'Excused',
        'missing' => 'No record',
        'upcoming' => 'Upcoming',
        'no-class' => 'No class',
        _ => 'No class',
      };

  Widget _logCard(BuildContext context, PortalSubjectAttendanceDetail record) {
    final theme = Theme.of(context);
    if (record.log.isEmpty) {
      return const ZEmpty(
        icon: Icons.fact_check_outlined,
        title: 'No attendance records yet',
        subtitle: 'Marks appear here after your teacher records this class.',
        compact: true,
      );
    }
    final format = DateFormat('MMM d, yyyy');
    return ZCard(
      key: const ValueKey('student-attendance-log'),
      padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 12),
      child: Column(
        children: [
          for (final (index, entry) in record.log.indexed) ...[
            if (index > 0) Divider(height: 1, color: theme.colorScheme.outline),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          format.format(DateTime.tryParse(entry.date) ?? DateTime(2000)),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                        ),
                        Text(
                          'Period ${entry.slot + 1}',
                          style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  _statusPill(entry.status),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _statusPill(String status) => ZStatusPill(
    text: switch (status) {
      'present' => 'Present',
      'absent' => 'Absent',
      'late' => 'Late',
      'excused' => 'Excused',
      _ => status,
    },
    tone: switch (status) {
      'present' => StatusTone.green,
      'absent' => StatusTone.red,
      'late' => StatusTone.amber,
      'excused' => StatusTone.blue,
      _ => StatusTone.neutral,
    },
  );
}
