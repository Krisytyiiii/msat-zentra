// Zentra app shell — adviser bottom navigation + secondary drawer destinations.
// Header mirrors the Drive app: [≡] · rounded search field · profile avatar.
// Branding and the screen list live in the drawer; the profile avatar opens a
// full-screen account panel (notifications, appearance, settings, logout).
// Search is contextual: desks with a filterable list consume the shared
// query (hiding their inline field), every other desk opens a page finder.
// Drawer: brand → term switcher dropdown → Advisory → Workspace.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/notifications.dart';
import '../core/session.dart';
import '../core/sync_outbox.dart';
import '../features/adviser/adm_cases_page.dart' show admCasesProvider;
import '../features/adviser/advisory_list_page.dart'
    show advisoryProvider, archivedAdvisoryProvider;
import '../features/home/role_home.dart' show AdviserRoute, WorkspaceRoute;
import '../features/settings/settings_data.dart' show teacherProfileProvider;
import '../shared/models.dart' show Term;
import '../shared/widgets.dart';
import '../shared/user_messages.dart';
import 'brand.dart';
import 'adviser_navigation.dart';
import 'screen_search.dart';
import 'settings_theme.dart';
import 'theme_mode.dart' show themeSettingsProvider;
import 'theme_picker.dart';

class ZentraShell extends ConsumerStatefulWidget {
  final Widget child;
  final String selectedPath;

  /// Test/preview override; production resolves from the matched route.
  final ScreenSearchSpec? spec;

  const ZentraShell({
    super.key,
    required this.child,
    required this.selectedPath,
    this.spec,
  });

  @override
  ConsumerState<ZentraShell> createState() => _ZentraShellState();
}

