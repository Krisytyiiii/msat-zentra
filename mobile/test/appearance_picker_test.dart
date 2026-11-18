import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme_mode.dart';
import 'package:zentra_mobile/design/theme_picker.dart';

class _Settings extends ThemeSettingsNotifier {
  int writes = 0;
  @override
  Future<void> setMode(ThemeMode mode) async {
    writes++;
    state = ThemeSettings(mode: mode);
  }
}

void main() {
  for (final width in [320.0, 700.0]) {
    testWidgets('appearance stages selection until Apply at $width', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final settings = _Settings();
      var closed = false;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [themeSettingsProvider.overrideWith((ref) => settings)],
          child: MaterialApp(
            home: Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: WorkspaceThemePicker(onApplied: () => closed = true),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Dark'));
      await tester.pumpAndSettle();
      expect(settings.writes, 0);
      expect(settings.state.mode, ThemeMode.system);
      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();
      expect(settings.writes, 1);
      expect(settings.state.mode, ThemeMode.dark);
      expect(closed, isTrue);
      expect(tester.takeException(), isNull);
    });
  }
}
