import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:zentra_mobile/features/student/student_identity_page.dart';
import 'package:zentra_mobile/shared/models.dart';
import 'package:zentra_mobile/services/portal_service.dart';

void main() {
  PortalLearner learner({String lrn = '123456789012'}) => PortalLearner(
    studentId: 'student-one',
    name: 'Jeslito Geverola',
    lrn: lrn,
    gradeLevel: 'G10',
    sectionName: 'Diamond',
  );

  test(
    'QR payload contains versioned name/LRN and no private account data',
    () {
      expect(jsonDecode(studentQrPayload(learner())), {
        'type': 'zentra.student',
        'version': 1,
        'name': 'Jeslito Geverola',
        'lrn': '123456789012',
      });
    },
  );

  testWidgets('Profile opens the dedicated QR screen and Back returns', (
    tester,
  ) async {
    final router = GoRouter(
      initialLocation: '/student/profile',
      routes: [
        GoRoute(
          path: '/student/profile',
          builder: (_, _) => const StudentIdentityPage(),
        ),
        GoRoute(
          path: '/student/profile/qr',
          builder: (_, _) => const StudentIdentityPage(qr: true),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [studentMeProvider.overrideWith((ref) async => learner())],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
    await tester.tap(find.text('My QR Code'));
    await tester.pumpAndSettle();
    expect(find.text('QR VERIFICATION'), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
  });

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('QR card renders at $width with large text', (tester) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var exports = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(width, 1000),
              textScaler: const TextScaler.linear(1.6),
            ),
            child: Scaffold(
              body: SingleChildScrollView(
                child: Center(
                  child: SizedBox(
                    width: 440,
                    child: StudentQrCard(
                      learner: learner(),
                      onExport: () => exports++,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Jeslito Geverola'), findsOneWidget);
      expect(find.text('LRN: 123456789012'), findsOneWidget);
      final qr = tester.widget<QrImageView>(find.byType(QrImageView));
      expect(qr.errorCorrectionLevel, QrErrorCorrectLevel.H);
      expect(qr.embeddedImage, isA<AssetImage>());
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Save or share QR card'));
      expect(exports, 1);
    });
  }

  testWidgets('missing LRN does not generate an invalid QR', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: StudentQrCard(learner: learner(lrn: '')),
          ),
        ),
      ),
    );
    expect(find.byType(QrImageView), findsNothing);
    expect(find.textContaining('required to generate a QR'), findsOneWidget);
  });
}
