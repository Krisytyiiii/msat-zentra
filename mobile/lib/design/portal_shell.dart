// Learner portal shell (student + parent).
//
// Mirrors the adviser workspace chrome: one 72px header with the menu button,
// a contextual search field and the account avatar, a light/dark desk palette,
// the floating bottom navigation and a drawer that carries only the learner's
// own desks. Deliberately separate from ZentraShell: no teacher overview or
// advisory menu, and the parent drawer owns the child picker.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/notifications.dart';
import '../core/session.dart';
import '../services/portal_service.dart';
import '../shared/models.dart';
import '../shared/widgets.dart';
import 'adviser_navigation.dart';
import 'brand.dart';
import 'overview_theme.dart';
import 'screen_search.dart'
    show
        ScreenSearchController,
        ScreenSearchScope,
        ScreenSearchSpec,
        screenSearchSpecFor;

/// Resolves the learner portal for a ShellRoute location and mounts the shared
/// chrome. `/portal/notifications` is role-neutral, so it follows the signed-in
/// portal instead of the path prefix.
class PortalShellChrome extends ConsumerWidget {
  final String location;
  final Widget child;
  const PortalShellChrome({
    super.key,
    required this.location,
    required this.child,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cached = ref.watch(authProvider).portal;
    final portal = location.startsWith('/parent')
        ? 'parent'
        : location.startsWith('/student')
        ? 'student'
        : cached == 'parent'
        ? 'parent'
        : 'student';
    return PortalShell(portal: portal, selectedPath: location, child: child);
  }
}

class PortalShell extends ConsumerStatefulWidget {
  final Widget child;
  final String selectedPath;
  final String portal; // student | parent
  final ScreenSearchSpec? spec;

  const PortalShell({
    super.key,
    required this.child,
    required this.selectedPath,
    required this.portal,
    this.spec,
  });

  @override
  ConsumerState<PortalShell> createState() => _PortalShellState();
}

class _PortalShellState extends ConsumerState<PortalShell> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  final _search = ScreenSearchController();

