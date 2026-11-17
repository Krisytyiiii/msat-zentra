import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../adviser/schedule_timing.dart';
import 'attendance_data.dart';
import 'attendance_sheet_page.dart';

/// Shared adviser/subject-teacher attendance entry, using web's teaching load.
class WorkspaceAttendancePage extends ConsumerStatefulWidget {
  const WorkspaceAttendancePage({super.key});
  @override
  ConsumerState<WorkspaceAttendancePage> createState() => _AttendanceState();
}

class _AttendanceState extends ConsumerState<WorkspaceAttendancePage>
    with WidgetsBindingObserver {
  AttendanceAccess? _access;
  Term? _term;
  late String _date;
  bool _scheduledOnly = true;
  String? _sectionId;
  Object? _error;
  bool _loading = true;
  bool _fetching = false;
  bool _opening = false;
  String _query = '';
  int _generation = 0;
  Timer? _timer;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _date = attendanceDay(philippineTime(ref.read(attendanceClockProvider)()));
    WidgetsBinding.instance.addObserver(this);
    _load();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted &&
          ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        _load(silent: true);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _search.dispose();
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
    if (_fetching) return;
    _fetching = true;
    final generation = ++_generation;
    setState(() {
      _loading = !silent || _access == null;
      _error = null;
    });
    try {
      final selected = ref.read(termProvider);
      if (selected == null) {
        throw ApiException('NO_TERM', 'Select a school year and term first.');
      }
      final access = await AttendanceService(ref.read(apiClientProvider))
          .access();
      if (!mounted || generation != _generation) return;
      Term? term;
      if (access.linked && access.entered) {
        // Resolve authoritative dates even when the saved term is an older
        // cache entry without date metadata. Never invent a live term window.
        final years = await ref.read(schoolYearsProvider.future);
        if (!mounted || generation != _generation) return;
        term = years
            .expand((y) => y.terms)
            .where(
              (t) =>
                  t.id == selected.id &&
                  t.schoolYearId == selected.schoolYearId,
            )
            .firstOrNull;
        if (term?.startDate == null ||
            term?.endDate == null ||
            term!.endDate!.isBefore(term.startDate!)) {
          throw ApiException(
            'NO_TERM',
            'The selected term dates are unavailable.',
          );
        }
      }
      setState(() {
        _access = access;
        _term = term;
        if (!access.pairs.any((p) => p.sectionId == _sectionId)) {
          _sectionId = null;
        }
        if (term != null) {
          // Keep the selected day inside the authoritative term, e.g. when an
          // older term is selected or the term rolled over while open.
          final first = attendanceDay(term.startDate!);
          final last = attendanceDay(term.endDate!);
          if (_date.compareTo(first) < 0) _date = first;
          if (_date.compareTo(last) > 0) _date = last;
        }
        _loading = false;
      });
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() {
          _error = error;
          _loading = false;
        });
      }
    } finally {
      if (generation == _generation) _fetching = false;
    }
  }

  Future<void> _open(AttendancePair pair) async {
    if (_opening || _access == null || _error != null) return;
    _opening = true;
    final access = _access!;
    final date = _date;
    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => AttendanceSheetPage(
            pair: pair,
            access: access,
            initialDate: date,
          ),
        ),
      );
      if (mounted) await _load(silent: true);
    } finally {
      _opening = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (_, _) {
      _generation++;
      _fetching = false;
      _access = null;
      _term = null;
      _sectionId = null;
      _scheduledOnly = true;
      _query = '';
      _search.clear();
      _date = attendanceDay(
        philippineTime(ref.read(attendanceClockProvider)()),
      );
      _load();
    });
    if (_loading) return const LoadingView();
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    final access = _access!;
    if (!access.linked || !access.entered) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: ZCard(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.key_outlined, size: 28),
                  const SizedBox(height: 12),
                  Text(
                    access.linked
                        ? 'Enter your school year'
                        : 'Link your teacher code',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Use your teacher code to open the same classes and attendance sheets as web.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => context.go('/gate'),
                    child: const Text('Open verification'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    if (access.pairs.isEmpty) {
      return ZEmptyPage(
        icon: Icons.class_outlined,
        title: 'No teaching load',
        subtitle:
            'Your submitted or approved timetable classes will appear here.',
        onRefresh: _load,
      );
    }
    final now = ref.read(attendanceClockProvider)();
    final sections = {for (final p in access.pairs) p.sectionId: p.sectionName};
    final pairs =
        access.pairs
            .where(
              (p) =>
                  (!_scheduledOnly || _scheduled(p)) &&
                  (_sectionId == null || p.sectionId == _sectionId) &&
                  '${p.sectionName} ${p.subjectName}'.toLowerCase().contains(
                    _query,
                  ),
            )
            .toList()
          ..sort((a, b) {
            final rank = _cardState(
              a,
              access,
              now,
            ).rank.compareTo(_cardState(b, access, now).rank);
            return rank != 0
                ? rank
                : '${a.subjectName} ${a.sectionName}'.compareTo(
                    '${b.subjectName} ${b.sectionName}',
                  );
          });
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: RefreshIndicator(
          onRefresh: () => _load(silent: true),
          child: CustomScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Take attendance',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Pick a date and class, then review and save your marks.',
                      ),
                      const SizedBox(height: 12),
                      _dateControls(),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          ChoiceChip(
                            key: const ValueKey('attendance-scheduled'),
                            label: const Text('Scheduled that day'),
                            selected: _scheduledOnly,
                            onSelected: (_) =>
                                setState(() => _scheduledOnly = true),
                          ),
                          ChoiceChip(
                            key: const ValueKey('attendance-all'),
                            label: const Text('All classes'),
                            selected: !_scheduledOnly,
                            onSelected: (_) =>
                                setState(() => _scheduledOnly = false),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        key: ValueKey(
                          'attendance-section-${_sectionId ?? 'all'}',
                        ),
                        initialValue: _sectionId ?? '',
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Section'),
                        items: [
                          const DropdownMenuItem(
                            value: '',
                            child: Text('All sections'),
                          ),
                          for (final section in sections.entries)
                            DropdownMenuItem(
                              value: section.key,
                              child: Text(
                                section.value,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (value) => setState(
                          () => _sectionId = value == '' ? null : value,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _search,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Search subject or section',
                        ),
                        onChanged: (v) =>
                            setState(() => _query = v.trim().toLowerCase()),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${pairs.length} ${pairs.length == 1 ? 'class' : 'classes'} · ${DateFormat('EEE, MMM d').format(DateTime.parse(_date))}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
              if (pairs.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    child: ZCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _query.isNotEmpty || _sectionId != null
                                ? 'No classes match these filters'
                                : 'No scheduled classes on this date',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Choose another date, or browse all your classes.',
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => setState(() {
                              _scheduledOnly = false;
                              _sectionId = null;
                              _query = '';
                              _search.clear();
                            }),
                            child: const Text('Show all classes'),
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  sliver: SliverList.separated(
                    itemCount: pairs.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final pair = pairs[i];
                      final state = _cardState(pair, access, now);
                      return ZCard(
                        key: ValueKey('attendance-class-${pair.key}'),
                        onTap: () => _open(pair),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              pair.subjectName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              pair.sectionName,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _scheduleLabel(pair, access),
                              style: Theme.of(context).textTheme.bodySmall,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                ZStatusPill(
                                  text: state.label,
                                  tone: state.tone,
                                ),
                                ZStatusPill(
                                  text: '${pair.slots.length} weekly meetups',
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              state.message,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 8),
                            const Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Flexible(child: Text('Open attendance sheet')),
                                Icon(Icons.chevron_right, size: 18),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _scheduleLabel(AttendancePair pair, AttendanceAccess access) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    String clock(int m) =>
        '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
    final selected =
        pair.slots.where((s) => s.day == DateTime.parse(_date).weekday).toList()
          ..sort((a, b) => a.period.compareTo(b.period));
    if (!_scheduled(pair)) return 'No meetup on the selected date.';
    return selected
            .take(3)
            .map((s) {
              final day = s.day >= 1 && s.day <= 7
                  ? days[s.day - 1]
                  : 'Day ${s.day}';
              final periods = access.config?.periods;
              if (periods == null ||
                  s.period < 0 ||
                  s.period >= periods.length) {
                return '$day · Period ${s.period + 1}';
              }
              final t = periods[s.period];
              return '$day ${clock(t.start)}–${clock(t.end)}';
            })
            .join(' · ') +
        (selected.length > 3 ? ' · +${selected.length - 3} more' : '');
  }

  bool _scheduled(AttendancePair pair) =>
      _term?.startDate != null &&
      _term?.endDate != null &&
      _date.compareTo(attendanceDay(_term!.startDate!)) >= 0 &&
      _date.compareTo(attendanceDay(_term!.endDate!)) <= 0 &&
      DateTime.parse(_date).weekday <= 5 &&
      pair.slots.any((s) => s.day == DateTime.parse(_date).weekday);

  ({String label, String message, StatusTone tone, int rank}) _cardState(
    AttendancePair pair,
    AttendanceAccess access,
    DateTime now,
  ) {
    final gate = attendanceGate(
      pair,
      access.config,
      _date,
      attendanceDay(_term!.startDate!),
      attendanceDay(_term!.endDate!),
      now,
    );
    final today = attendanceDay(philippineTime(now));
    if (!access.canMark(pair) ||
        !_scheduled(pair) ||
        (_date.compareTo(today) <= 0 &&
            gate.locked &&
            !gate.message.startsWith('Opens at'))) {
      return (
        label: 'Read-only',
        message: !access.canMark(pair)
            ? 'Verify attendance access to mark this class.'
            : gate.message,
        tone: StatusTone.neutral,
        rank: 30000,
      );
    }
    final periods =
        pair.slots
            .where(
              (s) =>
                  s.day == DateTime.parse(_date).weekday &&
                  s.period >= 0 &&
                  s.period < (access.config?.periods.length ?? 0),
            )
            .toList()
          ..sort((a, b) => a.period.compareTo(b.period));
    final start = periods.isEmpty
        ? 0
        : access.config!.periods[periods.first.period].start;
    if (_date.compareTo(today) > 0 || gate.message.startsWith('Opens at')) {
      return (
        label: 'Upcoming',
        message: gate.message,
        tone: StatusTone.neutral,
        rank: start,
      );
    }
    if (gate.message.startsWith('Live')) {
      return (
        label: 'Live',
        message: gate.message,
        tone: StatusTone.green,
        rank: -1,
      );
    }
    return (
      label: 'Ended',
      message: gate.message,
      tone: StatusTone.amber,
      rank: 10000 + start,
    );
  }

  Widget _dateControls() {
    final first = attendanceDay(_term!.startDate!);
    final last = attendanceDay(_term!.endDate!);
    final today = attendanceDay(
      philippineTime(ref.read(attendanceClockProvider)()),
    );
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        IconButton(
          tooltip: 'Previous day',
          onPressed: _date.compareTo(first) <= 0
              ? null
              : () => setState(() {
                  _date = _date.compareTo(last) > 0
                      ? last
                      : attendanceDay(
                          DateTime.parse(_date)
                              .subtract(const Duration(days: 1)),
                        );
                }),
          icon: const Icon(Icons.chevron_left),
        ),
        OutlinedButton.icon(
          key: const ValueKey('attendance-class-date'),
          onPressed: _chooseDate,
          icon: const Icon(Icons.calendar_today_outlined, size: 16),
          label: Text(
            DateFormat('EEE, MMM d, yyyy').format(DateTime.parse(_date)),
          ),
        ),
        IconButton(
          tooltip: 'Next day',
          onPressed: _date.compareTo(last) >= 0
              ? null
              : () => setState(() {
                  _date = _date.compareTo(first) < 0
                      ? first
                      : attendanceDay(
                          DateTime.parse(_date).add(const Duration(days: 1)),
                        );
                }),
          icon: const Icon(Icons.chevron_right),
        ),
        TextButton(
          onPressed:
              _date == today ||
                  today.compareTo(first) < 0 ||
                  today.compareTo(last) > 0
              ? null
              : () => setState(() => _date = today),
          child: const Text('Today'),
        ),
      ],
    );
  }

  Future<void> _chooseDate() async {
    final term = _term!;
    final scope = ref.read(termProvider);
    final first = DateTime.parse(attendanceDay(term.startDate!));
    final last = DateTime.parse(attendanceDay(term.endDate!));
    var initial = DateTime.parse(_date);
    if (initial.isBefore(first)) initial = first;
    if (initial.isAfter(last)) initial = last;
    final picked = await showDatePicker(
      context: context,
      firstDate: first,
      lastDate: last,
      initialDate: initial,
      helpText: 'Choose attendance date',
    );
    if (!mounted) return;
    final current = ref.read(termProvider);
    if (picked == null ||
        current?.id != scope?.id ||
        current?.schoolYearId != scope?.schoolYearId) {
      return;
    }
    setState(() => _date = attendanceDay(picked));
  }
}
