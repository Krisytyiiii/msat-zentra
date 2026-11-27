// ADM coordinator workspace shell.
//
// Reuses the adviser desk chrome: white search/avatar header, the same
// floating pill bottom navigation and the same account panel. The header,
// search results and pill use the adviser Overview's light palette on every
// desk. Navigation lives in the bottom bar; Settings opens from the account
// panel.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/adviser_navigation.dart';
import '../../design/brand.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/shell.dart' show staffNavigationHiddenProvider;
import '../../design/staff_profile.dart';
import '../../shared/widgets.dart';
import 'coordinator_data.dart';
import 'coordinator_notifications.dart';
import 'coordinator_widgets.dart';
import '../../design/desk_theme.dart';

/// Searchable desks. Settings is deliberately absent: it lives in the account
/// panel opened from the header avatar.
const coordinatorDestinations = [
  ScreenSearchDestination(
    'Overview',
    '/coordinator/overview',
    Icons.dashboard_outlined,
  ),
  ScreenSearchDestination(
    'ADM Cases',
    '/coordinator/referrals',
    Icons.folder_shared_outlined,
  ),
  ScreenSearchDestination(
    'Enrolled',
    '/coordinator/enrolled',
    Icons.school_outlined,
  ),
  ScreenSearchDestination(
    'Files',
    '/coordinator/files',
    Icons.folder_open_outlined,
  ),
  ScreenSearchDestination(
    'Devices',
    '/coordinator/devices',
    Icons.devices_outlined,
  ),
];

class CoordinatorShell extends ConsumerStatefulWidget {
  const CoordinatorShell({super.key, required this.path, required this.child});
  final String path;
  final Widget child;
  @override
  ConsumerState<CoordinatorShell> createState() => _CoordinatorShellState();
}

class _CoordinatorShellState extends ConsumerState<CoordinatorShell>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorShell> {
  final _search = ScreenSearchController();
  final _text = TextEditingController();
  final _focus = FocusNode();
  @override
  Future<void> reload() async =>
      ref.refresh(coordinatorInboxProvider.future).then((_) {});

  @override
  void initState() {
    super.initState();
    _search.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(CoordinatorShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.path != widget.path) {
      _clearSearch();
    }
  }

  void _clearSearch() {
    _text.clear();
    _search.resetSilently();
    _focus.unfocus();
  }

