import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/widgets.dart';

import '../../core/notifications.dart' show ZNotification;
import 'coordinator_data.dart';
import 'coordinator_widgets.dart';

/// Port of coordinatorNotificationTarget (web label.ts). Returns null when the
/// update has no coordinator destination, so the tap stays on the dedicated
/// notifications screen.
String? coordinatorNotificationTarget(ZNotification n) {
  if (n.sourceTable == 'adm_devices') return '/coordinator/devices';
  if (n.sourceTable == 'adm_parent_meetings') return '/coordinator/referrals';
  if (n.sourceTable == 'adm_learner_profiles' &&
      n.sourceId?.isNotEmpty == true) {
    return '/coordinator/referrals/${Uri.encodeComponent(n.sourceId!)}';
  }
  if (n.sourceTable == 'referrals' && n.sourceId?.isNotEmpty == true) {
    return '/coordinator/referrals/${Uri.encodeComponent('referral:${n.sourceId}')}';
  }
  // A meeting ID is not a case ID. Never invent a case URL from it.
  return null;
}

/// Port of coordinatorNotificationTitle (web label.ts) — rules and order
/// mirror the web desk.
String coordinatorNotificationTitle(ZNotification n) {
  final msg = n.message;
  if (_has(
    RegExp(r'^you booked a parent meeting', caseSensitive: false),
    msg,
  )) {
    return 'Action recorded';
  }
  if (_has(
    RegExp(r'^you moved the parent meeting', caseSensitive: false),
    msg,
  )) {
    return 'Action recorded';
  }
  if (_has(RegExp(r'^you recorded that parents', caseSensitive: false), msg)) {
    return 'Action recorded';
  }
  if (_has(RegExp(r'^you certified', caseSensitive: false), msg)) {
    return 'Action recorded';
  }
  if (_has(RegExp(r'^you endorsed', caseSensitive: false), msg)) {
    return 'Action recorded';
  }
  if (_has(RegExp(r'^you moved', caseSensitive: false), msg)) {
    return 'Action recorded';
  }
  if (_has(RegExp(r'^you issued learning device', caseSensitive: false), msg)) {
    return 'Action recorded';
  }
  if (_has(RegExp(r'^you marked learning device', caseSensitive: false), msg)) {
    return 'Action recorded';
  }
  if (_has(
    RegExp(
      r'^you (booked|moved|rescheduled|recorded|certified|endorsed|issued|completed|created)',
      caseSensitive: false,
    ),
    msg,
  )) {
    return 'Action recorded';
  }
  if (n.type == 'device_issued' || n.type == 'device_issued_self') {
    return 'Device issued';
  }
  if (n.type == 'device_returned' || n.type == 'device_returned_self') {
    return 'Device returned';
  }
  if (n.type == 'device_overdue') return 'Device return overdue';
  if (n.type == 'meeting_booked' || n.type == 'meeting_booked_self') {
    return 'Parent meeting booked';
  }
  if (n.type == 'meeting_rescheduled' || n.type == 'meeting_rescheduled_self') {
    return 'Parent meeting rescheduled';
  }
  if (n.type == 'meeting_outcome' || n.type == 'meeting_outcome_self') {
    return 'Meeting outcome recorded';
  }
  if (n.type == 'meeting_cancelled') return 'Parent meeting cancelled';
  if (n.type == 'principal_verdict') return 'Principal verdict';
  if (n.type == 'new_adm_referral') return 'New ADM referral';
  if (_has(
    RegExp(r'device .* overdue|overdue.*device', caseSensitive: false),
    msg,
  )) {
    return 'Device return overdue';
  }
  if (_has(
    RegExp(r'meeting .* cancelled|cancelled.*meeting', caseSensitive: false),
    msg,
  )) {
    return 'Parent meeting cancelled';
  }
  if (_has(
    RegExp(
      r'signed .* by the principal|principal.*signed',
      caseSensitive: false,
    ),
    msg,
  )) {
    return 'Principal verdict';
  }
  if (n.sourceTable == 'adm_devices') return 'Device update';
  if (n.sourceTable == 'adm_parent_meetings') return 'Parent meeting update';
  if (_has(RegExp(r'new .*referral submitted', caseSensitive: false), msg)) {
    return 'New ADM referral submitted';
  }
  if (_has(RegExp(r'returned .*revision', caseSensitive: false), msg)) {
    return 'Case returned for revision';
  }
  if (_has(RegExp(r'adm consultation endorsed', caseSensitive: false), msg)) {
    return 'ADM consultation endorsed';
  }
  if (_has(RegExp(r'escalated to ADM', caseSensitive: false), msg)) {
    return 'Case escalated to ADM';
  }
  if (_has(RegExp(r'reassigned to ADM', caseSensitive: false), msg)) {
    return 'Case reassigned to ADM';
  }
  if (_has(RegExp(r'referred to ADM', caseSensitive: false), msg)) {
    return 'New ADM referral';
  }
  if (_has(RegExp(r're-submitted', caseSensitive: false), msg)) {
    return 'Referral re-submitted';
  }
  if (_has(RegExp(r'was withdrawn', caseSensitive: false), msg)) {
    return 'Referral withdrawn';
  }
  if (n.type == 'referral_status_change') return 'Referral update';
  return _coordinatorPrettify(n.type);
}

bool _has(RegExp re, String s) => re.hasMatch(s);

String _coordinatorPrettify(String type) => type
    .split('_')
    .where((w) => w.isNotEmpty)
    .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
    .join(' ');

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
      final target = notification == null
          ? null
          : coordinatorNotificationTarget(notification);
      // No coordinator destination: stay on this dedicated inbox.
      if (target != null) context.push(target);
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
              if (rows.isEmpty)
                const ZEmpty(
                  icon: Icons.notifications_none,
                  title: 'No notifications yet.',
                ),
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
