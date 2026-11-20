import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/interventions_data.dart';
import 'package:zentra_mobile/features/adviser/interventions_page.dart';
import 'package:zentra_mobile/features/home/overview_data.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:zentra_mobile/design/screen_search.dart';

AdvisoryIntervention learner(String id, {bool plan = false}) =>
    AdvisoryIntervention({
      'key': id,
      'name': id,
      'lrn': '123456789012',
      'section': 'Mabini',
      'sectionId': 'section',
      'gradeLevel': 'G7',
      'riskLevel': 'High',
      'detectedAt': '2026-11-18T01:00:00Z',
      'factors': {'academic': true, 'attendance': false, 'behavioral': false},
      'intervention': plan
          ? {
              'id': 'case-$id',
              'recommendedAction': 'individual_counseling',
              'outcomeStatus': 'ongoing',
              'approvalStatus': 'approved',
              'assignee': 'Guidance Counselor',
              'sessions': [
                {
                  'sessionType': 'individual_counseling',
                  'status': 'scheduled',
                  'scheduledAt': '2026-11-19T01:00:00Z',
                  'venue': 'Guidance office',
                  'sessionNotes': 'Follow-up note',
                  'attachmentsCount': 2,
                },
              ],
            }
          : null,
    });

Future<ScreenSearchController> mount(
  WidgetTester tester,
  List<AdvisoryIntervention> rows, {
  double width = 390,
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final search = ScreenSearchController();
  addTearDown(search.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        overviewSummaryProvider.overrideWith(
          (ref) => const AsyncData(
            OverviewSummary(
              teacherName: 'Teacher',
              isAdviser: true,
              sectionName: 'Aristotle',
              learnerCount: 16,
            ),
          ),
        ),
        advisoryInterventionsProvider.overrideWith(
          (ref) async =>
              AdvisoryInterventions(rows, [], {'total': rows.length}),
        ),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        home: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(textScale)),
            child: ScreenSearchScope(
              controller: search,
              child: const Scaffold(body: InterventionsPage()),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return search;
}

void main() {
  late Directory cache;
  setUpAll(() async {
    cache = await Directory.systemTemp.createTemp('zentra-interventions-');
    Hive.init(cache.path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() async {
    await Hive.close();
    await cache.delete(recursive: true);
  });
  testWidgets('queue searches learners and keeps no-plan cases', (
    tester,
  ) async {
    final search = await mount(tester, [
      learner('Maria'),
      learner('Juan', plan: true),
    ]);
    expect(find.text('Maria'), findsOneWidget);
    expect(find.text('2\nHigh'), findsOneWidget);
    expect(find.text('0\nModerate'), findsOneWidget);
    expect(find.text('1\nOngoing'), findsOneWidget);
    expect(find.text('No plan yet'), findsWidgets);
    expect(find.byType(TextField), findsNothing);
    search.setQuery('case-Juan');
    await tester.pumpAndSettle();
    expect(find.text('Maria'), findsNothing);
    expect(find.text('Juan'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('detail shows guidance plan and session evidence', (
    tester,
  ) async {
    await mount(tester, [learner('Juan', plan: true)]);
    await tester.ensureVisible(find.text('Juan'));
    await tester.tap(find.text('Juan'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Guidance Counselor'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.textContaining('Follow-up note'),
      250,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.textContaining('Follow-up note'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'factor dropdown filters and All restores the queue without Reset',
    (tester) async {
      final search = await mount(tester, [
        learner('Maria'),
        learner('Juan', plan: true),
      ]);
      await tester.tap(find.byTooltip('Factor'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Attendance'));
      await tester.pumpAndSettle();
      expect(find.text('No matching advisees'), findsOneWidget);
      expect(find.text('Log referral'), findsNothing);
      expect(find.text('Reset'), findsNothing);
      await tester.tap(find.byTooltip('Factor'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('All').last);
      search.setQuery('Juan');
      await tester.pumpAndSettle();
      expect(find.text('Maria'), findsNothing);
      expect(find.text('Juan'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('risk and status dropdowns filter the existing cohort', (
    tester,
  ) async {
    await mount(tester, [learner('Maria')]);
    await tester.tap(find.byTooltip('Risk level'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Moderate risk'));
    await tester.pumpAndSettle();
    expect(find.text('No matching advisees'), findsOneWidget);
    await tester.tap(find.byTooltip('Risk level'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All Risk Levels').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Status'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('No plan yet').last);
    await tester.pumpAndSettle();
    expect(find.text('Maria'), findsOneWidget);
    expect(find.text('Status: No plan yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty state uses the reference success card without actions', (
    tester,
  ) async {
    await mount(tester, []);
    expect(find.byIcon(LucideIcons.badgeCheck), findsOneWidget);
    expect(
      find.text(
        'All advisees are currently on track for this term with no active guidance desk flags.',
      ),
      findsOneWidget,
    );
    expect(find.text('Log referral'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reference content fits narrow screens with larger text', (
    tester,
  ) async {
    await mount(tester, [], width: 320, textScale: 1.5);
    await tester.scrollUntilVisible(
      find.text('No advisees needing intervention'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('No advisees needing intervention'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('empty queue fits $width', (tester) async {
      await mount(tester, [], width: width);
      expect(find.text('No advisees needing intervention'), findsOneWidget);
      expect(find.text('0\nHigh'), findsOneWidget);
      expect(find.text('0\nModerate'), findsOneWidget);
      expect(find.text('0\nOngoing'), findsOneWidget);
      expect(find.text('Showing 0 records'), findsOneWidget);
      expect(find.text('Log referral'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