  @override
  void dispose() {
    _search.removeListener(_onSearchChanged);
    _text.dispose();
    _focus.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Rebuild the whole desk on an account hand-off; no previous session data.
    final auth = ref.watch(authProvider);
    if (!auth.loggedIn || auth.role != 'adm_coordinator') {
      return const Scaffold(
        body: Center(child: Text('ADM coordinator access required.')),
      );
    }
    final spec = screenSearchSpecFor(widget.path);
    final profile = ref.watch(coordinatorProfileProvider).asData?.value;
    final name = profile?['fullName']?.toString() ?? 'ADM Coordinator';
    // The header is always the adviser desk's white tool bar, scoped here so
    // the dark coordinator content keeps its own palette.
    // The header is light on every desk, so build it from the same light
    // palette the adviser Overview uses. Deriving it from the dark login
    // workspace left icon buttons, hover fills and the search cursor dark.
    final headerBase = overviewScreenTheme(Theme.of(context));
    final headerDark = headerBase.brightness == Brightness.dark;
    final headerTheme = headerBase.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: headerDark
            ? headerBase.colorScheme.surface
            : Colors.white,
        foregroundColor: headerDark
            ? headerBase.colorScheme.onSurface
            : zInk(context),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 72,
      ),
    );
    final query = _search.query.trim().toLowerCase();
    final isSettings = widget.path == '/coordinator/settings';
    final isOverview = widget.path == '/coordinator/overview';
    final showBottomBar =
        !isSettings && !ref.watch(staffNavigationHiddenProvider);
    final showingPages =
        spec.mode == ScreenSearchMode.pages && query.isNotEmpty;
    final destinations = showingPages
        ? [
            for (final d in coordinatorDestinations)
              if (d.label.toLowerCase().contains(query) ||
                  d.path.toLowerCase().contains(query))
                d,
          ]
        : const <ScreenSearchDestination>[];

    return Theme(
      // The Overview desk shares the adviser overview's light palette,
      // including the floating bottom navigation; other desks stay dark.
      // Use a light base explicitly: the coordinator root is always wrapped in
      // the dark workspace theme, so deriving from it painted the overview
      // canvas black even when the app appearance was light.
      data: isOverview
          ? overviewScreenTheme(Theme.of(context))
          : Theme.of(context),
      child: ScreenSearchScope(
        controller: _search,
        child: Scaffold(
          // The adviser desk floats its pill navigation over the scroll
          // content; keep the same overlay behavior here (pages keep bottom
          // clearance). Half-height detail sheets hide it, like referrals.
          extendBody: showBottomBar,
          appBar: isSettings
              ? null
              : PreferredSize(
                  preferredSize: const Size.fromHeight(73),
                  child: Theme(
                    data: headerTheme,
                    child: AppBar(
                      titleSpacing: 0,
                      leadingWidth: 64,
                      leading: const Center(
                        child: ZLogo(
                          key: ValueKey('coordinator-logo'),
                          size: 36,
                          radius: 9,
                        ),
                      ),
                      title: _searchField(context, spec),
                      actions: [_CoordinatorProfileButton(name: name)],
                      bottom: PreferredSize(
                        preferredSize: const Size.fromHeight(1),
                        child: Divider(
                          height: 1,
                          color: headerBase.colorScheme.outline,
                        ),
                      ),
                    ),
                  ),
                ),
          drawer: isSettings ? null : _CoordinatorDrawer(name: name),
          bottomNavigationBar: showBottomBar
              ? CoordinatorBottomNavigation(selectedPath: widget.path)
              : null,
          body: ListenableBuilder(
            listenable: _search,
            builder: (context, _) {
              if (showingPages) {
                return _CoordinatorPageResults(
                  destinations: destinations,
                  onOpen: (path) {
                    _clearSearch();
                    context.go(path);
                  },
                );
              }
              return widget.child;
            },
          ),
        ),
      ),
    );
  }

  Widget _searchField(BuildContext context, ScreenSearchSpec spec) {
    final theme = overviewScreenTheme(Theme.of(context));
    final dark = theme.brightness == Brightness.dark;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(999),
      borderSide: BorderSide(
        color: dark ? theme.colorScheme.outline : const Color(0xFFDDE2EE),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: SizedBox(
        height: 44,
        child: TextField(
          key: const ValueKey('screen-search-field'),
          textAlign: TextAlign.start,
          textAlignVertical: TextAlignVertical.center,
          controller: _text,
          focusNode: _focus,
          textInputAction: TextInputAction.search,
          onChanged: _search.setQuery,
          style: theme.textTheme.bodyMedium,
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search, size: 20),
            hintText: spec.hint,
            hintStyle: TextStyle(
              color: dark
                  ? theme.colorScheme.onSurfaceVariant
                  : zMutedInk(context),
              fontSize: 14,
            ),
            prefixIconColor: dark
                ? theme.colorScheme.onSurfaceVariant
                : zInk(context),
            isDense: true,
            filled: true,
            fillColor: dark
                ? theme.colorScheme.surfaceContainerLow
                : zSoft(context),
            constraints: const BoxConstraints(minHeight: 40),
            contentPadding: const EdgeInsets.symmetric(
              vertical: 8,
              horizontal: 16,
            ),
            suffixIcon: _text.text.isEmpty
                ? null
                : IconButton(
                    key: const ValueKey('screen-search-clear'),
                    icon: const Icon(Icons.close, size: 16),
                    tooltip: 'Clear search',
                    onPressed: () {
                      _clearSearch();
                      _focus.requestFocus();
                    },
                  ),
            suffixIconConstraints: const BoxConstraints(
              minWidth: 36,
              minHeight: 36,
            ),
            border: border,
            enabledBorder: border,
            focusedBorder: border.copyWith(
              borderSide: BorderSide(color: theme.colorScheme.primary),
            ),
          ),
        ),
      ),
    );
  }
}

class _CoordinatorPageResults extends StatelessWidget {
  const _CoordinatorPageResults({
    required this.destinations,
    required this.onOpen,
  });

