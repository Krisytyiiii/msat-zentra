import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/adviser_navigation.dart';
import '../../design/status_palette.dart';
import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/save_tasks.dart';
import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import '../adviser/schedule_timing.dart';
import 'attendance_data.dart';
import 'attendance_qr_logic.dart';
import 'attendance_saves.dart';
import 'attendance_scanner_page.dart';
import 'attendance_mark_card.dart';

/// Full-screen meetup sheet. Roster identity is never inferred from marks.
class AttendanceSheetPage extends ConsumerStatefulWidget {
  const AttendanceSheetPage({
    super.key,
    required this.pair,
    required this.access,
    this.initialDate,
    this.openQr = false,
    this.historyEdit = false,
  });
  final AttendancePair pair;
  final AttendanceAccess access;
  final String? initialDate;
  final bool openQr;
  final bool historyEdit;
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
  String? _notice;
  bool _loading = true, _fetching = false, _saving = false;
  bool _stale = false, _allowPop = false, _leaving = false, _reviewing = false;
  int _generation = 0;
  final _draft = <String, String>{};
  final _queued = <String, String>{};
  final _search = TextEditingController();
  String _query = '', _filter = 'all';
  String _saveFilter = 'all';
  bool _descending = false;
  Timer? _timer;
  Future<void> _draftWrites = Future.value();
  bool _openedInitialQr = false;
  bool _finishedInitialQr = false;
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

  /// The draft cache box is not opened at startup, so open it on demand.
  Future<Box> _cacheBox() async => Hive.isBoxOpen(AppConfig.cacheBox)
      ? Hive.box(AppConfig.cacheBox)
      : Hive.openBox(AppConfig.cacheBox);

