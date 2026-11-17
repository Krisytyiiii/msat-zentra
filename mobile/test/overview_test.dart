import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/shell.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/design/tokens.dart';
import 'package:zentra_mobile/features/adviser/adviser_schedule_page.dart';
import 'package:zentra_mobile/features/auth/first_time_gate.dart';
import 'package:zentra_mobile/features/home/overview_data.dart';
import 'package:zentra_mobile/features/home/overview_page.dart';
import 'package:zentra_mobile/shared/models.dart';

Map<String, dynamic> critical({bool adviser = true}) => {
  'teacherName': 'Maria Santos', 'isAdviser': adviser,
  'advisorySection': adviser ? {'name': 'Grade 8 – Arts'} : null,
  'kpi': {
    'classCount': 4,
    'studentCount': 150,
    'pendingAssessments': 0,
    'openFlags': 99,
  },
  'advisoryTotal': 40, 'atRiskStudents': 3,
  // Partial rows must never replace authoritative totals.
  'classes': [{}],
  'advisory': {
    'students': [{}],
  },
};
Map<String, dynamic> configJson() => {
  'startTime': '07:30',
  'periodMins': 60,
  'lunch': {'afterPeriod': 4, 'mins': 90},
  'morningRecess': {'enabled': true, 'afterPeriod': 2, 'mins': 15},
  'afternoonRecess': {'enabled': false, 'afterPeriod': 6, 'mins': 15},
};
Term term({String id = 'term', DateTime? start, DateTime? end}) => Term(
  id: id,
  schoolYearId: 'year',
  schoolYearName: '2026–2027',
  termNumber: 2,
  startDate: start ?? DateTime.utc(2020),
  endDate: end ?? DateTime.utc(2100),
);
TimetableSlot slot({int day = 1, int period = 0, String status = 'APPROVED'}) =>
    TimetableSlot(
      day: day,
      period: period,
      status: status,
      subjectName: 'Mathematics',
      subjectCode: 'MATH',
      sectionName: 'Arts',
    );
OverviewSchedule schedule({Term? scope, List<TimetableSlot>? slots}) =>
    OverviewSchedule(
      term: scope ?? term(),
      slots: slots ?? [slot()],
      config: SchoolDayConfig.fromJson(configJson()),
    );

class TestTerm extends TermNotifier {
  TestTerm() {
    state = term();
  }
  @override
  Future<void> select(Term value) async {
    state = value;
  }
}

class TestApi extends ApiClient {
  TestApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          paths.add(options.path);
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: switch (options.path) {
                '/api/teacher/schedule/teachers/me' => {
                  'teacherName': linked ? {'name': 'Teacher'} : null,
                  'termGrant': verified ? {'id': 'grant'} : null,
                },
                '/api/teacher/schedule/config' => {'config': configJson()},
                '/api/teacher/schedule/my-slots' => {
                  'slots': [
                    {
                      'day': 1,
                      'period': 0,
                      'status': 'APPROVED',
                      'subject': {'name': 'Math'},
                      'section': {'name': 'Arts'},
                    },
                  ],
                },
                _ => {},
              },
            ),
          );
        },
      ),
    );
  }
  bool linked = true;
  bool verified = true;
  final paths = <String>[];
  @override
  Future<String?> accessToken() async => null;
}

