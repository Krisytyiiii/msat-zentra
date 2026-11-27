import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/overview_theme.dart';
import 'package:zentra_mobile/design/settings_theme.dart';
import 'package:zentra_mobile/design/theme.dart';

double _contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final lighter = la > lb ? la : lb;
  final darker = la > lb ? lb : la;
  return (lighter + 0.05) / (darker + 0.05);
}

void main() {
  group('adviser desk theme', () {
    test('light appearance keeps the reference white palette', () {
      final theme = overviewScreenTheme(zLightTheme());
      expect(theme.brightness, Brightness.light);
      expect(theme.scaffoldBackgroundColor, Colors.white);
      expect(theme.colorScheme.surface, Colors.white);
      expect(theme.colorScheme.onSurface, const Color(0xFF090F1E));
    });

    test('dark appearance paints the dark workspace, not white', () {
      final theme = overviewScreenTheme(zDarkTheme(deskCanvas: true));
      expect(theme.brightness, Brightness.dark);
      expect(theme.scaffoldBackgroundColor, const Color(0xFF050807));
      expect(theme.colorScheme.surface, const Color(0xFF0B1411));
      expect(theme.cardTheme.color, const Color(0xFF0B1411));
      expect(theme.colorScheme.onSurface, const Color(0xFFF3F7F5));
      // Body copy and captions must stay readable on the dark card.
      expect(
        _contrast(theme.colorScheme.onSurface, theme.colorScheme.surface),
        greaterThan(7),
      );
      expect(
        _contrast(
          theme.colorScheme.onSurfaceVariant,
          theme.colorScheme.surface,
        ),
        greaterThan(4.5),
      );
      // The bottom navigation and cards must be distinguishable from the page.
      expect(theme.colorScheme.surface, isNot(theme.scaffoldBackgroundColor));
      expect(
        _contrast(theme.colorScheme.outline, theme.colorScheme.surface),
        greaterThan(1.2),
      );
    });

    test('settings follows the appearance mode too', () {
      final light = settingsScreenTheme(zLightTheme());
      final dark = settingsScreenTheme(zDarkTheme(deskCanvas: true));
      expect(light.brightness, Brightness.light);
      expect(light.scaffoldBackgroundColor, Colors.white);
      expect(dark.brightness, Brightness.dark);
      expect(dark.scaffoldBackgroundColor, const Color(0xFF050807));
      expect(
        _contrast(dark.colorScheme.onSurface, dark.colorScheme.surface),
        greaterThan(7),
      );
    });
  });
}
