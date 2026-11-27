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
import '../../shared/floating_add.dart';
import 'gradebook_data.dart';

final classListProvider = FutureProvider.autoDispose
    .family<ClassRecord, String>((ref, classId) {
      ref.watch(authProvider);
      ref.watch(termProvider);
      return GradebookService(ref.watch(apiClientProvider)).load(classId);
    });

/// The selected subject/section's roster, not the adviser's whole section.
class ClassListPage extends ConsumerStatefulWidget {
  const ClassListPage({super.key, required this.classId});
  final String classId;

  @override
  ConsumerState<ClassListPage> createState() => _ClassListState();
}

class _ClassListState extends ConsumerState<ClassListPage>
    with WidgetsBindingObserver {
  final _search = TextEditingController();
  Timer? _poll;
  bool _expanded = false;
  bool _descending = false;
  bool _adm = false;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted &&
          ModalRoute.of(context)?.isCurrent == true &&
          TickerMode.valuesOf(context).enabled &&
          (WidgetsBinding.instance.lifecycleState == null ||
              WidgetsBinding.instance.lifecycleState ==
                  AppLifecycleState.resumed)) {
        ref.invalidate(classListProvider(widget.classId));
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        mounted &&
        ModalRoute.of(context)?.isCurrent == true) {
      ref.invalidate(classListProvider(widget.classId));
    }
  }

  @override
  void didUpdateWidget(ClassListPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.classId != widget.classId) {
      _expanded = false;
      _search.clear();
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      await ref
          .refresh(classListProvider(widget.classId).future)
          .then<void>((_) {});
    } catch (_) {
      // The provider renders the error and retry state.
    }
  }

  Future<void> _open(bool attendance) async {
    if (_opening) return;
    final classId = widget.classId;
    final parts = classId.split('|');
    if (attendance && (parts.length != 2 || parts.any((p) => p.isEmpty))) {
      return;
    }
    setState(() {
      _expanded = false;
      _opening = true;
    });
    final path = attendance
        ? '/workspace/attendance/records/${Uri.encodeComponent(parts[1])}/${Uri.encodeComponent(parts[0])}'
        : '/workspace/classes/${Uri.encodeComponent(classId)}';
    try {
      await context.push<void>(path);
      if (mounted && widget.classId == classId) {
        ref.invalidate(classListProvider(classId));
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  void _back() {
    if (_expanded) {
      setState(() => _expanded = false);
      return;
    }
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/workspace/classes');
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(termProvider, (_, _) {
      setState(() {
        _expanded = false;
        _search.clear();
      });
    });
    final roster = ref.watch(classListProvider(widget.classId));
    final desk = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: desk,
      child: PopScope(
        canPop: !_expanded,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && _expanded) setState(() => _expanded = false);
        },
        child: Scaffold(
          appBar: AppBar(
            backgroundColor: desk.scaffoldBackgroundColor,
            shape: Border(bottom: BorderSide(color: desk.colorScheme.outline)),
            centerTitle: true,
            title: const Text('Class List'),
            leadingWidth: 64,
            leading: ZBackButton(
              tooltip: 'Back',
              icon: const Icon(Icons.chevron_left),
              onPressed: _back,
            ),
          ),
          body: Stack(
            children: [
              Positioned.fill(
                child: roster.when(
                  loading: () =>
                      const LoadingView(layout: SkeletonLayout.directory),
                  error: (error, _) => ErrorView(
                    message: error,
                    onRetry: () =>
                        ref.invalidate(classListProvider(widget.classId)),
                  ),
                  data: _body,
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
            ],
          ),
          floatingActionButton: roster.hasValue && !roster.hasError
              ? FloatingAdd(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      if (_expanded) ...[
                        _action('Enter grades', LucideIcons.notebookPen, false),
                        const SizedBox(height: 8),
                        _action('Attendance', LucideIcons.clipboardCheck, true),
                        const SizedBox(height: 8),
                      ],
                      FloatingActionButton(
                        heroTag: 'class-list-actions',
                        tooltip: _expanded
                            ? 'Close class actions'
                            : 'Class actions',
                        onPressed: _opening
                            ? null
                            : () => setState(() => _expanded = !_expanded),
                        child: AnimatedRotation(
                          turns: _expanded ? .125 : 0,
                          duration: MediaQuery.disableAnimationsOf(context)
                              ? Duration.zero
                              : const Duration(milliseconds: 150),
                          child: const Icon(LucideIcons.plus),
                        ),
                      ),
                    ],
                  ),
                )
              : null,
          floatingActionButtonLocation: const FloatingAddLocation(),
        ),
      ),
    );
  }

  Widget _action(String label, IconData icon, bool attendance) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: (MediaQuery.sizeOf(context).width - 96).clamp(
            0,
            double.infinity,
          ),
        ),
        child: ActionChip(
          label: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
          onPressed: () => _open(attendance),
        ),
      ),
      const SizedBox(width: 8),
      FloatingActionButton.small(
        heroTag: 'class-list-$attendance',
        tooltip: label,
        onPressed: () => _open(attendance),
        child: Icon(icon, size: 18),
      ),
    ],
  );

  Widget _body(ClassRecord record) {
    final query = _search.text.trim().toLowerCase();
    final learners = record.learners
        .where((s) => s.isAdm == _adm)
        .where(
          (s) =>
              s.displayName.toLowerCase().contains(query) ||
              s.name.toLowerCase().contains(query) ||
              s.lrn.contains(query),
        )
        .toList();
    if (_descending) {
      learners.sort((a, b) => b.displayName.compareTo(a.displayName));
    }
    final assignment = record.assignment;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 180),
        children: [
          ZContentHeader(
            title: assignment['subjectName']?.toString() ?? 'Class',
            icon: LucideIcons.users,
            titleMetadata: [
              Text(
                'View learners in this class.',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.3,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            titleTrailing: OutlinedButton(
              onPressed: () => setState(() {
                _adm = !_adm;
                _expanded = false;
              }),
              style: OutlinedButton.styleFrom(
                backgroundColor: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0x292B7FFF)
                    : const Color(0xFFEAF2FF),
                foregroundColor: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF8FB6F5)
                    : const Color(0xFF2563EB),
                minimumSize: const Size(48, 28),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                tapTargetSize: MaterialTapTargetSize.padded,
                visualDensity: VisualDensity.standard,
                side: BorderSide(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0x662B7FFF)
                      : const Color(0xFFD4E4FF),
                ),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.users, size: 12),
                  const SizedBox(width: 4),
                  Text(_adm ? 'ADM' : 'REG'),
                  const SizedBox(width: 4),
                  const Icon(Icons.swap_horiz, size: 12),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (assignment['schoolYear'] != null)
                ZScopePill(
                  text: assignment['schoolYear'].toString(),
                  kind: ScopePillKind.schoolYear,
                  compact: true,
                ),
              if (assignment['termNumber'] != null)
                ZScopePill(
                  text: 'Term ${assignment['termNumber']}',
                  kind: ScopePillKind.term,
                  compact: true,
                ),
              if (assignment['gradeLevel'] != null ||
                  assignment['sectionName'] != null)
                ZScopePill(
                  text: [
                    if (assignment['gradeLevel'] != null)
                      assignment['gradeLevel'].toString().replaceFirst(
                        RegExp(r'^Grade\s*', caseSensitive: false),
                        'G',
                      ),
                    if (assignment['sectionName'] != null)
                      assignment['sectionName'].toString(),
                  ].where((value) => value.isNotEmpty).join(' · '),
                  kind: ScopePillKind.grade,
                  label: 'Grade and section',
                  compact: true,
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(fontSize: 14),
            textAlignVertical: TextAlignVertical.center,
            decoration: InputDecoration(
              hintText: 'Search learner or LRN',
              prefixIcon: const Icon(LucideIcons.search, size: 18),
              hintStyle: TextStyle(
                fontSize: 14,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: .3,
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 10,
              ),
              suffixIcon: query.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () => setState(_search.clear),
                    ),
              filled: true,
              fillColor: Theme.of(context).colorScheme.surfaceContainerLow,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.outline,
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.outline,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Showing ${learners.length} ${learners.length == 1 ? 'record' : 'records'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: () => setState(() => _descending = !_descending),
                style: TextButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.onSurface,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  textStyle: const TextStyle(fontSize: 12),
                ),
                icon: const Icon(LucideIcons.listFilter, size: 16),
                label: Text(_descending ? 'Name (Z-A)' : 'Name (A-Z)'),
              ),
            ],
          ),
          if (learners.isEmpty)
            ZEmpty(
              icon: query.isEmpty ? LucideIcons.users : LucideIcons.search,
              title: query.isEmpty
                  ? 'No students in this class yet.'
                  : 'No learners match your search.',
              subtitle: query.isEmpty
                  ? 'Learners in this group will appear here.'
                  : 'Try another name or LRN.',
            ),
          for (final learner in learners)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                border: Border.all(
                  color: Theme.of(context).colorScheme.outline,
                ),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: Theme.of(context)
                        .colorScheme
                        .surfaceContainerLow,
                    child: Text(
                      learner.name.isEmpty
                          ? '?'
                          : learner.name.characters.first.toUpperCase(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          learner.displayName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'LRN ${learner.lrn}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (learner.isAdm)
                    const ZStatusPill(text: 'ADM', tone: StatusTone.violet),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
