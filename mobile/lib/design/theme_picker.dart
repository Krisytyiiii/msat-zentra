import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../shared/user_messages.dart';
import 'theme_mode.dart';

/// Stages an appearance choice until the user explicitly applies it.
class WorkspaceThemePicker extends ConsumerStatefulWidget {
  const WorkspaceThemePicker({super.key, this.onApplied});
  final VoidCallback? onApplied;

  @override
  ConsumerState<WorkspaceThemePicker> createState() =>
      _WorkspaceThemePickerState();
}

class _WorkspaceThemePickerState extends ConsumerState<WorkspaceThemePicker> {
  ThemeMode? _pending;
  bool _saving = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final selected = _pending ?? ref.watch(themeSettingsProvider).mode;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final mode in [
              ThemeMode.light,
              ThemeMode.dark,
              ThemeMode.system,
            ])
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    right: mode == ThemeMode.system ? 0 : 10,
                  ),
                  child: _AppearanceOption(
                    mode: mode,
                    selected: selected == mode,
                    onTap: _saving
                        ? null
                        : () => setState(() => _pending = mode),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 26),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              _error!,
              style: const TextStyle(color: Color(0xFFA13F43)),
            ),
          ),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2476D0),
              foregroundColor: Colors.white,
              minimumSize: const Size(48, 48),
              shape: const StadiumBorder(),
            ),
            onPressed: _saving
                ? null
                : () async {
                    setState(() {
                      _saving = true;
                      _error = null;
                    });
                    try {
                      await ref
                          .read(themeSettingsProvider.notifier)
                          .setMode(selected);
                      if (mounted) widget.onApplied?.call();
                    } catch (error) {
                      if (mounted) setState(() => _error = userMessage(error));
                    } finally {
                      if (mounted) setState(() => _saving = false);
                    }
                  },
            child: Text(_saving ? 'Applying…' : 'Apply'),
          ),
        ),
      ],
    );
  }
}

class _AppearanceOption extends StatelessWidget {
  const _AppearanceOption({
    required this.mode,
    required this.selected,
    required this.onTap,
  });
  final ThemeMode mode;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final dark = mode == ThemeMode.dark;
    final system = mode == ThemeMode.system;
    final ink = dark ? const Color(0xFFADB8C4) : const Color(0xFF74818A);
    final label = switch (mode) {
      ThemeMode.light => 'Light',
      ThemeMode.dark => 'Dark',
      ThemeMode.system => 'System',
    };
    return Semantics(
      selected: selected,
      button: true,
      inMutuallyExclusiveGroup: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                gradient: system
                    ? const LinearGradient(
                        colors: [
                          Colors.white,
                          Colors.white,
                          Color(0xFF303E4A),
                          Color(0xFF303E4A),
                        ],
                        stops: [0, 0.5, 0.5, 1],
                      )
                    : null,
                color: system
                    ? null
                    : dark
                    ? const Color(0xFF242B32)
                    : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: selected
                      ? const Color(0xFF2476D0)
                      : const Color(0xFFD9DCD9),
                  width: selected ? 2 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Icon(
                        switch (mode) {
                          ThemeMode.light => LucideIcons.sun,
                          ThemeMode.dark => LucideIcons.moon,
                          ThemeMode.system => LucideIcons.monitorSmartphone,
                        },
                        size: 20,
                        color: ink,
                      ),
                      const Spacer(),
                      Icon(
                        selected ? LucideIcons.circleCheck : LucideIcons.circle,
                        size: 20,
                        color: selected
                            ? const Color(0xFF2476D0)
                            : const Color(0xFFADB3B8),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: (dark ? Colors.white : Colors.black).withValues(
                        alpha: 0.04,
                      ),
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(color: ink.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      children: [
                        for (var i = 0; i < 2; i++)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              children: [
                                Container(
                                  width: 15,
                                  height: 17,
                                  decoration: BoxDecoration(
                                    color: ink.withValues(alpha: 0.25),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Container(
                                        height: 4,
                                        color: ink.withValues(alpha: 0.35),
                                      ),
                                      const SizedBox(height: 4),
                                      FractionallySizedBox(
                                        widthFactor: 0.65,
                                        child: Container(
                                          height: 3,
                                          color: ink.withValues(alpha: 0.25),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: const TextStyle(fontSize: 14, color: Color(0xFF181B19)),
            ),
          ],
        ),
      ),
    );
  }
}
