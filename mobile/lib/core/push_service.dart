// Zentra mobile — push notifications (Firebase Cloud Messaging).
//
// Delivery mirrors the in-app inbox: the backend fans every Notification row
// out to the user's registered devices. Tapping a push opens the exact screen
// the update belongs to (see [pushDestination]) and marks the row read.
//
// Everything is a no-op until FIREBASE_* --dart-defines are provided; the app
// must stay fully usable (and buildable) without a Firebase project.

import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Color;

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'api_client.dart';
import 'config.dart';
import 'notifications.dart'
    show
        ZNotification,
        portalNotificationTarget,
        portalNotificationTitle,
        teacherNotificationTitle;
import 'push_config.dart';
import '../features/coordinator/coordinator_notifications.dart'
    show coordinatorNotificationTarget, coordinatorNotificationTitle;

/// Background isolate entry point. The backend sends a `notification` payload,
/// so the OS draws the alert itself when the app is backgrounded/killed; this
/// handler only needs to boot Firebase for data-only frames.
@pragma('vm:entry-point')
Future<void> zentraPushBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty && PushConfig.configured) {
    await Firebase.initializeApp(options: PushConfig.options);
  }
}

/// Adviser/subject-teacher destinations for a notification row.
///
/// Kept next to [pushDestination] so the in-app inbox and the OS push always
/// agree on where a row lives. Returns null when the update has no mobile
/// screen (the caller falls back to the workspace overview).
String? staffPushTarget(ZNotification n, {required bool isAdviser}) {
  switch (n.sourceTable) {
    case 'interventions':
      return isAdviser ? '/adviser/interventions' : null;
    case 'referrals':
    case 'counseling_sessions':
      return isAdviser ? '/adviser/referrals' : null;
    case 'adm_parent_meetings':
    case 'adm_profiles':
    case 'adm_learner_profiles':
    case 'adm_modules':
    case 'adm_devices':
      return isAdviser ? '/adviser/adm-cases' : null;
    case 'section_timetable_entries':
      return '/adviser/schedule';
    case 'student_grades':
    case 'final_grades':
    case 'grade_flags':
      return '/workspace/gradebook';
    case 'attendance_records':
      return '/workspace/attendance';
    case 'advisory_modules':
      return isAdviser ? '/adviser/academic' : null;
  }
  // Type-only fallbacks for rows without a source table.
  if (n.type == 'intervention_detected') {
    return isAdviser ? '/adviser/interventions' : null;
  }
  if (n.type == 'referral_status_change' || n.type == 'new_adm_referral') {
    return isAdviser ? '/adviser/referrals' : null;
  }
  if (n.type == 'finals_ready' || n.type == 'grade_locked') {
    return '/workspace/gradebook';
  }
  if (n.type.startsWith('attendance_')) return '/workspace/attendance';
  if (n.type.startsWith('adm_')) return isAdviser ? '/adviser/adm-cases' : null;
  return null;
}

/// The one route resolver shared by foreground taps, background taps and the
/// cold-start notification that launched the app.
String pushDestination(ZNotification n) {
  final box = Hive.isBoxOpen(AppConfig.portalBox)
      ? Hive.box(AppConfig.portalBox)
      : null;
  final role = box?.get('role') as String?;
  final portal = box?.get('portal') as String? ?? 'staff';

  if (portal == 'student' || portal == 'parent') {
    return portalNotificationTarget(n, portal);
  }
  if (role == 'adm_coordinator') {
    return coordinatorNotificationTarget(n) ?? '/coordinator/notifications';
  }
  return staffPushTarget(n, isAdviser: role == 'adviser') ??
      '/workspace/overview';
}

String pushTitleFor(ZNotification n) {
  final box = Hive.isBoxOpen(AppConfig.portalBox)
      ? Hive.box(AppConfig.portalBox)
      : null;
  final role = box?.get('role') as String?;
  final portal = box?.get('portal') as String? ?? 'staff';
  if (portal == 'student' || portal == 'parent')
    return portalNotificationTitle(n);
  if (role == 'adm_coordinator') return coordinatorNotificationTitle(n);
  return teacherNotificationTitle(n);
}

ZNotification _notificationFromMessage(RemoteMessage m) => ZNotification(
  id: m.data['notificationId']?.toString() ?? m.messageId ?? '',
  type: m.data['type']?.toString() ?? '',
  sourceTable: _nonEmpty(m.data['sourceTable']),
  sourceId: _nonEmpty(m.data['sourceId']),
  message: m.notification?.body ?? m.data['message']?.toString() ?? '',
  isRead: false,
  createdAt: DateTime.now().toIso8601String(),
);

