// Zentra mobile entry — Adviser + Subject Teacher app.
// Reuses the SAME Express + Prisma API as the Next.js web app.
// Run: flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/config.dart';
import 'core/sync_outbox.dart';
import 'design/theme.dart';
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
  runApp(const ProviderScope(child: ZentraApp()));
}

class ZentraApp extends ConsumerWidget {
  const ZentraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          return devicePreviewEnabled
              ? DevicePreviewHost(child: app)
              : app;
        },
      ),
    );
  }
}

// Sync banner host — call Outbox.flush() on reconnect from a connectivity
// listener in Phase 5 (connectivity_plus). Kept here so Phase 0 compiles.
Future<int> flushPending(WidgetRef ref) => ref.read(outboxProvider).flush();
