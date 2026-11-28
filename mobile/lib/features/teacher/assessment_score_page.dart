import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/intl.dart';

import '../../design/adviser_navigation.dart';
import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/save_tasks.dart';
import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../design/status_palette.dart';
import '../../design/overview_theme.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import '../../shared/identity_tile.dart';
import 'gradebook_data.dart';
import 'score_saves.dart';

/// Dedicated assessment encoding, outside the staff shell. Only dirty rows
/// are submitted, using the same bulk endpoint and per-row results as web.
class AssessmentScorePage extends ConsumerStatefulWidget {
  const AssessmentScorePage({
    super.key,
    required this.classId,
    required this.assessmentId,
    this.reviewSaveId,
  });
  final String classId;
  final String assessmentId;
  final String? reviewSaveId;
  @override
  ConsumerState<AssessmentScorePage> createState() => _ScoreState();
}

class _ReviewScoresDialog extends StatelessWidget {
  const _ReviewScoresDialog({
    required this.assessment,
    required this.assignment,
    required this.changes,
  });
  final RecordAssessment assessment;
  final Map<String, dynamic> assignment;
  final List<({String name, double? before, double after, bool queued})>
  changes;

  @override
  Widget build(BuildContext context) => Dialog(
    backgroundColor: Theme.of(context).colorScheme.surface,
    insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 380),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Review scores',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Close review',
                  onPressed: () => Navigator.pop(context, false),
                  icon: const Icon(Icons.close, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                ZStatusPill(
                  text: assignment['subjectName']?.toString() ?? 'Class',
                  tone: StatusTone.blue,
                ),
                if (assignment['sectionName'] != null)
                  ZStatusPill(
                    text: assignment['sectionName'].toString(),
                    tone: StatusTone.violet,
                  ),
                ZStatusPill(
                  text: 'Max ${gradeNumber(assessment.maxScore)}',
                  tone: StatusTone.amber,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              assessment.title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${changes.length} changed ${changes.length == 1 ? 'learner' : 'learners'}',
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            for (final change in changes)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.outline,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      change.name,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${change.before == null ? 'Missing' : gradeNumber(change.before!)}'
                      '${change.queued ? ' (Queued)' : ''} → ${gradeNumber(change.after)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0xFF8FB6F5)
                            : const Color(0xFF2563EB),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            Text(
              'Only changed scores will be submitted. Offline scores stay queued until confirmed.',
              style: TextStyle(
                fontSize: 12,
                height: 1.45,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Back'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      foregroundColor: Theme.of(context).colorScheme.onPrimary,
                      minimumSize: const Size(48, 48),
                    ),
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Save'),
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
  bool _reviewing = false;
  bool _descending = false;
  String _saveFilter = 'all';
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
      if (widget.reviewSaveId != null) {
        final tasks = ref.read(saveTasksProvider);
        await tasks.ready;
        if (!mounted || generation != _generation) return;
        final task = tasks.tasks
            .where((t) => t.id == widget.reviewSaveId)
            .firstOrNull;
        if (task != null &&
            task.failed &&
            task.recovery['scope'] == _currentScope) {
          for (final row in task.recovery['scores'] as List? ?? []) {
            if (row is! Map) continue;
            final id = row['studentId'];
            final score = row['rawScore'];
            if (id is String && score is num && !_queued.containsKey(id)) {
              _controllers[id]?.text = gradeNumber(score);
            }
          }
        }
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

  Future<void> _save() async {
    if (_saving || _reviewing || _stale || _dirty.isEmpty) return;
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
        _saveFilter = 'all';
        _query = '';
        _error = 'Check the highlighted scores before saving.';
      });
      return;
    }
    final owner = ref.read(authProvider);
    final generation = _generation;
    final scope = _scope;
    setState(() => _reviewing = true);
    bool? confirmed;
    try {
      confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => _ReviewScoresDialog(
          assessment: _assessment!,
          assignment: _record!.assignment,
          changes: [
            for (final learner in dirty)
              (
                name: learner.displayName,
                before: _queued[learner.id] ?? _saved[learner.id],
                after:
                    (jobs.firstWhere(
                          (job) => job['studentId'] == learner.id,
                        )['rawScore']
                        as double),
                queued: _queued.containsKey(learner.id),
              ),
          ],
        ),
      );
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
    if (!mounted ||
        confirmed != true ||
        _stale ||
        _currentScope != scope ||
        generation != _generation ||
        !identical(owner, ref.read(authProvider))) {
      return;
    }
    final tasks = ref.read(saveTasksProvider);
    final term = ref.read(termProvider);
    final expected = '${term?.schoolYearId}:${term?.id}';
    final request = ScoreSaveRequest(
      assessmentId: widget.assessmentId,
      jobs: List<Map<String, dynamic>>.from(jobs),
      queuedIds: _queued.keys.toSet(),
    );
    final api = ref.read(apiClientProvider);
    final outbox = ref.read(outboxProvider);
    final service = _service;
    ScoreSaveOutcome? outcome;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    // The write runs in the app-wide queue: this page is free to leave while
    // the pill above the navigation reports progress, and only a server
    // acknowledgement counts as saved.
    late final SaveTask task;
    task = tasks.submit(
      title: 'Scores · ${_assessment!.title}',
      onSettled: (task) => _afterSave(task, outcome),
      route:
          '/workspace/classes/${Uri.encodeComponent(widget.classId)}'
          '/assessments/${Uri.encodeComponent(widget.assessmentId)}',
      recovery: {
        'scope': expected,
        'scores': List<Map<String, dynamic>>.from(jobs),
      },
      subtitle:
          '${_record?.assignment['subjectName'] ?? 'Grade Record'} · ${jobs.length} ${jobs.length == 1 ? 'learner' : 'learners'}',
      action: () async {
        final result = await runScoreSave(
          api: api,
          outbox: outbox,
          service: service,
          request: request,
          termIsCurrent: () => tasks.termIsCurrent(expected),
          onQueued: (id, count) => tasks.trackQueued(task, id, count),
          onProgress: () {
            task.saved = request.savedScores.length;
            task.queued = request.queuedScores.length;
            task.recovery['scores'] = List<Map<String, dynamic>>.from(
              request.jobs,
            );
            tasks.checkpoint(task);
          },
        );
        outcome = result;
        return SaveTaskResult(
          saved: result.saved,
          queued: result.queued,
          failed: result.errors.length,
          message: [
            if (result.saved > 0) '${result.saved} saved',
            if (result.queued > 0) '${result.queued} queued offline',
            if (result.errors.isNotEmpty)
              '${result.errors.length} need${result.errors.length == 1 ? 's' : ''} attention',
          ].join(' · '),
        );
      },
    );
  }

  void _afterSave(SaveTask task, ScoreSaveOutcome? outcome) {
    if (!mounted || _scope != _currentScope) return;
    final assessment = _assessment;
    var savedCount = 0;
    setState(() {
      _saving = false;
      if (outcome != null) {
        outcome.savedScores.forEach((id, score) {
          _saved[id] = score;
          assessment?.scores[id] = score;
          _rowErrors.remove(id);
        });
        outcome.queuedScores.forEach((id, score) => _queued[id] = score);
        _rowErrors.addAll(outcome.errors);
        savedCount = outcome.saved;
      }
      _error = task.failed
          ? (task.error ?? 'Scores could not be saved. Your edits are kept.')
          : _rowErrors.isEmpty
          ? null
          : 'Some scores were not saved. Your edits are kept for retry.';
      _notice = outcome == null
          ? null
          : [
              if (outcome.saved > 0) '${outcome.saved} saved',
              if (outcome.queued > 0) '${outcome.queued} queued offline',
            ].join(' · ');
    });
    if (savedCount > 0) {
      ref.invalidate(overviewProvider);
      ref.invalidate(overviewSecondaryProvider);
    }
    // Everything the user asked to save was acknowledged (or safely queued):
    // close the editor as before, but never discard a newer edit.
    if (!task.failed &&
        !_stale &&
        _currentScope == _scope &&
        _rowErrors.isEmpty &&
        _error == null &&
        _notice?.contains('queued') != true &&
        _dirty.isEmpty) {
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
    // Submitted rows now live in the app-wide save queue; leaving does not
    // cancel them, and controls stay locked while a task runs.
    if (_saving) return true;
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
    if (_confirmingLeave) return;
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
    final desk = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: desk,
      child: PopScope(
        canPop: !_saving && (_dirty.isEmpty || _allowPop),
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _leave();
        },
        child: Scaffold(
          backgroundColor: desk.scaffoldBackgroundColor,
          appBar: AppBar(
            shape: Border(bottom: BorderSide(color: desk.colorScheme.outline)),
            backgroundColor: desk.scaffoldBackgroundColor,
            surfaceTintColor: Colors.transparent,
            scrolledUnderElevation: 0,
            centerTitle: true,
            leadingWidth: 64,
            leading: ZBackButton(
              tooltip: canPop ? 'Back' : 'Close',
              onPressed: _leave,
              icon: const Icon(Icons.chevron_left),
            ),
            title: const Text('Edit Scores'),
          ),
          body: AdviserBamaAccess(
            busy: _saving,
            child: _busy
                ? const LoadingView(layout: SkeletonLayout.scores)
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
                      child: SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: desk.colorScheme.primary,
                            foregroundColor: desk.colorScheme.onPrimary,
                            minimumSize: const Size(160, 48),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          onPressed:
                              _saving || _reviewing || _stale || _dirty.isEmpty
                              ? null
                              : _save,
                          child: Text(_saving ? 'Saving…' : 'Save scores'),
                        ),
                      ),
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  Widget _body(RecordAssessment assessment) {
    final givenDate = DateTime.tryParse(assessment.dateGiven);
    final shown =
        _learners.where((learner) {
          if (_filter == 'missing' && _saved.containsKey(learner.id)) {
            return false;
          }
          if (_filter == 'scored' && !_saved.containsKey(learner.id)) {
            return false;
          }
          final saved =
              _saved.containsKey(learner.id) &&
              !_changed(learner) &&
              !_queued.containsKey(learner.id);
          if (_saveFilter == 'saved' && !saved) return false;
          if (_saveFilter == 'unsaved' && saved) return false;
          return _query.isEmpty ||
              learner.displayName.toLowerCase().contains(_query) ||
              learner.name.toLowerCase().contains(_query) ||
              learner.lrn.contains(_query);
        }).toList()..sort(
          (a, b) => _descending
              ? b.displayName.toLowerCase().compareTo(
                  a.displayName.toLowerCase(),
                )
              : a.displayName.toLowerCase().compareTo(
                  b.displayName.toLowerCase(),
                ),
        );
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                ? const Color(0x292B7FFF)
                                : const Color(0xFFE8EFFF),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Icon(
                            Icons.edit_note_outlined,
                            size: 24,
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                ? const Color(0xFFA9C9FF)
                                : const Color(0xFF2442A8),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      assessment.title,
                                      style: TextStyle(
                                        fontSize: 22,
                                        height: 1.2,
                                        fontWeight: FontWeight.w700,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurface,
                                        letterSpacing: -0.5,
                                      ),
                                    ),
                                  ),
                                  if (assessment.dateGiven.isNotEmpty) ...[
                                    const SizedBox(width: 8),
                                    _metadataPill(
                                      givenDate == null
                                          ? assessment.dateGiven
                                          : DateFormat('MMM d, yyyy')
                                                .format(givenDate),
                                      Icons.calendar_today_outlined,
                                      'Assessment date',
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  if (_record!.assignment['subjectName'] !=
                                      null)
                                    _metadataPill(
                                      _record!.assignment['subjectName']
                                          .toString(),
                                      Icons.menu_book_outlined,
                                      'Subject',
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (_record!.assignment['schoolYear'] != null)
                          ZScopePill(
                            text: _record!.assignment['schoolYear'].toString(),
                            kind: ScopePillKind.schoolYear,
                            compact: true,
                          ),
                        if (_record!.assignment['termNumber'] != null)
                          ZScopePill(
                            text: 'Term ${_record!.assignment['termNumber']}',
                            kind: ScopePillKind.term,
                            compact: true,
                          ),
                        if (_record!.assignment['gradeLevel'] != null ||
                            _record!.assignment['sectionName'] != null)
                          _metadataPill(
                            [
                              if (_record!.assignment['gradeLevel'] != null)
                                _record!.assignment['gradeLevel']
                                    .toString()
                                    .replaceFirst(
                                      RegExp(
                                        r'^Grade\s*',
                                        caseSensitive: false,
                                      ),
                                      'G',
                                    ),
                              if (_record!.assignment['sectionName'] != null)
                                _record!.assignment['sectionName'].toString(),
                            ].where((value) => value.isNotEmpty).join(' · '),
                            Icons.school_outlined,
                            'Grade and section',
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
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
                          fillColor: Theme.of(context)
                              .colorScheme
                              .surfaceContainerLow,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(999),
                            borderSide: BorderSide(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(999),
                            borderSide: BorderSide(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                          ),
                        ),
                        onChanged: (text) =>
                            setState(() => _query = text.trim().toLowerCase()),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Flexible(
                          child: _recordFilter('Category', _filter, const {
                            'all': 'All Category',
                            'missing': 'Missing',
                            'scored': 'Scored',
                          }, (value) => setState(() => _filter = value)),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: _recordFilter(
                            'Save status',
                            _saveFilter,
                            const {
                              'all': 'Save: All',
                              'saved': 'Save: Saved',
                              'unsaved': 'Save: Unsaved',
                            },
                            (value) => setState(() => _saveFilter = value),
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Showing ${shown.length} records',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () =>
                              setState(() => _descending = !_descending),
                          icon: const Icon(Icons.sort, size: 16),
                          label: Text(
                            _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                    if (_stale)
                      Text(
                        'The selected term changed. Return to the Grade Record before saving.',
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
            ),
            if (shown.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: ZEmpty(
                    icon: Icons.group_outlined,
                    title: 'No learners match',
                    subtitle: 'Try a different search or score filter.',
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverList.separated(
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

  Color _wash(Color light) {
    if (Theme.of(context).brightness != Brightness.dark) return light;
    final hsl = HSLColor.fromColor(light);
    return HSLColor.fromAHSL(0.16, hsl.hue, 0.45, 0.5).toColor();
  }

  Color _lift(Color light) {
    if (Theme.of(context).brightness != Brightness.dark) return light;
    final hsl = HSLColor.fromColor(light);
    return HSLColor.fromAHSL(
      hsl.alpha,
      hsl.hue,
      hsl.saturation.clamp(0.35, 0.9),
      0.68,
    ).toColor();
  }

  Widget _metadataPill(String text, IconData icon, String label) {
    final (background, border, foreground) = switch (label) {
      'Assessment date' => (
        _wash(const Color(0xFFF3F4F6)),
        _wash(const Color(0xFFE5E7EB)),
        _lift(const Color(0xFF6B7280)),
      ),
      'Subject' => (
        _wash(const Color(0xFFF0FDFA)),
        _wash(const Color(0xFF99F6E4)),
        _lift(const Color(0xFF0F766E)),
      ),
      'Grade and section' => (
        _wash(const Color(0xFFF5F3FF)),
        _wash(const Color(0xFFDDD6FE)),
        _lift(const Color(0xFF7C3AED)),
      ),
      _ => (
        _wash(const Color(0xFFEAF2FF)),
        _wash(const Color(0xFFD4E4FF)),
        _lift(const Color(0xFF2563EB)),
      ),
    };
    return Tooltip(
      message: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: background,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: foreground),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: foreground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _recordFilter(
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> onChanged,
  ) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12),
    decoration: BoxDecoration(
      color: _wash(const Color(0xFFEFF6FF)),
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: _wash(const Color(0xFFBFDBFE))),
    ),
    child: Tooltip(
      message: label,
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          itemHeight: null,
          style: TextStyle(fontSize: 12, color: _lift(const Color(0xFF2563EB))),
          selectedItemBuilder: (_) => [
            for (final text in options.values)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
          ],
          items: [
            for (final entry in options.entries)
              DropdownMenuItem(
                value: entry.key,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(entry.value),
                ),
              ),
          ],
          onChanged: (selected) {
            if (selected != null) onChanged(selected);
          },
        ),
      ),
    ),
  );

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
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: changed
              ? _wash(const Color(0xFFBFDBFE))
              : Theme.of(context).colorScheme.outline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ZIdentityTile(
                name: learner.displayName,
                seed: learner.id,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      learner.displayName,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'LRN ${learner.lrn}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: ZStatusPill(
                  text: status,
                  tone: error != null
                      ? StatusTone.red
                      : changed || status == 'Queued'
                      ? StatusTone.amber
                      : status == 'Saved'
                      ? StatusTone.green
                      : StatusTone.neutral,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Divider(
              height: 1,
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  key: ValueKey('assessment-score-${learner.id}'),
                  controller: _controllers[learner.id],
                  enabled:
                      !_saving && !_reviewing && !_stale && !learner.locked,
                  decoration: InputDecoration(
                    labelText: 'Score',
                    suffixText: '/ ${gradeNumber(assessment.maxScore)}',
                    errorText: error,
                    filled: true,
                    fillColor: Theme.of(context)
                        .colorScheme
                        .surfaceContainerLow,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Theme.of(context).colorScheme.primary,
                        width: 1.5,
                      ),
                    ),
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
            ],
          ),
        ],
      ),
    );
  }
}
