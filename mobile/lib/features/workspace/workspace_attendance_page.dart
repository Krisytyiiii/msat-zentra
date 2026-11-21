import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/status_palette.dart';
import '../../design/overview_theme.dart';
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
  bool _descending = false;
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
          _date = attendanceDay(
            philippineTime(ref.read(attendanceClockProvider)()),
          );
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
      _descending = false;
      _query = '';
      _search.clear();
      _date = attendanceDay(
        philippineTime(ref.read(attendanceClockProvider)()),
      );
      _load();
    });
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: ColoredBox(
        color: Colors.white,
        child: Builder(builder: (context) => _content(context)),
      ),
    );
  }

  Widget _content(BuildContext context) {
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
    final now = ref.read(attendanceClockProvider)();
    final sections = {for (final p in access.pairs) p.sectionId: p.sectionName};
    final pairs =
        access.pairs
            .where(
              (p) =>
                  (_sectionId == null || p.sectionId == _sectionId) &&
                  '${p.sectionName} ${p.subjectName}'.toLowerCase().contains(
                    _query,
                  ),
            )
            .toList()
          ..sort((a, b) {
            final order = '${a.subjectName} ${a.sectionName}'
                .toLowerCase()
                .compareTo('${b.subjectName} ${b.sectionName}'.toLowerCase());
            return _descending ? -order : order;
          });
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1200),
        child: RefreshIndicator(
          onRefresh: () => _load(silent: true),
          child: CustomScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Attendance',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Choose a class to review and record learner attendance.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.5,
                          color: Color(0xFF81818F),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          ZStatusPill(
                            text: _term!.schoolYearName,
                            tone: StatusTone.blue,
                          ),
                          ZStatusPill(
                            text: 'Term ${_term!.termNumber}',
                            tone: StatusTone.amber,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9F9FA),
                          border: Border.all(color: const Color(0xFFE8E8ED)),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            for (final entry in [
                              ('${access.pairs.length}', 'Classes'),
                              ('${sections.length}', 'Sections'),
                              (
                                '${access.pairs.fold<int>(0, (total, pair) => total + pair.slots.length)}',
                                'Weekly Meetups',
                              ),
                            ].indexed) ...[
                              if (entry.$1 > 0)
                                const SizedBox(
                                  height: 30,
                                  child: VerticalDivider(width: 16),
                                ),
                              Expanded(
                                child: Column(
                                  children: [
                                    Text(
                                      entry.$2.$1,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        height: 1.6,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF1E293B),
                                      ),
                                    ),
                                    Text(
                                      entry.$2.$2,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        height: 1.6,
                                        color: Color(0xFF71809B),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (sections.length > 1) ...[
                        DropdownButtonFormField<String>(
                          key: ValueKey(
                            'attendance-section-${_sectionId ?? 'all'}',
                          ),
                          initialValue: _sectionId ?? '',
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Section',
                          ),
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
                      ],
                      SizedBox(
                        height: 40,
                        child: TextField(
                          controller: _search,
                          textAlignVertical: TextAlignVertical.center,
                          style: const TextStyle(fontSize: 12),
                          decoration: InputDecoration(
                            prefixIcon: const Icon(Icons.search, size: 20),
                            hintText: 'Search subject or section',
                            isDense: true,
                            filled: true,
                            fillColor: const Color(0xFFF5F7FA),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 8,
                            ),
                            suffixIcon: _search.text.isEmpty
                                ? null
                                : IconButton(
                                    tooltip: 'Clear search',
                                    icon: const Icon(Icons.close, size: 16),
                                    onPressed: () => setState(() {
                                      _search.clear();
                                      _query = '';
                                    }),
                                  ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(999),
                              borderSide: const BorderSide(
                                color: Color(0xFFE6ECF4),
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(999),
                              borderSide: const BorderSide(
                                color: Color(0xFFE6ECF4),
                              ),
                            ),
                          ),
                          onChanged: (v) =>
                              setState(() => _query = v.trim().toLowerCase()),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Showing ${pairs.length} records',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF9999A6),
                              ),
                            ),
                          ),
                          TextButton.icon(
                            onPressed: () =>
                                setState(() => _descending = !_descending),
                            icon: const Icon(LucideIcons.listFilter, size: 14),
                            label: Text(
                              _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                              style: const TextStyle(fontSize: 12),
                            ),
                            style: TextButton.styleFrom(
                              foregroundColor: const Color(0xFF334155),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 0,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (pairs.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 120),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 24,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: const Color(0xFFDFE7F5)),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        children: [
                          const CircleAvatar(
                            backgroundColor: Color(0xFFEAF0FF),
                            child: Icon(
                              LucideIcons.bookOpen,
                              size: 20,
                              color: Color(0xFF4263F0),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _query.isNotEmpty || _sectionId != null
                                ? 'No classes match these filters'
                                : 'No teaching load',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Published classes will appear here. Try adjusting your search or section filter.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: Color(0xFF71809B),
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (_query.isNotEmpty || _sectionId != null)
                            TextButton(
                              onPressed: () => setState(() {
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
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 120),
                  sliver: SliverList.separated(
                    itemCount: pairs.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (_, i) {
                      final pair = pairs[i];
                      final state = _cardState(pair, access, now);
                      final theme = Theme.of(context);
                      final words = pair.subjectName
                          .trim()
                          .split(RegExp(r'\s+'))
                          .where((word) => word.isNotEmpty)
                          .toList();
                      final initials = words.isEmpty
                          ? '?'
                          : '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
                                .toUpperCase();
                      final identity = '${pair.subjectId}|${pair.sectionId}';
                      return Tooltip(
                        message: state.message,
                        child: Material(
                          key: ValueKey('attendance-class-${pair.key}'),
                          elevation: 1,
                          shadowColor: Colors.black.withValues(alpha: 0.06),
                          color: theme.cardTheme.color,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(
                              color: theme.colorScheme.outline.withValues(
                                alpha: 0.72,
                              ),
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: () => _open(pair),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 19,
                                        backgroundColor:
                                            const [
                                              Color(0xFFF1F5F9),
                                              Color(0xFFEFF6FF),
                                              Color(0xFFFFFBEB),
                                              Color(0xFFFAF5FF),
                                              Color(0xFFFFF1F2),
                                            ][identity.codeUnits.fold(
                                                  0,
                                                  (a, b) => a + b,
                                                ) %
                                                5],
                                        foregroundColor: const Color(
                                          0xFF52627C,
                                        ),
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
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              pair.subjectName,
                                              style: theme.textTheme.titleSmall
                                                  ?.copyWith(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                            ),
                                            const SizedBox(height: 3),
                                            Text(
                                              pair.sectionName,
                                              style: theme.textTheme.bodySmall
                                                  ?.copyWith(
                                                    color: theme
                                                        .colorScheme
                                                        .onSurfaceVariant,
                                                    fontFeatures: const [
                                                      FontFeature.tabularFigures(),
                                                    ],
                                                  ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (pair.gradeLevel != null) ...[
                                        const SizedBox(width: 8),
                                        ZStatusPill(
                                          text: pair.gradeLevel!,
                                          tone: StatusTone.blue,
                                          label: 'Grade level',
                                        ),
                                      ],
                                    ],
                                  ),
                                  const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 10),
                                    child: Divider(height: 1),
                                  ),
                                  _ScheduleFooter(pair: pair, access: access),
                                ],
                              ),
                            ),
                          ),
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
}

/// Compact schedule footer: one line per distinct time, days sharing it combined.
class _ScheduleFooter extends StatefulWidget {
  const _ScheduleFooter({required this.pair, required this.access});
  final AttendancePair pair;
  final AttendanceAccess access;

  @override
  State<_ScheduleFooter> createState() => _ScheduleFooterState();
}

class _ScheduleFooterState extends State<_ScheduleFooter> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final lines = _scheduleLines(widget.pair, widget.access);
    if (lines.isEmpty) {
      return const _ScheduleLineRow('Schedule not published');
    }
    final visible = _expanded ? lines : lines.take(2).toList();
    final hidden = lines.length - visible.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final line in visible) _ScheduleLineRow(line),
        if (lines.length > 2)
          TextButton(
            onPressed: () => setState(() => _expanded = !_expanded),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF4263F0),
              padding: EdgeInsets.zero,
              minimumSize: const Size(48, 28),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
            child: Text(
              _expanded ? 'Show less' : '+$hidden more',
              style: const TextStyle(fontSize: 12),
            ),
          ),
      ],
    );
  }
}

class _ScheduleLineRow extends StatelessWidget {
  const _ScheduleLineRow(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 1),
            child: Icon(
              LucideIcons.clock,
              size: 13,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12, color: Color(0xFF71809B)),
            ),
          ),
        ],
      ),
    );
  }
}

