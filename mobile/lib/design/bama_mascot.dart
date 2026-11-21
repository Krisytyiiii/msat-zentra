import 'package:flutter/material.dart';

/// The bundled Bama avatar used throughout the chat screens.
class BamaMascot extends StatelessWidget {
  const BamaMascot({super.key, this.size = 40});

  final double size;

  static const normalAsset = 'assets/mascots/bama-v2.png';

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: "Bama's profile mascot",
      child: ExcludeSemantics(
        child: ClipOval(
          child: Image.asset(
            normalAsset,
            width: size,
            height: size,
            fit: BoxFit.cover,
            filterQuality: FilterQuality.medium,
            excludeFromSemantics: true,
            errorBuilder: (context, _, _) => SizedBox(
              width: size,
              height: size,
              child: Icon(
                Icons.smart_toy_outlined,
                size: size * 0.7,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