  Future<void> _persist() async {
    final key = _storageKey;
    final values = Map<String, String>.from(_draft);
    _draftWrites = _draftWrites.catchError((_) {}).then((_) async {
      final cache = await _cacheBox();
      await cache.put(key, values);
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
      // A restored draft that matches the server marks is not a change; drop it
      // so leaving never re-writes (or blocks on) an unchanged draft.
      _draft.removeWhere((id, value) => value == _baseline(id));
      if (widget.openQr && !_openedInitialQr) {
        _openedInitialQr = true;
        WidgetsBinding.instance.addPostFrameCallback((_) async {
          if (!mounted) return;
          try {
            await _openScanner();
          } finally {
            if (mounted) setState(() => _finishedInitialQr = true);
          }
        });
      }
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

  Future<void> _openScanner() async {
    if (_saving || _fetching || _reviewing || _sheet == null) return;
    final lock = _lock;
    final now = philippineTime(_now);
    final config = _access.config;
    final slot = _sheet!.gate.slot;
    // A date-picker jump into the past is a correction too, even when the
    // sheet was originally opened from the new-attendance action.
    final historyEdit = widget.historyEdit || _date != attendanceDay(now);
    if (lock != null ||
        (!historyEdit &&
            (config == null || slot < 1 || slot > config.periods.length))) {
      _alert(
        lock ?? 'QR attendance is available only for today’s published class period.',
      );
      return;
    }
    final period = config != null && slot >= 1 && slot <= config.periods.length
        ? config.periods[slot - 1]
        : null;
    final day = DateTime.utc(now.year, now.month, now.day);
    final start = period == null
        ? null
        : day.add(Duration(minutes: period.start));
    final end = period == null ? null : day.add(Duration(minutes: period.end));
    final live =
        _date == attendanceDay(now) &&
        start != null &&
        end != null &&
        !now.isBefore(start) &&
        now.isBefore(end);
    final key = _storageKey;
    final term = ref.read(termProvider);
    String? clockLabel(int? minutes) => minutes == null
        ? null
        : DateFormat.jm().format(
            DateTime(2000, 1, 1).add(Duration(minutes: minutes)),
          );
    final ruleKey =
        'attendance.late-minutes.${_access.teacherId}.$_scope.${widget.pair.key}';
    final cache = await _cacheBox();
    if (!mounted ||
        _scope != _currentScope ||
        key != _storageKey ||
        _lock != null) {
      return;
    }
    final storedMinutes = cache.get(ruleKey);
    var lateMinutes =
        storedMinutes is int && storedMinutes >= 0 && storedMinutes <= 240
        ? storedMinutes
        : 20;
    var finishedAbsences = false;
    var announcedOngoing = false;
    _reviewing = true;
    bool? saveRequested;
    try {
      saveRequested = await Navigator.of(context, rootNavigator: true).push<bool>(
        MaterialPageRoute<bool>(
          builder: (_) => AttendanceScannerPage(
            title: widget.pair.subjectName,
            historyEdit: historyEdit,
            allowAutomatic: !historyEdit || live,
            onLateAfterChanged: (minutes) async {
              if (!mounted ||
                  _stale ||
                  _scope != _currentScope ||
                  key != _storageKey) {
                throw ApiException(
                  'SCOPE_CHANGED',
                  'Return and refresh attendance.',
                );
              }
              await cache.put(ruleKey, minutes);
              lateMinutes = minutes;
            },
            snapshot: () => AttendanceScanSnapshot(
              learners: [
                for (final learner in _sheet!.learners)
                  if (!learner.exempt)
                    AttendanceScanEntry(
                      id: learner.id,
                      name: learner.name,
                      lrn: learner.lrn,
                    ),
              ],
              marks: {
                for (final learner in _sheet!.learners)
                  if (!learner.exempt &&
                      (_draft[learner.id] ?? _baseline(learner.id)) != null)
                    learner.id: (_draft[learner.id] ?? _baseline(learner.id))!,
              },
              schoolYear: term?.schoolYearName,
              term: term == null ? null : 'Term ${term.termNumber}',
              grade: widget.pair.gradeLevel,
              section: widget.pair.sectionName,
              date: DateFormat('MMM d, yyyy').format(DateTime.parse(_date)),
              start: clockLabel(period?.start),
              late: clockLabel(
                period == null ? null : period.start + lateMinutes,
              ),
              lateAfterMinutes: lateMinutes,
              absent: clockLabel(period?.end),
            ),
            onScan: (raw, automatic, manual) async {
              if (!mounted ||
                  _stale ||
                  _scope != _currentScope ||
                  key != _storageKey ||
                  _lock != null) {
                throw ApiException(
                  'SCOPE_CHANGED',
                  'The sheet changed. Return and refresh attendance.',
                );
              }
              final learner = matchAttendanceQr(raw, _sheet!.learners);
              if (!historyEdit &&
                  (_draft.containsKey(learner.id) ||
                      _baseline(learner.id) != null)) {
                return '${learner.name} already has a mark. Use Manual to change it.';
              }
              if (automatic && historyEdit && !live) {
                throw ApiException(
                  'QR_OUTSIDE_PERIOD',
                  'Choose P, A, L or E for this recorded date.',
                );
              }
              final status = historyEdit && !automatic
                  ? manual
                  : qrAttendanceStatus(
                      philippineTime(_now),
                      start!,
                      end!,
                      automatic: automatic,
                      manual: manual,
                      lateAfterMinutes: lateMinutes,
                    );
              if (!attendanceLabels.containsKey(status)) {
                throw ApiException(
                  'INVALID_STATUS',
                  'Choose a valid attendance status.',
                );
              }
              setState(() {
                if (historyEdit && status == _baseline(learner.id)) {
                  _draft.remove(learner.id);
                } else {
                  _draft[learner.id] = status;
                }
              });
              await _persist();
              return '${learner.name} · ${attendanceLabels[status]} (draft)';
            },
            onAutomaticTick: () async {
              if (!mounted ||
                  historyEdit ||
                  finishedAbsences ||
                  _stale ||
                  _scope != _currentScope ||
                  key != _storageKey) {
                return null;
              }
              final clock = philippineTime(_now);
              if (attendanceDay(clock) != _date) {
                throw ApiException(
                  'SCOPE_CHANGED',
                  'The class date changed. Return to review your drafts.',
                );
              }
              if (end == null) return null;
              if (clock.isBefore(end)) {
                if (start != null &&
                    !clock.isBefore(start) &&
                    !announcedOngoing) {
                  announcedOngoing = true;
                  return 'Class is ongoing. Scan student QR codes to mark attendance.';
                }
                return null;
              }
              if (_lock != null) {
                throw ApiException(
                  'SCOPE_CHANGED',
                  'The period or attendance access changed. Return to review your drafts.',
                );
              }
              final unmarked = qrAbsentDrafts(
                now: clock,
                end: end,
                learners: _sheet!.learners,
                existing: {..._sheet!.marks, ..._queued, ..._draft},
              );
              setState(() {
                _draft.addAll(unmarked);
              });
              await _persist();
              finishedAbsences = true;
              return 'Class ended. Tap Save to submit attendance.';
            },
          ),
        ),
      );
    } finally {
      _reviewing = false;
      if (mounted) setState(() {});
    }
    if (saveRequested == true && mounted) {
      if (_fetching ||
          _stale ||
          _scope != _currentScope ||
          key != _storageKey ||
          _lock != null) {
        _alert('Attendance access changed. Refresh before saving.');
        return;
      }
      final records = Map<String, String>.from(_delta);
      final submitted = records.isEmpty || await _save(records, key);
      if (submitted && mounted) {
        setState(() => _allowPop = true);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.of(context).pop();
        });
      }
    }
  }

  Future<void> _pick(AttendanceLearner learner, String value) async {
    if (_saving || _fetching || _reviewing || _lock != null || learner.exempt) {
      return;
    }
    setState(() {
      final current = _draft[learner.id] ?? _baseline(learner.id);
      if (current == value) {
        _draft.remove(learner.id);
      } else {
        _draft[learner.id] = value;
      }
      _notice = null;
    });
    try {
      await _persist();
    } catch (error) {
      _alert(
        'Your draft could not be stored. Keep this sheet open and try saving again.',
      );
    }
  }

  void _alert(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
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
      builder: (dialog) => _ReviewAttendanceDialog(
        subject: widget.pair.subjectName,
        section: widget.pair.sectionName,
        gradeLevel: widget.pair.gradeLevel,
        date: _date,
        records: records,
      ),
    );
    _reviewing = false;
    if (confirmed == true && mounted && key == _storageKey) {
      await _save(records, key);
    }
  }

