import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/adviser_navigation.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/design/overview_theme.dart';

void main() {
  for (final width in [320.0, 390.0, 700.0, 1200.0]) {
    testWidgets('teacher navigation shows the four desks at $width', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          theme: overviewScreenTheme(zWorkspaceTheme()),
          home: const Scaffold(
            bottomNavigationBar: AdviserBottomNavigation(
              selectedPath: '/workspace/overview',
            ),
          ),
        ),
      );
      final bar = find.byKey(const ValueKey('adviser-nav-bar'));
      expect(bar, findsOneWidget);
      expect(tester.getSize(bar).height, 60);
      for (final label in ['Overview', 'Class', 'Gradebook', 'Attendance']) {
        expect(find.text(label), findsOneWidget);
        expect(
          tester
              .getSize(find.byKey(ValueKey('adviser-nav-$label')))
              .height,
          greaterThanOrEqualTo(48),
        );
      }
      // Bama is no longer a bottom destination.
      expect(find.byKey(const ValueKey('adviser-nav-Bama')), findsNothing);
      expect(find.byTooltip('Chat with Bama'), findsNothing);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('selected destination is highlighted', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: overviewScreenTheme(zWorkspaceTheme()),
        home: const Scaffold(
          bottomNavigationBar: AdviserBottomNavigation(
            selectedPath: '/workspace/attendance',
          ),
        ),
      ),
    );
    expect(
      find.byKey(const ValueKey('adviser-nav-Attendance')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
