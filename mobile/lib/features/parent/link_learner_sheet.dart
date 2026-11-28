import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/desk_theme.dart';
import '../../design/overview_theme.dart';
import '../../services/portal_service.dart';
import '../../shared/user_messages.dart';

/// Modal form a guardian uses to ask the school office to link a learner to
/// this account by LRN. Approval happens on the administrator's desk; this
/// sheet only files the request.
Future<void> showLinkLearnerSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (ctx) {
      final media = MediaQuery.of(ctx);
      return Padding(
        padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
        child: ConstrainedBox(
          // Content-height sheet: only scrolls when it has to.
          constraints: BoxConstraints(maxHeight: media.size.height * 0.85),
          child: const LinkLearnerSheet(),
        ),
      );
    },
  );
}

const _relationships = ['Mother', 'Father', 'Guardian', 'Sibling', 'Other'];

class LinkLearnerSheet extends ConsumerStatefulWidget {
  const LinkLearnerSheet({super.key});
  @override
  ConsumerState<LinkLearnerSheet> createState() => _LinkLearnerSheetState();
}

class _LinkLearnerSheetState extends ConsumerState<LinkLearnerSheet> {
  final _lrn = TextEditingController();
  String _relationship = 'Guardian';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _lrn.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final lrn = _lrn.text.trim();
    if (lrn.isEmpty) {
      setState(() => _error = "Enter your child's LRN.");
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await requestParentLink(ref, lrn: lrn, relationship: _relationship);
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) setState(() => _error = userMessage(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    final ink = zInk(context);
    final muted = zMutedInk(context);
    Widget panel(Widget child) => Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: zCard(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: zLine(context)),
      ),
      child: child,
    );
    return Theme(
      data: theme,
      child: ColoredBox(
        color: zCard(context),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: zLift(context, const Color(0xFF2563EB)),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Icon(
                    LucideIcons.link2,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Link a learner',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: ink,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "Enter your child's LRN. The school office reviews the "
                        'request before their records appear here.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.45,
                          color: muted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'Close',
                  style: IconButton.styleFrom(
                    foregroundColor: muted,
                    side: BorderSide(color: zLine(context)),
                    minimumSize: const Size(42, 42),
                    shape: const CircleBorder(),
                  ),
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 14),
            panel(
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Learner reference number (LRN)',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    key: const ValueKey('link-learner-lrn'),
                    controller: _lrn,
                    enabled: !_submitting,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                    ],
                    onSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(
                      hintText: 'e.g. 123456789012',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Relationship to the learner',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    key: const ValueKey('link-learner-relationship'),
                    initialValue: _relationship,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: [
                      for (final value in _relationships)
                        DropdownMenuItem(value: value, child: Text(value)),
                    ],
                    onChanged: _submitting
                        ? null
                        : (value) {
                            if (value == null) return;
                            setState(() => _relationship = value);
                          },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      key: const ValueKey('link-learner-error'),
                      style: TextStyle(
                        fontSize: 13,
                        color: theme.colorScheme.error,
                        height: 1.35,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: FilledButton(
                key: const ValueKey('link-learner-submit'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: const Color(0xFF2563EB)
                      .withValues(alpha: 0.45),
                  disabledForegroundColor: Colors.white
                      .withValues(alpha: 0.6),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Send link request'),
              ),
            ),
            ],
          ),
        ),
      ),
    );
  }
}
