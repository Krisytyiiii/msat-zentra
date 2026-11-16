import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widget_previews.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/session.dart';
import '../../core/sync_outbox.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../shared/models.dart';
import '../../shared/spinner.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'advisory_list_data.dart';

// Keep existing imports in the academic/settings/Bama screens compatible.
export 'advisory_list_data.dart';

class AdvisoryListPage extends ConsumerStatefulWidget {
  const AdvisoryListPage({super.key});
  @override
  ConsumerState<AdvisoryListPage> createState() => _AdvisoryListState();
}

class _AdvisoryListState extends ConsumerState<AdvisoryListPage> {
  final _search = TextEditingController();
  String _q = '';
  String _filter = 'All';
  bool _showArchived = false;
  bool _expanded = false;
  bool _acting = false;
  bool _adding = false;
  String? _busyId;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _view(bool archived) {
    _search.clear();
    setState(() {
      _q = '';
      _filter = 'All';
      _showArchived = archived;
      _expanded = false;
    });
    if (archived) ref.invalidate(archivedAdvisoryProvider);
  }

  Future<void> _refreshAll() async {
    ref.invalidate(overviewProvider);
    final futures = <Future<Object?>>[
      ref.refresh(advisoryProvider.future),
      ref.refresh(archivedAdvisoryProvider.future),
    ];
    // A completed write stays successful even if the follow-up read fails;
    // each list presents its own retryable error.
    await Future.wait(
      futures.map(
        (future) =>
            future.then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ),
    );
  }

  bool _sameScope(Term? scope) {
    final current = ref.read(termProvider);
    return scope != null &&
        current?.id == scope.id &&
        current?.schoolYearId == scope.schoolYearId;
  }

