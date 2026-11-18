import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/adviser_navigation.dart';
import 'package:zentra_mobile/design/theme.dart';

void main() {
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
      expect(tester.getSize(attendance).height, tester.getSize(bama).height);
      expect(tester.getRect(attendance).top, tester.getRect(bama).top);
      for (final label in [
        'Overview',
        'Class',
        'Gradebook',
        'Attendance',
      ]) {
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
