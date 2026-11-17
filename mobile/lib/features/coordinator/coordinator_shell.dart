import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../design/brand.dart';
import '../../design/screen_search.dart';
import 'coordinator_data.dart';
import 'coordinator_widgets.dart';

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
    'Certifications',
    '/coordinator/certifications',
    Icons.verified_outlined,
  ),
  ScreenSearchDestination(
    'Devices',
    '/coordinator/devices',
    Icons.devices_outlined,
  ),
  ScreenSearchDestination(
    'Settings',
    '/coordinator/settings',
    Icons.settings_outlined,
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
  bool _searching = false;
  @override
  Future<void> reload() async =>
      ref.refresh(coordinatorInboxProvider.future).then((_) {});
  @override
  void didUpdateWidget(CoordinatorShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.path != widget.path) {
      _text.clear();
      _search.resetSilently();
      _searching = false;
    }
  }

  @override
  void dispose() {
    _text.dispose();
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
    final unread =
        ref
            .watch(coordinatorInboxProvider)
            .asData
            ?.value
            .where((n) => !n.isRead)
            .length ??
        0;
    return ScreenSearchScope(
      controller: _search,
      child: Scaffold(
        appBar: AppBar(
          title: _searching
              ? TextField(
                  controller: _text,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: spec.hint,
                    border: InputBorder.none,
                  ),
                  onChanged: _search.setQuery,
                )
              : Text(spec.title),
          actions: [
            IconButton(
              tooltip: _searching ? 'Close search' : 'Search',
              icon: Icon(_searching ? Icons.close : Icons.search),
              onPressed: () => setState(() {
                _searching = !_searching;
                if (!_searching) {
                  _text.clear();
                  _search.clear();
                }
              }),
            ),
            IconButton(
              tooltip: 'Notifications',
              icon: Badge(
                isLabelVisible: unread > 0,
                label: Text('$unread'),
                child: const Icon(Icons.notifications_none),
              ),
              onPressed: () => context.push('/coordinator/notifications'),
            ),
            PopupMenuButton<String>(
              tooltip: 'Account',
              icon: const Icon(Icons.account_circle_outlined),
              onSelected: (value) async {
                if (value == 'settings') {
                  context.go('/coordinator/settings');
                  return;
                }
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'settings', child: Text('Settings')),
                PopupMenuItem(value: 'logout', child: Text('Log out')),
              ],
            ),
          ],
        ),
        drawer: Drawer(
          child: SafeArea(
            child: ListView(
              children: [
                const ListTile(leading: ZLogo(size: 32), title: Text('Zentra')),
                ListTile(
                  title: Text(name),
                  subtitle: const Text('ADM Coordinator'),
                ),
                const ListTile(
                  leading: Icon(Icons.lock_clock_outlined),
                  title: Text('School-managed scope'),
                  subtitle: Text(
                    'Active term is resolved by the server. Case and device records may span terms.',
                  ),
                ),
                const Divider(),
                for (final item in coordinatorDestinations)
                  ListTile(
                    selected: item.path == widget.path,
                    leading: Icon(item.icon),
                    title: Text(item.label),
                    onTap: () {
                      Navigator.pop(context);
                      context.go(item.path);
                    },
                  ),
              ],
            ),
          ),
        ),
        body: ListenableBuilder(
          listenable: _search,
          builder: (context, _) {
            if (_searching && !spec.filtersContent) {
              final matches = coordinatorDestinations.where(
                (d) => d.label.toLowerCase().contains(
                  _search.query.trim().toLowerCase(),
                ),
              );
              return ListView(
                children: [
                  for (final item in matches)
                    ListTile(
                      leading: Icon(item.icon),
                      title: Text(item.label),
                      onTap: () => context.go(item.path),
                    ),
                ],
              );
            }
            return widget.child;
          },
        ),
      ),
    );
  }
}