  @override
  void initState() {
    super.initState();
    _search.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant PortalShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedPath != widget.selectedPath) _resetSearch();
  }

  void _resetSearch() {
    _text.clear();
    _search.resetSilently();
    if (_focus.hasFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focus.unfocus();
      });
    }
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
    final base = Theme.of(context);
    final theme = overviewScreenTheme(base);
    final dark = theme.brightness == Brightness.dark;
    final router = GoRouter.maybeOf(context);
    final uri = router == null ? null : GoRouterState.of(context).uri;
    final spec = widget.spec ?? screenSearchSpecFor(widget.selectedPath, uri);
    final headerTheme = theme.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: dark ? theme.colorScheme.surface : Colors.white,
        foregroundColor: theme.colorScheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 72,
      ),
    );

    return Theme(
      data: theme,
      child: ScreenSearchScope(
        controller: _search,
        child: Scaffold(
          extendBody: true,
          backgroundColor: theme.scaffoldBackgroundColor,
          appBar: PreferredSize(
            preferredSize: const Size.fromHeight(73),
            child: Theme(
              data: headerTheme,
              child: AppBar(
                titleSpacing: 0,
                leadingWidth: 64,
                leading: Builder(
                  builder: (ctx) => Center(
                    child: IconButton(
                      style: IconButton.styleFrom(
                        side: BorderSide(
                          color: dark
                              ? theme.colorScheme.outline
                              : const Color(0xFFE5E8F0),
                        ),
                        minimumSize: const Size(42, 42),
                        shape: const CircleBorder(),
                      ),
                      icon: const Icon(Icons.menu, size: 20),
                      tooltip: 'Menu',
                      onPressed: () => Scaffold.of(ctx).openDrawer(),
                    ),
                  ),
                ),
                title: _searchField(context, theme, spec),
                actions: [
                  _PortalBell(portal: widget.portal),
                  _PortalAvatar(portal: widget.portal),
                ],
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(1),
                  child: Divider(height: 1, color: theme.colorScheme.outline),
                ),
              ),
            ),
          ),
          drawer: PortalDrawer(
            selectedPath: widget.selectedPath,
            portal: widget.portal,
          ),
          bottomNavigationBar: widget.portal == 'parent'
              ? ParentBottomNavigation(selectedPath: widget.selectedPath)
              : StudentBottomNavigation(selectedPath: widget.selectedPath),
          body: widget.child,
        ),
      ),
    );
  }

  Widget _searchField(
    BuildContext context,
    ThemeData theme,
    ScreenSearchSpec spec,
  ) {
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
          key: const ValueKey('portal-search-field'),
          controller: _text,
          focusNode: _focus,
          textAlignVertical: TextAlignVertical.center,
          textInputAction: TextInputAction.search,
          onChanged: _search.setQuery,
          style: theme.textTheme.bodyMedium,
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search, size: 20),
            hintText: spec.hint,
            hintStyle: TextStyle(
              color: dark
                  ? theme.colorScheme.onSurfaceVariant
                  : const Color(0xFF626B82),
              fontSize: 14,
            ),
            prefixIconColor: dark
                ? theme.colorScheme.onSurfaceVariant
                : const Color(0xFF242B42),
            isDense: true,
            filled: true,
            fillColor: dark
                ? theme.colorScheme.surfaceContainerLow
                : const Color(0xFFF3F5FA),
            constraints: const BoxConstraints(minHeight: 40),
            contentPadding: const EdgeInsets.symmetric(
              vertical: 8,
              horizontal: 16,
            ),
            suffixIcon: _text.text.isEmpty
                ? null
                : IconButton(
                    key: const ValueKey('portal-search-clear'),
                    icon: const Icon(Icons.close, size: 16),
                    tooltip: 'Clear search',
                    onPressed: () {
                      _text.clear();
                      _search.clear();
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

class _PortalBell extends ConsumerWidget {
  final String portal;
  const _PortalBell({required this.portal});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref
        .watch(notificationsProvider)
        .maybeWhen(
          data: (items) => items.where((n) => !n.isRead).length,
          orElse: () => 0,
        );
    return IconButton(
      key: const ValueKey('portal-notifications'),
      tooltip: 'Notifications',
      onPressed: () => context.push('/portal/notifications'),
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: const Icon(Icons.notifications_none, size: 22),
      ),
    );
  }
}

