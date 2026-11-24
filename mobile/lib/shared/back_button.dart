import 'package:flutter/material.dart';

/// Screen navigation only; date and pagination arrows keep their own styles.
class ZBackButton extends StatelessWidget {
  const ZBackButton({
    super.key,
    required this.onPressed,
    this.tooltip = 'Back',
    this.icon = const Icon(Icons.chevron_left),
    this.padding,
  });

  final VoidCallback? onPressed;
  final String tooltip;
  final Widget icon;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => Center(
    child: IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      padding: padding,
      style: IconButton.styleFrom(
        side: const BorderSide(color: Color(0xFFE5E8F0)),
        minimumSize: const Size(42, 42),
        shape: const CircleBorder(),
      ),
      icon: icon,
    ),
  );
}

/// Outline for automatically supplied AppBar back arrows.
Widget zAutomaticBackIcon(BuildContext context) => Container(
  width: 42,
  height: 42,
  alignment: Alignment.center,
  decoration: BoxDecoration(
    shape: BoxShape.circle,
    border: Border.all(color: const Color(0xFFE5E8F0)),
  ),
  child: Icon(
    Theme.of(context).platform == TargetPlatform.iOS
        ? Icons.arrow_back_ios_new
        : Icons.arrow_back,
    size: 20,
  ),
);
