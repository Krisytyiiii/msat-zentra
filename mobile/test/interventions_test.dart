import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/interventions_data.dart';
import 'package:zentra_mobile/features/adviser/interventions_page.dart';

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

Future<void> mount(
  WidgetTester tester,
  List<AdvisoryIntervention> rows, {
  double width = 390,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        advisoryInterventionsProvider.overrideWith(
          (ref) async =>
              AdvisoryInterventions(rows, [], {'total': rows.length}),
        ),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        home: const Scaffold(body: InterventionsPage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('queue searches learners and keeps no-plan cases', (
    tester,
  ) async {
    await mount(tester, [learner('Maria'), learner('Juan', plan: true)]);
    expect(find.text('Maria'), findsOneWidget);
    expect(find.text('No plan yet'), findsWidgets);
    await tester.enterText(find.byType(TextField), 'Juan');
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

  for (final width in [320.0, 700.0]) {
    testWidgets('empty queue fits $width', (tester) async {
      await mount(tester, [], width: width);
      expect(
        find.text('No advisees needing intervention in this term.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
