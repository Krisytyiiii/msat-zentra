// Zentra mobile — opening splash.
//
// A Facebook-style hand-off: the mark fades and settles while the first frame
// of the app is laid out behind it, then the overlay dissolves. The cover
// follows the active theme (white in light, the workspace canvas in dark), and
// the logo asset has a transparent background so the same artwork reads on
// both. Under reduced motion the mark appears instantly and the dissolve is
// skipped.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'tokens.dart' show ZWorkspace;

class SplashGate extends StatefulWidget {
  const SplashGate({
    super.key,
    required this.child,
    this.minimum = const Duration(milliseconds: 1300),
  });

  /// The app (router + shells) shown beneath the splash cover.
  final Widget child;

  /// How long the mark is held before the overlay starts to dissolve. The app
  /// is already laid out underneath, so this only controls pacing.
  final Duration minimum;

  @override
  State<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<SplashGate>
    with SingleTickerProviderStateMixin {
  late final AnimationController _intro;
  late final Animation<double> _fade;
  late final Animation<double> _scale;
  Timer? _hold;
  bool _dismissing = false;
  bool _removed = false;
  bool _reducedMotion = false;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 640),
    );
    _fade = CurvedAnimation(parent: _intro, curve: Curves.easeOut);
    _scale = Tween<double>(
      begin: 0.92,
      end: 1,
    ).animate(CurvedAnimation(parent: _intro, curve: Curves.easeOutCubic));
    _hold = Timer(widget.minimum, _dismiss);
    _intro.forward();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reducedMotion = MediaQuery.disableAnimationsOf(context);
    if (_reducedMotion) _intro.value = 1;
  }

  void _dismiss() {
    if (!mounted || _dismissing) return;
    setState(() {
      _dismissing = true;
      // Zero-duration fades still run `onEnd` during the same build, so under
      // reduced motion drop the cover outright instead of animating it out.
      if (_reducedMotion) _removed = true;
    });
  }

  @override
  void dispose() {
    _hold?.cancel();
    _intro.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final dissolve = _reducedMotion
        ? Duration.zero
        : const Duration(milliseconds: 320);
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (!_removed)
          IgnorePointer(
            ignoring: _dismissing,
            child: AnimatedOpacity(
              opacity: _dismissing ? 0 : 1,
              duration: dissolve,
              curve: Curves.easeOut,
              onEnd: () {
                if (_dismissing) setState(() => _removed = true);
              },
              child: _SplashCover(dark: dark, fade: _fade, scale: _scale),
            ),
          ),
      ],
    );
  }
}

class _SplashCover extends StatelessWidget {
  const _SplashCover({
    required this.dark,
    required this.fade,
    required this.scale,
  });

  final bool dark;
  final Animation<double> fade;
  final Animation<double> scale;

  @override
  Widget build(BuildContext context) {
    final width = math.min(MediaQuery.sizeOf(context).width * 0.42, 176.0);
    return Semantics(
      label: 'Zentra is starting',
      child: ColoredBox(
        key: const ValueKey('zentra_splash'),
        color: dark ? ZWorkspace.background : Colors.white,
        child: Center(
          child: ScaleTransition(
            scale: scale,
            child: FadeTransition(
              opacity: fade,
              // The mark alone: the artwork's white backing is transparent so
              // it sits on the light cover and the dark canvas alike.
              child: Image.asset(
                'assets/zentra_logo.png',
                width: width,
                height: width,
                filterQuality: FilterQuality.high,
                semanticLabel: 'Zentra',
              ),
            ),
          ),
        ),
      ),
    );
  }
}
