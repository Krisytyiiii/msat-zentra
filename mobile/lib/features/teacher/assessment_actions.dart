import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'gradebook_data.dart';

/// Matches Advisory List's dial: same timings, main/small FABs, labels and gaps.
class AssessmentActions extends StatefulWidget {
  const AssessmentActions({
    super.key,
    required this.expanded,
    required this.onToggle,
    required this.onAdd,
  });
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<String> onAdd;
  @override
  State<AssessmentActions> createState() => _ActionsState();
}

class _ActionsState extends State<AssessmentActions>
    with SingleTickerProviderStateMixin {
  late final _turns = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 150),
    animationBehavior: AnimationBehavior.preserve,
    value: widget.expanded ? 1 : 0,
  );
  late final _size = CurvedAnimation(parent: _turns, curve: Curves.easeOut);
  late final _rotation = Tween(begin: 0.0, end: 0.125).animate(_turns);
  void _sync() {
    if (MediaQuery.disableAnimationsOf(context)) {
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
    _sync();
  }

  @override
  void didUpdateWidget(AssessmentActions oldWidget) {
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
                  key: const ValueKey('assessment-dial-options'),
                  sizeFactor: _size,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final entry in assessmentTypes.entries) ...[
                        _Option(
                          type: entry.key,
                          label: entry.value,
                          onTap: () => widget.onAdd(entry.key),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        FloatingActionButton(
          key: const ValueKey('assessment-main-action'),
          heroTag: 'assessment-actions',
          tooltip: widget.expanded
              ? 'Close assessment actions'
              : 'Add assessment',
          onPressed: widget.onToggle,
          child: RotationTransition(
            key: const ValueKey('assessment-dial-rotation'),
            turns: _rotation,
            child: const Icon(Icons.add),
          ),
        ),
      ],
    ),
  );
}

class _Option extends StatelessWidget {
  const _Option({required this.type, required this.label, required this.onTap});
  final String type;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final icon = switch (type) {
      'WRITTEN_WORK' => Icons.edit_note_outlined,
      'PERFORMANCE_TASK' => Icons.assignment_outlined,
      _ => Icons.quiz_outlined,
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          button: true,
          child: GestureDetector(
            onTap: onTap,
            child: Tooltip(
              message: label,
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
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        FloatingActionButton.small(
          key: ValueKey('assessment-dial-$type'),
          heroTag: 'assessment-dial-$type',
          tooltip: label,
          onPressed: onTap,
          child: Icon(icon, size: 18),
        ),
      ],
    );
  }
}