  Future<bool> _save(Map<String, String> records, String key) async {
    if (_saving || _stale || _scope != _currentScope) return false;
    final sheet = _sheet;
    if (sheet == null) return false;
    // Online saves recheck ownership, roster/exemptions, permissions and the
    // live period on the server; the sheet only hands over live, eligible rows.
    final eligible = sheet.learners
        .where((s) => !s.exempt)
        .map((s) => s.id)
        .toSet();
    final delta = _delta;
    final jobs = <String, String>{
      for (final row in records.entries)
        if (eligible.contains(row.key) && delta[row.key] == row.value)
          row.key: row.value,
    };
    if (jobs.isEmpty) {
      _alert('Nothing left to save. The sheet already has these marks.');
      return false;
    }
    final tasks = ref.read(saveTasksProvider);
    final term = ref.read(termProvider);
    final expected = '${term?.schoolYearId}:${term?.id}';
    final request = AttendanceSaveRequest(
      pair: widget.pair,
      sheet: sheet,
      date: _date,
      draftKey: key,
      records: Map<String, String>.from(jobs),
      // Queue behind any pending write for this sheet; older queued values
      // must never overwrite a newer online submission.
      queueBehindExisting: _queued.isNotEmpty,
    );
    final api = ref.read(apiClientProvider);
    final outbox = ref.read(outboxProvider);
    final day = DateTime.tryParse(_date);
    setState(() {
      _saving = true;
      _notice = null;
    });
    // The write now runs in the app-wide queue: this screen is free, the pill
    // above the navigation reports progress, and the request survives leaving
    // the sheet.
    late final SaveTask task;
    task = tasks.submit(
      title: 'Attendance · ${widget.pair.subjectName}',
      route: '/workspace/attendance',
      recovery: {'scope': expected},
      onSettled: (task) => _afterSave(task, jobs, sheet),
      subtitle: day == null
          ? '${widget.pair.sectionName} · $_date'
          : '${widget.pair.sectionName} · ${DateFormat('MMM d, yyyy').format(day)}',
      action: () => runAttendanceSave(
        api: api,
        outbox: outbox,
        request: request,
        termIsCurrent: () => tasks.termIsCurrent(expected),
        onQueued: (id, count) => tasks.trackQueued(task, id, count),
        onProgress: () {
          task.saved = request.saved;
          task.queued = request.queued;
          tasks.checkpoint(task);
        },
      ),
    );
    return true;
  }

