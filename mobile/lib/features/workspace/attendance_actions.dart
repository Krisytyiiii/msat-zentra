import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Same standard/small FAB sizes, 150ms motion and 8px gaps as Class Record.
class AttendanceActions extends StatefulWidget {
  const AttendanceActions({
    super.key,
    required this.expanded,
    required this.onToggle,
    required this.onSelect,
  });
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<bool> onSelect;

  @override
  State<AttendanceActions> createState() => _ActionsState();
}

class _ActionsState extends State<AttendanceActions>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 150),
    animationBehavior: AnimationBehavior.preserve,
    value: widget.expanded ? 1 : 0,
  );
  late final _size = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOut,
  );

  late final _rotation = Tween(begin: 0.0, end: 0.125).animate(_controller);

  void _sync() {
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = widget.expanded ? 1 : 0;
    } else if (widget.expanded) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(AttendanceActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.expanded != widget.expanded) _sync();
  }

  @override
  void dispose() {
    _size.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Offstage(
          offstage: _controller.isDismissed,
          child: SizeTransition(
            key: const ValueKey('attendance-dial-options'),
            sizeFactor: _size,
            child: IgnorePointer(
              ignoring: !widget.expanded,
              child: ExcludeSemantics(
                excluding: !widget.expanded,
                child: ExcludeFocus(
                  excluding: !widget.expanded,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final entry in [
                        (false, 'Manual', LucideIcons.notebookPen),
                        (true, 'QR', LucideIcons.scanLine),
                      ]) ...[
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            InkWell(
                              onTap: () => widget.onSelect(entry.$1),
                              borderRadius: BorderRadius.circular(6),
                              child: Container(
                                constraints: BoxConstraints(
                                  maxWidth:
                                      MediaQuery.sizeOf(context).width - 96,
                                ),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerLow,
                                  border: Border.all(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .outline,
                                  ),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  entry.$2,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FloatingActionButton.small(
                              backgroundColor: const Color(0xFF2444B8),
                              foregroundColor: Colors.white,
                              heroTag: 'attendance-${entry.$2}',
                              tooltip: entry.$2,
                              onPressed: () => widget.onSelect(entry.$1),
                              child: Icon(entry.$3, size: 18),
                            ),
                          ],
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
          backgroundColor: const Color(0xFF2444B8),
          foregroundColor: Colors.white,
          heroTag: 'attendance-actions',
          tooltip: widget.expanded
              ? 'Close attendance actions'
              : 'Add attendance',
          onPressed: widget.onToggle,
          child: RotationTransition(
            key: const ValueKey('attendance-dial-rotation'),
            turns: _rotation,
            child: const Icon(LucideIcons.plus),
          ),
        ),
      ],
    ),
  );
}
