// Zentra mobile — Drive-style save notice.
//
// A white stadium pill that floats just above the bottom navigation, exactly
// where Google Drive shows "1 upload complete": a circular leading badge
// (spinner while writing, check when acknowledged), the count in plain words,
// a dismiss X and an expand chevron that reveals each save.
//
// The panel lives with staff bottom navigation. The app-owned save queue
// keeps running even when this presentation is hidden.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/save_tasks.dart';
import '../features/app_router.dart';
import 'floating_add.dart';

const _blue = Color(0xFF1A73E8);
const _amber = Color(0xFFF29900);
const _red = Color(0xFFD93025);

class SaveTaskHost extends ConsumerWidget {
  const SaveTaskHost({super.key, required this.child, this.enabled = true});

  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(saveTasksProvider);
    final media = MediaQuery.of(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        Positioned(
          left: 16,
          right: 16,
          // Match the navigation's SafeArea minimum (not inset + margin),
          // then clear its 60px height with a consistent 8px gap.
          bottom: media.viewPadding.bottom.clamp(12.0, double.infinity) +
              60 +
              8 +
              media.viewInsets.bottom,
          child: IgnorePointer(
            ignoring: !enabled || !tasks.hasTasks,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 150),
              opacity: enabled && tasks.hasTasks ? 1 : 0,
              child: Align(
                alignment: Alignment.bottomCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: SavePanelMeasure(
                    child: enabled && tasks.hasTasks
                        ? const SaveTaskPanel()
                        : const SizedBox.shrink(),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class SaveTaskPanel extends ConsumerWidget {
  const SaveTaskPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(saveTasksProvider);
    if (!tasks.hasTasks) return const SizedBox.shrink();
    final colors = Theme.of(context).colorScheme;
    final tone = _Tone(tasks);
    return Material(
      color: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AnimatedSize(
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
            alignment: Alignment.bottomCenter,
            child: tasks.expanded
                ? Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _TaskList(tasks: tasks),
                  )
                : const SizedBox.shrink(),
          ),
          Material(
            key: const ValueKey('save-task-pill'),
            color: colors.surface,
            elevation: 3,
            shadowColor: Colors.black.withValues(alpha: 0.16),
            shape: StadiumBorder(
              side: BorderSide(color: colors.outlineVariant),
            ),
            clipBehavior: Clip.antiAlias,
            child: SizedBox(
              height: 48,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Row(
                  children: [
                    _StatusBadge(tone: tone),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Semantics(
                        liveRegion: true,
                        label: _summary(tasks),
                        child: Text(
                          _summary(tasks),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.2,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    if (!tasks.expanded) _RoundAction(
                      key: const ValueKey('save-task-dismiss'),
                      icon: LucideIcons.x,
                      tooltip: 'Dismiss saved tasks',
                      onTap: tasks.settledCount == 0
                          ? null
                          : tasks.dismissFinished,
                      color: colors.onSurfaceVariant,
                      border: colors.outlineVariant,
                    ),
                    if (!tasks.expanded) const SizedBox(width: 6),
                    _RoundAction(
                      key: const ValueKey('save-task-expand'),
                      icon: tasks.expanded
                          ? LucideIcons.chevronDown
                          : LucideIcons.chevronUp,
                      tooltip: tasks.expanded ? 'Hide saves' : 'Show saves',
                      onTap: tasks.toggleExpanded,
                      color: colors.onSurfaceVariant,
                      border: colors.outlineVariant,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _summary(SaveTasks tasks) {
  final running = tasks.runningCount;
  final done = tasks.doneCount;
  final queued = tasks.queuedCount;
  final failed = tasks.failedCount;
  if (running > 0) {
    final head = 'Saving $running ${running == 1 ? 'change' : 'changes'}…';
    final rest = [
      if (done > 0) '$done done',
      if (queued > 0) '$queued queued',
      if (failed > 0) '$failed failed',
    ];
    return rest.isEmpty ? head : '$head ${rest.join(' · ')}';
  }
  if (failed > 0) {
    final others = [
      if (done > 0) '$done complete',
      if (queued > 0) '$queued queued',
    ];
    final head = '$failed ${failed == 1 ? 'save' : 'saves'} failed';
    return others.isEmpty ? head : '$head · ${others.join(' · ')}';
  }
  if (queued > 0) {
    return '${done > 0 ? '$done saved · ' : ''}$queued waiting to sync';
  }
  final total = done;
  return '$total ${total == 1 ? 'save' : 'saves'} complete';
}

class _Tone {
  _Tone(SaveTasks tasks)
    : running = tasks.runningCount > 0,
      failed = tasks.runningCount == 0 && tasks.failedCount > 0,
      queued =
          tasks.runningCount == 0 &&
          tasks.failedCount == 0 &&
          tasks.queuedCount > 0;

  final bool running;
  final bool failed;
  final bool queued;
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.tone});

  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final color = tone.failed
        ? _red
        : tone.queued
        ? _amber
        : _blue;
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: tone.running
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: _blue,
                ),
              )
            : Icon(
                tone.failed
                    ? LucideIcons.circleAlert
                    : tone.queued
                    ? LucideIcons.clock
                    : LucideIcons.check,
                size: 18,
                color: color,
              ),
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
    required this.color,
    required this.border,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final Color color;
  final Color border;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Semantics(
      button: true,
      label: tooltip,
      child: Material(
        color: Colors.transparent,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 44,
            height: 44,
            child: Center(
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: border),
                ),
                child: Icon(
                  icon,
                  size: 18,
                  color: enabled ? color : color.withValues(alpha: 0.32),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskList extends ConsumerWidget {
  const _TaskList({required this.tasks});

  final SaveTasks tasks;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).colorScheme;
    return Material(
      key: const ValueKey('save-task-list'),
      color: colors.surface,
      elevation: 3,
      shadowColor: Colors.black.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: colors.outlineVariant),
        ),
        constraints: const BoxConstraints(maxHeight: 260),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 8, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Save history',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (tasks.queuedCount > 0)
                    TextButton(
                      onPressed: tasks.syncing ? null : tasks.syncPending,
                      child: Text(tasks.syncing ? 'Syncing…' : 'Sync now'),
                    ),
                  _RoundAction(
                    key: const ValueKey('save-task-dismiss'),
                    icon: LucideIcons.x,
                    tooltip: 'Dismiss saved tasks',
                    onTap: tasks.settledCount == 0
                        ? null
                        : tasks.dismissFinished,
                    color: colors.onSurfaceVariant,
                    border: colors.outlineVariant,
                  ),
                ],
              ),
            ),
            if (tasks.syncError != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  tasks.syncError!,
                  style: const TextStyle(fontSize: 12, color: _red),
                ),
              ),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 6),
                itemCount: tasks.tasks.length,
                separatorBuilder: (_, _) => Divider(
                  height: 1,
                  thickness: 1,
                  color: colors.outlineVariant.withValues(alpha: 0.6),
                ),
                itemBuilder: (context, index) =>
                    _TaskRow(task: tasks.tasks[index]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskRow extends ConsumerWidget {
  const _TaskRow({required this.task});

  final SaveTask task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).colorScheme;
    final status = task.running
        ? 'Saving…'
        : task.failed
        ? (task.interrupted ? 'Needs review' : 'Not saved')
        : task.queued > 0
        ? 'Waiting to sync'
        : 'Saved';
    final detail = task.failed
        ? (task.error ?? 'This save did not finish.')
        : task.message ??
              (task.queued > 0
                  ? '${task.queued} queued · waiting for server confirmation'
                  : task.saved > 0
                  ? '${task.saved} saved'
                  : task.subtitle);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      child: Row(
        children: [
          SizedBox(
            width: 20,
            height: 20,
            child: task.running
                ? const CircularProgressIndicator(strokeWidth: 2, color: _blue)
                : Icon(
                    task.failed
                        ? LucideIcons.circleAlert
                        : task.status == SaveTaskStatus.queued
                        ? LucideIcons.clock
                        : LucideIcons.check,
                    size: 18,
                    color: task.failed
                        ? _red
                        : task.status == SaveTaskStatus.queued
                        ? _amber
                        : _blue,
                  ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  task.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '${task.subtitle} · $status',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: task.failed ? _red : colors.onSurfaceVariant,
                  ),
                ),
                Text(
                  detail,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: task.failed ? _red : colors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          if (task.canRetry)
            TextButton(
              key: ValueKey('save-task-retry-${task.id}'),
              onPressed: () => ref.read(saveTasksProvider).retry(task.id),
              child: const Text('Retry'),
            )
          else if (task.failed && task.route != null)
            TextButton(
              onPressed: () {
                final route = task.route!;
                ref
                    .read(routerProvider)
                    .push(
                      task.recovery.isEmpty
                          ? route
                          : '$route?reviewSave=${Uri.encodeComponent(task.id)}',
                    );
              },
              child: const Text('Review'),
            )
          else if (task.status == SaveTaskStatus.done && task.queued == 0)
            Semantics(
              button: true,
              label: 'Dismiss this save',
              child: IconButton(
                onPressed: () => ref.read(saveTasksProvider).dismiss(task.id),
                icon: Icon(
                  LucideIcons.x,
                  size: 18,
                  color: colors.onSurfaceVariant,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
