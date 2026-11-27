// Shared full-screen account panel for every staff workspace.
//
// The teacher/adviser shell and the ADM coordinator shell both push this same
// screen, so the profile header, notification previews, preferences and logout
// stay pixel-identical across desks. Each desk supplies its own profile and
// inbox sources through [StaffProfileData]; the presentation is shared.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/notifications.dart';
import '../core/session.dart';
import '../shared/user_messages.dart';
import '../shared/widgets.dart';
import 'brand.dart';
import 'theme_mode.dart' show themeSettingsProvider;
import 'theme_picker.dart';

/// Desk-specific data the shared profile panel renders.
class StaffProfileData {
  const StaffProfileData({
    required this.name,
    required this.photoUrl,
    required this.roleLabel,
    required this.inbox,
    required this.onSeeAll,
    required this.settingsPath,
    required this.notificationTitle,
    required this.notificationTarget,
    required this.emptySubtitle,
  });

  final String name;
  final String? photoUrl;
  final String roleLabel;
  final AsyncValue<List<ZNotification>> inbox;
  final void Function(BuildContext context) onSeeAll;
  final String settingsPath;
  final String Function(ZNotification notification) notificationTitle;
  final String? Function(ZNotification notification) notificationTarget;
  final String emptySubtitle;
}

/// Full-screen account panel (Drive-style): Profile header, notifications with
/// See all, appearance, settings and logout. Close sits top-right.
class StaffProfileScreen extends ConsumerWidget {
  const StaffProfileScreen({super.key, required this.data});

  final StaffProfileData data;

  static String _modeLabel(ThemeMode mode) => switch (mode) {
    ThemeMode.light => 'Light',
    ThemeMode.dark => 'Dark',
    ThemeMode.system => 'System',
  };

