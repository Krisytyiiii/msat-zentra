import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../design/bama_mascot.dart';

class BamaWritingIndicator extends StatefulWidget {
  const BamaWritingIndicator({super.key});

  @override
  State<BamaWritingIndicator> createState() => _WritingState();
}

class _WritingState extends State<BamaWritingIndicator>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context) ||
        MediaQuery.accessibleNavigationOf(context)) {
      _controller.stop();
      _controller.value = 0;
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    label: 'Bama is writing',
    child: ExcludeSemantics(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            const BamaMascot(size: 28),
            const SizedBox(width: 8),
            const Flexible(
              child: Text('Bama is writing…', style: TextStyle(fontSize: 13)),
            ),
            const SizedBox(width: 8),
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) => Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var i = 0; i < 3; i++)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Opacity(
                        opacity: _controller.isAnimating
                            ? 0.35 +
                                  0.65 *
                                      (math.sin(
                                            _controller.value * 2 * math.pi -
                                                i * 0.8,
                                          ) +
                                          1) /
                                      2
                            : 0.7,
                        child: Container(
                          width: 5,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
