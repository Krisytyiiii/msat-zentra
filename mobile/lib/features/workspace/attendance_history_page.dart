import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../shared/user_messages.dart';
import '../adviser/schedule_timing.dart';
import 'attendance_data.dart';
import 'attendance_sheet_page.dart';

/// Recorded dates, not a fabricated history of scheduled or unmarked meetings.
class AttendanceHistoryPage extends ConsumerStatefulWidget {
  const AttendanceHistoryPage({super.key, required this.pair});

  final AttendancePair pair;

  @override
  ConsumerState<AttendanceHistoryPage> createState() => _HistoryState();
}

class _HistoryState extends ConsumerState<AttendanceHistoryPage>
    with WidgetsBindingObserver {
  Map<String, Map<String, int>> _dates = {};
  Object? _error;
  bool _loading = true;
  int _generation = 0;
  Timer? _timer;
  bool _opening = false;
  DateTime? _termStart;
  DateTime? _termEnd;

  Future<void> _pickDate() async {
    final scope = ref.read(termProvider);
    final start = _termStart;
    final end = _termEnd;
    if (_opening || start == null || end == null || end.isBefore(start)) {
      return;
    }
    final now = philippineTime(ref.read(attendanceClockProvider)());
    final today = DateTime(now.year, now.month, now.day);
    final selected = await showDatePicker(
      context: context,
      helpText: 'Select attendance date',
      firstDate: start,
      lastDate: end,
      initialDate: today.isBefore(start)
          ? start
          : today.isAfter(end)
          ? end
          : today,
      builder: (context, child) => Theme(
        data: overviewScreenTheme(Theme.of(context)).copyWith(
          colorScheme: overviewScreenTheme(Theme.of(context)).colorScheme
              .copyWith(primary: const Color(0xFF2563EB)),
        ),
        child: child!,
      ),
    );
    if (!mounted ||
        selected == null ||
        ref.read(termProvider)?.id != scope?.id ||
        ref.read(termProvider)?.schoolYearId != scope?.schoolYearId) {
      return;
    }
    await _openDate(DateFormat('yyyy-MM-dd').format(selected));
  }

  Future<void> _openDate(String date) async {
    if (_opening) return;
    setState(() => _opening = true);
    final scope = ref.read(termProvider);
    try {
      final access = await AttendanceService(ref.read(apiClientProvider))
          .access();
      if (!mounted ||
          ref.read(termProvider)?.id != scope?.id ||
          ref.read(termProvider)?.schoolYearId != scope?.schoolYearId) {
        return;
      }
      final pair = access.pairs
          .where((pair) => pair.key == widget.pair.key)
          .firstOrNull;
      if (!access.entered || pair == null) {
        throw ApiException(
          'ACCESS_CHANGED',
          'Verify your teacher code and refresh your teaching load before opening attendance.',
        );
      }
      final theme = overviewScreenTheme(Theme.of(context));
      await Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          builder: (_) => Theme(
            data: theme,
            child: AttendanceSheetPage(
              pair: pair,
              access: access,
              initialDate: date,
              historyEdit: true,
            ),
          ),
        ),
      );
      if (mounted) await _load(silent: true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(userMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        _load(silent: true);
      }
    });
  }

  @override
  void dispose() {
    _generation++;
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ModalRoute.of(context)?.isCurrent == true) {
      _load(silent: true);
    }
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_generation;
    final term = ref.read(termProvider);
    if (!silent) setState(() => _loading = true);
    try {
      final response = await ref
          .read(apiClientProvider)
          .dio
          .get(
            '/api/attendance/subject-days',
            queryParameters: {
              'sectionId': widget.pair.sectionId,
              'subjectId': widget.pair.subjectId,
            },
          );
      if (!mounted || generation != _generation) return;
      final body = response.data as Map;
      if (term == null ||
          body['termId'] != term.id ||
          body['sectionId'] != widget.pair.sectionId ||
          body['subjectId'] != widget.pair.subjectId) {
        throw ApiException(
          'STALE_SCOPE',
          'Refresh to load this class history.',
        );
      }
      final dates = <String, Map<String, int>>{};
      final today = attendanceDay(
        philippineTime(ref.read(attendanceClockProvider)()),
      );
      final start = body['termStart']?.toString().substring(0, 10);
      final end = body['termEnd']?.toString().substring(0, 10);
      for (final row in body['records'] as List) {
        final date = row['date'] as String;
        if (date.compareTo(today) > 0 ||
            (start != null && date.compareTo(start) < 0) ||
            (end != null && date.compareTo(end) > 0)) {
          continue;
        }
        final status = row['status'] as String;
        if (!attendanceLabels.containsKey(status)) continue;
        dates
            .putIfAbsent(date, () => {})
            .update(status, (count) => count + 1, ifAbsent: () => 1);
      }
      setState(() {
        _dates = dates;
        _termStart = DateTime.tryParse(start ?? '');
        _termEnd = DateTime.tryParse(end ?? '');
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (_, _) {
      _dates = {};
      _termStart = null;
      _termEnd = null;
      _load();
    });
    final term = ref.watch(termProvider);
    final now = philippineTime(ref.read(attendanceClockProvider)());
    final monday = attendanceDay(
      DateTime.utc(
        now.year,
        now.month,
        now.day,
      ).subtract(Duration(days: now.weekday - 1)),
    );
    final dates = _dates.keys.toList()..sort((a, b) => b.compareTo(a));
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: Scaffold(
        appBar: AppBar(
          shape: const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
          centerTitle: true,
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          leading: ZBackButton(
            tooltip: 'Back',
            icon: const Icon(Icons.chevron_left),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text('Meeting History'),
        ),
        body: _loading
            ? const LoadingView(layout: SkeletonLayout.schedule)
            : _error != null
            ? ErrorView(message: _error, onRetry: _load)
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    ZContentHeader(title: widget.pair.subjectName,
                      icon: Icons.history,
                      description: 'Tap a date to view attendance. Only this week can be edited. Totals count marks across all periods, not unique students.',
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
                        ZScopePill(
                          text: [
                            if (widget.pair.gradeLevel != null)
                              widget.pair.gradeLevel!,
                            widget.pair.sectionName,
                          ].join(' · '),
                          kind: ScopePillKind.grade,
                          compact: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed:
                          _opening || _termStart == null || _termEnd == null
                          ? null
                          : _pickDate,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF2563EB),
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFFE6ECF4)),
                        minimumSize: const Size.fromHeight(48),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      icon: const Icon(Icons.calendar_month_outlined, size: 20),
                      label: const Text('Choose date'),
                    ),
                    const SizedBox(height: 16),
                    if (dates.isEmpty)
                      const ZEmpty(
                        icon: Icons.calendar_month_outlined,
                        title: 'No recorded meetings yet.',
                        subtitle: 'Recorded class meetings will appear here.',
                      ),
                    for (final date in dates)
                      Card(
                        key: ValueKey('attendance-history-$date'),
                        margin: const EdgeInsets.only(bottom: 12),
                        elevation: 0,
                        color: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: const BorderSide(color: Color(0xFFE6ECF4)),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Material(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(16),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: _opening ? null : () => _openDate(date),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      const CircleAvatar(
                                        radius: 19,
                                        backgroundColor: Color(0xFFEFF6FF),
                                        foregroundColor: Color(0xFF52627C),
                                        child: Icon(
                                          Icons.calendar_month_outlined,
                                          size: 20,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              DateFormat('EEE, MMM d, yyyy')
                                                  .format(DateTime.parse(date)),
                                              style: const TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.w600,
                                                color: Color(0xFF172033),
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            const Text(
                                              'Attendance record',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: Color(0xFF71809B),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Tooltip(
                                        message: date.compareTo(monday) < 0
                                            ? 'Read-only'
                                            : 'Editable',
                                        child: Icon(
                                          date.compareTo(monday) < 0
                                              ? Icons.visibility_outlined
                                              : Icons.edit_outlined,
                                          size: 20,
                                          color: const Color(0xFF71809B),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 12),
                                    child: Divider(
                                      height: 1,
                                      color: Color(0xFFF0F3F8),
                                    ),
                                  ),
                                  Center(
                                    child: Wrap(
                                      alignment: WrapAlignment.center,
                                      spacing: 6,
                                      runSpacing: 6,
                                      children: [
                                        for (final entry
                                            in attendanceLabels.entries)
                                          ZStatusPill(
                                            text:
                                                '${entry.value} ${_dates[date]![entry.key] ?? 0}',
                                            tone: switch (entry.key) {
                                              'present' => StatusTone.green,
                                              'absent' => StatusTone.red,
                                              'late' => StatusTone.amber,
                                              _ => StatusTone.blue,
                                            },
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}
