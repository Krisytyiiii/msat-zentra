import 'package:flutter/material.dart';

import '../../design/desk_theme.dart';

import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Bottom action for the GCForm-01 preview: signing only. Document actions
/// (share/download) live in the header menu, like the other record viewers.
class PreviewActionBar extends StatelessWidget {
  const PreviewActionBar({
    super.key,
    required this.canSign,
    required this.signed,
    required this.onSign,
  });

  final bool canSign;
  final bool signed;
  final VoidCallback onSign;

  @override
  Widget build(BuildContext context) {
    if (!canSign) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onSign,
              icon: const Icon(LucideIcons.penLine, size: 18),
              label: Text(signed ? 'Signature' : 'Sign'),
              style: FilledButton.styleFrom(
                backgroundColor: zLift(context, const Color(0xFF2563EB)),
                foregroundColor: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF06101F)
                    : Colors.white,
                minimumSize: const Size(48, 48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
