import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/adviser_navigation.dart';
import '../../design/overview_theme.dart';
import '../../shared/widgets.dart';
import '../../shared/floating_add.dart';
import '../../shared/models.dart';
import '../adviser/advisory_attendance_data.dart';
import 'attendance_data.dart';
import 'attendance_history_page.dart';
import 'attendance_record_card.dart';
import 'attendance_actions.dart';
import 'attendance_sheet_page.dart';
import '../../shared/user_messages.dart';
import '../adviser/schedule_timing.dart';
import '../home/role_home.dart' show StaffShellScope;
import '../../design/desk_theme.dart';

/// A reopened/deep-linked record resolves its real class through the current
/// account's teaching load instead of trusting labels from a previous screen.
final attendanceRecordPairProvider = FutureProvider.autoDispose
    .family<AttendancePair, String>((ref, key) async {
      ref.watch(authProvider);
      ref.watch(termProvider);
      final access = await AttendanceService(ref.watch(apiClientProvider))
          .access();
      final pair = access.pairs.where((p) => p.key == key).firstOrNull;
      if (!access.entered || pair == null) {
        throw ApiException(
          'ACCESS_CHANGED',
          'This class is no longer available. Return to Attendance.',
        );
      }
      return pair;
    });

class AttendanceRecordRoute extends ConsumerWidget {
  const AttendanceRecordRoute({
    super.key,
    required this.sectionId,
    required this.subjectId,
  });
  final String sectionId, subjectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = attendanceRecordPairProvider('$sectionId|$subjectId');
    return ref
        .watch(provider)
        .when(
          data: (pair) =>
              AttendanceRecordPage(key: ValueKey(pair.key), pair: pair),
          loading: () => Scaffold(
            appBar: _recordHeader(context),
            body: const LoadingView(layout: SkeletonLayout.attendance),
          ),
          error: (error, _) => Scaffold(
            appBar: _recordHeader(context),
            body: ErrorView(
              message: error,
              onRetry: () => ref.invalidate(provider),
            ),
          ),
        );
  }
}

void _closeRecord(BuildContext context) {
  final router = GoRouter.maybeOf(context);
  if (router != null) {
    if (router.canPop()) {
      router.pop();
    } else {
      router.go('/workspace/attendance');
    }
  } else {
    Navigator.of(context).maybePop();
  }
}

AppBar _recordHeader(BuildContext context) => AppBar(
  shape: Border(bottom: BorderSide(color: zLine(context))),
  centerTitle: true,
  title: const Text('Attendance Record'),
  leading: ZBackButton(
    tooltip: 'Back',
    icon: const Icon(Icons.chevron_left),
    onPressed: () => _closeRecord(context),
  ),
);

/// Read-only class roster; attendance entry remains separate.
class AttendanceRecordPage extends ConsumerStatefulWidget {
  const AttendanceRecordPage({super.key, required this.pair});

  final AttendancePair pair;

  @override
  ConsumerState<AttendanceRecordPage> createState() =>
      _AttendanceRecordPageState();
}