  void _checkScope(Term? scope) {
    if (!_sameScope(scope)) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The selected term changed. Close this form and try again.',
      );
    }
  }

  Future<void> _requireOnline() async {
    final connections = await Connectivity().checkConnectivity();
    if (connections.contains(ConnectivityResult.none)) {
      throw ApiException(
        'NETWORK',
        'Connect to add, archive or restore learners.',
      );
    }
  }

  void _message(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          margin: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            160 + MediaQuery.paddingOf(context).bottom,
          ),
        ),
      );
    }
  }

  Future<void> _archive(AdvisoryStudent student) async {
    if (_acting || _adding) return;
    final scope = ref.read(termProvider);
    final service = ref.read(advisoryListServiceProvider);
    setState(() {
      _acting = true;
      _expanded = false;
    });
    try {
      final confirmed = await showModalBottomSheet<bool>(
        context: context,
        showDragHandle: true,
        useSafeArea: true,
        isScrollControlled: true,
        builder: (context) => SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Archive student?',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Text(student.name, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(
                'LRN ${student.lrn}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              const Text(
                'This removes the learner from your advisory list, not from the school. Grades, attendance, anecdotal records and referrals are kept. Restore them any time from Archived students.',
              ),
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Keep student'),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: ZTokens.destructiveRed,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => Navigator.pop(context, true),
                icon: const Icon(Icons.archive_outlined, size: 18),
                label: const Text('Archive student'),
              ),
            ],
          ),
        ),
      );
      if (confirmed != true || !mounted) return;
      await _requireOnline();
      if (!mounted) return;
      _checkScope(scope);
      setState(() => _busyId = student.studentId);
      await service.archive(student.studentId);
      if (!mounted) return;
      await _refreshAll();
      _message('${student.name} archived. Records are kept.');
    } catch (error) {
      _message(
        userMessage(
          error,
          fallback: 'We couldn’t archive this student. Please try again.',
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _acting = false;
          _busyId = null;
        });
      }
    }
  }

  Future<void> _restore(ArchivedAdvisoryStudent student) async {
    if (_acting || _adding) return;
    final scope = ref.read(termProvider);
    final service = ref.read(advisoryListServiceProvider);
    setState(() {
      _acting = true;
      _busyId = student.archiveId;
      _expanded = false;
    });
    try {
      await _requireOnline();
      if (!mounted) return;
      _checkScope(scope);
      await service.restore(student.archiveId);
      if (!mounted) return;
      await _refreshAll();
      _message('${student.name} restored with full history.');
    } catch (error) {
      _message(
        userMessage(
          error,
          fallback: 'We couldn’t restore this student. Please try again.',
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _acting = false;
          _busyId = null;
        });
      }
    }
  }

  Future<void> _openAdd(List<AdvisorySection> sections) async {
    if (_acting || _adding || sections.isEmpty) return;
    final scope = ref.read(termProvider);
    final service = ref.read(advisoryListServiceProvider);
    setState(() {
      _adding = true;
      _expanded = false;
    });
    try {
      await _requireOnline();
      if (!mounted) return;
      _checkScope(scope);
      final name = await showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => _AddStudentSheet(
          sections: sections,
          onSave: (fullName, lrn, sectionId, learnerType) async {
            if (!mounted) return;
            _checkScope(scope);
            // Keep the page busy even if the sheet is dismissed mid-request.
            setState(() => _acting = true);
            try {
              await _requireOnline();
              if (!mounted) return;
              _checkScope(scope);
              await service.enlist(
                fullName: fullName,
                lrn: lrn,
                sectionId: sectionId,
                learnerType: learnerType,
              );
              if (mounted) await _refreshAll();
            } finally {
              if (mounted) setState(() => _acting = false);
            }
          },
        ),
      );
      if (name != null && mounted) {
        _view(false);
        _message('$name enlisted.');
      }
    } catch (error) {
      _message(
        userMessage(
          error,
          fallback: 'We couldn’t open student enlistment. Please try again.',
        ),
      );
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = ref.watch(advisoryProvider);
    final archived = _showArchived ? ref.watch(archivedAdvisoryProvider) : null;
    final sections = active.asData?.value.sections ?? const <AdvisorySection>[];
    final pending = ref.watch(outboxProvider).pendingCount;
    return PopScope(
      canPop: !_expanded,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _expanded) setState(() => _expanded = false);
      },
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.escape): () {
            if (_expanded) setState(() => _expanded = false);
          },
        },
        child: Stack(
          children: [
            ExcludeFocus(
              excluding: _expanded,
              child: ExcludeSemantics(
                excluding: _expanded,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            _showArchived
                                ? 'Archived students'
                                : 'Advisory list',
                            style: theme.textTheme.headlineSmall,
                          ),
                          if (_showArchived) ...[
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => _view(false),
                                icon: const Icon(Icons.arrow_back, size: 16),
                                label: const Text('Back to advisory list'),
                              ),
                            ),
                            Text(
                              'Records are kept. Restore a learner to bring back their full history.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _search,
                                  decoration: const InputDecoration(
                                    prefixIcon: Icon(Icons.search, size: 18),
                                    hintText: 'Search name or LRN',
                                  ),
                                  onChanged: (value) => setState(
                                    () => _q = value.trim().toLowerCase(),
                                  ),
                                ),
                              ),
                              if (pending > 0) ...[
                                const SizedBox(width: 8),
                                PendingChip(count: pending),
                              ],
                            ],
                          ),
                          if (!_showArchived) ...[
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                for (final filter in [
                                  'All',
                                  'High',
                                  'academic',
                                  'attendance',
                                  'behavioral',
                                ])
                                  ChoiceChip(
                                    label: Text(
                                      filter,
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                    selected: _filter == filter,
                                    onSelected: (_) =>
                                        setState(() => _filter = filter),
                                  ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    Expanded(
                      child: _showArchived
                          ? archived!.when(
                              loading: () => const Padding(
                                padding: EdgeInsets.all(16),
                                child: ZSkeletonList(),
                              ),
                              error: (error, _) => ErrorView(
                                message: error,
                                onRetry: () =>
                                    ref.invalidate(archivedAdvisoryProvider),
                              ),
                              data: _archivedList,
                            )
                          : active.when(
                              loading: () => const Padding(
                                padding: EdgeInsets.all(16),
                                child: ZSkeletonList(),
                              ),
                              error: (error, _) => ErrorView(
                                message: error,
                                onRetry: () => ref.invalidate(advisoryProvider),
                              ),
                              data: _activeList,
                            ),
                    ),
                  ],
                ),
              ),
            ),
            if (_expanded)
              Positioned.fill(
                child: GestureDetector(
                  excludeFromSemantics: true,
                  onTap: () => setState(() => _expanded = false),
                  child: const ColoredBox(color: Colors.transparent),
                ),
              ),
            Positioned(
              key: const ValueKey('advisory-dial-anchor'),
              // Same body-relative anchor as Bama's _SpeedDial.
              right: 16,
              bottom: 88,
              child: _AdvisoryActions(
                expanded: _expanded,
                busy: _acting || _adding,
                onToggle: () {
                  if (!_expanded) {
                    FocusManager.instance.primaryFocus?.unfocus();
                  }
                  ScaffoldMessenger.of(context).removeCurrentSnackBar();
                  setState(() => _expanded = !_expanded);
                },
                onAdd: !active.isLoading && sections.isNotEmpty
                    ? () => _openAdd(sections)
                    : null,
                onArchived: () => _view(true),
                addHint: active.isLoading
                    ? 'Loading your advisory section…'
                    : active.hasError
                    ? 'Retry the advisory list to enable enlistment.'
                    : sections.isEmpty
                    ? 'No advisory section is assigned in this term.'
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  EdgeInsets get _listPadding => EdgeInsets.fromLTRB(
    16,
    4,
    16,
    184 + MediaQuery.paddingOf(context).bottom,
  );

  Widget _empty({required String title, required String subtitle}) =>
      RefreshIndicator(
        onRefresh: _refreshAll,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: _listPadding,
          children: [
            ZEmpty(
              icon: _showArchived
                  ? Icons.archive_outlined
                  : Icons.group_outlined,
              title: title,
              subtitle: subtitle,
            ),
          ],
        ),
      );

  Widget _activeList(AdvisoryRoster roster) {
    final shown = roster.students
        .where(
          (student) =>
              (_q.isEmpty ||
                  student.name.toLowerCase().contains(_q) ||
                  student.lrn.contains(_q)) &&
              (_filter == 'All' ||
                  student.riskLevel == _filter ||
                  student.flags.contains(_filter)),
        )
        .toList();
    if (shown.isEmpty) {
      return _empty(
        title: roster.students.isEmpty
            ? 'No advisees yet'
            : 'No students match',
        subtitle: roster.students.isEmpty
            ? 'Use the + menu to add a learner to your advisory section.'
            : 'Try a different name, LRN or risk filter.',
      );
    }
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: ListView.separated(
        key: const PageStorageKey('active-advisees'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: _listPadding,
        itemCount: shown.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final student = shown[index];
          return _LearnerCard(
            key: ValueKey('active-${student.studentId}'),
            onTap: _acting
                ? null
                : () => context.push(
                    '/adviser/students/${Uri.encodeComponent(student.studentId)}',
                    extra: student,
                  ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Identity(name: student.name, lrn: student.lrn),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 10,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            'Att ${student.attendancePercentage == null ? '—' : '${student.attendancePercentage!.toStringAsFixed(1)}%'}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          Text(
                            'Avg ${student.academicGrade?.toStringAsFixed(1) ?? '—'}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          RiskBadge(level: student.riskLevel),
                          for (final flag in student.flags)
                            FlagChip(flag: flag),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                if (_busyId == student.studentId)
                  const Padding(padding: EdgeInsets.all(12), child: ZSpinner())
                else
                  PopupMenuButton<String>(
                    tooltip: 'Actions for ${student.name}',
                    enabled: !_acting && !_adding,
                    icon: const Icon(Icons.more_horiz),
                    onSelected: (_) => _archive(student),
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'archive',
                        child: Row(
                          children: [
                            const Icon(Icons.archive_outlined, size: 18),
                            const SizedBox(width: 10),
                            Text(
                              'Archive student',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _archivedList(List<ArchivedAdvisoryStudent> students) {
    final shown = students
        .where(
          (student) =>
              _q.isEmpty ||
              student.name.toLowerCase().contains(_q) ||
              student.lrn.contains(_q),
        )
        .toList();
    if (shown.isEmpty) {
      return _empty(
        title: students.isEmpty
            ? 'No archived students'
            : 'No archived students match',
        subtitle: students.isEmpty
            ? 'Learners archived from your advisory list will appear here for restoration.'
            : 'Try a different name or LRN.',
      );
    }
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: ListView.separated(
        key: const PageStorageKey('archived-advisees'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: _listPadding,
        itemCount: shown.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final student = shown[index];
          final busy = _busyId == student.archiveId;
          return _LearnerCard(
            key: ValueKey('archived-${student.archiveId}'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Identity(name: student.name, lrn: student.lrn),
                if (student.section.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    student.section,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                if (student.archivedAt != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Archived ${DateFormat.yMMMd().format(student.archivedAt!.toUtc().add(const Duration(hours: 8)))}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _acting || _adding
                      ? null
                      : () => _restore(student),
                  icon: busy
                      ? const ZSpinner(size: 16)
                      : const Icon(Icons.restore, size: 18),
                  label: Text(busy ? 'Restoring…' : 'Restore student'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Identity extends StatelessWidget {
  const _Identity({required this.name, required this.lrn});
  final String name;
  final String lrn;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(name, style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 3),
      Text(
        'LRN $lrn',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    ],
  );
}

class _LearnerCard extends StatelessWidget {
  const _LearnerCard({super.key, required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).cardTheme.color,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(10),
      side: BorderSide(
        color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.72),
      ),
    ),
    clipBehavior: Clip.antiAlias,
    child: onTap == null
        ? Padding(padding: const EdgeInsets.all(14), child: child)
        : InkWell(
            onTap: onTap,
            child: Padding(padding: const EdgeInsets.all(14), child: child),
          ),
  );
}

class _AdvisoryActions extends StatefulWidget {
  const _AdvisoryActions({
    required this.expanded,
    required this.busy,
    required this.onToggle,
    required this.onAdd,
    required this.onArchived,
    this.addHint,
  });
  final bool expanded;
  final bool busy;
  final VoidCallback onToggle;
  final VoidCallback? onAdd;
  final VoidCallback onArchived;
  final String? addHint;
  @override
  State<_AdvisoryActions> createState() => _AdvisoryActionsState();
}

class _AdvisoryActionsState extends State<_AdvisoryActions>
    with SingleTickerProviderStateMixin {
  late final AnimationController _turns;
  late final CurvedAnimation _size;
  late final Animation<double> _rotation;
  bool _reducedMotion = false;

  @override
  void initState() {
    super.initState();
    _turns = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 150),
      // Reduced motion is handled explicitly in _sync via MediaQuery.
      animationBehavior: AnimationBehavior.preserve,
      value: widget.expanded ? 1 : 0,
    );
    _size = CurvedAnimation(parent: _turns, curve: Curves.easeOut);
    _rotation = Tween(begin: 0.0, end: 0.125).animate(_turns);
  }

  void _sync() {
    if (_reducedMotion) {
      _turns.value = widget.expanded ? 1 : 0;
    } else if (widget.expanded) {
      _turns.forward();
    } else {
      _turns.reverse();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reducedMotion = MediaQuery.disableAnimationsOf(context);
    _sync();
  }

  @override
  void didUpdateWidget(_AdvisoryActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.expanded != widget.expanded) _sync();
  }

  @override
  void dispose() {
    _size.dispose();
    _turns.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _turns,
    builder: (context, _) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Offstage(
          offstage: _turns.isDismissed,
          child: ExcludeFocus(
            excluding: !widget.expanded,
            child: ExcludeSemantics(
              excluding: !widget.expanded,
              child: IgnorePointer(
                ignoring: !widget.expanded,
                child: SizeTransition(
                  key: const ValueKey('advisory-dial-options'),
                  sizeFactor: _size,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      _AdvisoryDialOption(
                        id: 'add',
                        label: 'Add student',
                        icon: Icons.person_add_outlined,
                        onTap: widget.busy ? null : widget.onAdd,
                        disabledHint: widget.addHint,
                      ),
                      const SizedBox(height: 8),
                      _AdvisoryDialOption(
                        id: 'archived',
                        label: 'Archived students',
                        icon: Icons.archive_outlined,
                        onTap: widget.busy ? null : widget.onArchived,
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        FloatingActionButton(
          key: const ValueKey('advisory-main-action'),
          heroTag: 'advisory-actions',
          tooltip: widget.expanded
              ? 'Close advisory actions'
              : 'Advisory actions',
          onPressed: widget.busy ? null : widget.onToggle,
          child: widget.busy
              ? ZSpinner(
                  color:
                      Theme.of(context)
                          .floatingActionButtonTheme
                          .foregroundColor ??
                      Theme.of(context).colorScheme.onPrimaryContainer,
                )
              : RotationTransition(
                  key: const ValueKey('advisory-dial-rotation'),
                  turns: _rotation,
                  child: const Icon(Icons.add),
                ),
        ),
      ],
    ),
  );
}

/// Bama's label + small FAB treatment, with both label and icon tappable.
class _AdvisoryDialOption extends StatelessWidget {
  const _AdvisoryDialOption({
    required this.id,
    required this.label,
    required this.icon,
    required this.onTap,
    this.disabledHint,
  });
  final String id;
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final String? disabledHint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          button: true,
          enabled: onTap != null,
          child: GestureDetector(
            onTap: onTap,
            child: Tooltip(
              message: onTap == null ? disabledHint ?? label : label,
              child: Container(
                constraints: BoxConstraints(
                  maxWidth: math.max(0, MediaQuery.sizeOf(context).width - 96),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  color: theme.colorScheme.surfaceContainerLow,
                  border: Border.all(color: theme.colorScheme.outline),
                ),
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: onTap == null
                        ? theme.colorScheme.onSurfaceVariant
                        : null,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        FloatingActionButton.small(
          key: ValueKey('advisory-dial-$id'),
          heroTag: 'advisory-dial-$id',
          tooltip: label,
          onPressed: onTap,
          child: Icon(icon, size: 18),
        ),
      ],
    );
  }
}

class _AddStudentSheet extends StatefulWidget {
  const _AddStudentSheet({required this.sections, required this.onSave});
  final List<AdvisorySection> sections;
  final Future<void> Function(
    String name,
    String lrn,
    String sectionId,
    AdvisoryLearnerType learnerType,
  )
  onSave;
  @override
  State<_AddStudentSheet> createState() => _AddStudentSheetState();
}

class _AddStudentSheetState extends State<_AddStudentSheet> {
  final _name = TextEditingController();
  final _lrn = TextEditingController();
  String? _sectionId;
  AdvisoryLearnerType _learnerType = AdvisoryLearnerType.regular;
  String? _error;
  bool _saving = false;
  @override
  void initState() {
    super.initState();
    if (widget.sections.length == 1) _sectionId = widget.sections.first.id;
  }

  @override
  void dispose() {
    _name.dispose();
    _lrn.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    final name = _name.text.trim();
    final lrn = _lrn.text.trim();
    if (name.isEmpty ||
        !RegExp(r'^\d{12}$').hasMatch(lrn) ||
        _sectionId == null) {
      setState(
        () => _error =
            'Enter the full name, a 12-digit LRN and an advisory section.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSave(name, lrn, _sectionId!, _learnerType);
      if (mounted) Navigator.pop(context, name);
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = userMessage(
            error,
            fallback: 'We couldn’t enlist this student. Please try again.',
          );
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: EdgeInsets.fromLTRB(
      20,
      4,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Add student', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(
          widget.sections.length == 1
              ? 'Enlist into ${widget.sections.first.name}.'
              : 'Choose your advisory section.',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _name,
          enabled: !_saving,
          maxLength: 120,
          decoration: const InputDecoration(labelText: 'Full name'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _lrn,
          enabled: !_saving,
          maxLength: 12,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'LRN',
            hintText: '12-digit LRN',
          ),
        ),
        const SizedBox(height: 12),
        Text('Learner type', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        _LearnerTypePicker(
          value: _learnerType,
          enabled: !_saving,
          onChanged: (value) => setState(() => _learnerType = value),
        ),
        if (widget.sections.length > 1) ...[
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _sectionId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Section'),
            items: [
              for (final section in widget.sections)
                DropdownMenuItem(value: section.id, child: Text(section.name)),
            ],
            onChanged: _saving
                ? null
                : (value) => setState(() => _sectionId = value),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'Enlisting…' : 'Enlist student'),
        ),
      ],
    ),
  );
}

class _LearnerTypePicker extends StatelessWidget {
  const _LearnerTypePicker({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });
  final AdvisoryLearnerType value;
  final bool enabled;
  final ValueChanged<AdvisoryLearnerType> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final options = [
      (
        value: AdvisoryLearnerType.regular,
        label: 'Regular student',
        hint: 'Attendance is rated from the start of the term.',
      ),
      (
        value: AdvisoryLearnerType.transferee,
        label: 'Transferee',
        hint: 'Attendance starts on the day this student is enlisted, not the term start.',
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns =
            constraints.maxWidth >= 440 &&
                MediaQuery.textScalerOf(context).scale(13) <= 17
            ? 2
            : 1;
        final width = (constraints.maxWidth - (columns - 1) * 8) / columns;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final option in options)
              SizedBox(
                width: width,
                child: Semantics(
                  checked: value == option.value,
                  inMutuallyExclusiveGroup: true,
                  child: OutlinedButton(
                    onPressed: enabled ? () => onChanged(option.value) : null,
                    style: OutlinedButton.styleFrom(
                      alignment: Alignment.centerLeft,
                      backgroundColor: value == option.value
                          ? theme.colorScheme.primary.withValues(alpha: 0.10)
                          : theme.cardTheme.color,
                      side: BorderSide(
                        color: value == option.value
                            ? theme.colorScheme.primary.withValues(alpha: 0.4)
                            : theme.colorScheme.outline,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      padding: const EdgeInsets.all(12),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          value == option.value
                              ? Icons.radio_button_checked
                              : Icons.radio_button_off,
                          size: 18,
                          color: value == option.value
                              ? theme.colorScheme.primary
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                option.label,
                                style: theme.textTheme.titleSmall,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                option.hint,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

@Preview(name: 'Advisory learner type', group: 'Advisory', size: Size(390, 280))
Widget advisoryLearnerTypePreview() {
  var value = AdvisoryLearnerType.regular;
  return MaterialApp(
    theme: zWorkspaceTheme(),
    home: Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: StatefulBuilder(
          builder: (context, setState) => _LearnerTypePicker(
            value: value,
            enabled: true,
            onChanged: (next) => setState(() => value = next),
          ),
        ),
      ),
    ),
  );
}

@Preview(
  name: 'Advisory floating actions',
  group: 'Advisory',
  size: Size(390, 300),
)
Widget advisoryActionsPreview() {
  var expanded = false;
  return MaterialApp(
    theme: zWorkspaceTheme(),
    home: Scaffold(
      body: StatefulBuilder(
        builder: (context, setState) => Stack(
          children: [
            Positioned(
              right: 16,
              bottom: 88,
              child: _AdvisoryActions(
                expanded: expanded,
                busy: false,
                onToggle: () => setState(() => expanded = !expanded),
                onAdd: () {},
                onArchived: () {},
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
