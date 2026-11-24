import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../shared/widgets.dart';

import '../../core/notifications.dart' show ZNotification;
import 'coordinator_data.dart';
import 'coordinator_widgets.dart';

String coordinatorNotificationTarget(ZNotification n) {
  if (n.sourceTable == 'adm_devices') return '/coordinator/devices';
  if (n.sourceTable == 'referrals' && n.sourceId?.isNotEmpty == true) {
    return '/coordinator/referrals/${Uri.encodeComponent('referral:${n.sourceId}')}';
  }
  if (n.sourceTable == 'adm_learner_profiles' &&
      n.sourceId?.isNotEmpty == true) {
    return '/coordinator/referrals/${Uri.encodeComponent(n.sourceId!)}';
  }
  // A meeting ID is not a case ID. Never invent a case URL from it.
  return '/coordinator/referrals';
}

String coordinatorNotificationTitle(ZNotification n) => switch (n.sourceTable) {
  'adm_devices' => 'Device update',
  'adm_parent_meetings' => 'Parent meeting update',
  'adm_learner_profiles' => 'ADM case update',
  'referrals' => 'Referral update',
  _ => 'Workspace update',
};

class CoordinatorNotificationsPage extends ConsumerStatefulWidget {
  const CoordinatorNotificationsPage({super.key});
  @override
  ConsumerState<CoordinatorNotificationsPage> createState() => _InboxState();
}

class _InboxState extends ConsumerState<CoordinatorNotificationsPage>
    with
        WidgetsBindingObserver,
        CoordinatorRefresh<CoordinatorNotificationsPage> {
  bool _busy = false;
  @override
  Future<void> reload() async =>
      ref.refresh(coordinatorInboxProvider.future).then((_) {});
  Future<void> _read(ZNotification? notification) async {
    if (_busy) return;
    setState(() => _busy = true);
    final repo = ref.read(coordinatorRepositoryProvider);
    try {
      if (notification == null) {
        await repo.readAllNotifications();
      } else if (!notification.isRead) {
        await repo.readNotification(notification.id);
      }
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      ref.invalidate(coordinatorInboxProvider);
      if (notification != null) {
        context.push(coordinatorNotificationTarget(notification));
      }
    } catch (e) {
      if (mounted) admError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Notifications'),
      leading: ZBackButton(
        tooltip: 'Back',
        icon: const Icon(Icons.arrow_back),
        onPressed: () => admClose(context, '/coordinator/overview'),
      ),
    ),
    body: AdmBody(
      onRefresh: refresh,
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _busy ? null : () => _read(null),
            child: const Text('Mark all read'),
          ),
        ),
        AdmAsync(
          value: ref.watch(coordinatorInboxProvider),
          retry: refresh,
          builder: (rows) => Column(
            children: [
              if (rows.isEmpty) const ZEmpty(icon: Icons.notifications_none,
                title: 'No notifications yet.'),
              for (final n in rows)
                Card(
                  child: ListTile(
                    enabled: !_busy,
                    leading: Icon(
                      n.isRead
                          ? Icons.notifications_none
                          : Icons.notifications_active_outlined,
                    ),
                    title: Text(coordinatorNotificationTitle(n)),
                    subtitle: Text('${n.message}\n${admDate(n.createdAt)}'),
                    isThreeLine: true,
                    onTap: () => _read(n),
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );
}
