import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/home/overview_insights.dart';

void main() {
  final data = OverviewInsights.fromJson({
    'populationLabel': 'advisees',
    'riskMix': {'high': 2, 'moderate': 3, 'low': 5, 'unassessed': 0},
    'series': [
      {
        'date': '2026-11-17',
        'label': 'Nov 17',
        'present': 8,
        'late': 1,
        'absent': 1,
        'excused': 0,
        'rate': 90,
      },
      {
        'date': '2026-11-18',
        'label': 'Nov 18',
        'present': 0,
        'late': 0,
        'absent': 0,
        'excused': 0,
        'rate': null,
      },
    ],
  });

  test('insight mapping preserves missing rates and server counts', () {
    expect(data.risk['high'], 2);
    expect(data.days.first.rate, 90);
    expect(data.days.last.rate, isNull);
    expect(data.days.first.marked, 10);
  });

  for (final width in [320.0, 700.0]) {
    testWidgets('insights display real counts without overflow at $width', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 1000);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          theme: zWorkspaceTheme(),
          home: Scaffold(
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  OverviewRiskMix(insights: data),
                  const SizedBox(height: 24),
                  OverviewDailyAttendance(insights: data),
                ],
              ),
            ),
          ),
        ),
      );
      expect(find.text('High 2 · 20%'), findsOneWidget);
      expect(find.text('90%'), findsOneWidget);
      expect(find.text('No marks'), findsOneWidget);
      expect(find.text('Absent 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('empty insights show explicit empty states', (tester) async {
    final empty = OverviewInsights.fromJson({'riskMix': {}, 'series': []});
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              OverviewRiskMix(insights: empty),
              OverviewDailyAttendance(insights: empty),
            ],
          ),
        ),
      ),
    );
    expect(find.text('No risk snapshots yet.'), findsOneWidget);
    expect(find.text('No school days in range yet.'), findsOneWidget);
  });
}
