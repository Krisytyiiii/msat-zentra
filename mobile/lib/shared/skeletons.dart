import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Shimmer sweep overlay for skeleton placeholders.
class _ShimmerSweep extends StatefulWidget {
  const _ShimmerSweep({required this.child});
  final Widget child;

  @override
  State<_ShimmerSweep> createState() => _ShimmerSweepState();
}

class _ShimmerSweepState extends State<_ShimmerSweep> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
  @override
  void dispose() { _controller.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, child) => ShaderMask(
      blendMode: BlendMode.srcATop,
      shaderCallback: (bounds) => LinearGradient(
        colors: [
          Colors.transparent,
          Colors.white.withValues(alpha: 0.45),
          Colors.transparent,
        ],
        stops: const [0.0, 0.5, 1.0],
        begin: Alignment(-1.2 + 2.4 * _controller.value, 0),
        end: Alignment(1.2 + 2.4 * _controller.value, 0),
      ).createShader(bounds),
      child: child,
    ),
    child: widget.child,
  );
}

enum SkeletonLayout {
  list,
  overview,
  record,
  attendance,
  scores,
  marking,
  schedule,
  profile,
  form,
  assessments,
  notifications,
  chart,
  summary,
  directory,
  interventions,
  conversation,
  qr,
}

/// Placeholder geometry only: no providers, actions or fabricated learner data.
/// Static deliberately, including under reduced motion and in widget previews.
class ScreenSkeleton extends StatelessWidget {
  const ScreenSkeleton({
    super.key,
    this.layout,
    this.label = 'Loading screen',
    this.section = false,
    this.count = 4,
  });

  final SkeletonLayout? layout;
  final String label;
  final bool section;
  final int count;

