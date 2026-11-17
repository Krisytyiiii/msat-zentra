import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'assessment_actions.dart';
import 'class_record_grid.dart';
import 'gradebook_data.dart';
import 'gradebook_forms.dart';
import 'assessment_score_page.dart';

class GradebookPage extends ConsumerStatefulWidget {
  const GradebookPage({super.key, required this.classId, required this.title});
  final String classId;
  final String title;
  @override
  ConsumerState<GradebookPage> createState() => _State();
}

class _State extends ConsumerState<GradebookPage> {
  ClassRecord? _data;
  bool _busy = true;
  bool _refreshing = false;
  bool _expanded = false;
  bool _editorOpen = false;
  String? _error;
  String? _refreshError;
  String _query = '';
  String _audience = 'regular';
  int _generation = 0;
  int _scopeVersion = 0;
  final _search = TextEditingController();
  final Map<String, double> _queued = {};
  GradebookService get _service =>
      GradebookService(ref.read(apiClientProvider));

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(GradebookPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.classId != widget.classId) _resetScope();
  }

  void _resetScope() {
    _scopeVersion++;
    _expanded = false;
    _queued.clear();
    _search.clear();
    _query = '';
    _data = null;
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_generation;
    setState(() {
      _busy = !silent;
      _refreshing = silent;
      _error = null;
      _refreshError = null;
    });
    try {
      final data = await _service.load(widget.classId);
      if (!mounted || generation != _generation) return;
      final queued = <String, double>{};
      if (Hive.isBoxOpen(AppConfig.outboxBox)) {
        for (final op in ref.read(outboxProvider).pending) {
          final body = op['body'];
          if (body is! Map || body['rawScore'] is! num) continue;
          for (final assessment in data.assessments) {
            final path =
                '/api/grades/assessments/${Uri.encodeComponent(assessment.id)}/score';
            if (op['path'] == path &&
                data.learners.any((s) => s.id == body['studentId'])) {
              queued['${assessment.id}|${body['studentId']}'] =
                  (body['rawScore'] as num).toDouble();
            }
          }
        }
      }
      setState(() {
        _data = data;
        _queued
          ..clear()
          ..addAll(queued);
        _busy = false;
        _refreshing = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _busy = false;
        _refreshing = false;
        if (silent && _data != null) {
          _refreshError = userMessage(error);
        } else {
          _error = userMessage(error);
        }
      });
    }
  }

  void _checkScope(int version) {
    if (!mounted || version != _scopeVersion) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The selected term changed. Close this form and try again.',
      );
    }
  }

  void _invalidate() {
    ref.invalidate(overviewProvider);
    ref.invalidate(overviewSecondaryProvider);
  }

  Future<void> _openAssessment(String id) async {
    if (_editorOpen) return;
    _editorOpen = true;
    try {
      final router = GoRouter.maybeOf(context);
      if (router != null) {
        await router.push<void>(
          '/workspace/classes/${Uri.encodeComponent(widget.classId)}'
          '/assessments/${Uri.encodeComponent(id)}',
        );
      } else {
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) =>
                AssessmentScorePage(classId: widget.classId, assessmentId: id),
          ),
        );
      }
      if (mounted) await _load(silent: true);
    } finally {
      _editorOpen = false;
    }
  }

  Future<void> _add(String type) async {
    if (_editorOpen) return;
    setState(() => _expanded = false);
    _editorOpen = true;
    final version = _scopeVersion;
    final audience = _audience;
    final classId = widget.classId;
    String? createdId;
    try {
      await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        isDismissible: false,
        enableDrag: false,
        builder: (_) => GradebookEditor.assessment(
          type: type,
          audience: audience,
          onSave: (title, max) async {
            _checkScope(version);
            createdId = await _service.add(
              classId,
              type: type,
              title: title,
              maxScore: max,
              audience: audience,
            );
            if (!mounted || version != _scopeVersion) return;
            _invalidate();
            await _load(silent: true);
          },
        ),
      );
    } finally {
      _editorOpen = false;
    }
    if (mounted && version == _scopeVersion && createdId != null) {
      await _openAssessment(createdId!);
    }
  }

  void _close() {
    final router = GoRouter.maybeOf(context);
    if (router != null && router.canPop()) {
      router.pop();
    } else if (router != null) {
      router.go('/workspace/classes');
    } else {
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (previous, next) {
      if (previous?.id != next?.id ||
          previous?.schoolYearId != next?.schoolYearId) {
        _resetScope();
      }
    });
    final data = _data;
    final canPop = ModalRoute.of(context)?.canPop ?? false;
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): () {
          if (_expanded) setState(() => _expanded = false);
        },
      },
      child: PopScope(
        canPop: !_expanded,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && _expanded) setState(() => _expanded = false);
        },
        child: Scaffold(
          appBar: AppBar(
            leading: canPop
                ? null
                : IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Close',
                    onPressed: _close,
                  ),
            title: Text(
              widget.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            actions: [
              IconButton(
                tooltip: 'Refresh class record',
                onPressed: _busy || _refreshing
                    ? null
                    : () => _load(silent: true),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          body: Stack(
            children: [
              if (_busy)
                const LoadingView()
              else if (_error != null)
                ErrorView(message: _error, onRetry: _load)
              else if (data != null)
                _record(data),
              if (_expanded)
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _expanded = false),
                    child: const ColoredBox(color: Colors.transparent),
                  ),
                ),
              if (!_busy && _error == null && data != null)
                Positioned(
                  key: const ValueKey('assessment-dial-anchor'),
                  right: 16,
                  bottom: 88,
                  child: AssessmentActions(
                    expanded: _expanded,
                    onToggle: () => setState(() => _expanded = !_expanded),
                    onAdd: _add,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _record(ClassRecord data) {
    final theme = Theme.of(context);
    final learners = data.learners.where((learner) {
      return learner.isAdm == (_audience == 'adm') &&
          (_query.isEmpty ||
              learner.name.toLowerCase().contains(_query) ||
              learner.displayName.toLowerCase().contains(_query) ||
              learner.lrn.contains(_query));
    }).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Class Record',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${data.learners.length} learners · '
                '${data.assessments.where((a) => a.audience == _audience).length} assessments'
                '${data.assignment['termNumber'] == null ? '' : ' · Term ${data.assignment['termNumber']}'}'
                '${data.assignment['schoolYear'] == null ? '' : ' · ${data.assignment['schoolYear']}'}',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SegTabs<String>(
                  values: const ['regular', 'adm'],
                  labels: const ['Regular', 'ADM'],
                  selected: _audience,
                  onChanged: (value) => setState(() {
                    _audience = value;
                    _expanded = false;
                  }),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _search,
                decoration: const InputDecoration(
                  hintText: 'Search learner or LRN',
                  prefixIcon: Icon(Icons.search, size: 18),
                ),
                onChanged: (text) =>
                    setState(() => _query = text.trim().toLowerCase()),
              ),
              if (data.assessments.isEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  'Use + to add Written Work, Performance Task or Exam.',
                  style: theme.textTheme.bodySmall,
                ),
              ],
              if (_queued.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  'Queued scores are waiting to sync; grades remain server-confirmed.',
                  style: theme.textTheme.bodySmall,
                ),
              ],
              if (_refreshError != null)
                TextButton.icon(
                  onPressed: () => _load(silent: true),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Could not refresh. Try again.'),
                ),
            ],
          ),
        ),
        if (_refreshing) const LinearProgressIndicator(minHeight: 2),
        Expanded(
          child: learners.isEmpty
              ? ZEmptyPage(
                  icon: Icons.group_outlined,
                  title: _query.isNotEmpty
                      ? 'No learners match'
                      : _audience == 'adm'
                      ? 'No ADM learners'
                      : 'No learners yet',
                  subtitle: _query.isNotEmpty
                      ? 'Try another name or LRN.'
                      : 'Learners in this group will appear here.',
                )
              : ClassRecordGrid(
                  key: ValueKey('${widget.classId}:$_scopeVersion:$_audience'),
                  record: data,
                  learners: learners,
                  audience: _audience,
                  queued: _queued,
                  onOpen: (assessment) => _openAssessment(assessment.id),
                ),
        ),
      ],
    );
  }
}
