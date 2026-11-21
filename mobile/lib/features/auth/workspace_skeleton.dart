import 'package:flutter/material.dart';

import '../../design/overview_theme.dart';

// A static skeleton avoids motion during the brief authentication hand-off.
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
  );
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
