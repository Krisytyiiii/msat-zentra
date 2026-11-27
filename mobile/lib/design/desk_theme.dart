import 'package:flutter/material.dart';

// Color helpers for the adviser workspace desks.
//
// The adviser workspace follows the app's Appearance setting. Screens that
// used to hardcode the reference light palette call these instead, so the same
// widget paints readable ink on either canvas.

/// Primary ink for titles and body copy.
Color zInk(BuildContext context) => Theme.of(context).colorScheme.onSurface;

/// Secondary ink for captions, metadata and hints.
Color zMutedInk(BuildContext context) =>
    Theme.of(context).colorScheme.onSurfaceVariant;

/// Hairline border between cards, rows and sections.
Color zLine(BuildContext context) => Theme.of(context).colorScheme.outline;

/// Subtle fill for tiles, search fields and quiet rows.
Color zSoft(BuildContext context) =>
    Theme.of(context).colorScheme.surfaceContainerLow;

/// Card / sheet surface.
Color zCard(BuildContext context) => Theme.of(context).colorScheme.surface;

/// Pastel fill used by the light desks. In dark mode it becomes a low-alpha
/// wash of the same hue so the block still reads as that category.
Color zWash(BuildContext context, Color lightFill) {
  if (Theme.of(context).brightness != Brightness.dark) return lightFill;
  final hsl = HSLColor.fromColor(lightFill);
  return HSLColor.fromAHSL(0.16, hsl.hue, 0.45, 0.5).toColor();
}

/// Saturated accent (status text, icon, border). Lifted in dark mode so it
/// keeps contrast against the dark wash.
Color zLift(BuildContext context, Color lightAccent) {
  if (Theme.of(context).brightness != Brightness.dark) return lightAccent;
  final hsl = HSLColor.fromColor(lightAccent);
  return HSLColor.fromAHSL(
    hsl.alpha,
    hsl.hue,
    hsl.saturation.clamp(0.35, 0.9),
    0.68,
  ).toColor();
}
