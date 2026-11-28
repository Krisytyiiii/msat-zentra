import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

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
    backgroundColor: Colors.transparent,
    builder: (_) => const LinkLearnerSheet(),
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
    final base = Theme.of(context);
    final theme = overviewScreenTheme(base);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Theme(
      data: theme,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          ),
          padding: EdgeInsets.fromLTRB(
            20,
            14,
            20,
            20 + MediaQuery.paddingOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.outlineVariant,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        LucideIcons.link2,
                        size: 20,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Link a learner',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                      tooltip: 'Close',
                      icon: const Icon(LucideIcons.x, size: 20),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  "Enter your child's LRN. The school office reviews the request "
                  'before their records appear here.',
                  style: TextStyle(fontSize: 13, color: muted, height: 1.4),
                ),
                const SizedBox(height: 18),
                Text(
                  'Learner reference number (LRN)',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  key: const ValueKey('link-learner-lrn'),
                  controller: _lrn,
                  enabled: !_submitting,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
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
                    color: theme.colorScheme.onSurface,
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
                const SizedBox(height: 20),
                SizedBox(
                  height: 48,
                  child: FilledButton(
                    key: const ValueKey('link-learner-submit'),
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Send link request'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