List<String> _scheduleLines(AttendancePair pair, AttendanceAccess access) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final periods = access.config?.periods;
  final grouped = <String, ({int? start, int? end, int period, Set<int> days})>{};
  for (final slot in pair.slots) {
    final known =
        periods != null && slot.period >= 0 && slot.period < periods.length;
    final key = known
        ? '${periods[slot.period].start}|${periods[slot.period].end}'
        : 'p${slot.period}';
    final existing = grouped[key];
    if (existing != null) {
      existing.days.add(slot.day);
    } else {
      grouped[key] = (
        start: known ? periods[slot.period].start : null,
        end: known ? periods[slot.period].end : null,
        period: slot.period,
        days: {slot.day},
      );
    }
  }
  final sorted = grouped.values.toList()
    ..sort((a, b) {
      if (a.start != null && b.start != null && a.start != b.start) {
        return a.start!.compareTo(b.start!);
      }
      if (a.start == null && b.start != null) return 1;
      if (a.start != null && b.start == null) return -1;
      return a.period.compareTo(b.period);
    });
  return sorted.map((group) {
    final slots = group.days.toList()..sort();
    final label = slots
        .map((day) => day >= 1 && day <= 7 ? days[day - 1] : 'Day $day')
        .join(', ');
    final time = group.start != null && group.end != null
        ? _clockRange(group.start!, group.end!)
        : 'Period ${group.period + 1}';
    return '$label · $time';
  }).toList();
}

String _clockRange(int start, int end) {
  final from = _clockTime(start);
  final to = _clockTime(end);
  // Only repeat the meridiem when the range crosses noon/midnight.
  return from.$2 == to.$2
      ? '${from.$1}–${to.$1} ${from.$2}'
      : '${from.$1} ${from.$2}–${to.$1} ${to.$2}';
}

(String, String) _clockTime(int minutes) {
  final hour24 = (minutes ~/ 60) % 24;
  final minute = (minutes % 60).toString().padLeft(2, '0');
  final hour = hour24 % 12 == 0 ? 12 : hour24 % 12;
  return ('$hour:$minute', hour24 < 12 ? 'AM' : 'PM');
}
