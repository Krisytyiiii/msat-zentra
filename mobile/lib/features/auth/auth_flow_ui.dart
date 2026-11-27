import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widget_previews.dart';

import '../../design/overview_theme.dart';
import '../../shared/spinner.dart';

// The auth hand-off renders in the same desk language as the workspaces it
// opens: the overview palette in Light/Dark/System, hairline borders and the
// amber accent. No separate particle universe, no top header bar.

/// Desk palette for the auth screens. The desks follow the app Appearance
/// setting, so sign-in and term selection do too.
ThemeData authFlowTheme(ThemeData base) {
  final theme = overviewScreenTheme(base);
  final colors = theme.colorScheme;
  final dark = theme.brightness == Brightness.dark;

  OutlineInputBorder fieldBorder(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: width),
      );

  final buttonBackground = dark
      ? const Color(0xFFEAF6F1)
      : const Color(0xFF101828);
  final buttonForeground = dark
      ? const Color(0xFF08110E)
      : const Color(0xFFF8FAFC);

  return theme.copyWith(
    scaffoldBackgroundColor: dark
        ? const Color(0xFF050807)
        : const Color(0xFFF6F8FB),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: colors.surfaceContainerLow,
      hintStyle: theme.textTheme.bodyMedium?.copyWith(
        color: colors.onSurfaceVariant,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
      border: fieldBorder(colors.outline),
      enabledBorder: fieldBorder(colors.outline),
      focusedBorder: fieldBorder(colors.primary, 1.5),
      errorBorder: fieldBorder(colors.error),
      focusedErrorBorder: fieldBorder(colors.error, 1.5),
      errorStyle: theme.textTheme.bodySmall?.copyWith(color: colors.error),
      errorMaxLines: 2,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: buttonBackground,
        foregroundColor: buttonForeground,
        disabledBackgroundColor: buttonBackground.withValues(alpha: 0.45),
        disabledForegroundColor: buttonForeground.withValues(alpha: 0.6),
        minimumSize: const Size.fromHeight(46),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: colors.onSurface,
        backgroundColor: colors.surface,
        side: BorderSide(color: colors.outline),
        minimumSize: const Size.fromHeight(46),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: colors.primary,
        minimumSize: const Size(48, 46),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size(40, 40),
        iconSize: 18,
        foregroundColor: colors.onSurfaceVariant,
      ),
    ),
  );
}

// Scoped to the sign-in hand-off. Workspace themes and loaders stay unchanged.
class AuthFlowScaffold extends StatelessWidget {
  const AuthFlowScaffold({
    super.key,
    required this.child,
    this.centerContent = false,
  });

  final Widget child;
  final bool centerContent;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    final theme = authFlowTheme(base);
    final dark = theme.brightness == Brightness.dark;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Theme(
        data: theme,
        child: Scaffold(
          backgroundColor: theme.scaffoldBackgroundColor,
          body: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: dark
                    ? const [Color(0xFF050807), Color(0xFF0B1411)]
                    : const [Color(0xFFF6F8FB), Color(0xFFFDFEFF)],
              ),
            ),
            child: SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final content = centerContent
                      ? Center(
                          key: const ValueKey('auth-flow-center'),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 22,
                              vertical: 24,
                            ),
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(
                                maxWidth: 880,
                              ),
                              child: child,
                            ),
                          ),
                        )
                      : child;
                  return SingleChildScrollView(
                    padding: EdgeInsets.zero,
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: math.max(0, constraints.maxHeight),
                      ),
                      child: content,
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Fixed-width rotating arc, like the web's Loader2, instead of Material's
// expanding/contracting progress animation. No artificial progress percentage.
class AuthSpinner extends ZSpinner {
  const AuthSpinner({super.key, super.size, super.color});
}

class AuthLoading extends StatelessWidget {
  const AuthLoading({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    label: label,
    child: ExcludeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 48),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const AuthSpinner(),
            const SizedBox(width: 12),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

@Preview(
  name: 'Preparing workspace · phone',
  group: 'Authentication',
  size: Size(390, 844),
)
@Preview(
  name: 'Preparing workspace · wide',
  group: 'Authentication',
  size: Size(1200, 800),
)
Widget authLoadingPreview() => const MaterialApp(
  home: AuthFlowScaffold(
    centerContent: true,
    child: AuthLoading(label: 'Preparing workspace…'),
  ),
);
