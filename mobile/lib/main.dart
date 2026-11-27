// Zentra mobile entry — Adviser + Subject Teacher app.
// Reuses the SAME Express + Prisma API as the Next.js web app.
// Run: flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/api_client.dart';
import 'core/config.dart';
import 'core/push_service.dart';
import 'core/session.dart' show authProvider;
import 'core/sync_outbox.dart';
import 'design/theme.dart';
import 'design/splash_screen.dart';
import 'design/theme_mode.dart'
    show openThemeSettingsBox, themeSettingsProvider;
import 'dev_preview/device_preview_host.dart';
import 'features/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox(AppConfig.termScopeBox);
  await Hive.openBox(AppConfig.portalBox);
  await Hive.openBox(AppConfig.outboxBox);
  await Hive.openBox(AppConfig.cacheBox);
  await Hive.openBox(AppConfig.bamaBox);
  await Hive.openBox(AppConfig.saveHistoryBox);
  await openThemeSettingsBox();
  // Must be registered before runApp; the OS may deliver a background frame
  // as soon as the process starts.
  FirebaseMessaging.onBackgroundMessage(zentraPushBackgroundHandler);
  runApp(const ProviderScope(child: ZentraApp()));
}

class ZentraApp extends ConsumerStatefulWidget {
  const ZentraApp({super.key});

  @override
  ConsumerState<ZentraApp> createState() => _ZentraAppState();
}

class _ZentraAppState extends ConsumerState<ZentraApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootPush());
  }

  /// Boots FCM after the router exists, then replays a tap that cold-started
  /// the app (deep link into the exact screen the notification points at).
  Future<void> _bootPush() async {
    PushService.instance.attach(
      api: ref.read(apiClientProvider),
      navigate: (route) => ref.read(routerProvider).go(route),
    );
    await PushService.instance.start();
    final initial = await PushService.instance.takeInitialRoute();
    if (initial != null && mounted) {
      ref.read(routerProvider).go(initial);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Signing in (or restoring a session) registers this device for pushes.
    ref.listen(authProvider, (previous, next) {
      if (next.loggedIn && next.role != null) {
        PushService.instance.register();
      }
    });
    final router = ref.watch(routerProvider);
    final mode = ref.watch(themeSettingsProvider.select((s) => s.mode));
    final pending = Hive.box(AppConfig.outboxBox).listenable();
    return ValueListenableBuilder(
      valueListenable: pending,
      builder: (context, _, _) => MaterialApp.router(
        title: 'Zentra',
        debugShowCheckedModeBanner: false,
        // Web palette in both modes; the dark desk keeps the teacher shell
        // canvas (#050807) the web uses behind every staff board.
        theme: zLightTheme(),
        darkTheme: zDarkTheme(deskCanvas: true),
        themeMode: mode,
        routerConfig: router,
        builder: (context, child) {
          // The notice must live inside the app frame (and inside device
          // preview), otherwise it is positioned against the window and
          // spills past the screen edges, over the bottom navigation.
          final app = child ?? const SizedBox.shrink();
          // App-wide save queue: writes keep running while the user moves on,
          // and the Drive-style notice survives every screen change.
          final framed = devicePreviewEnabled
              ? DevicePreviewHost(child: app)
              : app;
          // Facebook-style opening: the mark settles in while the first frame
          // is built underneath, then dissolves into the app.
          return SplashGate(child: framed);
        },
      ),
    );
  }
}

// Sync banner host — call Outbox.flush() on reconnect from a connectivity
// listener in Phase 5 (connectivity_plus). Kept here so Phase 0 compiles.
Future<int> flushPending(WidgetRef ref) => ref.read(outboxProvider).flush();
