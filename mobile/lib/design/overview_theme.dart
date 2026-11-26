import 'package:flutter/material.dart';

/// Presentation-only palette for the staff overview and its persistent chrome.
ThemeData overviewScreenTheme(ThemeData base) {
  final colors =
      ColorScheme.fromSeed(
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
    brightness: Brightness.light,
    colorScheme: colors,
    // The light desks paint white content (Class/Overview/records). Leaving
    // this on the dark workspace base turned record headers and the gaps
    // between cards black.
    scaffoldBackgroundColor: Colors.white,
    textTheme: base.textTheme
        .apply(bodyColor: colors.onSurface, displayColor: colors.onSurface)
        .copyWith(headlineSmall: base.textTheme.headlineSmall),
    cardTheme: const CardThemeData(color: Colors.white),
    appBarTheme: AppBarTheme(
      backgroundColor: const Color(0xFFF7F9FC),
      foregroundColor: colors.onSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      toolbarHeight: 72,
    ),
  );
}