class _AttendanceRecordPageState extends ConsumerState<AttendanceRecordPage>
    with WidgetsBindingObserver {
  final _search = TextEditingController();
  List<AttendanceLearner> _learners = [];
  Object? _error;
  bool _loading = true, _descending = false;
  int _generation = 0;
  Timer? _timer;
  int? _meetings, _atRisk;
  double? _average;
  Map<String, ({int present, int late, int absent, double rate})> _summaries =
      {};
  bool _openingAttendance = false;
  bool _expanded = false;

  Future<void> _openAttendance(bool qr) async {
    if (_openingAttendance) return;
    setState(() {
      _expanded = false;
      _openingAttendance = true;
    });
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
          'Verify your teacher code and refresh your teaching load before taking attendance.',
        );
      }
      final theme = overviewScreenTheme(Theme.of(context));
      var date = attendanceDay(
        philippineTime(ref.read(attendanceClockProvider)()),
      );
      if (scope?.startDate != null &&
          date.compareTo(attendanceDay(scope!.startDate!)) < 0) {
        date = attendanceDay(scope.startDate!);
      }
      if (scope?.endDate != null &&
          date.compareTo(attendanceDay(scope!.endDate!)) > 0) {
        date = attendanceDay(scope.endDate!);
      }
      await Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          builder: (_) => Theme(
            data: theme,
            child: AttendanceSheetPage(
              pair: pair,
              access: access,
              openQr: qr,
              initialDate: date,
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
      if (mounted) setState(() => _openingAttendance = false);
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
    _search.dispose();
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
      final responses = await Future.wait([
        ref
            .read(apiClientProvider)
            .dio
            .get(
              '/api/attendance/section-roster',
              queryParameters: {'sectionId': widget.pair.sectionId},
            ),
        ref
            .read(apiClientProvider)
            .dio
            .get(
              '/api/attendance/section-subject-matrix',
              queryParameters: {'sectionId': widget.pair.sectionId},
            ),
        ref
            .read(apiClientProvider)
            .dio
            .get(
              '/api/attendance/subject-days',
              queryParameters: {
                'sectionId': widget.pair.sectionId,
                'subjectId': widget.pair.subjectId,
              },
            ),
      ]);
      if (!mounted || generation != _generation) return;
      final body = responses[0].data as Map;
      final matrix = SectionAttendanceMatrix.fromJson(
        Map<String, dynamic>.from(responses[1].data as Map),
      );
      final days = responses[2].data as Map;
      if (body['sectionId'] != widget.pair.sectionId ||
          body['termId'] != term?.id ||
          matrix.termId != term?.id ||
          matrix.sectionId != widget.pair.sectionId ||
          days['termId'] != term?.id ||
          days['subjectId'] != widget.pair.subjectId) {
        throw ApiException(
          'STALE_SCOPE',
          'Refresh to load the selected class.',
        );
      }
      final learners = [
        for (final row in body['students'] as List)
          AttendanceLearner(row as Map),
      ];
      // Match the matrix's elapsed-meetup calendar, including its weekday
      // fallback when no timetable has been published.
      final calendar = <String, int>{};
      final start = DateTime.tryParse(days['termStart']?.toString() ?? '');
      final end = DateTime.tryParse(days['termEnd']?.toString() ?? '');
      if (start != null && end != null) {
        final today = attendanceDay(
          ref.read(attendanceClockProvider)().toUtc(),
        );
        final last = attendanceDay(end).compareTo(today) < 0
            ? attendanceDay(end)
            : today;
        for (
          var day = DateTime.utc(start.year, start.month, start.day);
          attendanceDay(day).compareTo(last) <= 0;
          day = day.add(const Duration(days: 1))
        ) {
          final count = widget.pair.slots.isEmpty
              ? (day.weekday <= 5 ? 1 : 0)
              : widget.pair.slots
                    .where((slot) => slot.day == day.weekday)
                    .map((slot) => slot.period)
                    .toSet()
                    .length;
          if (count > 0) calendar[attendanceDay(day)] = count;
        }
      }
      final records = (days['records'] as List).cast<Map>();
      final rates = <double>[];
      final summaries =
          <String, ({int present, int late, int absent, double rate})>{};
      final exempt = {
        for (final learner in learners)
          if (learner.exempt) learner.id,
      };
      final active = {for (final learner in learners) learner.id};
      for (final student in matrix.students) {
        if (exempt.contains(student.studentId) ||
            !active.contains(student.studentId)) {
          continue;
        }
        final total = student.meetups[widget.pair.subjectId] ?? 0;
        if (total == 0) continue;
        final ownRecords = records
            .where((row) => row['key'] == student.studentId)
            .toList();
        final rate = attendanceRecordRate(calendar, total, ownRecords);
        int count(String status) =>
            (attendanceRecordRate(
                      calendar,
                      total,
                      ownRecords.where((row) => row['status'] == status),
                    ) *
                    total)
                .round();
        summaries[student.studentId] = (
          present: count('present'),
          late: count('late'),
          absent: total - (rate * total).round(),
          rate: rate,
        );
        rates.add(rate);
      }
      setState(() {
        _learners = learners;
        _summaries = summaries;
        _meetings = start == null || end == null
            ? null
            : calendar.values.fold<int>(0, (a, b) => a + b);
        _average = rates.isEmpty
            ? null
            : rates.reduce((a, b) => a + b) / rates.length;
        _atRisk = rates.isEmpty
            ? null
            : rates.where((rate) => rate <= 0.8).length;
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
      _expanded = false;
      _learners = [];
      _search.clear();
      _load();
    });
    final term = ref.watch(termProvider);
    final isAdviser = ref.watch(authProvider).role == 'adviser';
    final ownNavigation = isAdviser && !StaffShellScope.contains(context);
    final query = _search.text.trim().toLowerCase();
    final learners =
        _learners
            .where(
              (learner) =>
                  learner.name.toLowerCase().contains(query) ||
                  learner.lrn.contains(query),
            )
            .toList()
          ..sort((a, b) {
            final order = a.name.toLowerCase().compareTo(b.name.toLowerCase());
            return _descending ? -order : order;
          });
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.escape): () {
            if (_expanded) setState(() => _expanded = false);
          },
        },
        child: Focus(
          autofocus: true,
          child: PopScope(
            canPop: !_expanded,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop && _expanded) setState(() => _expanded = false);
            },
            child: Scaffold(
              extendBody: ownNavigation,
              bottomNavigationBar: ownNavigation
                  ? AdviserBottomNavigation(
                      selectedPath: '/workspace/attendance',
                      rerouteOnSelect: true,
                      isAdviser: isAdviser,
                    )
                  : null,
              appBar: AppBar(
                shape: Border(bottom: BorderSide(color: zLine(context))),
                centerTitle: true,
                backgroundColor: zCard(context),
                leadingWidth: 64,
                leading: ZBackButton(
                  icon: const Icon(Icons.chevron_left),
                  tooltip: 'Back',
                  padding: EdgeInsets.zero,
                  onPressed: () {
                    if (_expanded) {
                      setState(() => _expanded = false);
                    } else {
                      _closeRecord(context);
                    }
                  },
                ),
                title: const Text('Attendance Record'),
              ),
              body: Stack(
                children: [
                  _loading
                      ? const LoadingView(layout: SkeletonLayout.attendance)
                      : _error != null
                      ? ErrorView(message: _error, onRetry: _load)
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(12, 16, 12, 168),
                            children: [
                              ZContentHeader(
                                title: widget.pair.subjectName,
                                icon: LucideIcons.calendarCheck,
                                description: 'View the learners in this class.',
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
                                    text:
                                        [
                                              if (widget.pair.gradeLevel !=
                                                  null)
                                                widget.pair.gradeLevel!,
                                              widget.pair.sectionName,
                                            ]
                                            .where((value) => value.isNotEmpty)
                                            .join(' · '),
                                    kind: ScopePillKind.grade,
                                    label: 'Grade and section',
                                    compact: true,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'ATTENDANCE SUMMARY',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: zMutedInk(context),
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    style: TextButton.styleFrom(
                                      minimumSize: const Size(48, 32),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                      ),
                                      visualDensity: VisualDensity.compact,
                                      tapTargetSize:
                                          MaterialTapTargetSize.padded,
                                    ),
                                    onPressed: () =>
                                        Navigator.of(
                                          context,
                                          rootNavigator: true,
                                        ).push(
                                          MaterialPageRoute<void>(
                                            builder: (_) =>
                                                AttendanceHistoryPage(
                                                  pair: widget.pair,
                                                ),
                                          ),
                                        ),
                                    child: const Text('Meetings ›'),
                                  ),
                                ],
                              ),
                              LayoutBuilder(
                                builder: (context, constraints) {
                                  final tiles = [
                                    _counter(
                                      'MEETINGS',
                                      _meetings?.toString() ?? '—',
                                      zLift(context, const Color(0xFF4263F0)),
                                      const Color(0xFFF3F5FF),
                                    ),
                                    _counter(
                                      'AVG. ATT.',
                                      _average == null
                                          ? '—'
                                          : '${(_average! * 100).toStringAsFixed(1)}%',
                                      zLift(context, const Color(0xFFB77908)),
                                      const Color(0xFFFFF9EB),
                                    ),
                                    _counter(
                                      'AT RISK',
                                      _atRisk?.toString() ?? '—',
                                      zLift(context, const Color(0xFFE11D48)),
                                      zWash(context, const Color(0xFFFFF2F5)),
                                    ),
                                  ];
                                  if (constraints.maxWidth < 330 ||
                                      MediaQuery.textScalerOf(context)
                                              .scale(12) >
                                          18) {
                                    return Column(
                                      children: [
                                        for (final tile in tiles)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              bottom: 8,
                                            ),
                                            child: tile,
                                          ),
                                      ],
                                    );
                                  }
                                  return Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      for (
                                        var i = 0;
                                        i < tiles.length;
                                        i++
                                      ) ...[
                                        if (i > 0) const SizedBox(width: 8),
                                        Expanded(child: tiles[i]),
                                      ],
                                    ],
                                  );
                                },
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _search,
                                onChanged: (_) => setState(() {}),
                                style: const TextStyle(fontSize: 12),
                                decoration: InputDecoration(
                                  hintText: 'Search learner or LRN',
                                  prefixIcon: const Icon(
                                    Icons.search,
                                    size: 20,
                                  ),
                                  suffixIcon: query.isEmpty
                                      ? null
                                      : IconButton(
                                          tooltip: 'Clear search',
                                          icon: const Icon(
                                            Icons.close,
                                            size: 16,
                                          ),
                                          onPressed: () =>
                                              setState(_search.clear),
                                        ),
                                  filled: true,
                                  fillColor: zSoft(context),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(999),
                                    borderSide: BorderSide(
                                      color: zLine(context),
                                    ),
                                  ),
                                ),
                              ),
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'Showing ${learners.length} records',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: zMutedInk(context),
                                      ),
                                    ),
                                  ),
                                  TextButton.icon(
                                    style: TextButton.styleFrom(
                                      minimumSize: const Size(48, 32),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                      ),
                                      visualDensity: VisualDensity.compact,
                                      tapTargetSize:
                                          MaterialTapTargetSize.padded,
                                    ),
                                    onPressed: () => setState(
                                      () => _descending = !_descending,
                                    ),
                                    icon: const Icon(
                                      LucideIcons.listFilter,
                                      size: 14,
                                    ),
                                    label: Text(
                                      _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                                    ),
                                  ),
                                ],
                              ),
                              if (learners.isEmpty)
                                ZEmpty(
                                  icon: query.isEmpty
                                      ? LucideIcons.users
                                      : LucideIcons.search,
                                  title: query.isEmpty
                                      ? 'No learners in this class.'
                                      : 'No learners match your search.',
                                  subtitle: query.isEmpty
                                      ? 'Learners in this class will appear here.'
                                      : 'Try another name or LRN.',
                                ),
                              for (
                                var index = 0;
                                index < learners.length;
                                index++
                              )
                                AttendanceRecordCard(
                                  learner: learners[index],
                                  index: index,
                                  summary: _summaries[learners[index].id],
                                ),
                            ],
                          ),
                        ),
                  if (_expanded)
                    Positioned.fill(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => setState(() => _expanded = false),
                        child: const ColoredBox(color: Colors.transparent),
                      ),
                    ),
                  if (!_loading && _error == null)
                    Positioned(
                      key: const ValueKey('attendance-dial-anchor'),
                      right: 16,
                      bottom: 0,
                      child: FloatingAdd(
                        child: AttendanceActions(
                          expanded: _expanded,
                          onToggle: () =>
                              setState(() => _expanded = !_expanded),
                          onSelect: _openAttendance,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _counter(String title, String value, Color ink, Color background) =>
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: ink.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                color: ink,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 12,
                color: ink,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );
}

/// The server's learner-specific denominator determines the eligible tail of
/// the calendar (transferees start after enlistment). Cap each day's accepted
/// marks to its meetup count, just as the server caps Present slots.
double attendanceRecordRate(
  Map<String, int> calendar,
  int eligibleMeetings,
  Iterable<Map> records,
) {
  if (eligibleMeetings <= 0) return 0;
  final acceptedByDate = <String, int>{};
  for (final record in records) {
    if (!const {'present', 'late', 'excused'}.contains(record['status'])) {
      continue;
    }
    final date = record['date'] as String;
    acceptedByDate.update(date, (count) => count + 1, ifAbsent: () => 1);
  }
  var remaining = eligibleMeetings;
  var attended = 0;
  final dates = calendar.keys.toList()..sort((a, b) => b.compareTo(a));
  for (final date in dates) {
    if (remaining == 0) break;
    final available = calendar[date]!;
    final eligible = available < remaining ? available : remaining;
    final accepted = acceptedByDate[date] ?? 0;
    attended += accepted < eligible ? accepted : eligible;
    remaining -= eligible;
  }
  return attended / eligibleMeetings;
}
