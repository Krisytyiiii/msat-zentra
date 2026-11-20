import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/settings_theme.dart';
import 'package:zentra_mobile/design/theme.dart';

void main() {
  for (final mode in ThemeMode.values) {
    for (final device in Brightness.values) {
      testWidgets('settings follows $mode with device $device', (tester) async {
        tester.platformDispatcher.platformBrightnessTestValue = device;
        addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
        ThemeData? resolved;
        await tester.pumpWidget(
          MaterialApp(
            theme: zLightTheme(),
            darkTheme: zDarkTheme(deskCanvas: true),
            themeMode: mode,
            home: Builder(
              builder: (context) {
                resolved = settingsScreenTheme(Theme.of(context));
                return const SizedBox.shrink();
              },
            ),
          ),
        );
        final expected = mode == ThemeMode.system
            ? device
            : mode == ThemeMode.dark
            ? Brightness.dark
            : Brightness.light;
        expect(resolved!.brightness, expected);
        expect(
          resolved!.scaffoldBackgroundColor,
          resolved!.colorScheme.surface,
        );
        expect(resolved!.cardTheme.color, resolved!.colorScheme.surface);
        expect(resolved!.textTheme.bodyMedium!.fontSize, 14);
      });
    }
  }
}
