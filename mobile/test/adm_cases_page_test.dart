import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/design/shell.dart';
import 'package:zentra_mobile/features/adviser/adm_case_card.dart';
import 'package:zentra_mobile/features/adviser/adm_cases_page.dart';
import 'package:zentra_mobile/features/home/overview_data.dart';
import 'package:zentra_mobile/shared/models.dart';

Future<void> mount(
  WidgetTester tester, {
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        admCasesProvider.overrideWith(
          (ref) async => [
            {
              'id': 'a',
              'studentName': 'Ana',
              'lrn': '111',
              'stage': 'consultation',
              'eligibilityStatus': 'pending',
              'approved': false,
            },
            {
              'id': 'b',
              'studentName': 'Ben',
              'lrn': '222',
              'stage': 'enrollment_monitoring',
              'eligibilityStatus': 'eligible',
              'approved': true,
            },
            {
              'id': 'c',
              'studentName': 'Carl',
              'lrn': '333',
              'stage': 'completion',
              'eligibilityStatus': 'eligible',
              'approved': true,
            },
          ],
        ),
        overviewSummaryProvider.overrideWith(
          (ref) => const AsyncData(
            OverviewSummary(
              teacherName: 'Teacher',
              isAdviser: true,
              sectionName: 'Arts',
            ),
          ),
        ),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const Scaffold(body: AdmCasesPage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    Hive.init((await Directory.systemTemp.createTemp('adm-header')).path);
    final box = await Hive.openBox(AppConfig.termScopeBox);
    await box.put(
      'scope',
      Term(
        id: 'term',
        schoolYearId: 'year',
        schoolYearName: '2026–2027',
        termNumber: 2,
      ).toJson(),
    );
  });
  tearDownAll(() => Hive.close());

  testWidgets(
    'learner cards open half-height ADM details and restore navigation',
    (tester) async {
      await mount(tester);
      expect(find.byType(ExpansionTile), findsNothing);
      expect(find.byType(CircleAvatar), findsNWidgets(3));
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AdmCasesPage)),
      );
      await tester.tap(find.text('Ana'));
      await tester.pumpAndSettle();
      expect(find.byType(AdmCaseDetails), findsOneWidget);
      expect(find.text('ADM status'), findsOneWidget);
      expect(
        tester.getSize(find.byType(BottomSheet)).height,
        lessThanOrEqualTo(500),
      );
      expect(container.read(staffNavigationHiddenProvider), isTrue);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Close ADM details'));
      await tester.pumpAndSettle();
      expect(container.read(staffNavigationHiddenProvider), isFalse);
      expect(find.byType(AdmCaseDetails), findsNothing);
    },
  );

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('ADM header matches desk styling at $width', (tester) async {
      await mount(tester, width: width, scale: 1.5);
      expect(find.text('ADM Cases'), findsOneWidget);
      expect(find.text('2026–2027'), findsOneWidget);
      expect(find.text('Term 2'), findsOneWidget);
      expect(find.text('Arts'), findsOneWidget);
      expect(find.text('FILTER ADM CASES'), findsOneWidget);
      expect(find.text('Showing 3 records'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'filters and search combine without changing full-cohort counters',
    (tester) async {
      await mount(tester);
      expect(
        find.textContaining('1\nPending', findRichText: true),
        findsOneWidget,
      );
      expect(
        find.textContaining('2\nApproved', findRichText: true),
        findsOneWidget,
      );
      expect(
        find.textContaining('1\nCompleted', findRichText: true),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Approval'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Approved').last);
      await tester.pumpAndSettle();
      expect(find.text('Showing 2 records'), findsOneWidget);
      await tester.enterText(find.byType(TextField), '333');
      await tester.pumpAndSettle();
      expect(find.text('Showing 1 records'), findsOneWidget);
      expect(find.byType(AdmCaseCard), findsOneWidget);
      expect(
        find.textContaining('2\nApproved', findRichText: true),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Stage'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Consultation').last);
      await tester.pumpAndSettle();
      expect(find.text('No ADM cases match'), findsOneWidget);
      await tester.tap(find.text('Name (A-Z)'));
      await tester.pumpAndSettle();
      expect(find.text('Name (Z-A)'), findsOneWidget);
    },
  );
}
