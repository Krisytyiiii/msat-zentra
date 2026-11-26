// Zentra mobile — Firebase configuration.
//
// The app ships without a Firebase project baked in. Provide the public
// client config at build time:
//
//   flutter run \
//     --dart-define=FIREBASE_API_KEY=... \
//     --dart-define=FIREBASE_APP_ID=... \
//     --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
//     --dart-define=FIREBASE_PROJECT_ID=...
//
// Explicit FirebaseOptions keeps the build working before the credentials
// exist (no google-services.json / GoogleService-Info.plist required), and
// push simply stays inert while [configured] is false.

import 'package:firebase_core/firebase_core.dart';

class PushConfig {
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _storageBucket = String.fromEnvironment('FIREBASE_STORAGE_BUCKET');
  static const _iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');

  /// True when every field Firebase needs is present.
  static bool get configured =>
      _apiKey.isNotEmpty &&
      _appId.isNotEmpty &&
      _senderId.isNotEmpty &&
      _projectId.isNotEmpty;

  static FirebaseOptions get options => FirebaseOptions(
        apiKey: _apiKey,
        appId: _appId,
        messagingSenderId: _senderId,
        projectId: _projectId,
        storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
        iosBundleId: _iosBundleId.isEmpty ? null : _iosBundleId,
      );

  /// Notification channel used by both FCM and local (foreground) notices.
  static const channelId = 'zentra_default';
  static const channelName = 'Zentra';
  static const channelDescription =
      'Referral, session, assessment and learner updates from Zentra.';

  /// Android status-bar icon (white-only silhouette of the Z + cap mark).
  static const smallIcon = 'ic_stat_zentra';
  /// Coloured logo shown in the expanded/large-icon view.
  static const largeIcon = 'ic_zentra_large';
}
