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
import '../../design/theme.dart' show zLightTheme;
import '../../shared/widgets.dart';
import 'coordinator_data.dart';
import 'coordinator_notifications.dart';
import 'coordinator_widgets.dart';

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
    final headerTheme = overviewScreenTheme(zLightTheme()).copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: Color(0xFF242B42),
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
                      bottom: const PreferredSize(
                        preferredSize: Size.fromHeight(1),
                        child: Divider(height: 1, color: Color(0xFFEDF0F6)),
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
    // Match the light header: the search text and its clear control must use
    // the adviser's light ink, not the ambient dark workspace text.
    final theme = overviewScreenTheme(zLightTheme());
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(999),
      borderSide: const BorderSide(color: Color(0xFFDDE2EE)),
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
            hintStyle: const TextStyle(color: Color(0xFF626B82), fontSize: 14),
            prefixIconColor: const Color(0xFF242B42),
            isDense: true,
            filled: true,
            fillColor: const Color(0xFFF3F5FA),
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
    final theme = overviewScreenTheme(zLightTheme());
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
    final base = zLightTheme();
    final drawerTheme = base.copyWith(
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: Color(0xFFB45309),
        surface: Color(0xFFFAFAF9),
        onSurface: Color(0xFF181B19),
        onSurfaceVariant: Color(0xFF707572),
        outline: Color(0xFFDDE0DD),
        outlineVariant: Color(0xFFDDE0DD),
        surfaceContainerLow: Color(0xFFF0F1EF),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: const Color(0xFF181B19),
        displayColor: const Color(0xFF181B19),
      ),
    );
    return Theme(
      data: drawerTheme,
      child: Drawer(
        backgroundColor: const Color(0xFFFAFAF9),
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
                      leading: const CircleAvatar(
                        radius: 21,
                        backgroundColor: Color(0xFFDBEAFE),
                        child: Icon(
                          LucideIcons.userRound,
                          size: 20,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                      title: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF181B19),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: const Text(
                        'ADM Coordinator',
                        style: TextStyle(
                          color: Color(0xFF707572),
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0F1EF),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.lock_clock_outlined,
                            size: 18,
                            color: Color(0xFF707572),
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'School-managed scope. The active term is resolved by the server; case and device records may span terms.',
                              style: TextStyle(
                                fontSize: 12,
                                height: 1.4,
                                color: Color(0xFF707572),
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
                    const Divider(color: Color(0xFFDDE0DD)),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFD9E6FC),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            LucideIcons.briefcaseBusiness,
                            size: 18,
                            color: Color(0xFF1855B5),
                          ),
                          SizedBox(width: 8),
                          Text(
                            'ADM workspace',
                            style: TextStyle(
                              color: Color(0xFF1855B5),
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
            backgroundColor: const Color(0xFF2442A8),
            textColor: Colors.white,
            isLabelVisible: unread > 0,
            label: Text(unread > 99 ? '99+' : '$unread'),
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFE5E8F0)),
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
