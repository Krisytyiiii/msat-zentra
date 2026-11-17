import 'dart:async';
import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import '../adviser/schedule_timing.dart';
import 'attendance_data.dart';

/// Full-screen meetup sheet. Roster identity is never inferred from marks.
class AttendanceSheetPage extends ConsumerStatefulWidget {
  const AttendanceSheetPage({
    super.key,
    required this.pair,
    required this.access,
    this.initialDate,
  });
  final AttendancePair pair;
  final AttendanceAccess access;
  final String? initialDate;
  @override
  ConsumerState<AttendanceSheetPage> createState() => _SheetState();
}

class _SheetState extends ConsumerState<AttendanceSheetPage>
    with WidgetsBindingObserver {
  AttendanceSheet? _sheet;
  late AttendanceAccess _access;
  late String _scope;
  late String _date;
  Object? _loadError;
  String? _saveError, _notice;
  bool _loading = true, _fetching = false, _saving = false;
  bool _stale = false, _allowPop = false, _leaving = false, _reviewing = false;
  int _generation = 0;
  final _draft = <String, String>{};
  final _queued = <String, String>{};
  final _search = TextEditingController();
  String _query = '', _filter = 'all';
  Timer? _timer;
  Future<void> _draftWrites = Future.value();
  AttendanceService get _service =>
      AttendanceService(ref.read(apiClientProvider));
  DateTime get _now => ref.read(attendanceClockProvider)();
  String get _currentScope {
    final term = ref.read(termProvider);
    return '${term?.schoolYearId}:${term?.id}';
  }

  String _draftKey(int slot) =>
      'attendance.draft.${_access.teacherId}.$_scope.'
      '${widget.pair.key}.$_date.$slot';
  String get _storageKey => _draftKey(_sheet?.gate.slot ?? 1);
  String? _baseline(String id) => _queued[id] ?? _sheet?.marks[id];
  Map<String, String> get _delta => {
    for (final learner in _sheet?.learners ?? <AttendanceLearner>[])
      if (!learner.exempt &&
          _draft.containsKey(learner.id) &&
          _draft[learner.id] != _baseline(learner.id))
        learner.id: _draft[learner.id]!,
  };
  String? get _lock {
    if (_stale || _scope != _currentScope) {
      return 'The selected term changed. Return to Attendance.';
    }
    if (_loadError != null || _sheet == null) {
      return 'Refresh the sheet before editing.';
    }
    if (!_sheet!.mine) {
      return 'Submitted by ${_sheet!.owner ?? 'another teacher'} · read-only.';
    }
    if (!_sheet!.canMark) {
      return 'Verify your teacher code or check your assignment to mark this class.';
    }
    final pair = _access.pairs
        .where((p) => p.key == widget.pair.key)
        .firstOrNull;
    if (pair == null) return 'This class is no longer assigned to you.';
    final gate = attendanceGate(
      pair,
      _access.config,
      _date,
      _sheet!.start,
      _sheet!.end,
      _now,
    );
    if (gate.slot != _sheet!.gate.slot) {
      return 'The meetup changed. Refresh to open its sheet.';
    }
    if (gate.locked) return gate.message;
    return null;
  }

  @override
  void initState() {
    super.initState();
    _access = widget.access;
    _scope = _currentScope;
    _date = widget.initialDate ?? attendanceDay(philippineTime(_now));
    WidgetsBinding.instance.addObserver(this);
    _load();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted &&
          !_saving &&
          !_reviewing &&
          !_stale &&
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
        !_saving &&
        !_stale &&
        ModalRoute.of(context)?.isCurrent == true) {
      _load(silent: true);
    }
  }

  Future<void> _persist() async {
    final key = _storageKey;
    final values = Map<String, String>.from(_draft);
    _draftWrites = _draftWrites.catchError((_) {}).then((_) async {
      if (!Hive.isBoxOpen(AppConfig.cacheBox)) {
        throw StateError('Draft storage unavailable');
      }
      await Hive.box(AppConfig.cacheBox).put(key, values);
    });
    await _draftWrites;
  }

  Future<void> _load({bool silent = false}) async {
    if (_fetching || _stale) return;
    _fetching = true;
    final generation = ++_generation;
    final previousKey = _storageKey;
    setState(() {
      _loading = !silent && _sheet == null;
    });
    try {
      final access = await _service.access();
      if (!mounted || generation != _generation || _scope != _currentScope) {
        return;
      }
      final pair = access.pairs
          .where((p) => p.key == widget.pair.key)
          .firstOrNull;
      if (!access.entered ||
          pair == null ||
          access.teacherId != widget.access.teacherId) {
        throw ApiException(
          'ACCESS_CHANGED',
          'Your attendance access changed. Return to Attendance.',
        );
      }
      final sheet = await _service.sheet(access, pair, _date, _now);
      if (!mounted || generation != _generation || _currentScope != _scope) {
        return;
      }
      final selectedTerm = ref.read(termProvider);
      if (sheet.termId != selectedTerm?.id) {
        throw const FormatException('Attendance term mismatch');
      }
      final firstLoad = _sheet == null;
      final switching = previousKey != _draftKey(sheet.gate.slot);
      if (!firstLoad && switching && _draft.isNotEmpty) {
        // Persist against the old slot before publishing the new sheet.
        await _persist();
        if (!mounted || generation != _generation || _scope != _currentScope) {
          return;
        }
      }
      _access = access;
      _sheet = sheet;
      if (firstLoad || switching) {
        _draft.clear();
        if (Hive.isBoxOpen(AppConfig.cacheBox)) {
          final stored = Hive.box(AppConfig.cacheBox).get(_storageKey);
          if (stored is Map) {
            for (final entry in stored.entries) {
              if (entry.key is String &&
                  attendanceLabels.containsKey(entry.value)) {
                _draft[entry.key as String] = entry.value as String;
              }
            }
          }
        }
      }
      _queued.clear();
      if (Hive.isBoxOpen(AppConfig.outboxBox)) {
        for (final op in ref.read(outboxProvider).pending) {
          final body = op['body'];
          if (op['path'] != '/api/attendance/bulk' ||
              body is! Map ||
              body['sectionId'] != widget.pair.sectionId ||
              body['subjectId'] != widget.pair.subjectId ||
              body['termId'] != sheet.termId ||
              body['slot'] != sheet.gate.slot ||
              body['date'] != '${_date}T00:00:00Z') {
            continue;
          }
          for (final row in body['records'] as List) {
            _queued[row['studentId'] as String] = row['status'] as String;
          }
        }
      }
      setState(() {
        _loading = false;
        _loadError = null;
      });
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() {
          _loading = false;
          _loadError = error;
        });
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _fetching = false);
      }
    }
  }

  Future<void> _pick(AttendanceLearner learner, String value) async {
    if (_saving || _fetching || _lock != null || learner.exempt) return;
    setState(() {
      final current = _draft[learner.id] ?? _baseline(learner.id);
      if (current == value) {
        _draft.remove(learner.id);
      } else {
        _draft[learner.id] = value;
      }
      _notice = null;
      _saveError = null;
    });
    try {
      await _persist();
    } catch (error) {
      if (mounted) {
        setState(
          () => _saveError = 'Your draft could not be stored. Keep this sheet open and try saving again.',
        );
      }
    }
  }

  Future<void> _chooseDate() async {
    if (_saving || _fetching || _stale || _sheet == null) return;
    final start = _sheet!.start, end = _sheet!.end;
    if (start == null || end == null || start.compareTo(end) > 0) return;
    final first = DateTime.parse(start), last = DateTime.parse(end);
    var initial = DateTime.parse(_date);
    if (initial.isBefore(first)) initial = first;
    if (initial.isAfter(last)) initial = last;
    bool eligible(DateTime d) =>
        d.weekday <= 5 && widget.pair.slots.any((s) => s.day == d.weekday);
    if (!eligible(initial)) {
      var candidate = first;
      while (!eligible(candidate) && !candidate.isAfter(last)) {
        candidate = candidate.add(const Duration(days: 1));
      }
      if (candidate.isAfter(last)) return;
      initial = candidate;
    }
    _reviewing = true;
    final picked = await showDatePicker(
      context: context,
      firstDate: first,
      lastDate: last,
      initialDate: initial,
      helpText: 'Choose a meetup date',
      selectableDayPredicate: eligible,
      // Historical/future sheets can be viewed, but never bypass the gate.
    );
    _reviewing = false;
    if (picked == null || !mounted || _saving || _stale) return;
    try {
      await _persist();
      if (!mounted) return;
      setState(() {
        _generation++;
        _fetching = false;
        _date = attendanceDay(picked);
        _sheet = null;
        _draft.clear();
        _queued.clear();
        _notice = null;
        _saveError = null;
        _loadError = null;
      });
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _saveError =
              'Your draft could not be stored. Save before changing dates.',
        );
      }
    }
  }

  Future<void> _review() async {
    if (_saving || _fetching || _reviewing || _lock != null || _delta.isEmpty) {
      return;
    }
    _reviewing = true;
    final records = Map<String, String>.from(_delta);
    final key = _storageKey;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Review attendance'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${widget.pair.subjectName} · ${widget.pair.sectionName}'),
              Text('$_date · Meetup ${_sheet!.gate.slot}'),
              const SizedBox(height: 12),
              Text('${records.length} changed learners'),
              for (final entry in attendanceLabels.entries)
                if (records.values.contains(entry.key))
                  Text(
                    '${records.values.where((v) => v == entry.key).length} ${entry.value}',
                  ),
              const SizedBox(height: 8),
              const Text(
                'Unmarked and ADM-exempt learners will not be submitted.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Save attendance'),
          ),
        ],
      ),
    );
    _reviewing = false;
    if (confirmed == true && mounted && key == _storageKey) {
      await _save(records, key);
    }
  }

  Future<void> _save(Map<String, String> records, String key) async {
    if (_saving || _stale || _scope != _currentScope) return;
    setState(() {
      _saving = true;
      _saveError = null;
      _notice = null;
    });
    var saved = 0, queued = 0;
    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (!mounted || _stale || _currentScope != _scope || _lock != null) {
        throw ApiException(
          'SCOPE_CHANGED',
          'Attendance access changed. Refresh the sheet before saving.',
        );
      }
      final offline = connectivity.contains(ConnectivityResult.none);
      // Online saves recheck ownership, roster/exemptions, permissions and
      // the live period. Offline writes remain provisional until server sync.
      if (!offline) await _load(silent: true);
      if (!mounted ||
          _stale ||
          _currentScope != _scope ||
          _lock != null ||
          key != _storageKey) {
        throw ApiException(
          'SCOPE_CHANGED',
          'The sheet changed. Review it again before saving.',
        );
      }
      final eligible = _sheet!.learners
          .where((s) => !s.exempt)
          .map((s) => s.id)
          .toSet();
      final delta = _delta;
      final jobs = records.entries
          .where((r) => eligible.contains(r.key) && delta[r.key] == r.value)
          .toList();
      // Queue behind any pending write for this sheet; older queued values
      // must never overwrite a newer online submission.
      final queue = offline || _queued.isNotEmpty;
      for (var i = 0; i < jobs.length; i += 300) {
        if (!mounted || _stale || _scope != _currentScope) {
          throw StateError('Scope changed');
        }
        final batch = jobs.sublist(i, math.min(i + 300, jobs.length));
        final body = <String, dynamic>{
          'sectionId': widget.pair.sectionId,
          'termId': _sheet!.termId,
          'date': '${_date}T00:00:00Z',
          'subjectId': widget.pair.subjectId,
          'slot': _sheet!.gate.slot,
          if (_sheet!.assignmentId?.isNotEmpty == true)
            'assignmentId': _sheet!.assignmentId,
          'records': [
            for (final r in batch) {'studentId': r.key, 'status': r.value},
          ],
        };
        if (queue) {
          await ref
              .read(outboxProvider)
              .enqueue(
                method: 'POST',
                path: '/api/attendance/bulk',
                body: body,
              );
          queued += batch.length;
          for (final r in batch) {
            _queued[r.key] = r.value;
            _draft.remove(r.key);
          }
        } else {
          final response = await ref
              .read(apiClientProvider)
              .dio
              .post('/api/attendance/bulk', data: body);
          if ((response.data as Map)['count'] != batch.length) {
            throw const FormatException(
              'Incomplete attendance acknowledgement',
            );
          }
          saved += batch.length;
          for (final r in batch) {
            _sheet!.marks[r.key] = r.value;
            _draft.remove(r.key);
          }
        }
        await _persist();
      }
      if (mounted) {
        setState(
          () => _notice = queued > 0
              ? '$queued queued · waiting for server confirmation.'
              : '$saved attendance marks saved.',
        );
      }
    } catch (error) {
      if (mounted) setState(() => _saveError = userMessage(error));
    } finally {
      if (mounted) {
        if (saved > 0) {
          ref.invalidate(overviewProvider);
          ref.invalidate(overviewSecondaryProvider);
        }
        setState(() => _saving = false);
      }
    }
  }

  Future<void> _verify() async {
    if (_saving || _stale || _fetching || _reviewing) return;
    _reviewing = true;
    final value = await showDialog<String>(
      context: context,
      builder: (_) => const _AttendanceCodeDialog(),
    );
    _reviewing = false;
    if (value == null || value.isEmpty || !mounted || _stale) return;
    setState(() => _saving = true);
    try {
      if (_scope != _currentScope) return;
      await ref
          .read(apiClientProvider)
          .dio
          .post(
            '/api/teacher/schedule/teachers/verify-attendance',
            data: {'code': value},
          );
      if (mounted) await _load(silent: true);
    } catch (error) {
      if (mounted) setState(() => _saveError = userMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _leave() async {
    if (_saving || _leaving) return;
    _leaving = true;
    try {
      if (_draft.isNotEmpty) await _persist();
      if (!mounted) return;
      setState(() => _allowPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop();
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _saveError =
              'Draft storage failed. Save your changes before leaving.',
        );
      }
    } finally {
      _leaving = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (_, _) {
      if (_currentScope != _scope) {
        setState(() {
          _stale = true;
          _generation++;
          _fetching = false;
          _loading = false;
        });
      }
    });
    final sheet = _sheet;
    final lock = _lock;
    return PopScope(
      canPop: _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            onPressed: _saving ? null : _leave,
            icon: const Icon(Icons.arrow_back),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.pair.subjectName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                widget.pair.sectionName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Refresh attendance',
              onPressed: _saving || _fetching
                  ? null
                  : () => _load(silent: true),
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: _stale && sheet == null
            ? const ZEmptyPage(
                icon: Icons.lock_outline,
                title: 'Selected term changed',
                subtitle: 'Return to Attendance to open the selected term.',
              )
            : _loading
            ? const LoadingView()
            : sheet == null
            ? ErrorView(
                message: _loadError ?? 'Attendance unavailable.',
                onRetry: _load,
              )
            : Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 760),
                  child: _body(sheet, lock),
                ),
              ),
        bottomNavigationBar: sheet == null
            ? null
            : Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: Wrap(
                      alignment: WrapAlignment.spaceBetween,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        Text(
                          '${_delta.length} changed · ${_queued.length} queued',
                        ),
                        FilledButton(
                          onPressed:
                              _saving ||
                                  _fetching ||
                                  lock != null ||
                                  _delta.isEmpty
                              ? null
                              : _review,
                          child: Text(_saving ? 'Saving…' : 'Review changes'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  Widget _body(AttendanceSheet sheet, String? lock) {
    final dirtyIds = _delta.keys.toSet();
    String? status(AttendanceLearner s) => s.exempt
        ? null
        : _draft[s.id] ??
              _baseline(s.id) ??
              (sheet.gate.pastDue ? 'absent' : null);
    final shown = sheet.learners
        .where(
          (s) =>
              ('${s.name} ${s.lrn}'.toLowerCase().contains(_query)) &&
              (_filter == 'all' ||
                  (_filter == 'unmarked'
                      ? !s.exempt && status(s) == null
                      : status(s) == _filter)),
        )
        .toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed: _saving || _fetching || _stale
                        ? null
                        : _chooseDate,
                    icon: const Icon(Icons.calendar_today_outlined, size: 16),
                    label: Text(
                      DateFormat('EEE, MMM d, yyyy')
                          .format(DateTime.parse(_date)),
                    ),
                  ),
                  ZStatusPill(text: 'Meetup ${sheet.gate.slot}'),
                ],
              ),
              Text(
                lock ?? sheet.gate.message,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (!_access.canMark(widget.pair))
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _saving || _stale ? null : _verify,
                    icon: const Icon(Icons.key_outlined),
                    label: const Text('Verify teacher code'),
                  ),
                ),
              if (_loadError != null)
                Text(
                  userMessage(_loadError!),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              if (_saveError != null)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _saveError!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              if (_notice != null)
                Semantics(liveRegion: true, child: Text(_notice!)),
              const SizedBox(height: 8),
              TextField(
                controller: _search,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search, size: 18),
                  hintText: 'Search learner or LRN',
                ),
                onChanged: (v) =>
                    setState(() => _query = v.trim().toLowerCase()),
              ),
              const SizedBox(height: 6),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final entry in {
                      'all': 'All',
                      'unmarked': 'Unmarked',
                      ...attendanceLabels,
                    }.entries)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: FilterChip(
                          label: Text(entry.value),
                          selected: _filter == entry.key,
                          onSelected: (_) =>
                              setState(() => _filter = entry.key),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: shown.isEmpty
              ? const ZEmptyPage(
                  icon: Icons.fact_check_outlined,
                  title: 'No learners to show',
                  subtitle: 'Try another filter, or refresh this class roster.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  itemCount: shown.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final s = shown[i];
                    final value = status(s);
                    final implied =
                        !s.exempt &&
                        _draft[s.id] == null &&
                        _baseline(s.id) == null &&
                        value == 'absent';
                    final state = s.exempt
                        ? 'ADM exempt'
                        : dirtyIds.contains(s.id)
                        ? 'Unsaved'
                        : _queued.containsKey(s.id)
                        ? 'Queued'
                        : implied
                        ? 'Absent · not recorded'
                        : sheet.marks.containsKey(s.id)
                        ? 'Saved'
                        : 'Unmarked';
                    return ZCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          Text(
                            s.lrn,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 6),
                          ZStatusPill(
                            text: state,
                            tone: state == 'Unsaved' || state == 'Queued'
                                ? StatusTone.amber
                                : StatusTone.neutral,
                          ),
                          if (s.exempt)
                            const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: Text(
                                'Signed ADM · seat-time attendance is not recorded.',
                              ),
                            )
                          else
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  for (final entry in attendanceLabels.entries)
                                    Semantics(
                                      label: '${s.name}, ${entry.value}',
                                      selected: value == entry.key,
                                      child: OutlinedButton(
                                        key: ValueKey(
                                          'attendance-${s.id}-${entry.key}',
                                        ),
                                        style: OutlinedButton.styleFrom(
                                          minimumSize: const Size(64, 48),
                                          backgroundColor: value == entry.key
                                              ? _color(context, entry.key)
                                                    .withValues(alpha: .15)
                                              : null,
                                          side: BorderSide(
                                            color: value == entry.key
                                                ? _color(context, entry.key)
                                                : Theme.of(context)
                                                      .dividerColor,
                                          ),
                                          foregroundColor: value == entry.key
                                              ? _color(context, entry.key)
                                              : null,
                                        ),
                                        onPressed:
                                            _saving || _fetching || lock != null
                                            ? null
                                            : () => _pick(s, entry.key),
                                        child: Text(entry.value),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Color _color(BuildContext context, String value) => statusColors(
    switch (value) {
      'absent' => StatusTone.red,
      'late' => StatusTone.amber,
      'excused' => StatusTone.blue,
      _ => StatusTone.green,
    },
    Theme.of(context),
  ).foreground;
}

class _AttendanceCodeDialog extends StatefulWidget {
  const _AttendanceCodeDialog();
  @override
  State<_AttendanceCodeDialog> createState() => _AttendanceCodeDialogState();
}

class _AttendanceCodeDialogState extends State<_AttendanceCodeDialog> {
  final _code = TextEditingController();
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Verify attendance code'),
    content: TextField(
      controller: _code,
      autofocus: true,
      decoration: const InputDecoration(labelText: 'Teacher code'),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_code.text.trim().isNotEmpty) {
            Navigator.pop(context, _code.text.trim());
          }
        },
        child: const Text('Verify'),
      ),
    ],
  );
}
