import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/desk_theme.dart';
import '../../services/portal_service.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'link_learner_sheet.dart';

/// The one childless state for every parent desk.
///
/// A guardian with no approved learner sees the LRN link prompt; a guardian
/// whose request is still waiting sees the same "Waiting for approval" cards,
/// with Cancel. While this panel is mounted (no child selected) it polls the
/// portal so an approval lands everywhere without a manual refresh; once a
/// learner exists the panel is replaced by that desk's content.
class ParentLinkPrompt extends ConsumerStatefulWidget {
  const ParentLinkPrompt({super.key});

  @override
  ConsumerState<ParentLinkPrompt> createState() => _ParentLinkPromptState();
}

class _ParentLinkPromptState extends ConsumerState<ParentLinkPrompt>
    with WidgetsBindingObserver {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _poll = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_visible && _hasNoChild) _reload();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _visible && _hasNoChild) _reload();
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  bool get _visible =>
      mounted &&
      (WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) &&
      ModalRoute.of(context)?.isCurrent == true &&
      TickerMode.valuesOf(context).enabled;

  bool get _hasNoChild {
    final children = ref.read(parentChildrenProvider).asData?.value;
    return children != null && children.isEmpty;
  }

  void _reload() {
    ref.invalidate(parentChildrenProvider);
    ref.invalidate(parentLinkRequestsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final children = ref.watch(parentChildrenProvider).asData?.value;
    final pending = ref.watch(parentLinkRequestsProvider).asData?.value ??
        const <PortalLinkRequest>[];

    // A learner is linked but the remembered selection has not resolved yet.
    if (children != null && children.isNotEmpty) {
      return const ZEmpty(
        icon: Icons.family_restroom_outlined,
        title: 'Select a child',
        subtitle: 'Choose a child from the menu to view this desk.',
      );
    }

    if (pending.isEmpty) {
      return ZEmpty(
        icon: Icons.family_restroom_outlined,
        title: 'No linked learners',
        subtitle:
            "Enter your child's LRN to ask the school office to link their records to this account.",
        actionLabel: 'Link a learner',
        onAction: () => showLinkLearnerSheet(context),
      );
    }

    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final request in pending)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _PendingLinkCard(request: request),
          ),
        Center(
          child: TextButton.icon(
            onPressed: () => showLinkLearnerSheet(context),
            icon: Icon(
              LucideIcons.link2,
              size: 16,
              color: theme.colorScheme.primary,
            ),
            label: const Text('Link another learner'),
          ),
        ),
      ],
    );
  }
}

/// A guardian link request that is still waiting for the school office.
class _PendingLinkCard extends ConsumerStatefulWidget {
  const _PendingLinkCard({required this.request});
  final PortalLinkRequest request;

  @override
  ConsumerState<_PendingLinkCard> createState() => _PendingLinkCardState();
}

class _PendingLinkCardState extends ConsumerState<_PendingLinkCard> {
  bool _busy = false;

  Future<void> _cancel() async {
    setState(() => _busy = true);
    try {
      await cancelParentLink(ref, widget.request.id);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(content: Text(userMessage(error))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final request = widget.request;
    final requested = DateTime.tryParse(request.requestedAt);
    final date =
        requested == null ? null : DateFormat('MMM d, yyyy').format(requested.toLocal());
    return Container(
      key: ValueKey('parent-link-pending-${request.id}'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: zWash(context, const Color(0xFFFFF4D6)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.hourglass_top_rounded,
              size: 20,
              color: zLift(context, const Color(0xFF9A6700)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Waiting for approval',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  '${request.studentName} · LRN ${request.lrn}',
                  style: TextStyle(
                    fontSize: 13,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    request.relationship,
                    if (request.sectionName != null && request.sectionName!.isNotEmpty)
                      request.sectionName!,
                    if (date != null) 'Requested $date',
                  ].join(' · '),
                  style: TextStyle(
                    fontSize: 12,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            key: ValueKey('parent-link-cancel-${request.id}'),
            onPressed: _busy ? null : _cancel,
            child: _busy
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
