import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/adviser_navigation.dart';
import '../../design/status_palette.dart';

import 'package:hive_flutter/hive_flutter.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'assessment_actions.dart';
import 'class_record_cards.dart';
import 'gradebook_data.dart';
import 'gradebook_forms.dart';
import 'assessment_score_page.dart';
import 'assessments_page.dart';

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
  bool _descending = false;
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
        await router.push<bool>(
          '/workspace/classes/${Uri.encodeComponent(widget.classId)}'
          '/assessments/${Uri.encodeComponent(id)}',
        );
      } else {
        await Navigator.of(context).push<bool>(
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

  Future<void> _openAssessments() async {
    if (_editorOpen) return;
    _editorOpen = true;
    try {
      final router = GoRouter.maybeOf(context);
      if (router != null) {
        await router.push<void>(
          '/workspace/classes/${Uri.encodeComponent(widget.classId)}/assessments?audience=$_audience',
        );
      } else {
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) =>
                AssessmentsPage(classId: widget.classId, audience: _audience),
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
          onAssessmentSave: (title, max, selectedAudience, dateGiven) async {
            _checkScope(version);
            createdId = await _service.add(
              classId,
              type: type,
              title: title,
              maxScore: max,
              audience: selectedAudience,
              dateGiven: dateGiven,
            );
            if (!mounted || version != _scopeVersion) return;
            setState(() => _audience = selectedAudience);
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
            centerTitle: true,
            leadingWidth: 48,
            leading: IconButton(
              icon: const Icon(Icons.chevron_left),
              tooltip: canPop ? 'Back' : 'Close',
              padding: EdgeInsets.zero,
              onPressed: _close,
            ),
            title: const Text('Class Record'),
          ),
          body: AdviserBamaAccess(
            child: Stack(
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
      ),
    );
  }

  Widget _record(ClassRecord data) {
    final theme = Theme.of(context);
    final learners =
        data.learners.where((learner) {
          return learner.isAdm == (_audience == 'adm') &&
              (_query.isEmpty ||
                  learner.name.toLowerCase().contains(_query) ||
                  learner.displayName.toLowerCase().contains(_query) ||
                  learner.lrn.contains(_query));
        }).toList()..sort((a, b) {
          final order = a.displayName.toLowerCase().compareTo(
            b.displayName.toLowerCase(),
          );
          return _descending ? -order : order;
        });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.45,
          ),
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          data.assignment['subjectName']?.toString() ??
                              widget.title,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _audienceSwitch(),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Manage assessments and scores for your learners.',
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
                      if (data.assignment['schoolYear'] != null)
                        ZStatusPill(
                          text: data.assignment['schoolYear'].toString(),
                          tone: StatusTone.blue,
                        ),
                      if (data.assignment['termNumber'] != null)
                        ZStatusPill(
                          text: 'Term ${data.assignment['termNumber']}',
                          tone: StatusTone.amber,
                        ),
                      if (data.assignment['gradeLevel'] != null)
                        ZStatusPill(
                          text: data.assignment['gradeLevel']
                              .toString()
                              .replaceFirst(
                                RegExp(r'^Grade\s*', caseSensitive: false),
                                'G',
                              ),
                          tone: StatusTone.blue,
                        ),
                      if (data.assignment['sectionName'] != null)
                        ZStatusPill(
                          text: data.assignment['sectionName'].toString(),
                          tone: StatusTone.violet,
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _gradingWeights(data),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: SizedBox(
                          height: 40,
                          child: TextField(
                            controller: _search,
                            textAlignVertical: TextAlignVertical.center,
                            textInputAction: TextInputAction.search,
                            style: const TextStyle(fontSize: 12),
                            decoration: InputDecoration(
                              hintText: 'Search learner or LRN',
                              prefixIcon: const Icon(Icons.search, size: 20),
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
                              isDense: true,
                              filled: true,
                              fillColor: theme.colorScheme.surfaceContainerLow,
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 8,
                                horizontal: 16,
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(999),
                                borderSide: BorderSide(
                                  color: theme.colorScheme.outlineVariant,
                                ),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(999),
                                borderSide: BorderSide(
                                  color: theme.colorScheme.outlineVariant,
                                ),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(999),
                                borderSide: BorderSide(
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                            ),
                            onChanged: (text) => setState(
                              () => _query = text.trim().toLowerCase(),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Showing ${learners.length} ${learners.length == 1 ? 'record' : 'records'}',
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
          ),
        ),
        if (_refreshing) const LinearProgressIndicator(minHeight: 2),
        Expanded(
          child: learners.isEmpty
              ? SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 120),
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
                        Container(
                          width: 40,
                          height: 40,
                          decoration: const BoxDecoration(
                            color: Color(0xFFEAF0FF),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            LucideIcons.users,
                            size: 20,
                            color: Color(0xFF4263F0),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _query.isNotEmpty
                              ? 'No learners match'
                              : _audience == 'adm'
                              ? 'No ADM learners'
                              : 'No learners yet',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF192034),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _query.isNotEmpty
                              ? 'Try another name or LRN.'
                              : 'Learners in this group will appear here.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.5,
                            color: Color(0xFF71809B),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : ClassRecordCards(
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

  Widget _audienceSwitch() => OutlinedButton(
    onPressed: () => setState(() {
      _audience = _audience == 'regular' ? 'adm' : 'regular';
      _expanded = false;
    }),
    style: OutlinedButton.styleFrom(
      backgroundColor: const Color(0xFFEFF6FF),
      foregroundColor: const Color(0xFF2563EB),
      minimumSize: const Size(48, 32),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      tapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      side: const BorderSide(color: Color(0xFFBFDBFE)),
      shape: const StadiumBorder(),
      textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
    ),
    child: Text(_audience == 'regular' ? 'Regular' : 'ADM'),
  );

  Widget _gradingWeights(ClassRecord data) {
    const categories = [
      ('WRITTEN_WORK', 'WRITTEN', Color(0xFF355CEC), Color(0xFFF3F6FF)),
      ('PERFORMANCE_TASK', 'PERFORM', Color(0xFFB96C13), Color(0xFFFFFBEB)),
      ('EXAM', 'EXAM', Color(0xFFC31850), Color(0xFFFFF2F5)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'GRADING WEIGHTS',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF697791),
                ),
              ),
            ),
            TextButton(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(48, 28),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
              onPressed: _openAssessments,
              child: const Text(
                'Assessments ›',
                style: TextStyle(fontSize: 12),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        LayoutBuilder(
          builder: (context, constraints) {
            final stack =
                constraints.maxWidth < 350 ||
                MediaQuery.textScalerOf(context).scale(12) > 16;
            final tiles = [
              for (final category in categories)
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    key: ValueKey('grading-weight-${category.$1}'),
                    onTap: _openAssessments,
                    borderRadius: BorderRadius.circular(18),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: category.$4,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: category.$3.withValues(alpha: 0.15),
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  category.$2,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: category.$3,
                                  ),
                                ),
                              ),
                              Text(
                                '${gradeNumber(data.weights[category.$1] ?? 0)}%',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: category.$3,
                                ),
                              ),
                            ],
                          ),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${data.assessments.where((a) => a.type == category.$1 && a.audience == _audience).length} ${category.$1 == 'EXAM' ? 'exams' : 'tasks'}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: category.$3,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ];
            if (stack) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final tile in tiles)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: SizedBox(width: 180, child: tile),
                      ),
                  ],
                ),
              );
            }
            return Row(
              children: [
                for (final tile in tiles.indexed) ...[
                  if (tile.$1 > 0) const SizedBox(width: 8),
                  Expanded(child: tile.$2),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}
