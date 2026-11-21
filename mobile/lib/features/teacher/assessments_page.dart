import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import 'assessment_score_page.dart';
import 'gradebook_data.dart';

class AssessmentsPage extends ConsumerStatefulWidget {
  const AssessmentsPage({
    super.key,
    required this.classId,
    this.audience = 'regular',
  });
  final String classId;
  final String audience;

  @override
  ConsumerState<AssessmentsPage> createState() => _AssessmentsState();
}

class _AssessmentsState extends ConsumerState<AssessmentsPage>
    with WidgetsBindingObserver {
  ClassRecord? _record;
  Object? _error;
  bool _loading = true;
  bool _opening = false;
  int _generation = 0;
  Timer? _poll;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted &&
          (ModalRoute.of(context)?.isCurrent ?? true) &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(_load(silent: true));
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        (ModalRoute.of(context)?.isCurrent ?? true)) {
      unawaited(_load(silent: true));
    }
  }

  @override
  void dispose() {
    _generation++;
    _poll?.cancel();
    _search.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_generation;
    if (!silent) setState(() => _loading = true);
    try {
      final record = await GradebookService(ref.read(apiClientProvider))
          .load(widget.classId);
      if (!mounted || generation != _generation) return;
      setState(() {
        _record = record;
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

  Future<void> _open(RecordAssessment assessment) async {
    if (_opening) return;
    _opening = true;
    try {
      bool? saved;
      final router = GoRouter.maybeOf(context);
      if (router != null) {
        saved = await router.push<bool>(
          '/workspace/classes/${Uri.encodeComponent(widget.classId)}/assessments/${Uri.encodeComponent(assessment.id)}',
        );
      } else {
        saved = await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder: (_) => AssessmentScorePage(
              classId: widget.classId,
              assessmentId: assessment.id,
            ),
          ),
        );
      }
      if (!mounted) return;
      if (saved == true) {
        if (router != null && router.canPop()) {
          router.pop();
        } else if (router != null) {
          router.go(
            '/workspace/classes/${Uri.encodeComponent(widget.classId)}',
          );
        } else {
          Navigator.of(context).pop();
        }
      } else {
        await _load(silent: true);
      }
    } finally {
      _opening = false;
    }
  }

  void _close() {
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      if (router.canPop()) {
        router.pop();
      } else {
        router.go('/workspace/classes/${Uri.encodeComponent(widget.classId)}');
      }
    } else {
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (previous, next) {
      if (previous?.id != next?.id ||
          previous?.schoolYearId != next?.schoolYearId) {
        _search.clear();
        _record = null;
        unawaited(_load());
      }
    });
    ref.listen(authProvider, (previous, next) {
      if (previous != next) {
        _record = null;
        unawaited(_load());
      }
    });
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          centerTitle: true,
          title: const Text('Assessments'),
          leadingWidth: 48,
          leading: IconButton(
            tooltip: 'Back',
            icon: const Icon(Icons.chevron_left),
            onPressed: _close,
          ),
        ),
        body: _loading
            ? const LoadingView()
            : _record == null
            ? ErrorView(message: _error, onRetry: _load)
            : _content(_record!),
      ),
    );
  }

  Widget _content(ClassRecord record) {
    final query = _search.text.trim().toLowerCase();
    final assessments = record.assessments
        .where(
          (a) =>
              a.audience == widget.audience &&
              a.title.toLowerCase().contains(query),
        )
        .toList();
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
        children: [
          Text(
            record.assignment['subjectName']?.toString() ?? 'Assessments',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Choose an assessment to view and enter learner scores.',
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
              if (record.assignment['schoolYear'] != null)
                ZStatusPill(
                  text: record.assignment['schoolYear'].toString(),
                  tone: StatusTone.blue,
                ),
              if (record.assignment['termNumber'] != null)
                ZStatusPill(
                  text: 'Term ${record.assignment['termNumber']}',
                  tone: StatusTone.amber,
                ),
              if (record.assignment['gradeLevel'] != null)
                ZStatusPill(
                  text: record.assignment['gradeLevel'].toString().replaceFirst(
                    RegExp(r'^Grade\s*', caseSensitive: false),
                    'G',
                  ),
                  tone: StatusTone.blue,
                ),
              if (record.assignment['sectionName'] != null)
                ZStatusPill(
                  text: record.assignment['sectionName'].toString(),
                  tone: StatusTone.violet,
                ),
              ZStatusPill(text: widget.audience == 'adm' ? 'ADM' : 'Regular'),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 40,
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              textAlignVertical: TextAlignVertical.center,
              style: const TextStyle(fontSize: 12),
              decoration: InputDecoration(
                hintText: 'Search assessments',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        icon: const Icon(Icons.close, size: 16),
                        onPressed: () => setState(_search.clear),
                      ),
                filled: true,
                fillColor: const Color(0xFFF5F7FA),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(999),
                  borderSide: const BorderSide(color: Color(0xFFE6ECF4)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(999),
                  borderSide: const BorderSide(color: Color(0xFFE6ECF4)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Showing ${assessments.length} records',
            style: const TextStyle(fontSize: 12, color: Color(0xFF9999A6)),
          ),
          if (_error != null)
            TextButton(
              onPressed: () => _load(silent: true),
              child: const Text('Could not refresh. Try again.'),
            ),
          for (final category in assessmentTypes.entries) ...[
            const SizedBox(height: 16),
            Text(
              category.value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF172033),
              ),
            ),
            const SizedBox(height: 8),
            if (!assessments.any((a) => a.type == category.key))
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFDFE7F5)),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  children: [
                    const CircleAvatar(
                      backgroundColor: Color(0xFFEAF0FF),
                      child: Icon(
                        LucideIcons.clipboardList,
                        size: 20,
                        color: Color(0xFF4263F0),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      query.isEmpty
                          ? 'No assessments yet'
                          : 'No matching assessments',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      query.isEmpty
                          ? 'Create an assessment from the Class Record.'
                          : 'Try a different assessment name.',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF71809B),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            for (final assessment in assessments.where(
              (a) => a.type == category.key,
            ))
              Card(
                margin: const EdgeInsets.only(bottom: 12),
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: Color(0xFFE6ECF4)),
                ),
                clipBehavior: Clip.antiAlias,
                child: ListTile(
                  contentPadding: const EdgeInsets.all(14),
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFEFF6FF),
                    child: Icon(
                      switch (category.key) {
                        'WRITTEN_WORK' => LucideIcons.notebookPen,
                        'PERFORMANCE_TASK' => LucideIcons.presentation,
                        _ => LucideIcons.clipboardCheck,
                      },
                      size: 18,
                      color: const Color(0xFF52627C),
                    ),
                  ),
                  title: Text(
                    assessment.title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    'Max ${gradeNumber(assessment.maxScore)} pts${assessment.dateGiven.isEmpty ? '' : ' · ${assessment.dateGiven}'}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF71809B),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right, size: 18),
                  onTap: () => _open(assessment),
                ),
              ),
          ],
        ],
      ),
    );
  }
}