Future<void> mountOverview(
  WidgetTester tester, {
  double width = 390,
  double scale = 1,
  bool adviser = true,
  ThemeData? theme,
  FutureOr<Map<String, dynamic>> Function()? loadCritical,
  FutureOr<Map<String, dynamic>> Function()? loadSecondary,
  FutureOr<OverviewSchedule> Function()? loadSchedule,
}) async {
  tester.view.physicalSize = Size(width, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final api = TestApi();
  addTearDown(api.dio.close);
  final router = GoRouter(
    initialLocation: '/workspace/overview',
    routes: [
      GoRoute(
        path: '/workspace/overview',
        builder: (_, _) => const Scaffold(body: OverviewPage()),
      ),
      for (final path in [
        '/adviser/advisory',
        '/adviser/bama',
        '/adviser/schedule',
        '/workspace/gradebook',
        '/workspace/attendance',
        '/workspace/classes',
        '/workspace/schedule',
      ])
        GoRoute(
          path: path,
          builder: (_, state) =>
              Scaffold(appBar: AppBar(), body: Text('Opened ${state.uri}')),
        ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        authProvider.overrideWith((ref) => AuthNotifier(api)),
        termProvider.overrideWith((ref) => TestTerm()),
        overviewProvider.overrideWith((ref) {
          ref.watch(termProvider);
          return loadCritical?.call() ?? critical(adviser: adviser);
        }),
        overviewSecondaryProvider.overrideWith((ref) {
          ref.watch(termProvider);
          return loadSecondary?.call() ?? {'pendingAssessments': 2};
        }),
        overviewScheduleProvider.overrideWith((ref) {
          ref.watch(termProvider);
          return loadSchedule?.call() ?? schedule();
        }),
      ],
      child: MaterialApp.router(
        theme: theme ?? zDarkTheme(deskCanvas: true),
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: true,
            textScaler: TextScaler.linear(scale),
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  late Directory temp;
  setUpAll(() async {
    temp = await Directory.systemTemp.createTemp('zentra-overview-tests-');
    Hive.init(temp.path);
    await Hive.openBox(AppConfig.termScopeBox);
    await Hive.openBox(AppConfig.outboxBox);
  });
  tearDownAll(() async {
    await Hive.close();
    await temp.delete(recursive: true);
  });

  test('typed summaries use real totals and secondary scoring data', () {
    final adviser = OverviewSummary.fromJson(critical());
    expect(adviser.learnerCount, 40);
    expect(adviser.classCount, 4);
    expect(adviser.supportCount, 3);
    final teacher = OverviewSummary.fromJson(critical(adviser: false));
    expect(teacher.learnerCount, 150);
    expect(teacher.supportCount, isNull);
    expect(OverviewSummary.fromJson({}).classCount, isNull);
    expect(
      OverviewSummary.fromJson({
        'kpi': {'classCount': -1},
      }).classCount,
      isNull,
    );
    expect(
      OverviewAttention.fromJson({'pendingAssessments': 2}).pendingAssessments,
      2,
    );
    expect(
      OverviewAttention.fromJson({'openFlags': 99}).pendingAssessments,
      isNull,
    );
  });
  test('periods use server start time, recess and lunch precedence', () {
    final config = SchoolDayConfig.fromJson(configJson());
    expect(config.periods[0], (start: 450, end: 510));
    expect(config.periods[2], (start: 585, end: 645));
    expect(config.periods[4], (start: 795, end: 855));
    final sameBreak = {
      ...configJson(),
      'morningRecess': {'enabled': true, 'afterPeriod': 4, 'mins': 15},
    };
    expect(SchoolDayConfig.fromJson(sameBreak).periods[4].start, 780);
    expect(() => SchoolDayConfig.fromJson({}), throwsFormatException);
    expect(
      () => SchoolDayConfig.fromJson({...configJson(), 'startTime': '99:99'}),
      throwsFormatException,
    );
  });
  test(
    'next class uses Philippine time, approved slots and zero-based periods',
    () {
      final now = DateTime.utc(2026, 11, 15, 23);
      final result = schedule(
        slots: [
          slot(period: 2),
          slot(status: 'SUBMITTED'),
          slot(period: 1),
        ],
      ).nextClass(now)!;
      expect(result.startsAt, DateTime.utc(2026, 11, 16, 0, 30));
      expect(result.endsAt, DateTime.utc(2026, 11, 16, 1, 30));
      expect(result.slot.period, 1);
      final nextWeek = schedule().nextClass(DateTime.utc(2026, 11, 20, 12))!;
      expect(philippineTime(nextWeek.startsAt).weekday, DateTime.monday);
      expect(philippineTime(nextWeek.startsAt).day, 23);
    },
  );
  test(
    'historical, future, missing-date and term-end scopes never invent classes',
    () {
      final now = DateTime.utc(2026, 11, 16);
      expect(
        schedule(scope: term(end: DateTime.utc(2025))).nextClass(now),
        isNull,
      );
      expect(
        schedule(scope: term(start: DateTime.utc(2027))).scopeNotice(now),
        contains('different term'),
      );
      final undated = Term(
        id: 'u',
        schoolYearId: 'year',
        schoolYearName: '',
        termNumber: 1,
      );
      expect(
        schedule(scope: undated).scopeNotice(now),
        contains('dates aren’t available'),
      );
      expect(
        schedule(
          scope: term(end: now.add(const Duration(hours: 1))),
          slots: [slot(period: 7)],
        ).nextClass(now),
        isNull,
      );
      expect(
        schedule(
          slots: [
            slot(status: 'SUBMITTED'),
            slot(period: 50),
          ],
        ).nextClass(now),
        isNull,
      );
    },
  );
  test('schedule shares existing source and reloads on term change without chart calls', () async {
    final api = TestApi();
    final store = TestTerm();
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        termProvider.overrideWith((ref) => store),
        schoolYearsProvider.overrideWith(
          (ref) => [
            SchoolYear(
              id: 'year',
              name: 'Year',
              isActive: true,
              terms: [
                term(),
                term(id: 'next'),
              ],
            ),
          ],
        ),
      ],
    );
    addTearDown(container.dispose);
    addTearDown(api.dio.close);
    final sub = container.listen(overviewScheduleProvider, (_, _) {});
    addTearDown(sub.close);
    await container.read(overviewScheduleProvider.future);
    await container.read(adviserScheduleProvider.future);
    expect(api.paths.where((p) => p.endsWith('/my-slots')).length, 1);
    await store.select(term(id: 'next'));
    expect(
      (await container.read(overviewScheduleProvider.future)).term.id,
      'next',
    );
    expect(api.paths.where((p) => p.endsWith('/my-slots')).length, 2);
    expect(api.paths.any((p) => p.endsWith('/insights')), isFalse);
  });

  testWidgets(
    'compact sections are in the requested order with no charts or tables',
    (tester) async {
      await mountOverview(tester);
      final headings = [
        'Overview',
        'QUICK ACTIONS',
        'Up next',
        'Needs attention',
        'At a glance',
      ];
      for (var i = 1; i < headings.length; i++) {
        expect(
          tester.getTopLeft(find.text(headings[i])).dy,
          greaterThan(tester.getTopLeft(find.text(headings[i - 1])).dy),
        );
      }
      expect(find.text('Welcome back, Maria Santos.'), findsOneWidget);
      expect(find.textContaining('2026–2027 · Term 2'), findsOneWidget);
      expect(find.textContaining('Grade 8 – Arts'), findsOneWidget);
      expect(find.text('2 assessments with missing scores'), findsOneWidget);
      expect(find.text('3 learners may need support'), findsOneWidget);
      expect(find.textContaining('grade flags'), findsNothing);
      for (final title in [
        'Risk mix',
        'Subject averages',
        'Assessment pipeline',
        'Daily values',
      ]) {
        expect(find.text(title), findsNothing);
      }
      expect(find.byType(DataTable), findsNothing);
      expect(find.text('99'), findsNothing);
      await tester.ensureVisible(find.text('At a glance'));
      expect(find.text('40'), findsOneWidget);
      expect(find.text('150'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  for (final action in [
    (label: 'Chat with Bama', path: '/adviser/bama'),
    (label: 'Enter grades', path: '/workspace/gradebook'),
    (label: 'Take attendance', path: '/workspace/attendance'),
  ]) {
    testWidgets(
      '${action.label} opens its existing destination without resetting chat',
      (tester) async {
        await mountOverview(tester);
        await tester.tap(find.text(action.label));
        await tester.pumpAndSettle();
        expect(find.text('Opened ${action.path}'), findsOneWidget);
      },
    );
  }
  testWidgets(
    'subject teachers see disabled Bama and shared actions and totals',
    (tester) async {
      await mountOverview(tester, adviser: false);
      expect(find.text('Advisers only'), findsOneWidget);
      await tester.tap(find.text('Chat with Bama'));
      await tester.pumpAndSettle();
      expect(find.byType(OverviewPage), findsOneWidget);
      expect(find.textContaining('may need support'), findsNothing);
      expect(find.text('Need support'), findsNothing);
      await tester.ensureVisible(find.text('At a glance'));
      expect(find.text('150'), findsOneWidget);
      await tester.ensureVisible(find.text('Enter grades'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enter grades'));
      await tester.pumpAndSettle();
      expect(find.text('Opened /workspace/gradebook'), findsOneWidget);
    },
  );
  for (final adviser in [true, false]) {
    testWidgets('schedule link uses accessible route for adviser=$adviser', (
      tester,
    ) async {
      await mountOverview(tester, adviser: adviser);
      await tester.ensureVisible(find.text('View schedule'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('View schedule'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Opened ${adviser ? '/adviser/schedule' : '/workspace/schedule'}',
        ),
        findsOneWidget,
      );
    });
  }
  testWidgets('both attention summaries link to accessible screens', (
    tester,
  ) async {
    await mountOverview(tester);
    await tester.ensureVisible(find.text('2 assessments with missing scores'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2 assessments with missing scores'));
    await tester.pumpAndSettle();
    expect(find.text('Opened /workspace/gradebook'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('3 learners may need support'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 learners may need support'));
    await tester.pumpAndSettle();
    expect(find.text('Opened /adviser/advisory'), findsOneWidget);
  });
  testWidgets(
    'partial secondary failure leaves quick actions and schedule usable',
    (tester) async {
      await mountOverview(
        tester,
        loadSecondary: () => throw ApiException('NETWORK', 'private SQL'),
      );
      expect(find.text('Enter grades'), findsOneWidget);
      expect(find.text('Mathematics'), findsOneWidget);
      expect(find.textContaining('internet connection'), findsOneWidget);
      expect(find.textContaining('private SQL'), findsNothing);
      expect(find.textContaining('No missing scores'), findsNothing);
    },
  );
  testWidgets('all-clear applies only to known checks, not missing data', (
    tester,
  ) async {
    await mountOverview(
      tester,
      adviser: false,
      loadSecondary: () => {'pendingAssessments': 0},
    );
    expect(find.text('No missing scores from these checks.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await mountOverview(tester, loadSecondary: () => {});
    expect(find.text('Grading summary is unavailable.'), findsOneWidget);
    expect(find.textContaining('No missing scores'), findsNothing);
    await tester.ensureVisible(find.text('Check Gradebook'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check Gradebook'));
    await tester.pumpAndSettle();
    expect(find.text('Opened /workspace/gradebook'), findsOneWidget);
  });
  testWidgets(
    'unavailable totals stay unknown and zero assignments keep quick actions',
    (tester) async {
      await mountOverview(
        tester,
        loadCritical: () => {
          'isAdviser': true,
          'teacherName': 'Teacher',
          'kpi': {'classCount': 0},
        },
      );
      expect(find.text('Enter grades'), findsOneWidget);
      expect(
        find.text('Your advisory support summary is unavailable.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('At a glance'));
      expect(find.text('0'), findsOneWidget);
      expect(find.text('—'), findsNWidgets(2));
      expect(find.text('Unavailable'), findsNWidgets(2));
    },
  );
  testWidgets(
    'loading schedule and secondary data never blocks quick actions',
    (tester) async {
      final secondary = Completer<Map<String, dynamic>>();
      final upcoming = Completer<OverviewSchedule>();
      await mountOverview(
        tester,
        loadSecondary: () => secondary.future,
        loadSchedule: () => upcoming.future,
      );
      expect(find.text('Enter grades'), findsOneWidget);
      expect(find.textContaining('No missing scores'), findsNothing);
      expect(find.textContaining('No upcoming confirmed'), findsNothing);
      secondary.complete({'pendingAssessments': 0});
      upcoming.complete(schedule(slots: []));
      await tester.pumpAndSettle();
      expect(
        find.text('No upcoming confirmed classes in this term.'),
        findsOneWidget,
      );
    },
  );
  testWidgets('schedule errors are friendly, isolated and retryable', (
    tester,
  ) async {
    var calls = 0;
    await mountOverview(
      tester,
      loadSchedule: () {
        if (++calls == 1) throw ApiException('NETWORK', 'private');
        return schedule();
      },
    );
    expect(find.text('2 assessments with missing scores'), findsOneWidget);
    await tester.ensureVisible(find.text('Try again'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Mathematics'), findsOneWidget);
  });
  testWidgets('historical timetable is not displayed as todays next class', (
    tester,
  ) async {
    await mountOverview(
      tester,
      loadSchedule: () => schedule(
        scope: term(start: DateTime.utc(1999), end: DateTime.utc(2000)),
      ),
    );
    expect(find.textContaining('different term'), findsOneWidget);
    expect(find.text('Mathematics'), findsNothing);
  });
  testWidgets(
    'pull refresh waits for every request and duplicate refreshes coalesce',
    (tester) async {
      Completer<Map<String, dynamic>>? pending;
      var calls = 0;
      await mountOverview(
        tester,
        loadSecondary: () {
          calls++;
          return pending?.future ?? {'pendingAssessments': 2};
        },
      );
      pending = Completer<Map<String, dynamic>>();
      final callback = tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh;
      final first = callback();
      final second = callback();
      var finished = false;
      unawaited(first.then((_) => finished = true));
      await tester.pump();
      expect(finished, isFalse);
      expect(calls, 2);
      pending.complete({'pendingAssessments': 0});
      await tester.pumpAndSettle();
      await Future.wait([first, second]);
      expect(finished, isTrue);
    },
  );
  testWidgets(
    'poll pauses off-route and returning from tasks refreshes all sections',
    (tester) async {
      var calls = 0;
      var secondaryCalls = 0;
      var scheduleCalls = 0;
      await mountOverview(
        tester,
        loadCritical: () {
          calls++;
          return critical();
        },
        loadSecondary: () {
          secondaryCalls++;
          return {'pendingAssessments': 2};
        },
        loadSchedule: () {
          scheduleCalls++;
          return schedule();
        },
      );
      await tester.pump(const Duration(seconds: 21));
      await tester.pumpAndSettle();
      expect([calls, secondaryCalls, scheduleCalls], [2, 2, 2]);
      await tester.tap(find.text('Enter grades'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 21));
      expect(calls, 2);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect([calls, secondaryCalls, scheduleCalls], [3, 3, 3]);
    },
  );
  testWidgets('refresh pauses in the background and resumes on foreground', (
    tester,
  ) async {
    var calls = 0;
    await mountOverview(
      tester,
      loadSecondary: () {
        calls++;
        return {'pendingAssessments': 2};
      },
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    addTearDown(
      () => tester.binding.handleAppLifecycleStateChanged(
        AppLifecycleState.resumed,
      ),
    );
    await tester.pump(const Duration(seconds: 21));
    expect(calls, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(calls, 2);
  });
  testWidgets('term changes reload each section and replace old totals', (
    tester,
  ) async {
    var calls = 0;
    var secondaryCalls = 0;
    var scheduleCalls = 0;
    await mountOverview(
      tester,
      loadCritical: () {
        calls++;
        return {...critical(), 'advisoryTotal': calls == 1 ? 40 : 22};
      },
      loadSecondary: () {
        secondaryCalls++;
        return {'pendingAssessments': 2};
      },
      loadSchedule: () {
        scheduleCalls++;
        return schedule();
      },
    );
    final container = ProviderScope.containerOf(
      tester.element(find.byType(OverviewPage)),
    );
    await container
        .read(termProvider.notifier)
        .select(
          Term(
            id: 'new-term',
            schoolYearId: 'year',
            schoolYearName: '2027–2028',
            termNumber: 3,
          ),
        );
    await tester.pumpAndSettle();
    expect([calls, secondaryCalls, scheduleCalls], [2, 2, 2]);
    expect(find.textContaining('2027–2028 · Term 3'), findsOneWidget);
    await tester.ensureVisible(find.text('At a glance'));
    expect(find.text('22'), findsOneWidget);
    expect(find.text('40'), findsNothing);
  });
  for (final width in [320.0, 700.0, 1200.0]) {
    for (final adviser in [true, false]) {
      testWidgets(
        'compact overview fits $width at 1.5x text, adviser=$adviser',
        (tester) async {
          await mountOverview(
            tester,
            width: width,
            scale: 1.5,
            adviser: adviser,
          );
          await tester.ensureVisible(find.text('At a glance'));
          await tester.pumpAndSettle();
          final thrown = tester.takeException();
          expect(thrown, isNull);
          expect(find.text('Chat with Bama'), findsOneWidget);
          expect(
            Theme.of(
              tester.element(find.byType(OverviewPage)),
            ).scaffoldBackgroundColor,
            ZWorkspace.background,
          );
        },
      );
    }
  }
  testWidgets('light workspace keeps the same compact overview readable', (
    tester,
  ) async {
    await mountOverview(tester, theme: zLightTheme());
    final theme = Theme.of(tester.element(find.byType(OverviewPage)));
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, ZLight.background);
    expect(find.text('Welcome back, Maria Santos.'), findsOneWidget);
    expect(find.textContaining('2026–2027 · Term 2'), findsOneWidget);
    expect(find.text('2 assessments with missing scores'), findsOneWidget);
    await tester.ensureVisible(find.text('At a glance'));
    await tester.pumpAndSettle();
    expect(find.text('40'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('quick actions reflow on resize without losing overview state', (
    tester,
  ) async {
    var calls = 0;
    await mountOverview(
      tester,
      width: 700,
      loadCritical: () {
        calls++;
        return critical();
      },
    );
    expect(
      tester.getTopLeft(find.text('Enter grades')).dx,
      greaterThan(tester.getTopLeft(find.text('Chat with Bama')).dx),
    );
    tester.view.physicalSize = const Size(320, 900);
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.text('Enter grades')).dy,
      greaterThan(tester.getTopLeft(find.text('Chat with Bama')).dy),
    );
    expect(calls, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'action borders are aligned, softly accented and keyboard accessible',
    (tester) async {
      await mountOverview(tester, adviser: false);
      final bama = find.widgetWithText(OutlinedButton, 'Chat with Bama');
      final grades = find.widgetWithText(OutlinedButton, 'Enter grades');
      final attendance = find.widgetWithText(OutlinedButton, 'Take attendance');
      expect(tester.getSize(bama).height, tester.getSize(grades).height);
      expect(tester.getSize(grades).height, tester.getSize(attendance).height);
      expect(tester.getSize(grades).height, greaterThanOrEqualTo(48));
      expect(tester.widget<OutlinedButton>(bama).onPressed, isNull);
      final style = tester.widget<OutlinedButton>(grades).style!;
      expect(
        (style.shape!.resolve({})! as RoundedRectangleBorder).borderRadius,
        BorderRadius.circular(ZTokens.radiusXl),
      );
      expect(
        style.side!.resolve({WidgetState.focused})!.color,
        ZDesk.dataAccent(tester.element(grades)),
      );
      expect(style.side!.resolve({WidgetState.focused})!.width, 1.5);
      expect(style.side!.resolve({})!.width, 1);
      expect(
        style.animationDuration,
        Duration.zero,
      ); // Reduced motion in fixture.
      Focus.of(tester.element(find.text('Enter grades'))).requestFocus();
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.text('Opened /workspace/gradebook'), findsOneWidget);
    },
  );
  for (final width in [320.0, 700.0]) {
    testWidgets('stats share one bordered panel and retain links at $width', (
      tester,
    ) async {
      await mountOverview(tester, width: width);
      final panel = find.byKey(const ValueKey('overview-stats-panel'));
      await tester.ensureVisible(panel);
      await tester.pumpAndSettle();
      final material = tester.widget<Material>(
        find.descendant(of: panel, matching: find.byType(Material)).first,
      );
      expect(
        (material.shape! as RoundedRectangleBorder).borderRadius,
        BorderRadius.circular(ZTokens.radiusXl),
      );
      expect(
        find.descendant(of: panel, matching: find.byType(InkWell)),
        findsNWidgets(3),
      );
      expect(
        find.descendant(
          of: panel,
          matching: find.byType(width >= 330 ? VerticalDivider : Divider),
        ),
        findsNWidgets(2),
      );
      await tester.ensureVisible(find.text('CLASSES'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('CLASSES'));
      await tester.pumpAndSettle();
      expect(find.text('Opened /workspace/classes'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('drawer retains Overview as first destination', (tester) async {
    final api = TestApi();
    addTearDown(api.dio.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          authProvider.overrideWith((ref) => AuthNotifier(api)),
          termProvider.overrideWith((ref) => TestTerm()),
          overviewProvider.overrideWith((ref) => critical()),
        ],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: const Scaffold(
            body: ZentraDrawer(selectedPath: '/workspace/overview'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final tile = find.widgetWithText(ListTile, 'Overview');
    expect(tester.widget<ListTile>(tile).selected, isTrue);
    expect(
      tester.getTopLeft(tile).dy,
      lessThan(tester.getTopLeft(find.text('Advisory list')).dy),
    );
  });
  for (final adviser in [true, false]) {
    for (final verified in [true, false]) {
      testWidgets(
        'staff landing preserves verification: adviser=$adviser, verified=$verified',
        (tester) async {
          final api = TestApi()..verified = verified;
          final router = GoRouter(
            initialLocation: '/gate',
            routes: [
              GoRoute(path: '/gate', builder: (_, _) => const FirstTimeGate()),
              GoRoute(
                path: '/workspace/overview',
                builder: (_, _) =>
                    const Scaffold(body: Text('Overview landing')),
              ),
            ],
          );
          addTearDown(router.dispose);
          addTearDown(api.dio.close);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                apiClientProvider.overrideWithValue(api),
                authProvider.overrideWith((ref) => AuthNotifier(api)),
                termProvider.overrideWith((ref) => TestTerm()),
                overviewProvider.overrideWith(
                  (ref) => critical(adviser: adviser),
                ),
              ],
              child: MaterialApp.router(
                theme: zWorkspaceTheme(),
                routerConfig: router,
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(
            find.text(verified ? 'Overview landing' : 'Verify for this term'),
            verified ? findsOneWidget : findsNWidgets(2),
          );
        },
      );
    }
  }
  testWidgets('class linking still precedes Overview', (tester) async {
    final api = TestApi()..linked = false;
    addTearDown(api.dio.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          overviewProvider.overrideWith((ref) => critical()),
        ],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: const FirstTimeGate(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Link your classes'), findsNWidgets(2));
    expect(find.byType(OverviewPage), findsNothing);
  });
}
