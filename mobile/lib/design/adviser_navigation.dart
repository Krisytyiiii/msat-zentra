import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'bama_mascot.dart';

const _destinations = [
  (
    path: '/workspace/overview',
    label: 'Overview',
    icon: LucideIcons.layoutDashboard,
  ),
  (path: '/workspace/classes', label: 'Class', icon: LucideIcons.school),
  (
    path: '/workspace/gradebook',
    label: 'Gradebook',
    icon: LucideIcons.bookOpen,
  ),
  (
    path: '/workspace/attendance',
    label: 'Attendance',
    icon: LucideIcons.clipboardCheck,
  ),
];

/// Drawer-only desks deliberately leave all four destinations unselected.
class AdviserBottomNavigation extends StatelessWidget {
  const AdviserBottomNavigation({super.key, required this.selectedPath});

  final String selectedPath;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    const activeColor = Color(0xFFFFB900);
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Row(
            children: [
              Expanded(
                child: Material(
                  color: colors.surface,
                  elevation: 12,
                  shadowColor: Colors.black.withValues(alpha: 0.4),
                  shape: StadiumBorder(
                    side: BorderSide(color: colors.outlineVariant),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(80),
                    ),
                    child: SizedBox(
                      height: 60,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (final destination in _destinations)
                              Expanded(
                                child: Semantics(
                                  selected: selectedPath == destination.path,
                                  button: true,
                                  child: Tooltip(
                                    message: destination.label,
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(80),
                                      key: ValueKey(
                                        'adviser-nav-${destination.label}',
                                      ),
                                      onTap: () {
                                        if (selectedPath != destination.path) {
                                          context.go(destination.path);
                                        }
                                      },
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          AnimatedContainer(
                                            duration: const Duration(
                                              milliseconds: 150,
                                            ),
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color:
                                                  selectedPath ==
                                                      destination.path
                                                  ? activeColor.withValues(
                                                      alpha: 0.16,
                                                    )
                                                  : Colors.transparent,
                                              borderRadius:
                                                  BorderRadius.circular(40),
                                            ),
                                            child: Icon(
                                              destination.icon,
                                              size: 22,
                                              applyTextScaling: false,
                                              color:
                                                  selectedPath ==
                                                      destination.path
                                                  ? activeColor
                                                  : colors.onSurfaceVariant,
                                            ),
                                          ),
                                          Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 2,
                                            ),
                                            child: Text(
                                              destination.label,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                fontSize: 9,
                                                fontWeight: FontWeight.w600,
                                                color:
                                                    selectedPath ==
                                                        destination.path
                                                    ? activeColor
                                                    : colors.onSurfaceVariant,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Semantics(
                button: true,
                selected: selectedPath.startsWith('/adviser/bama'),
                child: Tooltip(
                  message: 'Chat with Bama',
                  child: Material(
                    key: const ValueKey('adviser-nav-Bama'),
                    color: selectedPath.startsWith('/adviser/bama')
                        ? activeColor.withValues(alpha: 0.16)
                        : colors.surface,
                    elevation: 12,
                    shadowColor: Colors.black.withValues(alpha: 0.4),
                    shape: CircleBorder(
                      side: BorderSide(
                        color: selectedPath.startsWith('/adviser/bama')
                            ? activeColor
                            : colors.outlineVariant,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () {
                        if (!selectedPath.startsWith('/adviser/bama')) {
                          context.push('/adviser/bama');
                        }
                      },
                      child: SizedBox(
                        width: 60,
                        height: 60,
                        child: const Center(
                          child: ExcludeSemantics(
                            child: BamaMascot(size: 52),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compatibility wrapper: Bama now lives beside the bottom navigation.
class AdviserBamaAccess extends StatelessWidget {
  const AdviserBamaAccess({
    super.key,
    required this.child,
    this.enabled,
    this.busy = false,
  });

  final Widget child;
  final bool? enabled;
  final bool busy;

  @override
  Widget build(BuildContext context) => child;
}
