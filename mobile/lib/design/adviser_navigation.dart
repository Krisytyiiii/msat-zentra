import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'overview_theme.dart';

const _adviserDestinations = [
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

const _studentDestinations = [
  (path: '/student/overview', label: 'Overview', icon: LucideIcons.layoutDashboard),
  (path: '/student/schedule', label: 'Schedule', icon: LucideIcons.calendar),
  (path: '/student/grades', label: 'Grades', icon: LucideIcons.award),
  (
    path: '/student/attendance',
    label: 'Attendance',
    icon: LucideIcons.clipboardCheck,
  ),
];

const _parentDestinations = [
  (path: '/parent/overview', label: 'Overview', icon: LucideIcons.layoutDashboard),
  (path: '/parent/schedule', label: 'Schedule', icon: LucideIcons.calendar),
  (path: '/parent/grades', label: 'Grades', icon: LucideIcons.award),
  (
    path: '/parent/attendance',
    label: 'Attendance',
    icon: LucideIcons.clipboardCheck,
  ),
];

/// Lets a full-height editor sheet hide the floating staff bar while it is open.
final staffNavBarHidden = ValueNotifier<bool>(false);

/// Record routes share persistent staff chrome; score/edit routes do not.
String? staffRecordDestination(String location) {
  final parts = Uri.parse(location).pathSegments;
  if ((parts.length == 3 || (parts.length == 4 && parts[3] == 'list')) &&
      parts[0] == 'workspace' &&
      parts[1] == 'classes') {
    return '/workspace/classes';
  }
  if (parts.length == 5 &&
      parts[0] == 'workspace' &&
      parts[1] == 'attendance' &&
      parts[2] == 'records') {
    return '/workspace/attendance';
  }
  return null;
}

/// One destination rendered by [ZPillBottomNavigation].
@immutable
class ZNavDestination {
  const ZNavDestination({
    required this.path,
    required this.label,
    required this.icon,
  });

  final String path;
  final String label;
  final IconData icon;
}

/// Floating stadium bottom navigation shared by the adviser and the ADM
/// coordinator workspaces. One implementation keeps both desks identical.
class ZPillBottomNavigation extends StatelessWidget {
  const ZPillBottomNavigation({
    super.key,
    required this.destinations,
    required this.selectedPath,
    this.rerouteOnSelect = false,
    this.keyPrefix = 'nav',
    this.trailing,
  });

  final List<ZNavDestination> destinations;
  final String selectedPath;

  /// Detail screens reuse this bar while showing an area's destination as
  /// selected; tapping it must still return to that destination's page.
  final bool rerouteOnSelect;

  /// Test/preview keys: `<keyPrefix>-nav-bar`, `<keyPrefix>-nav-<label>`.
  final String keyPrefix;

  /// Optional circular action rendered beside the stadium (staff Bama desk).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final light = Theme.of(context).brightness == Brightness.light;
    final activeColor = light
        ? const Color(0xFFF28C00)
        : const Color(0xFFFFB900);
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
                  key: ValueKey('$keyPrefix-nav-bar'),
                  color: colors.surface,
                  elevation: 12,
                  shadowColor: Colors.black.withValues(
                    alpha: light ? 0.08 : 0.4,
                  ),
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
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (final destination in destinations)
                              Expanded(
                                child: Semantics(
                                  selected: selectedPath == destination.path,
                                  button: true,
                                  child: Tooltip(
                                    message: destination.label,
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(80),
                                      key: ValueKey(
                                        '$keyPrefix-nav-${destination.label}',
                                      ),
                                      onTap: () {
                                        if (rerouteOnSelect ||
                                            selectedPath != destination.path) {
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
                                            padding: EdgeInsets.symmetric(
                                              horizontal: 6,
                                              vertical:
                                                  MediaQuery.textScalerOf(
                                                        context,
                                                      ).scale(9) >
                                                      12
                                                  ? 0
                                                  : 2,
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
                                              size: 20,
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
              if (trailing != null) ...[const SizedBox(width: 10), trailing!],
            ],
          ),
        ),
      ),
    );
  }
}

/// Teacher bottom navigation shared by advisers and subject teachers.
/// Drawer-only desks deliberately leave all four destinations unselected.
///
/// Advisers also get the circular Chat with Bama button beside the stadium;
/// subject teachers never see it.
class AdviserBottomNavigation extends StatelessWidget {
  const AdviserBottomNavigation({
    super.key,
    required this.selectedPath,
    this.rerouteOnSelect = false,
    this.isAdviser = false,
  });

  final String selectedPath;
  final bool rerouteOnSelect;
  final bool isAdviser;

  @override
  Widget build(BuildContext context) {
    final bar = ZPillBottomNavigation(
      destinations: [
        for (final destination in _adviserDestinations)
          ZNavDestination(
            path: destination.path,
            label: destination.label,
            icon: destination.icon,
          ),
      ],
      selectedPath: selectedPath,
      rerouteOnSelect: rerouteOnSelect,
      keyPrefix: 'adviser',
      trailing: isAdviser
          ? _BamaNavButton(selected: selectedPath.startsWith('/adviser/bama'))
          : null,
    );
    return ValueListenableBuilder<bool>(
      valueListenable: staffNavBarHidden,
      builder: (context, hidden, child) =>
          hidden ? const SizedBox.shrink() : child!,
      child: bar,
    );
  }
}

/// Circular special destination beside the stadium bar: Chat with Bama.
/// Advisers only; the mascot is the white-background-free artwork.
class _BamaNavButton extends StatelessWidget {
  const _BamaNavButton({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final light = Theme.of(context).brightness == Brightness.light;
    final activeColor = light
        ? const Color(0xFFF28C00)
        : const Color(0xFFFFB900);
    return Semantics(
      button: true,
      selected: selected,
      child: Tooltip(
        message: 'Chat with Bama',
        child: Material(
          key: const ValueKey('adviser-nav-Bama'),
          color: selected
              ? activeColor.withValues(alpha: 0.16)
              : colors.surface,
          elevation: 12,
          shadowColor: Colors.black.withValues(alpha: light ? 0.08 : 0.4),
          shape: CircleBorder(
            side: BorderSide(
              color: selected ? activeColor : colors.outlineVariant,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () {
              if (!selected) context.go('/adviser/bama');
            },
            child: SizedBox(
              width: 60,
              height: 60,
              child: Padding(
                padding: const EdgeInsets.all(5),
                child: ExcludeSemantics(
                  child: Image.asset(
                    'assets/mascots/bama-v2-nobg.png',
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const _coordinatorDestinations = [
  (
    path: '/coordinator/overview',
    label: 'Overview',
    icon: LucideIcons.layoutDashboard,
  ),
  (
    path: '/coordinator/referrals',
    label: 'ADM Cases',
    icon: LucideIcons.folderHeart,
  ),
  (
    path: '/coordinator/enrolled',
    label: 'Enrolled',
    icon: LucideIcons.graduationCap,
  ),
  (path: '/coordinator/files', label: 'Files', icon: LucideIcons.award),
  (path: '/coordinator/devices', label: 'Devices', icon: LucideIcons.tablet),
];

/// ADM coordinator bottom navigation — same pill, destinations and motion as
/// the adviser desk. Settings lives in the account panel instead.
class CoordinatorBottomNavigation extends StatelessWidget {
  const CoordinatorBottomNavigation({super.key, required this.selectedPath});

  final String selectedPath;

  @override
  Widget build(BuildContext context) => Theme(
    // The coordinator pill follows the same appearance mode as its desks.
    data: overviewScreenTheme(Theme.of(context)),
    child: ZPillBottomNavigation(
      destinations: [
        for (final destination in _coordinatorDestinations)
          ZNavDestination(
            path: destination.path,
            label: destination.label,
            icon: destination.icon,
          ),
      ],
      selectedPath: selectedPath,
      keyPrefix: 'coordinator',
    ),
  );
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

/// Student portal bottom navigation (4 destinations).
class StudentBottomNavigation extends StatelessWidget {
  const StudentBottomNavigation({
    super.key,
    required this.selectedPath,
    this.rerouteOnSelect = false,
  });

  final String selectedPath;
  final bool rerouteOnSelect;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final light = Theme.of(context).brightness == Brightness.light;
    final activeColor = light
        ? const Color(0xFFF28C00)
        : const Color(0xFFFFB900);
    final bar = SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Material(
            key: const ValueKey('student-nav-bar'),
            color: colors.surface,
            elevation: 12,
            shadowColor: Colors.black.withValues(alpha: light ? 0.08 : 0.4),
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final destination in _studentDestinations)
                        Expanded(
                          child: Semantics(
                            selected: selectedPath == destination.path,
                            button: true,
                            child: Tooltip(
                              message: destination.label,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(80),
                                key: ValueKey(
                                  'student-nav-${destination.label}',
                                ),
                                onTap: () {
                                  if (rerouteOnSelect ||
                                      selectedPath != destination.path) {
                                    context.go(destination.path);
                                  }
                                },
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    AnimatedContainer(
                                      duration: const Duration(
                                        milliseconds: 150,
                                      ),
                                      padding: EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical:
                                            MediaQuery.textScalerOf(context)
                                                    .scale(9) >
                                                12
                                            ? 0
                                            : 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: selectedPath == destination.path
                                            ? activeColor.withValues(
                                                alpha: 0.16,
                                              )
                                            : Colors.transparent,
                                        borderRadius: BorderRadius.circular(40),
                                      ),
                                      child: Icon(
                                        destination.icon,
                                        size: 20,
                                        applyTextScaling: false,
                                        color: selectedPath == destination.path
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
                                              selectedPath == destination.path
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
      ),
    );
    return bar;
  }
}

/// Parent portal bottom navigation (4 destinations).
class ParentBottomNavigation extends StatelessWidget {
  const ParentBottomNavigation({
    super.key,
    required this.selectedPath,
    this.rerouteOnSelect = false,
  });

  final String selectedPath;
  final bool rerouteOnSelect;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final light = Theme.of(context).brightness == Brightness.light;
    final activeColor = light
        ? const Color(0xFFF28C00)
        : const Color(0xFFFFB900);
    final bar = SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Material(
            key: const ValueKey('parent-nav-bar'),
            color: colors.surface,
            elevation: 12,
            shadowColor: Colors.black.withValues(alpha: light ? 0.08 : 0.4),
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final destination in _parentDestinations)
                        Expanded(
                          child: Semantics(
                            selected: selectedPath == destination.path,
                            button: true,
                            child: Tooltip(
                              message: destination.label,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(80),
                                key: ValueKey(
                                  'parent-nav-${destination.label}',
                                ),
                                onTap: () {
                                  if (rerouteOnSelect ||
                                      selectedPath != destination.path) {
                                    context.go(destination.path);
                                  }
                                },
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    AnimatedContainer(
                                      duration: const Duration(
                                        milliseconds: 150,
                                      ),
                                      padding: EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical:
                                            MediaQuery.textScalerOf(context)
                                                    .scale(9) >
                                                12
                                            ? 0
                                            : 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: selectedPath == destination.path
                                            ? activeColor.withValues(
                                                alpha: 0.16,
                                              )
                                            : Colors.transparent,
                                        borderRadius: BorderRadius.circular(40),
                                      ),
                                      child: Icon(
                                        destination.icon,
                                        size: 20,
                                        applyTextScaling: false,
                                        color: selectedPath == destination.path
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
                                              selectedPath == destination.path
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
      ),
    );
    return bar;
  }
}