class _PortalAvatar extends ConsumerWidget {
  final String portal;
  const _PortalAvatar({required this.portal});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final learner = portal == 'student'
        ? ref.watch(studentMeProvider).asData?.value
        : null;
    final children = portal == 'parent'
        ? ref.watch(parentChildrenProvider).asData?.value
        : null;
    final initial = (learner?.name ?? children?.firstOrNull?.name ?? '').trim();
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Tooltip(
        message: 'Account',
        child: InkWell(
          key: const ValueKey('portal-account'),
          borderRadius: BorderRadius.circular(999),
          onTap: () => _showAccount(context, ref, learner, children),
          child: Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: theme.colorScheme.outline),
            ),
            child: CircleAvatar(
              radius: 16,
              backgroundColor: theme.colorScheme.surfaceContainerLow,
              child: initial.isEmpty
                  ? Icon(
                      portal == 'parent'
                          ? Icons.family_restroom
                          : Icons.school_outlined,
                      size: 17,
                    )
                  : Text(
                      initial.characters.first.toUpperCase(),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  void _showAccount(
    BuildContext context,
    WidgetRef ref,
    PortalLearner? learner,
    List<PortalChild>? children,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (ctx) {
        final theme = Theme.of(ctx);
        final name = portal == 'student'
            ? learner?.name
            : (children?.length == 1 ? children!.first.name : null);
        final meta = portal == 'student'
            ? [
                if (learner?.lrn.isNotEmpty == true) 'LRN ${learner!.lrn}',
                if (learner?.sectionName != null) learner!.sectionName!,
              ].join(' · ')
            : (children?.length ?? 0) > 1
            ? '${children!.length} linked learners'
            : (children?.firstOrNull?.sectionName ?? '');
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  name?.isNotEmpty == true
                      ? name!
                      : (portal == 'parent' ? 'Parent account' : 'Learner'),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (meta.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(meta, style: theme.textTheme.labelSmall),
                  ),
                const SizedBox(height: 12),
                ListTile(
                  shape: const StadiumBorder(),
                  leading: const Icon(Icons.notifications_none),
                  title: const Text('Notifications'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.pop(ctx);
                    context.push('/portal/notifications');
                  },
                ),
                if (portal == 'student')
                  ListTile(
                    shape: const StadiumBorder(),
                    leading: const Icon(Icons.person_outline),
                    title: const Text('Profile'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.pop(ctx);
                      context.push('/student/profile');
                    },
                  ),
                ListTile(
                  shape: const StadiumBorder(),
                  leading: Icon(Icons.logout, color: theme.colorScheme.error),
                  title: Text(
                    'Log out',
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                  onTap: () async {
                    Navigator.pop(ctx);
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/login');
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class PortalDrawer extends ConsumerWidget {
  final String selectedPath;
  final String portal;
  const PortalDrawer({
    super.key,
    required this.selectedPath,
    required this.portal,
  });

  bool _selected(String path) => selectedPath == path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    return Drawer(
      backgroundColor: dark
          ? theme.colorScheme.surface
          : const Color(0xFFFAFAF9),
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
                    padding: EdgeInsets.symmetric(horizontal: 8, vertical: 12),
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
                  if (portal == 'parent') ...[
                    const _PortalChildPicker(),
                    const SizedBox(height: 4),
                  ],
                  const _PortalTermPicker(),
                  const SizedBox(height: 4),
                  const _DrawerHeader('My learning'),
                  _item(
                    context,
                    LucideIcons.layoutDashboard,
                    'Home',
                    '/$portal/home',
                  ),
                  _item(
                    context,
                    LucideIcons.award,
                    'Grades',
                    '/$portal/grades',
                  ),
                  _item(
                    context,
                    LucideIcons.clipboardCheck,
                    'Attendance',
                    '/$portal/attendance',
                  ),
                  _item(
                    context,
                    LucideIcons.calendar,
                    'Schedule',
                    '/$portal/schedule',
                  ),
                  _item(
                    context,
                    LucideIcons.folderOpen,
                    'Modules',
                    '/$portal/modules',
                  ),
                  _item(
                    context,
                    LucideIcons.calendarCheck,
                    'Sessions',
                    '/$portal/sessions',
                  ),
                  const _DrawerHeader('Account'),
                  _item(
                    context,
                    LucideIcons.bell,
                    'Notifications',
                    '/portal/notifications',
                  ),
                  if (portal == 'student')
                    _item(
                      context,
                      LucideIcons.user,
                      'Profile',
                      '/student/profile',
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                children: [
                  Divider(color: theme.colorScheme.outline),
                  _PortalIdentity(portal: portal),
                  ListTile(
                    shape: const StadiumBorder(),
                    leading: Icon(
                      LucideIcons.logOut,
                      color: theme.colorScheme.error,
                    ),
                    title: Text(
                      'Log out',
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                    onTap: () async {
                      await ref.read(authProvider.notifier).logout();
                      if (context.mounted) context.go('/login');
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, String path) {
    final theme = Theme.of(context);
    final selected = _selected(path);
    return ListTile(
      minTileHeight: 48,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      horizontalTitleGap: 12,
      leading: Icon(icon, size: 20),
      title: Text(
        label,
        style: TextStyle(
          fontSize: 14,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
        ),
      ),
      selected: selected,
      selectedColor: theme.colorScheme.primary,
      selectedTileColor: theme.colorScheme.primary.withValues(alpha: 0.12),
      shape: const StadiumBorder(),
      onTap: () {
        Navigator.pop(context);
        context.go(path);
      },
    );
  }
}

class _DrawerHeader extends StatelessWidget {
  const _DrawerHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 4),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall
            ?.copyWith(letterSpacing: 0.6),
      ),
    );
  }
}

class _PortalIdentity extends ConsumerWidget {
  final String portal;
  const _PortalIdentity({required this.portal});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final learner = portal == 'student'
        ? ref.watch(studentMeProvider).asData?.value
        : null;
    final children = portal == 'parent'
        ? ref.watch(parentChildrenProvider).asData?.value
        : null;
    final title = portal == 'student'
        ? (learner?.name ?? 'Learner')
        : (children?.length == 1 ? children!.first.name : 'Parent account');
    final subtitle = portal == 'student'
        ? [
            if (learner?.gradeLevel.isNotEmpty == true) learner!.gradeLevel,
            if (learner?.sectionName != null) learner!.sectionName!,
          ].join(' · ')
        : '${children?.length ?? 0} linked learner${(children?.length ?? 0) == 1 ? '' : 's'}';
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      leading: CircleAvatar(
        radius: 20,
        backgroundColor: theme.colorScheme.surfaceContainerLow,
        child: Icon(
          portal == 'parent' ? Icons.family_restroom : Icons.school_outlined,
          size: 19,
        ),
      ),
      title: Text(
        title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              style: theme.textTheme.bodySmall?.copyWith(fontSize: 12),
            ),
    );
  }
}

class _PortalChildPicker extends ConsumerWidget {
  const _PortalChildPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final children = ref.watch(parentChildrenProvider);
    final selected = ref.watch(selectedChildProvider);
    return children.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12),
        child: SkeletonBox(height: 40),
      ),
      error: (e, _) => const SizedBox.shrink(),
      data: (list) {
        if (list.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: ZEmpty(
              compact: true,
              icon: Icons.people_outline,
              title: 'No linked learners',
              subtitle:
                  'Ask the school office to link your child to this account.',
            ),
          );
        }
        if (list.length == 1) {
          return Card(
            margin: EdgeInsets.zero,
            elevation: 0,
            color: theme.colorScheme.surfaceContainerLow,
            shape: const StadiumBorder(),
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.person_outline, size: 20),
              title: Text(
                list.first.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13),
              ),
              subtitle: Text(
                list.first.sectionName ?? list.first.gradeLevel,
                style: theme.textTheme.labelSmall,
              ),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: DropdownButton<String>(
            isExpanded: true,
            value: selected != null && list.any((c) => c.studentId == selected)
                ? selected
                : list.first.studentId,
            items: [
              for (final child in list)
                DropdownMenuItem(
                  value: child.studentId,
                  child: Text(
                    '${child.name} · ${child.gradeLevel}',
                    style: const TextStyle(fontSize: 13),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (value) {
              if (value == null) return;
              selectPortalChild(ref, value);
              // Another learner has another term history — go back to current.
              selectPortalTerm(ref, null);
              ref.read(portalModulePageProvider.notifier).state = 1;
            },
          ),
        );
      },
    );
  }
}

class _PortalTermPicker extends ConsumerWidget {
  const _PortalTermPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final terms = ref.watch(portalTermsResultProvider);
    final selected = ref.watch(portalTermIdProvider);
    return terms.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12),
        child: SkeletonBox(height: 40),
      ),
      error: (e, _) => const SizedBox.shrink(),
      data: (result) {
        final valid =
            selected != null && result.terms.any((t) => t.id == selected);
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: DropdownButton<String>(
            isExpanded: true,
            value: valid ? selected : 'active',
            items: [
              const DropdownMenuItem(
                value: 'active',
                child: Text('Current term', style: TextStyle(fontSize: 13)),
              ),
              for (final term in result.terms)
                DropdownMenuItem(
                  value: term.id,
                  child: Text(
                    term.label,
                    style: const TextStyle(fontSize: 13),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (value) {
              selectPortalTerm(ref, value == 'active' ? null : value);
              ref.read(portalModulePageProvider.notifier).state = 1;
            },
          ),
        );
      },
    );
  }
}