  final List<ScreenSearchDestination> destinations;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.colorScheme.surface,
        child: destinations.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: ZEmpty(
                    icon: Icons.search_off,
                    title: 'No pages match',
                    subtitle:
                        'Try a menu name such as Cases, Enrolled, or Devices.',
                  ),
                ),
              )
            : ListView(
                key: const ValueKey('screen-search-results'),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
                children: [
                  Text(
                    'PAGES',
                    style: theme.textTheme.labelSmall?.copyWith(
                      letterSpacing: 0.6,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 8),
                  for (final d in destinations)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ZCard(
                        padding: EdgeInsets.zero,
                        onTap: () => onOpen(d.path),
                        child: ListTile(
                          leading: Icon(d.icon, size: 20),
                          title: Text(
                            d.label,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          trailing: const Icon(Icons.chevron_right, size: 18),
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _CoordinatorDrawer extends StatelessWidget {
  const _CoordinatorDrawer({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    final dark = base.brightness == Brightness.dark;
    final surface = dark ? const Color(0xFF0B1411) : const Color(0xFFFAFAF9);
    final ink = dark ? const Color(0xFFF3F7F5) : zInk(context);
    final muted = dark ? const Color(0xFF99AAA3) : zMutedInk(context);
    final border = dark ? const Color(0xFF2A3530) : zLine(context);
    final soft = dark ? const Color(0xFF101D18) : zSoft(context);
    final blue = dark ? const Color(0xFF7EB2FF) : zLift(context, const Color(0xFF2563EB));
    final drawerTheme = base.copyWith(
      brightness: dark ? Brightness.dark : Brightness.light,
      colorScheme: ColorScheme(
        brightness: dark ? Brightness.dark : Brightness.light,
        primary: dark ? blue : zLift(context, const Color(0xFFB45309)),
        onPrimary: dark ? const Color(0xFF06101F) : Colors.white,
        secondary: blue,
        onSecondary: dark ? const Color(0xFF06101F) : Colors.white,
        error: const Color(0xFFFF6467),
        onError: const Color(0xFF2A0507),
        surface: surface,
        onSurface: ink,
        onSurfaceVariant: muted,
        outline: border,
        outlineVariant: border,
        surfaceContainerLow: soft,
      ),
      textTheme: base.textTheme.apply(bodyColor: ink, displayColor: ink),
    );
    return Theme(
      data: drawerTheme,
      child: Drawer(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(right: Radius.circular(20)),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  children: [
                    const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 12,
                      ),
                      child: Row(
                        children: [
                          ZLogo(size: 32, radius: 8),
                          SizedBox(width: 10),
                          Text(
                            'Zentra',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 17,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      leading: CircleAvatar(
                        radius: 21,
                        backgroundColor: dark
                            ? blue.withValues(alpha: 0.18)
                            : zWash(context, const Color(0xFFDBEAFE)),
                        child: Icon(
                          LucideIcons.userRound,
                          size: 20,
                          color: blue,
                        ),
                      ),
                      title: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: ink,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        'ADM Coordinator',
                        style: TextStyle(color: muted, fontSize: 12),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: soft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.lock_clock_outlined,
                            size: 18,
                            color: muted,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'School-managed scope. The active term is resolved by the server; case and device records may span terms.',
                              style: TextStyle(
                                fontSize: 12,
                                height: 1.4,
                                color: muted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  children: [
                    Divider(color: border),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: dark
                            ? blue.withValues(alpha: 0.16)
                            : zWash(context, const Color(0xFFD9E6FC)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            LucideIcons.briefcaseBusiness,
                            size: 18,
                            color: dark
                                ? const Color(0xFFA9C9FF)
                                : zLift(context, const Color(0xFF1855B5)),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'ADM workspace',
                            style: TextStyle(
                              color: dark
                                  ? const Color(0xFFA9C9FF)
                                  : zLift(context, const Color(0xFF1855B5)),
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CoordinatorProfileButton extends ConsumerWidget {
  const _CoordinatorProfileButton({required this.name});

  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref
        .watch(coordinatorInboxProvider)
        .maybeWhen(
          data: (items) => items.where((n) => !n.isRead).length,
          orElse: () => 0,
        );
    final photoUrl = ref
        .watch(coordinatorProfileProvider)
        .maybeWhen(data: (p) => p['photoUrl']?.toString(), orElse: () => null);
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Tooltip(
        message: 'Profile',
        child: InkWell(
          key: const ValueKey('profile-avatar'),
          borderRadius: BorderRadius.circular(999),
          onTap: () => showCoordinatorProfile(context),
          child: Badge(
            backgroundColor: zLift(context, const Color(0xFF2442A8)),
            textColor: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF06101F)
                : Colors.white,
            isLabelVisible: unread > 0,
            label: Text(unread > 99 ? '99+' : '$unread'),
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: zLine(context)),
              ),
              child: TeacherAvatar(photoUrl: photoUrl, radius: 16),
            ),
          ),
        ),
      ),
    );
  }
}

/// Full-screen account panel matching the adviser desk: identity, updates,
/// appearance, Settings and Logout.
void showCoordinatorProfile(BuildContext context) {
  Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => const _CoordinatorProfileScreen(),
    ),
  );
}

class _CoordinatorProfileScreen extends ConsumerWidget {
  const _CoordinatorProfileScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(coordinatorProfileProvider);
    return StaffProfileScreen(
      data: StaffProfileData(
        name: profile.maybeWhen(
          data: (p) => p['fullName']?.toString() ?? 'ADM Coordinator',
          orElse: () => 'ADM Coordinator',
        ),
        photoUrl: profile.maybeWhen(
          data: (p) => p['photoUrl']?.toString(),
          orElse: () => null,
        ),
        roleLabel: 'ADM Coordinator',
        inbox: ref.watch(coordinatorInboxProvider),
        onSeeAll: (ctx) {
          final router = GoRouter.maybeOf(ctx);
          Navigator.of(ctx).pop();
          router?.push('/coordinator/notifications');
        },
        settingsPath: '/coordinator/settings',
        notificationTitle: coordinatorNotificationTitle,
        notificationTarget: coordinatorNotificationTarget,
        emptySubtitle: 'Case updates, meetings and device notices appear here.',
      ),
    );
  }
}
