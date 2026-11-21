import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../../design/adviser_navigation.dart';
import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../design/status_palette.dart';
import '../../design/overview_theme.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'gradebook_data.dart';

/// Dedicated assessment encoding, outside the staff shell. Only dirty rows
/// are submitted, using the same bulk endpoint and per-row results as web.
class AssessmentScorePage extends ConsumerStatefulWidget {
  const AssessmentScorePage({
    super.key,
    required this.classId,
    required this.assessmentId,
  });
  final String classId;
  final String assessmentId;
  @override
  ConsumerState<AssessmentScorePage> createState() => _ScoreState();
}

class _ScoreState extends ConsumerState<AssessmentScorePage> {
  ClassRecord? _record;
  RecordAssessment? _assessment;
  final _controllers = <String, TextEditingController>{};
  final _search = TextEditingController();
  final _saved = <String, double>{};
  final _queued = <String, double>{};
  final _rowErrors = <String, String>{};
  String _query = '';
  String _filter = 'all';
  String? _error;
  String? _notice;
  bool _busy = true;
  bool _saving = false;
  bool _stale = false;
  bool _allowPop = false;
  bool _confirmingLeave = false;
  int _generation = 0;
  late String _scope;
  GradebookService get _service =>
      GradebookService(ref.read(apiClientProvider));
  String get _currentScope {
    final term = ref.read(termProvider);
    return '${term?.schoolYearId}:${term?.id}';
  }

  List<RecordLearner> get _learners =>
      _record?.learners
          .where((s) => s.isAdm == (_assessment?.audience == 'adm'))
          .toList() ??
      [];

