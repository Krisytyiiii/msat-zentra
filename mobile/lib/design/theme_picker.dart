import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/widgets.dart';
import 'theme_mode.dart';
import 'tokens.dart';

/// Real Light / Dark / System switch over the web palette. Mint and violet
/// stay scoped to the sign-in screens, never the staff workspace.
class WorkspaceThemePicker extends ConsumerWidget {
  const WorkspaceThemePicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final settings = ref.watch(themeSettingsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegTabs<ThemeMode>(
          values: const [ThemeMode.system, ThemeMode.light, ThemeMode.dark],
          labels: const ['System', 'Light', 'Dark'],
          selected: settings.mode,
          onChanged: (mode) =>
              ref.read(themeSettingsProvider.notifier).setMode(mode),
        ),
        const SizedBox(height: 10),
        Text(
          switch (settings.mode) {
            ThemeMode.light => 'Light workspace · web palette',
            ThemeMode.dark => 'Dark workspace · web palette',
            ThemeMode.system => 'Follows this device’s appearance',
          },
          style: theme.textTheme.titleSmall,
        ),
        const SizedBox(height: 4),
        Text(
          'Same palette as the website: white or desk-dark surfaces, amber '
          'figures and monochrome ink.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        const Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _ColorSample('Mint', ZWorkspace.primary),
            _ColorSample('Violet', ZWorkspace.secondary),
            _ColorSample('Desk', ZWorkspace.background),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Mint and violet identify Zentra on the sign-in screens only.',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
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
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(ZTokens.radiusMd),
      ),
    ),
  );
}