class _ZentraShellState extends ConsumerState<ZentraShell> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  final _search = ScreenSearchController();
  String _location = '';

  @override
  void initState() {
    super.initState();
    // The shell itself is outside the scope, so listen directly for query
    // changes that must swap the body (page finder, clear button).
    _search.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _search.removeListener(_onSearchChanged);
    _text.dispose();
    _focus.dispose();
    _search.dispose();
    super.dispose();
  }

  /// One query per desk: moving away clears search without notifying
  /// listeners in the middle of a build.
  void _syncLocation(String location) {
    if (_location == location) return;
    _location = location;
    _text.clear();
    _search.resetSilently();
    if (_focus.hasFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focus.unfocus();
      });
    }
  }

  void _clearQuery() {
    _text.clear();
    _search.clear();
    _focus.requestFocus();
  }

  void _openDestination(String path) {
    _text.clear();
    _search.clear();
    _focus.unfocus();
    context.go(path);
  }

  @override
  Widget build(BuildContext context) {
    final theme = widget.selectedPath == '/teacher/more'
        ? settingsScreenTheme(Theme.of(context))
        : Theme.of(context);
    final router = GoRouter.maybeOf(context);
    final routeState = router == null ? null : GoRouterState.of(context);
    final location = routeState?.matchedLocation ?? widget.selectedPath;
    _syncLocation(location);
    final spec = widget.spec ?? screenSearchSpecFor(location, routeState?.uri);
    final isAdviser = ref
        .watch(overviewProvider)
        .maybeWhen(
          data: (d) => d['isAdviser'] == true,
          orElse: () => ref.read(authProvider).role == 'adviser',
        );
    final query = _search.query.trim().toLowerCase();
    final showingPages =
        spec.mode == ScreenSearchMode.pages && query.isNotEmpty;
    final destinations = showingPages
        ? [
            for (final d in screenSearchCatalog(isAdviser: isAdviser))
              if (d.label.toLowerCase().contains(query) ||
                  d.path.toLowerCase().contains(query))
                d,
          ]
        : const <ScreenSearchDestination>[];

    final showBottomNavigation = isAdviser && location != '/teacher/more';
    return Theme(
      data: theme,
      child: ScreenSearchScope(
        controller: _search,
        child: Scaffold(
          extendBody: showBottomNavigation,
          appBar: AppBar(
            titleSpacing: 0,
            leading: location == '/adviser/bama' && (router?.canPop() ?? false)
                ? IconButton(
                    tooltip: 'Back',
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => router!.pop(),
                  )
                : Builder(
                    builder: (ctx) => IconButton(
                      icon: const Icon(Icons.menu),
                      tooltip: 'Menu',
                      onPressed: () => Scaffold.of(ctx).openDrawer(),
                    ),
                  ),
            // Drive-style header: the search field owns the middle lane.
            title: _searchField(context, spec),
            actions: const [_ProfileButton()],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Divider(height: 1, color: theme.colorScheme.outline),
            ),
          ),
          drawer: ZentraDrawer(selectedPath: widget.selectedPath),
          bottomNavigationBar: showBottomNavigation
              ? AdviserBottomNavigation(selectedPath: location)
              : null,
          body: AdviserBamaAccess(
            enabled: isAdviser && !location.startsWith('/adviser/bama'),
            child: Stack(
              children: [
                Positioned.fill(
                  child: ExcludeFocus(
                    excluding: showingPages,
                    child: widget.child,
                  ),
                ),
                if (showingPages)
                  Positioned.fill(
                    child: _PageSearchResults(
                      destinations: destinations,
                      onOpen: _openDestination,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _searchField(BuildContext context, ScreenSearchSpec spec) {
    final theme = widget.selectedPath == '/teacher/more'
        ? settingsScreenTheme(Theme.of(context))
        : Theme.of(context);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(999),
      borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
    );
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: SizedBox(
        height: 40,
        child: TextField(
          key: const ValueKey('screen-search-field'),
          textAlign: TextAlign.center,
          textAlignVertical: TextAlignVertical.center,
          controller: _text,
          focusNode: _focus,
          textInputAction: TextInputAction.search,
          onChanged: _search.setQuery,
          style: theme.textTheme.bodyMedium,
          decoration: InputDecoration(
            hintText: spec.hint,
            isDense: true,
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerLow,
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
                    onPressed: _clearQuery,
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

class _PageSearchResults extends StatelessWidget {
  const _PageSearchResults({required this.destinations, required this.onOpen});

  final List<ScreenSearchDestination> destinations;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ColoredBox(
      color: theme.colorScheme.surface,
      child: destinations.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.search_off,
                      size: 32,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'No pages match',
                      style: theme.textTheme.titleSmall,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Try a menu name such as Academic, Attendance, or Referrals.',
                      style: theme.textTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              key: const ValueKey('screen-search-results'),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
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
    );
  }
}

class ZentraDrawer extends ConsumerWidget {
  final String selectedPath;
  const ZentraDrawer({super.key, required this.selectedPath});

  bool _selected(String path) =>
      selectedPath == path || selectedPath.startsWith('$path/');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(overviewProvider);
    final isAdviser = overview.maybeWhen(
      data: (d) => d['isAdviser'] == true,
      orElse: () => ref.read(authProvider).role == 'adviser',
    );
    final profile = ref.watch(teacherProfileProvider);
    final base = Theme.of(context);
    final drawerTheme = base.copyWith(
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: Color(0xFF1855B5),
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
                    const ZTermSwitcher(),
                    const SizedBox(height: 4),
                    if (!isAdviser)
                      _item(
                        context,
                        Icons.dashboard_outlined,
                        'Overview',
                        '/workspace/overview',
                        _selected('/workspace/overview'),
                      ),
                    if (isAdviser) ...[
                      const _DrawerHeader('Advisory'),
                      _item(
                        context,
                        LucideIcons.heart,
                        'Interventions',
                        '/adviser/interventions',
                        _selected('/adviser/interventions'),
                      ),
                      _item(
                        context,
                        LucideIcons.users,
                        'Advisory list',
                        '/adviser/advisory',
                        _selected('/adviser/advisory') &&
                            !_selected('/adviser/advisory/attendance'),
                      ),
                      _item(
                        context,
                        LucideIcons.clipboardCheck,
                        'Advisory attendance',
                        '/adviser/advisory/attendance',
                        _selected('/adviser/advisory/attendance'),
                      ),
                      _item(
                        context,
                        LucideIcons.graduationCap,
                        'Academic',
                        '/adviser/academic',
                        _selected('/adviser/academic'),
                      ),
                      _item(
                        context,
                        LucideIcons.folderHeart,
                        'ADM cases',
                        '/adviser/adm-cases',
                        _selected('/adviser/adm-cases'),
                      ),
                      _item(
                        context,
                        LucideIcons.notebookPen,
                        'Anecdotal',
                        '/adviser/anecdotal',
                        _selected('/adviser/anecdotal'),
                      ),
                      _item(
                        context,
                        LucideIcons.calendarDays,
                        'Class Schedule',
                        '/adviser/schedule',
                        _selected('/adviser/schedule') ||
                            _selected('/workspace/schedule'),
                      ),
                      _item(
                        context,
                        LucideIcons.send,
                        'Referrals',
                        '/adviser/referrals',
                        _selected('/adviser/referrals'),
                      ),
                    ],
                    if (!isAdviser) ...[
                      const _DrawerHeader('Workspace'),
                      _item(
                        context,
                        Icons.class_outlined,
                        'Class',
                        '/workspace/classes',
                        _selected('/workspace/classes'),
                      ),
                      _item(
                        context,
                        Icons.grade_outlined,
                        'Gradebook',
                        '/workspace/gradebook',
                        _selected('/workspace/gradebook'),
                      ),
                      _item(
                        context,
                        Icons.fact_check_outlined,
                        'Attendance',
                        '/workspace/attendance',
                        _selected('/workspace/attendance'),
                      ),
                    ],
                    if (!isAdviser)
                      _item(
                        context,
                        Icons.calendar_month_outlined,
                        'My schedule',
                        '/workspace/schedule',
                        _selected('/workspace/schedule'),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  children: [
                    const Divider(color: Color(0xFFDDE0DD)),
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      leading: TeacherAvatar(
                        photoUrl: profile.maybeWhen(
                          data: (p) => p.photoUrl,
                          orElse: () => null,
                        ),
                        radius: 21,
                      ),
                      title: Text(
                        profile.maybeWhen(
                          data: (p) => p.fullName,
                          orElse: () => 'Account',
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF181B19),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        isAdviser ? 'Adviser' : 'Subject teacher',
                        style: const TextStyle(
                          color: Color(0xFF707572),
                          fontSize: 12,
                        ),
                      ),
                    ),
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
                            'Staff workspace',
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

  static Widget _item(
    BuildContext context,
    IconData icon,
    String label,
    String path,
    bool selected,
  ) {
    const blue = Color(0xFF1855B5);
    return ListTile(
      minTileHeight: 48,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      horizontalTitleGap: 12,
      iconColor: const Color(0xFF181B19),
      textColor: const Color(0xFF181B19),
      leading: Icon(icon, size: 20),
      title: Text(
        label,
        style: TextStyle(
          fontSize: 14,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
        ),
      ),
      selected: selected,
      selectedColor: blue,
      selectedTileColor: const Color(0xFFD9E6FC),
      shape: const StadiumBorder(),
      onTap: () {
        Navigator.pop(context);
        context.go(path);
      },
    );
  }
}

/// Active school year and term; opens the shared sign-in term selection screen.
class ZTermSwitcher extends ConsumerWidget {
  const ZTermSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final term = ref.watch(termProvider);
    final pending = ref.watch(outboxProvider).pendingCount;
    final label = term == null
        ? 'Select term'
        : '${term.schoolYearName} · Term ${term.termNumber}${pending > 0 ? ' · $pending queued' : ''}';
    return Card(
      margin: EdgeInsets.zero,
      color: const Color(0xFFF0F1EF),
      elevation: 0,
      shape: const StadiumBorder(),
      child: InkWell(
        borderRadius: BorderRadius.circular(40),
        onTap: () {
          Scaffold.maybeOf(context)?.closeDrawer();
          context.go('/term');
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(
                LucideIcons.calendarDays,
                size: 20,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(
                LucideIcons.chevronRight,
                size: 20,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void showZTermPicker(BuildContext context, WidgetRef ref) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      builder: (_, scroll) {
        final years = ref.watch(schoolYearsProvider);
        final current = ref.watch(termProvider);
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Select term',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 2),
              Text(
                'Choose which term your workspace will display.',
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Expanded(
                child: years.when(
                  loading: () => const Center(child: Text('Loading…')),
                  error: (e, _) => Center(child: Text(userMessage(e))),
                  data: (list) {
                    if (list.isEmpty) {
                      return const Center(
                        child: Text(
                          'No school years found. Ask the Principal to create one.',
                        ),
                      );
                    }
                    return ListView.builder(
                      controller: scroll,
                      itemCount: list
                          .expand((sy) => sy.terms.map((t) => (sy, t)))
                          .length,
                      itemBuilder: (context, i) {
                        final pairs = list
                            .expand((sy) => sy.terms.map((t) => (sy, t)))
                            .toList();
                        final (sy, t) = pairs[i];
                        final isCurrent = current?.id == t.id;
                        final isDefault = sy.isActive && t.termNumber == 1;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            dense: true,
                            title: Text(
                              '${sy.name} — Term ${t.termNumber}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: sy.isActive
                                ? const Text(
                                    'Active school year',
                                    style: TextStyle(fontSize: 12),
                                  )
                                : null,
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (isDefault) const Icon(Icons.star, size: 16),
                                if (isCurrent)
                                  const Icon(Icons.check, size: 18),
                              ],
                            ),
                            onTap: () async {
                              await ref
                                  .read(termProvider.notifier)
                                  .select(
                                    Term(
                                      id: t.id,
                                      schoolYearId: sy.id,
                                      schoolYearName: sy.name,
                                      termNumber: t.termNumber,
                                    ),
                                  );
                              ref.invalidate(overviewProvider);
                              ref.invalidate(advisoryProvider);
                              ref.invalidate(archivedAdvisoryProvider);
                              ref.invalidate(admCasesProvider);
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

// Route-location helpers so shells/drawer highlight without prop drilling.
extension AdviserRouteLocation on AdviserRoute {
  String get path => switch (this) {
    AdviserRoute.interventions => '/adviser/interventions',
    AdviserRoute.advisory => '/adviser/advisory',
    AdviserRoute.advisoryAttendance => '/adviser/advisory/attendance',
    AdviserRoute.academic => '/adviser/academic',
    AdviserRoute.admCases => '/adviser/adm-cases',
    AdviserRoute.anecdotal => '/adviser/anecdotal',
    AdviserRoute.schedule => '/adviser/schedule',
    AdviserRoute.bama => '/adviser/bama',
    AdviserRoute.referrals => '/adviser/referrals',
  };
}

extension WorkspaceRouteLocation on WorkspaceRoute {
  String get path => switch (this) {
    WorkspaceRoute.overview => '/workspace/overview',
    WorkspaceRoute.classes => '/workspace/classes',
    WorkspaceRoute.gradebook => '/workspace/gradebook',
    WorkspaceRoute.attendance => '/workspace/attendance',
    WorkspaceRoute.schedule => '/workspace/schedule',
    WorkspaceRoute.more => '/teacher/more',
  };
}

class _DrawerHeader extends StatelessWidget {
  final String label;
  const _DrawerHeader(this.label);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
    child: Row(
      children: [
        Text(
          label.toUpperCase(),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontSize: 11,
            letterSpacing: 0.8,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(width: 12),
        const Expanded(child: Divider(color: Color(0xFFDDE0DD))),
      ],
    ),
  );
}

void showZNotifications(BuildContext context, WidgetRef ref) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      builder: (_, scroll) {
        final inbox = ref.watch(notificationsProvider);
        final overview = ref.watch(overviewProvider);
        final isAdviser = overview.maybeWhen(
          data: (d) => d['isAdviser'] == true,
          orElse: () => ref.read(authProvider).role == 'adviser',
        );
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Notifications',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      try {
                        await markAllNotificationsRead(ref);
                      } catch (e) {
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(userMessage(e))),
                          );
                        }
                      }
                    },
                    child: const Text(
                      'Mark all read',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: inbox.when(
                  loading: () => const ZSkeletonList(),
                  error: (e, _) => Center(
                    child: Text(
                      userMessage(e),
                      style: Theme.of(ctx).textTheme.bodySmall,
                    ),
                  ),
                  data: (items) {
                    if (items.isEmpty) {
                      return const ZEmpty(
                        icon: Icons.notifications_outlined,
                        title: 'No notifications yet',
                        subtitle: 'Referral updates, absent alerts, and meeting reminders appear here.',
                      );
                    }
                    return ListView.separated(
                      controller: scroll,
                      itemCount: items.length,
                      separatorBuilder: (context, _) =>
                          const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final n = items[i];
                        return ZCard(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          onTap: () async {
                            if (!n.isRead) {
                              try {
                                await markNotificationRead(ref, n.id);
                              } catch (_) {}
                            }
                            final target = teacherNotificationTarget(
                              n,
                              isAdviser: isAdviser,
                            );
                            if (ctx.mounted) Navigator.pop(ctx);
                            if (target != null) {
                              if (context.mounted) context.go(target);
                            } else if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'This update is available on the Zentra website. Open Zentra in your browser to view it.',
                                  ),
                                ),
                              );
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
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface,
                                  ),
                                ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      teacherNotificationTitle(n),
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
                                      style: Theme.of(ctx).textTheme.bodySmall,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      formatBellDate(n.createdAt),
                                      style: Theme.of(ctx).textTheme.bodySmall
                                          ?.copyWith(
                                            fontFeatures: const [
                                              FontFeature.tabularFigures(),
                                            ],
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

/// Header avatar — opens the full-screen account panel. The unread badge
/// keeps the inbox visible now that notifications live inside that panel.
class _ProfileButton extends ConsumerWidget {
  const _ProfileButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref
        .watch(notificationsProvider)
        .maybeWhen(
          data: (items) => items.where((n) => !n.isRead).length,
          orElse: () => 0,
        );
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Tooltip(
        message: 'Profile',
        child: InkWell(
          key: const ValueKey('profile-avatar'),
          borderRadius: BorderRadius.circular(999),
          onTap: () => showZProfile(context, ref),
          child: Badge(
            isLabelVisible: unread > 0,
            label: Text(unread > 99 ? '99+' : '$unread'),
            child: TeacherAvatar(
              photoUrl: ref
                  .watch(teacherProfileProvider)
                  .maybeWhen(data: (p) => p.photoUrl, orElse: () => null),
              radius: 16,
            ),
          ),
        ),
      ),
    );
  }
}

/// Full-screen account panel (Drive-style): Profile header, notifications
/// with See all, appearance, settings and logout. Close sits top-right.
void showZProfile(BuildContext context, WidgetRef ref) {
  Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => const _ProfileScreen(),
    ),
  );
}

class _ProfileScreen extends ConsumerWidget {
  const _ProfileScreen();

  static String _roleLabel(String role) => switch (role) {
    'adviser' => 'Adviser',
    'subject_teacher' => 'Subject Teacher',
    'adm_coordinator' => 'ADM Coordinator',
    'guidance_counselor' => 'Guidance Counselor',
    'record_keeper' => 'Record Keeper',
    'registrar' => 'Registrar',
    'principal' => 'Principal',
    'nurse' => 'Nurse',
    _ => 'Staff',
  };

  static String _modeLabel(ThemeMode mode) => switch (mode) {
    ThemeMode.light => 'Light',
    ThemeMode.dark => 'Dark',
    ThemeMode.system => 'System',
  };

  void _openAppearance(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: const Color(0xFFF2F0E7),
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
                  const Expanded(
                    child: Text(
                      'Appearance',
                      style: TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF181B19),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close appearance',
                    onPressed: () => Navigator.pop(ctx),
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFFE3E4DF),
                    ),
                    icon: const Icon(
                      LucideIcons.x,
                      color: Color(0xFF181B19),
                      size: 20,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'Choose how the app appears on your device',
                style: const TextStyle(fontSize: 14, color: Color(0xFF181B19)),
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
    router?.go('/teacher/more');
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
    final profile = ref.watch(teacherProfileProvider);
    final inbox = ref.watch(notificationsProvider);
    final role = ref.watch(authProvider).role;
    final isAdviser = ref
        .watch(overviewProvider)
        .maybeWhen(
          data: (d) => d['isAdviser'] == true,
          orElse: () => role == 'adviser',
        );
    final mode = ref.watch(themeSettingsProvider).mode;

    final lightTheme = theme.copyWith(
      brightness: Brightness.light,
      scaffoldBackgroundColor: Colors.white,
      colorScheme: const ColorScheme.light(
        primary: Color(0xFF567C8B),
        surface: Colors.white,
        onSurface: Color(0xFF121614),
        onSurfaceVariant: Color(0xFF737975),
        surfaceContainerLow: Color(0xFFECEEF0),
        outline: Color(0xFFE2E4E2),
        outlineVariant: Color(0xFFE2E4E2),
        error: Color(0xFFA76E70),
      ),
      textTheme: theme.textTheme.apply(
        bodyColor: const Color(0xFF121614),
        displayColor: const Color(0xFF121614),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: Color(0xFF121614),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 3,
        shadowColor: Colors.black26,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFFE2E4E2)),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: Color(0xFFE2E4E2),
        space: 1,
        thickness: 1,
      ),
      listTileTheme: const ListTileThemeData(
        textColor: Color(0xFF121614),
        iconColor: Color(0xFF567C8B),
      ),
    );
    return Theme(
      data: lightTheme,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const Text(
            'Profile',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
          ),
          actions: [
            IconButton(
              key: const ValueKey('profile-close'),
              tooltip: 'Close',
              style: IconButton.styleFrom(
                backgroundColor: const Color(0xFFECEEF0),
              ),
              icon: const Icon(LucideIcons.x, size: 20),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
          children: [
            ZCard(
              child: Row(
                children: [
                  TeacherAvatar(
                    photoUrl: profile.maybeWhen(
                      data: (p) => p.photoUrl,
                      orElse: () => null,
                    ),
                    radius: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profile.maybeWhen(
                            data: (p) => p.fullName,
                            orElse: () => 'Account',
                          ),
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
                            color: const Color(0xFFECEEF0),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _roleLabel(role ?? ''),
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Notification',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
                  ),
                ),
                TextButton(
                  key: const ValueKey('profile-see-all'),
                  onPressed: () => showZNotifications(context, ref),
                  child: const Text('See all', style: TextStyle(fontSize: 13)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            inbox.when(
              loading: () => const ZSkeletonList(count: 2),
              error: (e, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  userMessage(e),
                  style: lightTheme.textTheme.bodySmall,
                ),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return const ZEmpty(
                    icon: Icons.notifications_outlined,
                    title: 'No notifications yet',
                    subtitle: 'Referral updates, absent alerts, and meeting reminders appear here.',
                    compact: true,
                  );
                }
                return Column(
                  children: [
                    for (final n in items.take(3))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _ProfileNotificationTile(
                          notification: n,
                          isAdviser: isAdviser,
                        ),
                      ),
                  ],
                );
              },
            ),
            const SizedBox(height: 20),
            ZCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  ListTile(
                    onTap: () => _openAppearance(context),
                    leading: const Icon(LucideIcons.sun),
                    title: const Text(
                      'Appearance',
                      style: TextStyle(fontSize: 13),
                    ),
                    subtitle: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFECEEF0),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _modeLabel(mode),
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                    trailing: const Icon(LucideIcons.chevronRight, size: 18),
                  ),
                  const Divider(),
                  ListTile(
                    onTap: () => _openSettings(context),
                    leading: const Icon(LucideIcons.settings),
                    title: const Text(
                      'Settings',
                      style: TextStyle(fontSize: 13),
                    ),
                    trailing: const Icon(LucideIcons.chevronRight, size: 18),
                  ),
                  const Divider(),
                  ListTile(
                    onTap: () => _logout(context, ref),
                    leading: Icon(
                      LucideIcons.logOut,
                      color: lightTheme.colorScheme.error,
                    ),
                    title: Text(
                      'Logout',
                      style: TextStyle(
                        fontSize: 13,
                        color: lightTheme.colorScheme.error,
                      ),
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

/// Compact inbox row used inside the account panel. Tapping marks the update
/// read and opens its destination, matching the full notifications sheet.
class _ProfileNotificationTile extends ConsumerWidget {
  final ZNotification notification;
  final bool isAdviser;
  const _ProfileNotificationTile({
    required this.notification,
    required this.isAdviser,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = notification;
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        cardTheme: theme.cardTheme.copyWith(
          color: const Color(0xFFECEEF0),
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
          final target = teacherNotificationTarget(n, isAdviser: isAdviser);
          if (!context.mounted) return;
          if (target != null) {
            final router = GoRouter.of(context);
            Navigator.of(context).pop();
            router.go(target);
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'This update is available on the Zentra website. Open Zentra in your browser to view it.',
                ),
              ),
            );
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
                  color: theme.colorScheme.onSurface,
                ),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    teacherNotificationTitle(n),
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