  void _openAppearance(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final sheet = dark ? const Color(0xFF121110) : const Color(0xFFF2F0E7);
    final ink = dark ? const Color(0xFFF3F7F5) : const Color(0xFF181B19);
    final chip = dark ? const Color(0xFF22201D) : const Color(0xFFE3E4DF);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: sheet,
      barrierColor: Colors.black.withValues(alpha: 0.68),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      builder: (ctx) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Appearance',
                      style: TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w700,
                        color: ink,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close appearance',
                    onPressed: () => Navigator.pop(ctx),
                    style: IconButton.styleFrom(backgroundColor: chip),
                    icon: Icon(LucideIcons.x, color: ink, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'Choose how the app appears on your device',
                style: TextStyle(fontSize: 14, color: ink),
              ),
              const SizedBox(height: 22),
              WorkspaceThemePicker(onApplied: () => Navigator.pop(ctx)),
            ],
          ),
        ),
      ),
    );
  }

  void _openSettings(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    Navigator.of(context).pop();
    router?.go(data.settingsPath);
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final router = GoRouter.maybeOf(context);
    final navigator = Navigator.of(context);
    await ref.read(authProvider.notifier).logout();
    if (!navigator.mounted) return;
    navigator.pop();
    router?.go('/login');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final inbox = data.inbox;
    final mode = ref.watch(themeSettingsProvider).mode;

    final panelInk = dark ? const Color(0xFFF3F7F5) : const Color(0xFF181B19);
    final panelMuted = dark ? const Color(0xFF99AAA3) : const Color(0xFF707572);
    final panelCanvas = dark
        ? const Color(0xFF050807)
        : const Color(0xFFFAFAF9);
    final panelSurface = dark ? const Color(0xFF0B1411) : Colors.white;
    final panelSoft = dark ? const Color(0xFF101D18) : const Color(0xFFF0F1EF);
    final panelBorder = dark
        ? const Color(0xFF2A3530)
        : const Color(0xFFDDE0DD);
    final panelTheme = theme.copyWith(
      brightness: dark ? Brightness.dark : Brightness.light,
      scaffoldBackgroundColor: panelCanvas,
      colorScheme: dark
          ? ColorScheme.dark(
              primary: const Color(0xFF7EB2FF),
              onPrimary: const Color(0xFF06101F),
              surface: panelSurface,
              onSurface: panelInk,
              onSurfaceVariant: panelMuted,
              surfaceContainerLow: panelSoft,
              outline: panelBorder,
              outlineVariant: panelBorder,
              error: const Color(0xFFFF6467),
            )
          : ColorScheme.light(
              primary: const Color(0xFF2563EB),
              surface: panelSurface,
              onSurface: panelInk,
              onSurfaceVariant: panelMuted,
              surfaceContainerLow: panelSoft,
              outline: panelBorder,
              outlineVariant: panelBorder,
              error: const Color(0xFFBE3545),
            ),
      textTheme: theme.textTheme.apply(
        bodyColor: panelInk,
        displayColor: panelInk,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: panelCanvas,
        foregroundColor: panelInk,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      cardTheme: CardThemeData(
        color: panelSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: panelBorder),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: panelBorder,
        space: 1,
        thickness: 1,
      ),
      listTileTheme: ListTileThemeData(
        minTileHeight: 48,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12),
        horizontalTitleGap: 12,
        minVerticalPadding: 8,
        textColor: panelInk,
        iconColor: panelInk,
        shape: const StadiumBorder(),
      ),
    );
    return Theme(
      data: panelTheme,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const Text(
            'Profile',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          ),
          actionsPadding: const EdgeInsets.only(right: 12),
          actions: [
            IconButton(
              key: const ValueKey('profile-close'),
              tooltip: 'Close',
              style: IconButton.styleFrom(
                side: BorderSide(
                  color: dark ? panelBorder : const Color(0xFFE5E8F0),
                ),
                minimumSize: const Size(42, 42),
                shape: const CircleBorder(),
              ),
              icon: const Icon(LucideIcons.x, size: 20),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
        body: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: (constraints.maxHeight - 24).clamp(
                  0,
                  double.infinity,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ZCard(
                    key: const ValueKey('profile-identity'),
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        TeacherAvatar(photoUrl: data.photoUrl, radius: 28),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                data.name,
                                style: const TextStyle(
                                  fontSize: 19,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Container(
                                margin: const EdgeInsets.only(top: 4),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: dark
                                      ? const Color(0x292B7FFF)
                                      : const Color(0xFFDBEAFE),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  data.roleLabel,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: dark
                                        ? const Color(0xFF8FB6F5)
                                        : const Color(0xFF2563EB),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Icon(LucideIcons.bell, size: 20),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Notifications',
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      TextButton(
                        key: const ValueKey('profile-see-all'),
                        onPressed: () => data.onSeeAll(context),
                        child: const Text(
                          'See all',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  inbox.when(
                    loading: () => const SizedBox(
                      height: 160,
                      child: ZSkeletonList(count: 2),
                    ),
                    error: (e, _) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        userMessage(e),
                        style: panelTheme.textTheme.bodySmall,
                      ),
                    ),
                    data: (items) {
                      if (items.isEmpty) {
                        return ZEmpty(
                          icon: LucideIcons.bell,
                          title: 'No notifications yet',
                          subtitle: data.emptySubtitle,
                          compact: true,
                        );
                      }
                      return Column(
                        children: [
                          for (final n in items.take(3))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _StaffProfileNotificationTile(
                                notification: n,
                                data: data,
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Row(
                      children: [
                        Icon(LucideIcons.slidersHorizontal, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Preferences',
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  ZCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        ListTile(
                          onTap: () => _openAppearance(context),
                          leading: const Icon(LucideIcons.sun, size: 20),
                          title: const Text(
                            'Appearance',
                            style: TextStyle(fontSize: 14),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _modeLabel(mode),
                                style: TextStyle(
                                  fontSize: 12,
                                  color: panelMuted,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Icon(LucideIcons.chevronRight, size: 18),
                            ],
                          ),
                        ),
                        const Divider(),
                        ListTile(
                          onTap: () => _openSettings(context),
                          leading: const Icon(LucideIcons.settings, size: 20),
                          title: const Text(
                            'Settings',
                            style: TextStyle(fontSize: 14),
                          ),
                          trailing: const Icon(
                            LucideIcons.chevronRight,
                            size: 18,
                          ),
                        ),
                        const Divider(),
                        ListTile(
                          key: const ValueKey('profile-logout'),
                          onTap: () => _logout(context, ref),
                          leading: const Icon(LucideIcons.logOut, size: 20),
                          title: const Text(
                            'Logout',
                            style: TextStyle(fontSize: 14),
                          ),
                          trailing: const Icon(
                            LucideIcons.chevronRight,
                            size: 18,
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
      ),
    );
  }
}

/// Compact inbox row used inside the account panel. Tapping marks the update
/// read and opens its destination, matching the full notifications sheet.
class _StaffProfileNotificationTile extends ConsumerWidget {
  final ZNotification notification;
  final StaffProfileData data;
  const _StaffProfileNotificationTile({
    required this.notification,
    required this.data,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = notification;
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        cardTheme: theme.cardTheme.copyWith(
          color: theme.colorScheme.surfaceContainerLow,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      child: ZCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        onTap: () async {
          if (!n.isRead) {
            try {
              await markNotificationRead(ref, n.id);
            } catch (_) {}
          }
          final target = data.notificationTarget(n);
          if (!context.mounted) return;
          if (target != null) {
            final router = GoRouter.of(context);
            Navigator.of(context).pop();
            router.go(target);
          } else {
            // No mobile destination for this update: open the dedicated
            // notifications screen so the full notice stays readable.
            data.onSeeAll(context);
          }
        },
        child: Row(
          children: [
            if (!n.isRead)
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: theme.colorScheme.primary,
                ),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data.notificationTitle(n),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    n.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    formatBellDate(n.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
