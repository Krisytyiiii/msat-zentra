import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

/// Bama's mascot, matching the web chat's `StudentMascot character="crt"`.
///
/// Web paints a 3x3 direction sheet and follows the cursor with a fine
/// pointer; on touch it stays on the center frame and only blinks from the
/// reactions sheet. Mobile always uses that same center frame, so the two
/// cells are bundled here and the avatar renders with no network at all.
class BamaMascot extends StatefulWidget {
  const BamaMascot({super.key, this.size = 40});

  final double size;

  static const normalAsset = 'assets/mascots/bama-crt.png';
  static const blinkAsset = 'assets/mascots/bama-crt-blink.png';

  @override
  State<BamaMascot> createState() => _BamaMascotState();
}

class _BamaMascotState extends State<BamaMascot> {
  final _random = Random();
  Timer? _nextBlink;
  Timer? _closeBlink;
  bool _blink = false;
  bool _animate = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate =
        !MediaQuery.disableAnimationsOf(context) &&
        !MediaQuery.accessibleNavigationOf(context);
    if (animate == _animate) return;
    _animate = animate;
    if (_animate) {
      // Web: first blink after 1.5-5s, then 2.6-7.8s between blinks.
      _scheduleBlink(first: true);
    } else {
      _cancelBlink();
      if (_blink) setState(() => _blink = false);
    }
  }

  @override
  void dispose() {
    _cancelBlink();
    super.dispose();
  }

  void _scheduleBlink({bool first = false}) {
    _nextBlink?.cancel();
    final delay = first
        ? 1500 + _random.nextInt(3500)
        : 2600 + _random.nextInt(5200);
    _nextBlink = Timer(Duration(milliseconds: delay), _startBlink);
  }

  void _startBlink() {
    if (!_animate || !mounted) return;
    setState(() => _blink = true);
    _closeBlink?.cancel();
    _closeBlink = Timer(const Duration(milliseconds: 220), () {
      if (!mounted || !_animate) return;
      setState(() => _blink = false);
      _scheduleBlink();
    });
  }

  void _cancelBlink() {
    _nextBlink?.cancel();
    _closeBlink?.cancel();
    _nextBlink = null;
    _closeBlink = null;
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    return Semantics(
      image: true,
      label: "Bama's profile mascot",
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          height: size,
          child: Image.asset(
            _blink ? BamaMascot.blinkAsset : BamaMascot.normalAsset,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.medium,
            gaplessPlayback: true,
            excludeFromSemantics: true,
            errorBuilder: (context, _, _) => Icon(
              Icons.smart_toy_outlined,
              size: size * 0.7,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
