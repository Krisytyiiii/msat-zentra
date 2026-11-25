import 'package:flutter/material.dart';

import '../../design/overview_theme.dart';

// Shimmer respects the device's reduced-motion preference.
// No workspace providers or interactive controls mount before access is ready.
class WorkspaceSkeleton extends StatelessWidget {
  const WorkspaceSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context)),
    child: Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      body: Semantics(
        label: 'Loading overview',
        liveRegion: true,
        child: ExcludeSemantics(
          child: _WorkspaceShimmer(
            child: SafeArea(
              child: Column(
                children: [
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Row(
                      children: [
                        _Block(width: 32, height: 32),
                        SizedBox(width: 12),
                        Expanded(child: _Block(height: 48)),
                        SizedBox(width: 12),
                        _Block(width: 40, height: 40),
                      ],
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 760),
                          child: Column(
                            children: [
                              for (final height in [
                                130.0,
                                110.0,
                                130.0,
                                150.0,
                                150.0,
                              ])
                                Container(
                                  margin: const EdgeInsets.only(bottom: 16),
                                  padding: const EdgeInsets.all(20),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: const Color(0xFFE6ECF4),
                                    ),
                                  ),
                                  child: SizedBox(
                                    height: height,
                                    child: const Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        _Block(width: 150, height: 20),
                                        SizedBox(height: 18),
                                        _Block(height: 14),
                                        SizedBox(height: 10),
                                        FractionallySizedBox(
                                          widthFactor: .65,
                                          child: _Block(height: 14),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _WorkspaceShimmer extends StatefulWidget {
  const _WorkspaceShimmer({required this.child});
  final Widget child;

  @override
  State<_WorkspaceShimmer> createState() => _WorkspaceShimmerState();
}

class _WorkspaceShimmerState extends State<_WorkspaceShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context) ||
        MediaQuery.accessibleNavigationOf(context)) {
      _controller.stop();
    } else {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context) ||
        MediaQuery.accessibleNavigationOf(context)) {
      return widget.child;
    }
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) => ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (bounds) {
          final position = -2 + 4 * _controller.value;
          return LinearGradient(
            begin: Alignment(position - 1, -.3),
            end: Alignment(position + 1, .3),
            colors: const [
              Colors.transparent,
              Color(0x99FFFFFF),
              Colors.transparent,
            ],
          ).createShader(bounds);
        },
        child: child,
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({this.width, required this.height});
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: const Color(0xFFE9EEF5),
      borderRadius: BorderRadius.circular(12),
    ),
  );
}