  static SkeletonLayout forPath(String path) {
    if (path.startsWith('/workspace/classes/') && path.endsWith('/list')) {
      return SkeletonLayout.directory;
    }
    if (path.endsWith('/qr')) return SkeletonLayout.qr;
    if (path.contains('/bama/conversation/')) {
      return SkeletonLayout.conversation;
    }
    if (path.contains('/interventions')) return SkeletonLayout.interventions;
    if (path.endsWith('/advisory')) return SkeletonLayout.directory;
    if (path.contains('/profile') || path.contains('/students/')) {
      return SkeletonLayout.profile;
    }
    if (RegExp(r'/coordinator/(referrals|enrolled)/[^/]+$').hasMatch(path)) {
      return SkeletonLayout.profile;
    }
    if (path.contains('/settings') ||
        path.contains('/more') ||
        path == '/term') {
      return SkeletonLayout.form;
    }
    if (path.contains('/notifications')) return SkeletonLayout.notifications;
    if (path.contains('/schedule') || path == '/workspace/classes') {
      return SkeletonLayout.schedule;
    }
    if (path.contains('/assessments/')) return SkeletonLayout.scores;
    if (path.contains('/assessments')) return SkeletonLayout.assessments;
    if (path.contains('/attendance/records/')) return SkeletonLayout.attendance;
    if (RegExp(r'/workspace/classes/[^/]+$').hasMatch(path)) {
      return SkeletonLayout.record;
    }
    if (path.endsWith('/home') || path.endsWith('/overview')) {
      return SkeletonLayout.overview;
    }
    if (path.endsWith('/grades') || path.endsWith('/academic')) {
      return SkeletonLayout.record;
    }
    if (path.endsWith('/attendance')) return SkeletonLayout.attendance;
    return SkeletonLayout.list;
  }

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    final kind =
        layout ??
        forPath(router?.routeInformationProvider.value.uri.path ?? '');
    final cards = switch (kind) {
      SkeletonLayout.overview => <Widget>[
        _card(identity: true, lines: 2),
        _summary(),
        _card(lines: 3),
        _card(lines: 2),
        _chart(),
      ],
      SkeletonLayout.record => <Widget>[
        _chips(),
        _summary(),
        for (var i = 0; i < 3; i++) _card(identity: true, lines: 4),
      ],
      SkeletonLayout.attendance => <Widget>[
        _chips(),
        _summary(),
        const SkeletonBox(height: 44, radius: 24),
        for (var i = 0; i < 5; i++) _card(identity: true, lines: 1),
      ],
      SkeletonLayout.marking => <Widget>[
        _chips(),
        for (var i = 0; i < 4; i++)
          _card(identity: true, lines: 1, controls: true),
      ],
      SkeletonLayout.scores => <Widget>[
        _chips(),
        _summary(),
        const SkeletonBox(height: 44, radius: 24),
        for (var i = 0; i < 5; i++) _card(identity: true, lines: 1),
      ],
      SkeletonLayout.schedule => <Widget>[
        _chips(),
        _summary(),
        _chips(),
        for (var i = 0; i < 4; i++) _card(identity: true, lines: 2),
      ],
      SkeletonLayout.profile => <Widget>[
        _card(identity: true, lines: 3),
        _summary(),
        _card(lines: 4),
        _card(lines: 3),
      ],
      SkeletonLayout.form => <Widget>[
        _card(lines: 1),
        for (var i = 0; i < 5; i++) const SkeletonBox(height: 52, radius: 18),
      ],
      SkeletonLayout.assessments => <Widget>[
        _chips(),
        for (var i = 0; i < 3; i++) ...[
          const SkeletonBox(width: 130, height: 14),
          _card(identity: true, lines: 2),
        ],
      ],
      SkeletonLayout.notifications => <Widget>[
        for (var i = 0; i < count; i++) _card(identity: true, lines: 2),
      ],
      SkeletonLayout.chart => <Widget>[_chart()],
      SkeletonLayout.summary => <Widget>[_summary()],
      SkeletonLayout.list => <Widget>[
        _chips(),
        const SkeletonBox(height: 44, radius: 24),
        for (var i = 0; i < count; i++) _card(identity: true, lines: 2),
      ],
      SkeletonLayout.directory || SkeletonLayout.interventions => <Widget>[
        _chips(),
        _summary(),
        _chips(),
        for (var i = 0; i < count; i++)
          _card(
            identity: true,
            lines: kind == SkeletonLayout.directory ? 2 : 3,
          ),
      ],
      SkeletonLayout.conversation => <Widget>[
        for (var i = 0; i < 4; i++)
          Align(
            alignment: i.isEven ? Alignment.centerLeft : Alignment.centerRight,
            child: FractionallySizedBox(
              widthFactor: .75,
              child: _card(lines: i.isEven ? 3 : 1),
            ),
          ),
      ],
      SkeletonLayout.qr => <Widget>[
        _card(identity: true, lines: 2),
        const Center(
          child: SizedBox(
            width: 240,
            child: AspectRatio(aspectRatio: 1, child: SkeletonBox(height: 240)),
          ),
        ),
        const SkeletonBox(height: 48, radius: 24),
      ],
    };
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!section) ...[
          const FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: .55,
            child: SkeletonBox(height: 22),
          ),
          const SizedBox(height: 10),
        ],
        for (final card in cards) ...[card, const SizedBox(height: 12)],
      ],
    );
    return Semantics(
      label: label,
      liveRegion: true,
      child: ExcludeSemantics(
        child: section
            ? content
            : SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(12, 16, 12, 120),
                child: content,
              ),
      ),
    );
  }

  Widget _chips() => const Row(
    children: [
      Expanded(child: SkeletonBox(height: 22)),
      SizedBox(width: 8),
      Expanded(child: SkeletonBox(height: 22)),
      SizedBox(width: 8),
      Expanded(child: SkeletonBox(height: 22)),
    ],
  );

  Widget _summary() => Row(
    children: [
      for (var i = 0; i < 3; i++) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(child: _card(lines: 2)),
      ],
    ],
  );

  Widget _chart() => const SkeletonBox(height: 130, radius: 16);

  Widget _card({bool identity = false, int lines = 2, bool controls = false}) =>
      Builder(
        builder: (context) => Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (identity) ...[
                const Row(
                  children: [
                    SkeletonBox(width: 36, height: 36, radius: 36),
                    SizedBox(width: 12),
                    Expanded(child: SkeletonBox(height: 14)),
                  ],
                ),
                const SizedBox(height: 12),
              ],
              for (var i = 0; i < lines; i++) ...[
                FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: i.isEven ? .85 : .6,
                  child: const SkeletonBox(height: 12),
                ),
                if (i < lines - 1) const SizedBox(height: 10),
              ],
              if (controls) ...[const SizedBox(height: 12), _chips()],
            ],
          ),
        ),
      );
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.radius = 6,
    this.shimmer = true,
  });
  final double? width;
  final double height;
  final double radius;
  final bool shimmer;

  @override
  Widget build(BuildContext context) {
    final base = Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
    if (!shimmer) return base;
    // Respect reduced motion: if disabled, render static.
    if (MediaQuery.of(context).disableAnimations) return base;
    return _ShimmerSweep(child: base);
  }
}
