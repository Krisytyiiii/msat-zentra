import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:zentra_mobile/shared/skeletons.dart';

void main() {
  for (final width in [320.0, 360.0, 700.0]) {
    for (final layout in SkeletonLayout.values) {
      testWidgets('$layout fits $width with large text and reduced motion', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(width, 800),
                textScaler: const TextScaler.linear(1.5),
                disableAnimations: true,
              ),
              child: Scaffold(body: ScreenSkeleton(layout: layout)),
            ),
          ),
        );
        expect(find.byType(SkeletonBox), findsWidgets);
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(tester.hasRunningAnimations, isFalse);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('loading is announced once without placeholder semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ScreenSkeleton(label: 'Loading Class Record')),
      ),
    );
    expect(find.bySemanticsLabel('Loading Class Record'), findsOneWidget);
    semantics.dispose();
  });

  test('route layouts distinguish records, editors and portals', () {
    expect(
      ScreenSkeleton.forPath('/workspace/classes/a'),
      SkeletonLayout.record,
    );
    expect(
      ScreenSkeleton.forPath('/workspace/classes/a/assessments/b'),
      SkeletonLayout.scores,
    );
    expect(
      ScreenSkeleton.forPath('/workspace/attendance/records/a/b'),
      SkeletonLayout.attendance,
    );
    expect(ScreenSkeleton.forPath('/student/home'), SkeletonLayout.overview);
    expect(ScreenSkeleton.forPath('/parent/schedule'), SkeletonLayout.schedule);
    expect(
      ScreenSkeleton.forPath('/coordinator/referrals/a'),
      SkeletonLayout.profile,
    );
  });
}
