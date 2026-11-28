import 'package:flutter/material.dart';

/// Scoped settings presentation; other workspaces retain their palette.
/// Follows the app Appearance setting like the rest of the adviser desk.
ThemeData settingsScreenTheme(ThemeData base) {
  final dark = base.brightness == Brightness.dark;
  final ink = dark ? const Color(0xFFF3F7F5) : const Color(0xFF0F172A);
  final muted = dark ? const Color(0xFF99AAA3) : const Color(0xFF64748B);
  final border = dark ? const Color(0xFF2A3530) : const Color(0xFFE2E8F0);
  final surface = dark ? const Color(0xFF0B1411) : Colors.white;
  final soft = dark ? const Color(0xFF101D18) : const Color(0xFFF3F9FF);
  final primary = dark ? const Color(0xFF7EB2FF) : const Color(0xFF2563EB);
  return base.copyWith(
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: dark ? const Color(0xFF050807) : surface,
    colorScheme: dark
        ? ColorScheme.dark(
            primary: primary,
            onPrimary: const Color(0xFF06101F),
            surface: surface,
            onSurface: ink,
            onSurfaceVariant: muted,
            surfaceContainerLow: soft,
            outline: border,
            outlineVariant: border,
            error: const Color(0xFFFF6467),
          )
        : ColorScheme.light(
            primary: primary,
            onPrimary: Colors.white,
            surface: surface,
            onSurface: ink,
            onSurfaceVariant: muted,
            surfaceContainerLow: soft,
            outline: border,
            outlineVariant: border,
            error: const Color(0xFFBB303A),
          ),
    textTheme: base.textTheme.apply(bodyColor: ink, displayColor: ink),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? const Color(0xFF050807) : surface,
      foregroundColor: ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      // Match the Grade/Attendance Record headers (overviewScreenTheme).
      toolbarHeight: 72,
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
      labelStyle: TextStyle(color: muted, fontSize: 12),
      helperStyle: TextStyle(color: muted, fontSize: 12),
      contentPadding: const EdgeInsets.all(14),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: primary),
      ),
    ),
    // The settings shell sits on its own surface, so pin header/icon tint to
    // the settings ink instead of inheriting the workspace foreground.
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: ink,
        disabledForegroundColor: ink.withValues(alpha: 0.4),
        minimumSize: const Size(48, 48),
        iconSize: 20,
        shape: const CircleBorder(),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: dark ? const Color(0xFF06101F) : Colors.white,
        backgroundColor: primary,
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: ink,
        side: BorderSide(color: border),
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 13),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStatePropertyAll(dark ? ink : Colors.white),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? primary
            : const Color(0xFFB9C0BC),
      ),
    ),
  );
}