  void _afterSave(
    SaveTask task,
    Map<String, String> jobs,
    AttendanceSheet sheet,
  ) {
    if (!mounted || _scope != _currentScope || _sheet != sheet) return;
    if (task.status == SaveTaskStatus.failed) {
      setState(() => _saving = false);
      _alert(task.error ?? 'Attendance could not be saved. Please try again.');
      return;
    }
    setState(() {
      _saving = false;
      for (final row in jobs.entries) {
        if (task.queued > 0) {
          _queued[row.key] = row.value;
        } else {
          sheet.marks[row.key] = row.value;
        }
        _draft.remove(row.key);
      }
      _notice = task.queued > 0
          ? '${task.queued} queued · waiting for server confirmation.'
          : '${task.saved} attendance marks saved.';
    });
    if (task.saved > 0) {
      ref.invalidate(overviewProvider);
      ref.invalidate(overviewSecondaryProvider);
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
      _alert(userMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _leave() async {
    // A background save no longer holds the screen hostage: the draft is
    // already owned by the running task, so leaving only needs to store edits
    // that were never submitted.
    if (_leaving) return;
    _leaving = true;
    try {
      if (!_saving && _delta.isNotEmpty) await _persist();
      if (!mounted) return;
      setState(() => _allowPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop();
      });
    } catch (_) {
      _alert('Draft storage failed. Save your changes before leaving.');
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
    final preparingQr = widget.openQr && !_finishedInitialQr;
    return PopScope(
      canPop: _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        appBar: AppBar(
          shape: const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
          centerTitle: true,
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          leading: ZBackButton(
            tooltip: 'Back',
            onPressed: _leave,
            icon: const Icon(Icons.chevron_left),
          ),
          title: Text(preparingQr ? 'Scan Attendance' : 'Edit Record'),
        ),
        body: AdviserBamaAccess(
          busy: _saving,
          child: _stale && sheet == null
              ? const ZEmptyPage(
                  icon: Icons.lock_outline,
                  title: 'Selected term changed',
                  subtitle: 'Return to Attendance to open the selected term.',
                )
              : _loading || (preparingQr && sheet != null)
              ? const LoadingView(layout: SkeletonLayout.marking)
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
        ),
        bottomNavigationBar: sheet == null || preparingQr
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
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed:
                            _saving ||
                                _fetching ||
                                lock != null ||
                                _delta.isEmpty
                            ? null
                            : _review,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          minimumSize: const Size(0, 48),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(
                          _saving ? 'Saving…' : 'Save attendance',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  Widget _body(AttendanceSheet sheet, String? lock) {
    final term = ref.watch(termProvider);
    final selectedDate = DateTime.parse(_date);
    final theme = Theme.of(context);
    final searchBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(999),
      borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
    );
    final searchField = SizedBox(
      height: 40,
      child: TextField(
        controller: _search,
        textAlignVertical: TextAlignVertical.center,
        textInputAction: TextInputAction.search,
        style: theme.textTheme.bodyMedium,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search, size: 20),
          hintText: 'Search learner or LRN',
          isDense: true,
          filled: true,
          fillColor: theme.colorScheme.surfaceContainerLow,
          constraints: const BoxConstraints(minHeight: 40),
          contentPadding: const EdgeInsets.symmetric(
            vertical: 8,
            horizontal: 16,
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
          suffixIconConstraints: const BoxConstraints(
            minWidth: 36,
            minHeight: 36,
          ),
          border: searchBorder,
          enabledBorder: searchBorder,
          focusedBorder: searchBorder.copyWith(
            borderSide: BorderSide(color: theme.colorScheme.primary),
          ),
        ),
        onChanged: (value) =>
            setState(() => _query = value.trim().toLowerCase()),
      ),
    );
    final dateChip = Container(
      key: const ValueKey('attendance-date-chip'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            LucideIcons.calendarDays,
            size: 14,
            color: Color(0xFF6B7280),
          ),
          const SizedBox(width: 4),
          Text(
            DateFormat('MMM d, yyyy').format(selectedDate),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF6B7280),
            ),
          ),
        ],
      ),
    );
    final dirtyIds = _delta.keys.toSet();
    String? status(AttendanceLearner s) => s.exempt
        ? null
        : _draft[s.id] ??
              _baseline(s.id) ??
              (sheet.gate.pastDue ? 'absent' : null);
    bool saved(AttendanceLearner learner) =>
        !learner.exempt &&
        !dirtyIds.contains(learner.id) &&
        !_queued.containsKey(learner.id) &&
        sheet.marks.containsKey(learner.id);
    final shown =
        sheet.learners
            .where(
              (learner) =>
                  ('${learner.name} ${learner.lrn}'.toLowerCase().contains(
                    _query,
                  )) &&
                  (_filter == 'all' || status(learner) == _filter) &&
                  (_saveFilter == 'all' ||
                      (!learner.exempt &&
                          (_saveFilter == 'saved'
                              ? saved(learner)
                              : !saved(learner)))),
            )
            .toList()
          ..sort((a, b) {
            final order = a.name.toLowerCase().compareTo(b.name.toLowerCase());
            return _descending ? -order : order;
          });
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: constraints.maxHeight * 0.65,
            ),
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ZContentHeader(
                      title: widget.pair.subjectName,
                      icon: Icons.edit_note_outlined,
                      titleTrailing: dateChip,
                      titleMetadata: const [
                        Text(
                          'View the learners in this class.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.3,
                            color: Color(0xFF626B82),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (term != null && term.id == sheet.termId) ...[
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
                              widget.pair.gradeLevel!.replaceFirst(
                                RegExp(r'^Grade\s*', caseSensitive: false),
                                'G',
                              ),
                            widget.pair.sectionName,
                          ].where((value) => value.isNotEmpty).join(' · '),
                          kind: ScopePillKind.grade,
                          label: 'Grade and section',
                          compact: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    searchField,
                    const SizedBox(height: 6),
                    if (lock != null)
                      Text(lock, style: Theme.of(context).textTheme.bodySmall),
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
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    if (_notice != null)
                      Semantics(liveRegion: true, child: Text(_notice!)),
                    Row(
                      children: [
                        Flexible(
                          child: _recordFilter(
                            tooltip: 'Category',
                            value: _filter,
                            options: const {
                              'all': 'All Category',
                              'present': 'Present (P)',
                              'late': 'Late (L)',
                              'absent': 'Absent (A)',
                              'excused': 'Excused (E)',
                            },
                            primary: true,
                            onChanged: (value) =>
                                setState(() => _filter = value),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: _recordFilter(
                            tooltip: 'Save status',
                            value: _saveFilter,
                            options: const {
                              'all': 'All',
                              'saved': 'Saved',
                              'unsaved': 'Unsaved',
                            },
                            prefix: 'Save: ',
                            onChanged: (value) =>
                                setState(() => _saveFilter = value),
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Showing ${shown.length} records',
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
          ),
          Expanded(
            child: shown.isEmpty
                ? const ZEmptyPage(
                    icon: Icons.fact_check_outlined,
                    title: 'No learners to show',
                    subtitle:
                        'Try another filter, or refresh this class roster.',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    itemCount: shown.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
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
                      return AttendanceMarkCard(
                        learner: s,
                        index: i,
                        value: value,
                        recordState: state,
                        enabled:
                            !_saving &&
                            !_fetching &&
                            !_reviewing &&
                            lock == null &&
                            !s.exempt,
                        onSelect: (status) => _pick(s, status),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _recordFilter({
    required String tooltip,
    required String value,
    required Map<String, String> options,
    required ValueChanged<String> onChanged,
    bool primary = false,
    String prefix = '',
  }) {
    final blue = statusColors(StatusTone.blue, Theme.of(context));
    final active = primary || value != 'all';
    return PopupMenuButton<String>(
      tooltip: tooltip,
      initialValue: value,
      onSelected: onChanged,
      itemBuilder: (_) => [
        for (final option in options.entries)
          PopupMenuItem(value: option.key, child: Text(option.value)),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Center(
          widthFactor: 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: active ? blue.background : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active
                    ? blue.foreground.withValues(alpha: 0.25)
                    : const Color(0xFFE5E5EA),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    '$prefix${options[value]}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: active ? blue.foreground : const Color(0xFF7185A4),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: active ? blue.foreground : const Color(0xFF7185A4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReviewAttendanceDialog extends StatelessWidget {
  const _ReviewAttendanceDialog({
    required this.subject,
    required this.section,
    required this.gradeLevel,
    required this.date,
    required this.records,
  });

  final String subject;
  final String section;
  final String? gradeLevel;
  final String date;
  final Map<String, String> records;

  @override
  Widget build(BuildContext context) {
    final counts = {
      for (final entry in attendanceLabels.entries)
        entry.key: records.values.where((value) => value == entry.key).length,
    }..removeWhere((_, count) => count == 0);
    return Dialog(
      backgroundColor: Colors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Review attendance',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF101828),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 32,
                    height: 32,
                    child: Material(
                      color: const Color(0xFFF2F4F7),
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => Navigator.pop(context, false),
                        child: const Icon(
                          Icons.close,
                          size: 16,
                          color: Color(0xFF475467),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ZStatusPill(text: subject, tone: StatusTone.blue),
                        if (gradeLevel != null)
                          ZStatusPill(
                            text: gradeLevel!,
                            tone: StatusTone.amber,
                          ),
                        ZStatusPill(text: section, tone: StatusTone.violet),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      date,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF667085),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFEAECF0)),
                ),
                child: Column(
                  children: [
                    _panelRow(
                      'Changed learners',
                      Text(
                        '${records.length} changed learners',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF101828),
                        ),
                      ),
                    ),
                    const Divider(height: 1, color: Color(0xFFEAECF0)),
                    _panelRow(
                      'Status breakdown',
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final entry in counts.entries)
                            _statusPill(context, entry.key, entry.value),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFEAECF0)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.info_outline,
                      size: 16,
                      color: Color(0xFF98A2B3),
                    ),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Unmarked and ADM-exempt learners will not be submitted.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: Color(0xFF475467),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 48,
                      child: FilledButton(
                        onPressed: () => Navigator.pop(context, false),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFF2F4F7),
                          foregroundColor: const Color(0xFF101828),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'Keep editing',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 48,
                      child: FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'Save',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _panelRow(String label, Widget value) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Flexible(
          flex: 2,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF344054),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          flex: 3,
          child: Align(alignment: Alignment.centerRight, child: value),
        ),
      ],
    ),
  );

  Widget _statusPill(BuildContext context, String status, int count) {
    final colors = statusColors(switch (status) {
      'absent' => StatusTone.red,
      'late' => StatusTone.amber,
      'excused' => StatusTone.blue,
      _ => StatusTone.green,
    }, Theme.of(context));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.foreground.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: colors.foreground.withValues(alpha: 0.7),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              '$count ${attendanceLabels[status] ?? status}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
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
