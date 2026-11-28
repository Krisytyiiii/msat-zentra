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
import '../portal/portal_widgets.dart';

class StudentSubjectAttendancePage extends ConsumerStatefulWidget {
  const StudentSubjectAttendancePage({
    super.key,
    required this.subjectId,
    this.subjectName,
    this.childId,
  });

  final String subjectId;
  final String? subjectName;
  /// Set when a guardian opens a linked child's attendance from the parent desk.
  final String? childId;

  @override
  ConsumerState<StudentSubjectAttendancePage> createState() =>
      _StudentSubjectAttendanceState();
}

class _StudentSubjectAttendanceState
    extends ConsumerState<StudentSubjectAttendancePage> {
  /// Attendance-log page, 5 dated entries per page.
  int _logPage = 0;

  bool get _isParent => widget.childId != null;

  ParentSubjectKey? get _parentKey => _isParent
      ? (childId: widget.childId!, subjectId: widget.subjectId)
      : null;

  AsyncValue<PortalSubjectAttendanceDetail> _watchRecord() => _isParent
      ? ref.watch(parentSubjectAttendanceProvider(_parentKey!))
      : ref.watch(studentSubjectAttendanceProvider(widget.subjectId));

  void _invalidate() {
    if (_isParent) {
      ref.invalidate(parentSubjectAttendanceProvider(_parentKey!));
    } else {
      ref.invalidate(studentSubjectAttendanceProvider(widget.subjectId));
    }
  }

  Future<PortalSubjectAttendanceDetail> _future() => _isParent
      ? ref.read(parentSubjectAttendanceProvider(_parentKey!).future)
      : ref.read(studentSubjectAttendanceProvider(widget.subjectId).future);

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(_isParent ? '/parent/attendance' : '/student/attendance');
    }
  }

  Future<void> _refresh() async {
    _invalidate();
    try {
      await _future();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    final record = _watchRecord();
    return Theme(
      data: theme,
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          backgroundColor: theme.scaffoldBackgroundColor,
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
            onRetry: _invalidate,
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
          description: _isParent
              ? "Your child's present and absent record for this class."
              : 'Your present and absent record for this class.',
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
    return PortalAttendanceRateCard(
      key: const ValueKey('student-attendance-summary'),
      summary: record.summary,
      note: _isParent
          ? 'Marks appear here after the teacher records this class.'
          : 'Marks appear here after your teacher records this class.',
    );
  }

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
                ('none', 'Not scheduled'),
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
    if (day == null) {
      return const AspectRatio(aspectRatio: 1, child: SizedBox.shrink());
    }
    final date = DateTime.tryParse(day.date);
    final label = _stateLabel(day.state);
    final fill = _stateFill(theme, day.state);
    final border = _stateBorder(theme, day.state);
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
          border: _stateBorder(theme, state),
        ),
      ),
      const SizedBox(width: 4),
      Text(label, style: const TextStyle(fontSize: 11)),
    ],
  );

  /// Unmarked days warn in amber; cancelled class days stay a visible neutral
  /// grey, so the two placeholder states never read as the same square.
  Border? _stateBorder(ThemeData theme, String state) => switch (state) {
        'missing' => Border.all(color: const Color(0xFFF59E0B)),
        'no-class' => Border.all(
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.45),
          ),
        'upcoming' => Border.all(color: theme.colorScheme.outlineVariant),
        'none' => Border.all(color: theme.colorScheme.outline),
        _ => null,
      };

  Color _stateFill(ThemeData theme, String state) => switch (state) {
        'present' => const Color(0xFF16A34A),
        'absent' => const Color(0xFFDC2626),
        'late' => const Color(0xFFD97706),
        'excused' => const Color(0xFF2563EB),
        'missing' => const Color(0xFFF59E0B).withValues(
            alpha: theme.brightness == Brightness.dark ? 0.28 : 0.18,
          ),
        'upcoming' => theme.colorScheme.surfaceContainerLowest,
        'no-class' => theme.colorScheme.onSurfaceVariant.withValues(
            alpha: theme.brightness == Brightness.dark ? 0.22 : 0.18,
          ),
        'none' => theme.colorScheme.surfaceContainerLow,
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
        'none' => 'Not scheduled',
        _ => 'Not scheduled',
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
    const pageSize = 5;
    final entries = record.log;
    final pages = (entries.length / pageSize).ceil().clamp(1, 100000);
    final page = _logPage.clamp(0, pages - 1);
    final start = page * pageSize;
    final slice = entries.skip(start).take(pageSize).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ZCard(
          key: const ValueKey('student-attendance-log'),
          padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 12),
          child: Column(
            children: [
              for (final (index, entry) in slice.indexed)
                _logRow(context, entry, showDivider: index > 0),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 0, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Showing ${start + 1}–${start + slice.length} of ${entries.length}',
                  style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
              if (pages > 1) ...[
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: page > 0 ? () => setState(() => _logPage = page - 1) : null,
                  icon: const Icon(Icons.chevron_left, size: 20),
                ),
                Text(
                  '${page + 1} / $pages',
                  style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                ),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: page < pages - 1 ? () => setState(() => _logPage = page + 1) : null,
                  icon: const Icon(Icons.chevron_right, size: 20),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  /// One dated mark: a status-tinted dot, the date with its weekday, and the
  /// same status pill the rest of the desk uses.
  Widget _logRow(
    BuildContext context,
    PortalAttendanceLogEntry entry, {
    required bool showDivider,
  }) {
    final theme = Theme.of(context);
    final date = DateTime.tryParse(entry.date) ?? DateTime(2000);
    final color = _statusColor(entry.status);
    return Column(
      children: [
        if (showDivider) Divider(height: 1, color: theme.colorScheme.outline),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 9),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      DateFormat('MMM d, yyyy').format(date),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      DateFormat('EEEE').format(date),
                      style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _statusPill(entry.status),
            ],
          ),
        ),
      ],
    );
  }

  Color _statusColor(String status) => switch (status) {
        'present' => const Color(0xFF16A34A),
        'absent' => const Color(0xFFDC2626),
        'late' => const Color(0xFFD97706),
        'excused' => const Color(0xFF2563EB),
        _ => Colors.grey,
      };

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
