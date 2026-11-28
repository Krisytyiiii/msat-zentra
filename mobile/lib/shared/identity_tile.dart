import 'package:flutter/material.dart';

// Colored identity avatars shared by every mobile card that shows a learner or
// a class. One stable hue per identity key, so the same learner/class keeps the
// same color on every desk and after reloads.

/// Saturated palette (all entries hold white initials at 4.5:1+ contrast).
const zIdentityPalette = <Color>[
  Color(0xFF2563EB), // blue
  Color(0xFF4F46E5), // indigo
  Color(0xFF7C3AED), // violet
  Color(0xFF0F766E), // teal
  Color(0xFF047857), // emerald
  Color(0xFFB45309), // amber
  Color(0xFFBE185D), // rose
  Color(0xFF0E7490), // cyan
];

/// Stable palette index for a learner/class key (LRN, id, or display name).
int zIdentityHue(String seed) {
  if (seed.isEmpty) return 0;
  var hash = 0;
  for (final unit in seed.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return hash % zIdentityPalette.length;
}

Color zIdentityColor(String seed) => zIdentityPalette[zIdentityHue(seed)];

/// First + last initials, upper case ("Mabawad, Reogie Akero" -> "MA").
String zInitials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  return '${words.first.characters.first}'
          '${words.length > 1 ? words.last.characters.first : ''}'
      .toUpperCase();
}

/// Rounded-square identity tile: saturated fill picked from [seed] (falls back
/// to [name]) with white initials.
class ZIdentityTile extends StatelessWidget {
  const ZIdentityTile({
    super.key,
    required this.name,
    this.seed,
    this.size = 38,
    this.fontSize,
    this.radius,
  });

  final String name;

  /// Stable identity key (LRN, learner id, class id). Never shown.
  final String? seed;

  final double size;
  final double? fontSize;
  final double? radius;

  @override
  Widget build(BuildContext context) {
    final color = zIdentityColor(seed == null || seed!.isEmpty ? name : seed!);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius ?? size * 0.28),
      ),
      child: Text(
        zInitials(name),
        maxLines: 1,
        overflow: TextOverflow.clip,
        style: TextStyle(
          fontSize: fontSize ?? size * 0.32,
          fontWeight: FontWeight.w700,
          height: 1,
          color: Colors.white,
        ),
      ),
    );
  }
}
