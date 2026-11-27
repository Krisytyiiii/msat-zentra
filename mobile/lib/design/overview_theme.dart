import 'package:flutter/material.dart';

/// Presentation-only palette for the staff overview and its persistent chrome.
///
/// It follows the app's Appearance setting: the light desks keep the reference
/// white/blue-grey look, and the dark desks reuse the workspace canvas, cards
/// and ink so a board never paints white on black.
ThemeData overviewScreenTheme(ThemeData base) {
  final dark = base.brightness == Brightness.dark;
  final colors = dark
      ? const ColorScheme(
          brightness: Brightness.dark,
          primary: Color(0xFFFFB900),
          onPrimary: Color(0xFF1A1200),
          primaryContainer: Color(0xFF3A2A00),
          onPrimaryContainer: Color(0xFFFFE7B3),
          secondary: Color(0xFF7EF5D0),
          onSecondary: Color(0xFF08110E),
          tertiary: Color(0xFFA99CFF),
          onTertiary: Color(0xFF120C33),
          error: Color(0xFFFF6467),
          onError: Color(0xFF2A0507),
          surface: Color(0xFF0B1411),
          onSurface: Color(0xFFF3F7F5),
          onSurfaceVariant: Color(0xFF99AAA3),
          surfaceDim: Color(0xFF050807),
          surfaceBright: Color(0xFF16211C),
          surfaceContainerLowest: Color(0xFF050807),
          surfaceContainerLow: Color(0xFF101D18),
          surfaceContainer: Color(0xFF0B1411),
          surfaceContainerHigh: Color(0xFF16211C),
          surfaceContainerHighest: Color(0xFF1C2823),
          outline: Color(0xFF2A3530),
          outlineVariant: Color(0xFF2A3530),
          inverseSurface: Color(0xFFF3F7F5),
          onInverseSurface: Color(0xFF050807),
          inversePrimary: Color(0xFFEF8700),
          shadow: Colors.black,
          scrim: Colors.black,
          surfaceTint: Colors.transparent,
        )
      : ColorScheme.fromSeed(
          seedColor: const Color(0xFFF59E0B),
          brightness: Brightness.light,
        ).copyWith(
          primary: const Color(0xFFEF8700),
          surface: Colors.white,
          onSurface: const Color(0xFF090F1E),
          onSurfaceVariant: const Color(0xFF7185A4),
          outline: const Color(0xFFE6ECF4),
          outlineVariant: const Color(0xFFE6ECF4),
          surfaceContainerLow: const Color(0xFFF2F5F9),
        );
  return base.copyWith(
    brightness: dark ? Brightness.dark : Brightness.light,
    colorScheme: colors,
    // The desks paint their own content (Class/Overview/records). Leaving this
    // on the login workspace base turned the gaps between cards black in light
    // mode and white in dark mode.
    scaffoldBackgroundColor: dark ? const Color(0xFF050807) : Colors.white,
    textTheme: base.textTheme
        .apply(bodyColor: colors.onSurface, displayColor: colors.onSurface)
        .copyWith(
          headlineSmall: base.textTheme.headlineSmall?.copyWith(
            color: colors.onSurface,
          ),
        ),
    cardTheme: CardThemeData(
      color: colors.surface,
      surfaceTintColor: Colors.transparent,
    ),
    dividerTheme: DividerThemeData(
      color: colors.outline,
      thickness: 1,
      space: 1,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? colors.surface : const Color(0xFFF7F9FC),
      foregroundColor: colors.onSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      toolbarHeight: 72,
    ),
  );
}
