import 'package:flutter/material.dart';

import 'tokens.dart';

/// Read-only appearance preview: mobile has one consistent workspace identity.
/// Existing web palette settings are deliberately not overwritten.
class WorkspaceThemePicker extends StatelessWidget {
  const WorkspaceThemePicker({super.key});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          _ColorSample('Mint', ZWorkspace.primary),
          _ColorSample('Violet', ZWorkspace.secondary),
          _ColorSample('Dark green', ZWorkspace.muted),
        ],
      ),
      const SizedBox(height: 12),
      Text(
        'Dark workspace · Mint & violet',
        style: Theme.of(context).textTheme.titleSmall,
      ),
      const SizedBox(height: 4),
      const Text(
        'Used across all mobile screens. Your saved web appearance is unchanged.',
      ),
    ],
  );
}

class _ColorSample extends StatelessWidget {
  const _ColorSample(this.label, this.color);
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    child: Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: color,
        border: Border.all(color: ZWorkspace.border),
        borderRadius: BorderRadius.circular(8),
      ),
    ),
  );
}