String? _nonEmpty(Object? v) {
  final s = v?.toString();
  return (s == null || s.isEmpty) ? null : s;
}

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  ApiClient? _api;
  void Function(String route)? _navigate;
  bool _started = false;
  bool _starting = false;
  String? _registeredToken;
  RemoteMessage? _initialMessage;

  final _local = FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _tokenSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _openedSub;

  /// Wires the service to the app's HTTP client and router.
  void attach({
    required ApiClient api,
    required void Function(String route) navigate,
  }) {
    _api = api;
    _navigate = navigate;
  }

  /// Boots Firebase, the local-notifications channel and message listeners.
  /// Safe to call more than once; silent when push is not configured.
  Future<void> start() async {
    if (_started || _starting || kIsWeb) return;
    if (!PushConfig.configured) {
      debugPrint(
        '[push] FCM not configured — push notifications are off. '
        'Fill FIREBASE_* in .env and run with --dart-define-from-file=.env.',
      );
      return;
    }
    _starting = true;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: PushConfig.options);
      }
      await _initLocalNotifications();

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      // Foreground notices are drawn by flutter_local_notifications (custom Z
      // icon); iOS shouldn't double-present them.
      await messaging.setForegroundNotificationPresentationOptions(
        alert: false,
        badge: true,
        sound: false,
      );

      _foregroundSub = FirebaseMessaging.onMessage.listen(_showForeground);
      _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_open);
      _initialMessage = await messaging.getInitialMessage();
      _tokenSub = messaging.onTokenRefresh.listen(
        (token) => _registerToken(token),
      );

      _started = true;
    } catch (_) {
      // A missing Play Services / APNs setup must never break sign-in.
    } finally {
      _starting = false;
    }
  }

  /// The route of the notification that cold-started the app, consumed once.
  Future<String?> takeInitialRoute() async {
    final message = _initialMessage;
    if (message == null) return null;
    _initialMessage = null;
    final n = _notificationFromMessage(message);
    await _markRead(n.id);
    return pushDestination(n);
  }

  /// Opening a push is the same as opening its inbox row.
  Future<void> _markRead(String id) async {
    final api = _api;
    if (api == null || id.isEmpty) return;
    try {
      await api.dio.post('/api/notifications/read/$id');
    } catch (_) {
      // Read state is cosmetic; never block navigation on it.
    }
  }

  /// Local notification payload: route + row id, JSON so both survive.
  String _encodePayload(ZNotification n, String route) =>
      jsonEncode({'route': route, 'id': n.id});

  Future<void> _handlePayload(String? payload) async {
    if (payload == null || payload.isEmpty) return;
    var route = payload;
    var id = '';
    if (payload.startsWith('{')) {
      try {
        final decoded = jsonDecode(payload);
        if (decoded is Map) {
          route = decoded['route']?.toString() ?? '';
          id = decoded['id']?.toString() ?? '';
        }
      } catch (_) {
        return;
      }
    }
    if (route.isEmpty) return;
    await _markRead(id);
    _navigate?.call(route);
  }

  /// Registers this device's FCM token with the backend. Idempotent.
  Future<void> register() async {
    if (!_started || _api == null) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return;
      await _registerToken(token);
    } catch (_) {
      // Token registration is best-effort; the inbox still works.
    }
  }

  Future<void> _registerToken(String token) async {
    final api = _api;
    if (api == null || !_started || token.isEmpty || token == _registeredToken)
      return;
    try {
      await api.dio.post(
        '/api/notifications/device-token',
        data: {
          'token': token,
          'platform': defaultTargetPlatform == TargetPlatform.iOS
              ? 'ios'
              : (defaultTargetPlatform == TargetPlatform.android
                    ? 'android'
                    : 'web'),
        },
      );
      _registeredToken = token;
    } on DioException {
      // Retried on the next auth state change / token refresh.
    }
  }

  /// Stops this device from receiving pushes (sign-out / account switch).
  Future<void> unregister() async {
    final api = _api;
    if (!_started || api == null) return;
    try {
      final token =
          _registeredToken ?? await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return;
      await api.dio.post(
        '/api/notifications/device-token/unregister',
        data: {'token': token},
      );
    } catch (_) {
      // Server-side pruning also removes dead tokens.
    } finally {
      _registeredToken = null;
    }
  }

  Future<void> _initLocalNotifications() async {
    const android = AndroidInitializationSettings(PushConfig.smallIcon);
    const darwin = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _local.initialize(
      const InitializationSettings(android: android, iOS: darwin),
      onDidReceiveNotificationResponse: (response) {
        unawaited(_handlePayload(response.payload));
      },
    );
    final androidPlugin = _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        PushConfig.channelId,
        PushConfig.channelName,
        description: PushConfig.channelDescription,
        importance: Importance.high,
        playSound: true,
      ),
    );
  }

  void _showForeground(RemoteMessage message) {
    final n = _notificationFromMessage(message);
    final route = pushDestination(n);
    final body = n.message.isEmpty
        ? 'You have a new Zentra update.'
        : n.message;
    final id = n.id.isEmpty
        ? DateTime.now().millisecondsSinceEpoch
        : n.id.hashCode & 0x7fffffff;
    unawaited(
      _local.show(
        id,
        pushTitleFor(n),
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            PushConfig.channelId,
            PushConfig.channelName,
            channelDescription: PushConfig.channelDescription,
            importance: Importance.high,
            priority: Priority.high,
            icon: PushConfig.smallIcon,
            largeIcon: const DrawableResourceAndroidBitmap(
              PushConfig.largeIcon,
            ),
            // Matches the in-app inbox accent (unread dot / blue scope pills).
            color: const Color(0xFF2563EB),
            category: AndroidNotificationCategory.message,
            groupKey: PushConfig.groupKey,
            ticker: body,
            subText: 'Zentra',
            autoCancel: true,
            styleInformation: BigTextStyleInformation(body),
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
            threadIdentifier: n.type,
          ),
        ),
        payload: _encodePayload(n, route),
      ),
    );
  }

  void _open(RemoteMessage message) {
    final n = _notificationFromMessage(message);
    unawaited(_handlePayload(_encodePayload(n, pushDestination(n))));
  }

  void dispose() {
    _tokenSub?.cancel();
    _foregroundSub?.cancel();
    _openedSub?.cancel();
    _tokenSub = null;
    _foregroundSub = null;
    _openedSub = null;
    _started = false;
  }
}
