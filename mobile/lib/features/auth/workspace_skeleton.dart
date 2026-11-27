import 'package:flutter/material.dart';

import '../../design/shell.dart';
import '../../shared/skeletons.dart';

/// Login hand-off for the staff workspace.
///
/// The real header and floating navigation mount immediately; only the overview
/// body shimmers. This is the same loading state the ADM coordinator overview
/// shows, so every role sees the same content-only skeleton behind its own
/// chrome.
class WorkspaceSkeleton extends StatelessWidget {
  const WorkspaceSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ZentraShell(
    selectedPath: '/workspace/overview',
    child: const ScreenSkeleton(
      layout: SkeletonLayout.overview,
      label: 'Loading overview',
    ),
  );
}
