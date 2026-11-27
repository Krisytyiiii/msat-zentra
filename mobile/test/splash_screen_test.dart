import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:zentra_mobile/design/splash_screen.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/design/tokens.dart';

Widget _host({
  required Widget child,
  ThemeData? theme,
  bool reduceMotion = false,
}) {
  return MaterialApp(
    theme: theme ?? zLightTheme(),
    home: MediaQuery(
      data: MediaQueryData(disableAnimations: reduceMotion),
      child: child,
    ),
  );
}

Color _coverColor(WidgetTester tester) {
  final box = tester.widget<ColoredBox>(
    find.byKey(const ValueKey('zentra_splash')),
  );
  return box.color;
}

void main() {
  const app = Text('app');

  testWidgets('shows the mark, then dissolves into the app', (tester) async {
    await tester.pumpWidget(
      _host(
        child: const SplashGate(
          minimum: Duration(milliseconds: 40),
          child: app,
        ),
      ),
    );

    expect(find.byKey(const ValueKey('zentra_splash')), findsOneWidget);
    expect(find.text('app'), findsOneWidget); // laid out underneath
    expect(_coverColor(tester), Colors.white);

    // Fires the hold timer, then the dissolve animation.
    await tester.pump(const Duration(milliseconds: 60));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('zentra_splash')), findsNothing);
    expect(find.text('app'), findsOneWidget);
  });

  testWidgets('dark theme uses the workspace canvas behind the logo', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        theme: zDarkTheme(deskCanvas: true),
        child: const SplashGate(
          minimum: Duration(milliseconds: 40),
          child: app,
        ),
      ),
    );

    expect(_coverColor(tester), ZWorkspace.background);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.pumpAndSettle();
  });

  testWidgets('reduced motion skips the intro and dissolve', (tester) async {
    await tester.pumpWidget(
      _host(
        reduceMotion: true,
        child: const SplashGate(
          minimum: Duration(milliseconds: 40),
          child: app,
        ),
      ),
    );

    expect(find.byKey(const ValueKey('zentra_splash')), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.pump();

    expect(find.byKey(const ValueKey('zentra_splash')), findsNothing);
  });
}
