import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/adviser_navigation.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/design/overview_theme.dart';
import 'package:zentra_mobile/design/bama_mascot.dart';

void main() {
  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('reference Overview navigation fits $width', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final theme = overviewScreenTheme(zWorkspaceTheme());
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: const Scaffold(
            bottomNavigationBar: AdviserBottomNavigation(
              selectedPath: '/workspace/overview',
            ),
          ),
        ),
      );
      final bama = find.byKey(const ValueKey('adviser-nav-Bama'));
      final attendance = find.byKey(const ValueKey('adviser-nav-Attendance'));
      expect(theme.brightness, Brightness.light);
      expect(theme.colorScheme.surface, Colors.white);
      expect(tester.widget<Material>(bama).color, Colors.white);
      expect(
        find.descendant(of: bama, matching: find.byType(BamaMascot)),
        findsOneWidget,
      );
      expect(
        tester.getRect(bama).left,
        greaterThan(tester.getRect(attendance).right),
      );
      final bar = find.byKey(const ValueKey('adviser-nav-bar'));
      expect(tester.getSize(bar).height, tester.getSize(bama).height);
      expect(tester.getSize(attendance).height, greaterThanOrEqualTo(48));
      expect(
        tester.getRect(find.text('Attendance')).right,
        lessThanOrEqualTo(tester.getRect(bar).right - 12),
      );
      expect(
        tester.getRect(attendance).center.dy,
        tester.getRect(bama).center.dy,
      );
      expect(tester.takeException(), isNull);
    });
  }
  for (final width in [320.0, 390.0, 700.0]) {
    testWidgets('Bama sits outside the oblong bar at $width', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          theme: zWorkspaceTheme(),
          home: const Scaffold(
            bottomNavigationBar: AdviserBottomNavigation(
              selectedPath: '/workspace/overview',
            ),
          ),
        ),
      );
      final bama = find.byKey(const ValueKey('adviser-nav-Bama'));
      final attendance = find.byKey(const ValueKey('adviser-nav-Attendance'));
      final bamaMaterial = tester.widget<Material>(bama);
      expect(bamaMaterial.shape, isA<CircleBorder>());
      expect(
        tester.getRect(bama).left,
        greaterThan(tester.getRect(attendance).right),
      );
      expect(tester.getSize(bama).shortestSide, greaterThanOrEqualTo(48));
      final bar = find.byKey(const ValueKey('adviser-nav-bar'));
      expect(tester.getSize(bar).height, tester.getSize(bama).height);
      expect(tester.getRect(bar).top, tester.getRect(bama).top);
      expect(tester.getSize(attendance).height, greaterThanOrEqualTo(48));
      for (final label in ['Overview', 'Class', 'Gradebook', 'Attendance']) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.byTooltip('Overview'), findsOneWidget);
      expect(find.byTooltip('Chat with Bama'), findsOneWidget);
      expect(find.text('Bama'), findsNothing);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