  @override
  void initState() {
    super.initState();
    _scope = _currentScope;
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final record = await _service.load(widget.classId);
      if (!mounted || generation != _generation) return;
      final assessment = record.assessments
          .where((a) => a.id == widget.assessmentId)
          .firstOrNull;
      if (assessment == null) {
        throw ApiException(
          'ASSESSMENT_UNAVAILABLE',
          'This assessment is no longer available in this class and term.',
        );
      }
      _record = record;
      _assessment = assessment;
      _saved
        ..clear()
        ..addAll(assessment.scores);
      _queued.clear();
      _rowErrors.clear();
      if (Hive.isBoxOpen(AppConfig.outboxBox)) {
        final path =
            '/api/grades/assessments/${Uri.encodeComponent(assessment.id)}/score';
        for (final operation in ref.read(outboxProvider).pending) {
          final body = operation['body'];
          if (operation['path'] == path &&
              body is Map &&
              body['studentId'] is String &&
              body['rawScore'] is num) {
            _queued[body['studentId'] as String] = (body['rawScore'] as num)
                .toDouble();
          }
        }
      }
      for (final learner in _learners) {
        final value = _queued[learner.id] ?? _saved[learner.id];
        (_controllers[learner.id] ??= TextEditingController()).text =
            value == null ? '' : gradeNumber(value);
      }
      setState(() {
        _busy = false;
        _notice = null;
      });
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() {
          _busy = false;
          _error = userMessage(error);
        });
      }
    }
  }

  bool _changed(RecordLearner learner) {
    if (learner.locked) return false;
    final raw = _controllers[learner.id]?.text.trim() ?? '';
    final baseline = _queued[learner.id] ?? _saved[learner.id];
    if (raw.isEmpty && baseline == null) return false;
    final number = double.tryParse(raw);
    return number == null || !number.isFinite || number != baseline;
  }

  List<RecordLearner> get _dirty => _learners.where(_changed).toList();

  void _checkScope() {
    if (!mounted || _stale || _currentScope != _scope) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The selected term changed. Return to the Class Record before saving.',
      );
    }
  }

  Future<void> _save() async {
    if (_saving || _stale || _dirty.isEmpty) return;
    final dirty = _dirty;
    final jobs = <Map<String, dynamic>>[];
    _rowErrors.clear();
    for (final learner in dirty) {
      final number = double.tryParse(_controllers[learner.id]!.text.trim());
      if (number == null ||
          !number.isFinite ||
          number < 0 ||
          number > _assessment!.maxScore) {
        _rowErrors[learner.id] =
            'Enter a score from 0 to ${gradeNumber(_assessment!.maxScore)}.';
      } else {
        jobs.add({'studentId': learner.id, 'rawScore': number});
      }
    }
    if (_rowErrors.isNotEmpty) {
      _search.clear();
      setState(() {
        _filter = 'all';
        _query = '';
        _error = 'Check the highlighted scores before saving.';
      });
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    var savedCount = 0;
    var queuedCount = 0;
    try {
      final connectivity = await Connectivity().checkConnectivity();
      _checkScope();
      final online = <Map<String, dynamic>>[];
      for (final job in jobs) {
        final id = job['studentId'] as String;
        // Existing per-cell queued operations retain FIFO ordering; the outbox
        // cannot safely interpret partial-success bulk responses.
        if (connectivity.contains(ConnectivityResult.none) ||
            _queued.containsKey(id)) {
          _checkScope();
          await ref
              .read(outboxProvider)
              .enqueue(
                method: 'POST',
                path:
                    '/api/grades/assessments/${Uri.encodeComponent(widget.assessmentId)}/score',
                body: job,
              );
          _queued[id] = job['rawScore'] as double;
          queuedCount++;
        } else {
          online.add(job);
        }
      }
      // The web bulk contract accepts at most 300 learners per request.
      for (var start = 0; start < online.length; start += 300) {
        _checkScope();
        final batch = online.sublist(
          start,
          math.min(start + 300, online.length),
        );
        try {
          final response = await _service.scores(widget.assessmentId, batch);
          final results = response['results'];
          if (results is! List) {
            throw const FormatException('Missing score acknowledgements');
          }
          final byId = <String, Map>{
            for (final row in results)
              if (row is Map && row['studentId'] is String)
                row['studentId'] as String: row,
          };
          for (final job in batch) {
            final id = job['studentId'] as String;
            if (byId[id]?['ok'] == true) {
              _saved[id] = job['rawScore'] as double;
              _assessment!.scores[id] = job['rawScore'] as double;
              _rowErrors.remove(id);
              savedCount++;
            } else {
              _rowErrors[id] =
                  'This score could not be saved. Check it and retry.';
            }
          }
        } catch (error) {
          for (final job in batch) {
            _rowErrors[job['studentId'] as String] = userMessage(error);
          }
          rethrow;
        }
      }
      if (mounted) {
        _error = _rowErrors.isEmpty
            ? null
            : 'Some scores were not saved. Your edits are kept for retry.';
      }
    } catch (error) {
      if (mounted) _error = userMessage(error);
    } finally {
      if (mounted && savedCount > 0) {
        ref.invalidate(overviewProvider);
        ref.invalidate(overviewSecondaryProvider);
      }
      if (mounted) {
        setState(() {
          _saving = false;
          _notice = [
            if (savedCount > 0) '$savedCount saved',
            if (queuedCount > 0) '$queuedCount queued offline',
          ].join(' · ');
        });
      }
    }
    if (mounted &&
        !_stale &&
        _currentScope == _scope &&
        savedCount == jobs.length &&
        queuedCount == 0 &&
        _rowErrors.isEmpty &&
        _error == null) {
      setState(() => _allowPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final router = GoRouter.maybeOf(context);
        if (router != null && router.canPop()) {
          router.pop(true);
        } else if (router != null) {
          router.go(
            '/workspace/classes/${Uri.encodeComponent(widget.classId)}',
          );
        } else {
          Navigator.of(context).pop(true);
        }
      });
    }
  }

  Future<bool> _discard() async {
    if (_dirty.isEmpty) return true;
    return await showDialog<bool>(
          context: context,
          builder: (dialog) => AlertDialog(
            title: const Text('Discard unsaved scores?'),
            content: const Text(
              'Your unsaved edits will be lost. Saved and queued scores are kept.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialog, false),
                child: const Text('Keep editing'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialog, true),
                child: const Text('Discard changes'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _leave() async {
    if (_saving || _confirmingLeave) return;
    _confirmingLeave = true;
    try {
      if (!await _discard() || !mounted) return;
      setState(() => _allowPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final router = GoRouter.maybeOf(context);
        if (router != null && router.canPop()) {
          router.pop();
        } else if (router != null) {
          router.go(
            '/workspace/classes/${Uri.encodeComponent(widget.classId)}',
          );
        } else {
          Navigator.of(context).maybePop();
        }
      });
    } finally {
      _confirmingLeave = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (_, _) {
      if (_currentScope != _scope) setState(() => _stale = true);
    });
    final assessment = _assessment;
    final canPop =
        GoRouter.maybeOf(context)?.canPop() ??
        (ModalRoute.of(context)?.canPop ?? false);
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: PopScope(
        canPop: !_saving && (_dirty.isEmpty || _allowPop),
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _leave();
        },
        child: Scaffold(
          backgroundColor: Colors.white,
          appBar: AppBar(
            backgroundColor: Colors.white,
            surfaceTintColor: Colors.transparent,
            scrolledUnderElevation: 0,
            centerTitle: true,
            leadingWidth: 48,
            leading: IconButton(
              tooltip: canPop ? 'Back' : 'Close',
              onPressed: _saving ? null : _leave,
              icon: const Icon(Icons.chevron_left),
            ),
            title: const Text('Assessment scores'),
          ),
          body: AdviserBamaAccess(
            busy: _saving,
            child: _busy
                ? const LoadingView()
                : assessment == null
                ? ErrorView(
                    message: _error ?? 'This assessment is unavailable.',
                    onRetry: _load,
                  )
                : _body(assessment),
          ),
          bottomNavigationBar: _busy || assessment == null
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
                            '${_dirty.length} changed',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          FilledButton(
                            onPressed: _saving || _stale || _dirty.isEmpty
                                ? null
                                : _save,
                            child: Text(_saving ? 'Saving…' : 'Save scores'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  Widget _body(RecordAssessment assessment) {
    final shown = _learners.where((learner) {
      if (_filter == 'missing' && _saved.containsKey(learner.id)) return false;
      if (_filter == 'scored' && !_saved.containsKey(learner.id)) return false;
      return _query.isEmpty ||
          learner.displayName.toLowerCase().contains(_query) ||
          learner.name.toLowerCase().contains(_query) ||
          learner.lrn.contains(_query);
    }).toList();
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    assessment.title,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${_record!.assignment['subjectName'] ?? ''} · ${_record!.assignment['sectionName'] ?? ''}',
                    style: const TextStyle(
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
                      if (_record!.assignment['schoolYear'] != null)
                        ZStatusPill(
                          text: _record!.assignment['schoolYear'].toString(),
                          tone: StatusTone.blue,
                        ),
                      if (_record!.assignment['termNumber'] != null)
                        ZStatusPill(
                          text: 'Term ${_record!.assignment['termNumber']}',
                          tone: StatusTone.amber,
                        ),
                      ZStatusPill(
                        text:
                            assessmentTypes[assessment.type] ?? assessment.type,
                      ),
                      ZStatusPill(
                        text: assessment.audience == 'adm' ? 'ADM' : 'Regular',
                      ),
                      ZStatusPill(
                        text: 'Max ${gradeNumber(assessment.maxScore)}',
                        tone: StatusTone.amber,
                      ),
                      if (assessment.dateGiven.isNotEmpty)
                        ZStatusPill(text: assessment.dateGiven),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 40,
                    child: TextField(
                      controller: _search,
                      textAlignVertical: TextAlignVertical.center,
                      style: const TextStyle(fontSize: 12),
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search, size: 20),
                        hintText: 'Search learner or LRN',
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
                        filled: true,
                        fillColor: const Color(0xFFF5F7FA),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
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
                      onChanged: (text) =>
                          setState(() => _query = text.trim().toLowerCase()),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SegTabs<String>(
                      values: const ['all', 'missing', 'scored'],
                      labels: const ['All', 'Missing', 'Scored'],
                      selected: _filter,
                      onChanged: (v) => setState(() => _filter = v),
                    ),
                  ),
                  if (_stale)
                    Text(
                      'The selected term changed. Return to the Class Record before saving.',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  if (_error != null)
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  if (_notice?.isNotEmpty == true)
                    Semantics(liveRegion: true, child: Text(_notice!)),
                ],
              ),
            ),
            Expanded(
              child: shown.isEmpty
                  ? const ZEmptyPage(
                      icon: Icons.group_outlined,
                      title: 'No learners match',
                      subtitle: 'Try a different search or score filter.',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      itemCount: shown.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, index) => _row(shown[index], assessment),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(RecordLearner learner, RecordAssessment assessment) {
    final changed = _changed(learner);
    final error = _rowErrors[learner.id];
    final status = learner.locked
        ? 'Locked'
        : error != null
        ? 'Failed'
        : changed
        ? 'Unsaved'
        : _queued.containsKey(learner.id)
        ? 'Queued'
        : _saved.containsKey(learner.id)
        ? 'Saved'
        : 'Missing';
    return ZCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            learner.displayName,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          Text(learner.lrn, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  key: ValueKey('assessment-score-${learner.id}'),
                  controller: _controllers[learner.id],
                  enabled: !_saving && !_stale && !learner.locked,
                  decoration: InputDecoration(
                    labelText: 'Score',
                    suffixText: '/ ${gradeNumber(assessment.maxScore)}',
                    errorText: error,
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {
                    _rowErrors.remove(learner.id);
                    _notice = null;
                  }),
                ),
              ),
              const SizedBox(width: 8),
              ZStatusPill(
                text: status,
                tone: error != null
                    ? StatusTone.red
                    : changed || status == 'Queued'
                    ? StatusTone.amber
                    : status == 'Saved'
                    ? StatusTone.green
                    : StatusTone.neutral,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
