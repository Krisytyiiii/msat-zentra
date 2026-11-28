import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'coordinator_models.dart';

/// Web `admCaseStatusVariant` tone for a derived case status key.
StatusTone admCaseStatusTone(String key) => switch (key) {
  'cancelled' => StatusTone.red,
  'resolved_case' => StatusTone.green,
  'need_review' || 'for_certification' => StatusTone.amber,
  'ready_to_endorse' || 'endorsed' => StatusTone.blue,
  'needs_revision' => StatusTone.red,
  'parent_meeting' || 'home_visit' => StatusTone.violet,
  'monitoring' || 'completed' => StatusTone.green,
  _ => StatusTone.neutral,
};

Future<T?> admPush<T>(BuildContext context, Widget page) {
  final theme = Theme.of(context);
  return Navigator.of(context).push<T>(
    MaterialPageRoute(
      builder: (_) => Theme(data: theme, child: page),
    ),
  );
}

String admDate(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return value.isEmpty ? '—' : value;
  return value.length <= 10
      ? DateFormat.yMMMd().format(date)
      : '${DateFormat('MMM d, y · h:mm a').format(admSchoolTime(date))} PHT';
}

mixin CoordinatorRefresh<T extends ConsumerStatefulWidget>
    on ConsumerState<T>, WidgetsBindingObserver {
  Timer? _poll;
  Future<void>? _refreshFlight;
  Future<void> reload();
  bool get visible =>
      mounted &&
      (WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState ==
              AppLifecycleState.resumed) &&
      ModalRoute.of(context)?.isCurrent == true &&
      TickerMode.valuesOf(context).enabled;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      if (visible) unawaited(refresh());
    });
  }

  Future<void> refresh() => _refreshFlight ??= reload()
      .catchError((Object _) {})
      .whenComplete(() => _refreshFlight = null);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && visible) unawaited(refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}

class AdmBody extends StatelessWidget {
  const AdmBody({super.key, required this.children, this.onRefresh});
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  @override
  Widget build(BuildContext context) {
    final body = LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 820,
              minHeight: (constraints.maxHeight - 32).clamp(0, double.infinity),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final child in children)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: child,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    return onRefresh == null
        ? body
        : RefreshIndicator(onRefresh: onRefresh!, child: body);
  }
}

class AdmSection extends StatelessWidget {
  const AdmSection(this.title, {super.key, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          for (final child in children)
            Padding(padding: const EdgeInsets.only(bottom: 8), child: child),
        ],
      ),
    ),
  );
}

class AdmValue extends StatelessWidget {
  const AdmValue(this.label, this.value, {super.key});
  final String label, value;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: Theme.of(context).textTheme.labelSmall),
      SelectableText(value.isEmpty ? '—' : value),
    ],
  );
}

class AdmAsync<T> extends StatelessWidget {
  const AdmAsync({
    super.key,
    required this.value,
    required this.builder,
    required this.retry,
  });
  final AsyncValue<T> value;
  final Widget Function(T) builder;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    data: builder,
    loading: () =>
        const ScreenSkeleton(section: true),
    error: (e, _) => ErrorView(message: e, onRetry: retry),
  );
}

class AdmPager extends StatelessWidget {
  const AdmPager({
    super.key,
    required this.page,
    required this.pages,
    required this.total,
    required this.onPage,
  });
  final int page, pages, total;
  final ValueChanged<int> onPage;
  @override
  Widget build(BuildContext context) => Wrap(
    alignment: WrapAlignment.center,
    crossAxisAlignment: WrapCrossAlignment.center,
    spacing: 8,
    runSpacing: 8,
    children: [
      IconButton(
        tooltip: 'Previous page',
        onPressed: page > 1 ? () => onPage(page - 1) : null,
        icon: const Icon(Icons.chevron_left),
      ),
      Text('Page $page of $pages · $total records'),
      IconButton(
        tooltip: 'Next page',
        onPressed: page < pages ? () => onPage(page + 1) : null,
        icon: const Icon(Icons.chevron_right),
      ),
    ],
  );
}

void admClose(BuildContext context, String fallback) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.go(fallback);
  }
}

Future<bool> admConfirm(
  BuildContext context,
  String title,
  String message,
) async {
  final theme = overviewScreenTheme(Theme.of(context));
  const blue = Color(0xFF2563EB);
  return await showDialog<bool>(
        context: context,
        builder: (ctx) => Theme(
          data: theme,
          child: Dialog(
            backgroundColor: Colors.transparent,
            elevation: 0,
            insetPadding: const EdgeInsets.symmetric(
              horizontal: 28,
              vertical: 24,
            ),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 420),
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: theme.colorScheme.outlineVariant),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(
                      alpha: theme.brightness == Brightness.dark ? 0.4 : 0.12,
                    ),
                    blurRadius: 28,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: blue.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          LucideIcons.triangleAlert,
                          size: 19,
                          color: blue,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    message,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            foregroundColor: theme.colorScheme.onSurface,
                            side: BorderSide(
                              color: theme.colorScheme.outlineVariant,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            backgroundColor: blue,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Confirm'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ) ??
      false;
}

Future<void> admOpenUrl(BuildContext context, String value) async {
  final uri = Uri.tryParse(value);
  try {
    if (uri == null ||
        !['https', 'http'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw StateError('Unavailable document');
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This document could not be opened.')),
      );
    }
  }
}

void admError(BuildContext context, Object error) =>
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(userMessage(error))));
