import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/features/home/overview_data.dart';
import 'package:zentra_mobile/features/home/overview_insights.dart';
import 'package:zentra_mobile/features/home/overview_page.dart';
import 'package:zentra_mobile/features/teacher/classes_data.dart';
import 'package:zentra_mobile/shared/models.dart';

import 'overview_test.dart' as fixture;

TeachingWeek week() => TeachingWeek(
  classes: [
    TeachingClass({
      'subjectId': 'math',
      'sectionId': 'arts',
      'subjectName': 'Class-screen Math',
      'sectionName': 'Arts',
      'gradeLevel': 'G7',
    }),
  ],
  periods: [
    for (final period in [0, 2])
      TeachingPeriod({
        'day': 1,
        'period': period,
        'subject': {'id': 'math'},
        'section': {'id': 'arts'},
      }),
  ],
  config: SchoolDayConfig.fromJson(fixture.configJson()),
);

List<Override> overrides({
  required DateTime Function() clock,
  void Function()? onLoad,
}) => [
  termProvider.overrideWith((ref) => fixture.TestTerm()),
  teachingWeekProvider.overrideWith((ref) {
    ref.watch(termProvider);
    onLoad?.call();
    return week();
  }),
  overviewClockProvider.overrideWithValue(clock),
  schoolYearsProvider.overrideWith(
    (ref) async => [
      SchoolYear(
        id: 'year',
        name: '2026–2027',
        isActive: true,
        terms: [fixture.term()],
      ),
    ],
  ),
  overviewProvider.overrideWith((ref) async => fixture.critical()),
  overviewSecondaryProvider.overrideWith(
    (ref) async => {'pendingAssessments': 0},
  ),
  overviewInsightsProvider.overrideWith(
    (ref) async => OverviewInsights.fromJson({}),
  ),
];

void main() {
  setUpAll(() async {
    Hive.init((await Directory.systemTemp.createTemp('up-next')).path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() => Hive.close());

  test('Overview shares Class load/config, including recess, without legacy schedule requests', () async {
    final api = fixture.TestApi();
    var loads = 0;
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        ...overrides(
          clock: () => DateTime.utc(2026, 11, 16),
          onLoad: () => loads++,
        ),
      ],
    );
    final sub = container.listen(overviewScheduleProvider, (_, _) {});
    try {
      final schedule = await container.read(overviewScheduleProvider.future);
      final classes = await container.read(teachingWeekProvider.future);
      expect(loads, 1);
      expect(identical(schedule.config, classes.config), isTrue);
      final current = schedule.nextClass(DateTime.utc(2026, 11, 16, 0))!;
      expect(current.slot.subjectName, classes.classes.first.subject);
      expect(current.startsAt, DateTime.utc(2026, 11, 15, 23, 30));
      // At exact end, move to today's next slot (period 2 starts after recess).
      final next = schedule.nextClass(DateTime.utc(2026, 11, 16, 0, 30))!;
      expect(next.startsAt, DateTime.utc(2026, 11, 16, 1, 45));
      expect(schedule.nextClass(DateTime.utc(2026, 11, 16, 2, 45)), isNull);
      expect(schedule.nextClass(DateTime.utc(2026, 11, 15, 0)), isNull);
      expect(api.paths, isEmpty);
    } finally {
      sub.close();
      container.dispose();
      api.dio.close(force: true);
    }
  });

  testWidgets(
    'Sunday placeholder matches reference and View schedule opens Class',
    (tester) async {
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const Scaffold(body: OverviewPage()),
          ),
          GoRoute(
            path: '/workspace/classes',
            builder: (_, _) => const Scaffold(body: Text('Class destination')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: overrides(clock: () => DateTime.utc(2026, 11, 15, 0)),
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('No classes'));
      expect(find.text('No scheduled classes on Sunday.'), findsOneWidget);
      await tester.ensureVisible(find.text('View schedule'));
      await tester.tap(find.text('View schedule'));
      await tester.pumpAndSettle();
      expect(find.text('Class destination'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'time-based card advances on visible poll and uses end-of-day placeholder',
    (tester) async {
      var now = DateTime.utc(2026, 11, 16, 0);
      await tester.pumpWidget(
        ProviderScope(
          overrides: overrides(clock: () => now),
          child: const MaterialApp(home: Scaffold(body: OverviewPage())),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Class-screen Math'), findsOneWidget);
      expect(find.text('Now'), findsOneWidget);
      expect(find.text('7:30 AM – 8:30 AM'), findsOneWidget);
      now = DateTime.utc(2026, 11, 16, 0, 30);
      await tester.pump(const Duration(seconds: 20));
      await tester.pumpAndSettle();
      expect(find.text('Today'), findsOneWidget);
      expect(find.textContaining('9:45 AM –'), findsOneWidget);
      now = DateTime.utc(2026, 11, 16, 2, 45);
      await tester.pump(const Duration(seconds: 20));
      await tester.pumpAndSettle();
      expect(find.text('No classes'), findsOneWidget);
      expect(find.text('No more scheduled classes today.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('Up next reference fits $width with large text', (tester) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: overrides(clock: () => DateTime.utc(2026, 11, 16, 0)),
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(1.5),
              ),
              child: child!,
            ),
            home: const Scaffold(body: OverviewPage()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Class-screen Math'), findsOneWidget);
      expect(find.text('View schedule'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    });
  }
}
