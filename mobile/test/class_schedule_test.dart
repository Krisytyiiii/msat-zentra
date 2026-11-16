import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/screen_search.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/adviser_schedule_page.dart';
import 'package:zentra_mobile/features/adviser/class_schedule_data.dart';
import 'package:zentra_mobile/features/adviser/schedule_timing.dart';
import 'package:zentra_mobile/shared/models.dart';
import 'package:zentra_mobile/shared/widgets.dart';

Term _term([String id = 'term']) => Term(
  id: id,
  schoolYearId: 'year',
  schoolYearName: '2026–2027',
  termNumber: 1,
  startDate: DateTime.utc(2026, 11, 1),
  endDate: DateTime.utc(2026, 12, 1),
);

Map<String, dynamic> _config() => {
  'startTime': '07:30',
  'periodMins': 60,
  'lunch': {'afterPeriod': 4, 'mins': 90},
  'morningRecess': {'enabled': true, 'afterPeriod': 2, 'mins': 15},
  'afternoonRecess': {'enabled': false, 'afterPeriod': 6, 'mins': 15},
};

Map<String, dynamic> _entry(
  int period,
  String subject, {
  int day = 1,
  String status = 'APPROVED',
  String? teacher = 'Maria Santos',
}) => {
  'day': day,
  'period': period,
  'status': status,
  'subject': {'name': subject, 'code': 'SUB$period'},
  'teacherName': teacher == null ? null : {'name': teacher},
};

class _Term extends TermNotifier {
  _Term() {
    state = _term();
  }
  @override
  Future<void> select(Term term) async {
    state = term;
  }
}

class _Auth extends AuthNotifier {
  _Auth(super.api) {
    state = const AuthState(loggedIn: true, role: 'adviser');
  }
  void signOut() {
    state = const AuthState();
  }
}

class _Api extends ApiClient {
  _Api() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          if (options.path == failPath) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response(requestOptions: options, statusCode: 500),
              ),
            );
            return;
          }
          final Object data;
          switch (options.path) {
            case '/api/teacher/advisory/sections':
              data = {
                'advisorySections': noSection
                    ? []
                    : [
                        {'id': sectionId, 'name': 'Grade 7 – Arts'},
                      ],
              };
            case '/api/teacher/schedule':
              data = {
                'sections': missingSection
                    ? []
                    : [
                        {
                          'id': sectionId,
                          'name': 'Grade 7 – Arts',
                          'timetableEntries': rows,
                        },
                      ],
              };
            case '/api/teacher/schedule/config':
              data = {'config': config};
            case '/api/teacher/schedule/my-slots':
              data = {
                'slots': [
                  {
                    ..._entry(0, 'My Mathematics'),
                    'section': {'name': 'Grade 8 – Science'},
                  },
                ],
              };
            default:
              throw StateError('Unexpected API call: ${options.path}');
          }
          handler.resolve(
            Response(requestOptions: options, data: data, statusCode: 200),
          );
        },
      ),
    );
  }
  @override
  Future<String?> accessToken() async => null;
  String sectionId = 'section/id';
  String? failPath;
  bool noSection = false;
  bool missingSection = false;
  Map<String, dynamic> config = _config();
  List<Map<String, dynamic>> rows = [
    _entry(2, 'English', teacher: null),
    _entry(0, 'Mathematics'),
    _entry(1, 'Science', status: 'SUBMITTED', teacher: 'Leo Cruz'),
    _entry(3, 'Hidden draft', status: 'DRAFT'),
    _entry(0, 'Tuesday subject', day: 2),
  ];
  final requests = <RequestOptions>[];
}

List<Override> _overrides(_Api api) => [
  apiClientProvider.overrideWithValue(api),
  termProvider.overrideWith((ref) => _Term()),
  authProvider.overrideWith((ref) => _Auth(api)),
  schoolYearsProvider.overrideWith(
    (ref) async => [
      SchoolYear(
        id: 'year',
        name: '2026–2027',
        isActive: true,
        terms: [_term(), _term('next')],
      ),
    ],
  ),
];

Future<ProviderContainer> _mount(
  WidgetTester tester,
  _Api api, {
  bool advisory = true,
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(overrides: _overrides(api));
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(body: AdviserSchedulePage(advisory: advisory)),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  late Directory temp;
  setUpAll(() async {
    temp = await Directory('/tmp/opencode').createTemp('class-schedule-');
    Hive.init(temp.path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() async {
    await Hive.close();
    await temp.delete(recursive: true);
  });

  test(
    'advisory reads the same three endpoints as web and excludes drafts',
    () async {
      final api = _Api();
      final container = ProviderContainer(overrides: _overrides(api));
      addTearDown(container.dispose);
      addTearDown(() => api.dio.close(force: true));
      final sub = container.listen(classScheduleProvider(true), (_, _) {});
      addTearDown(sub.close);
      final data = await container.read(classScheduleProvider(true).future);
      expect(data.sectionName, 'Grade 7 – Arts');
      expect(data.entries.map((e) => e.slot.subjectName), [
        'Mathematics',
        'Science',
        'English',
        'Tuesday subject',
      ]);
      expect(data.entries[1].teacher, 'Leo Cruz');
      expect(data.entries[2].teacher, 'Unassigned');
      final request = api.requests.singleWhere(
        (r) => r.path == '/api/teacher/schedule',
      );
      expect(request.queryParameters, {'sectionId': 'section/id'});
      expect(
        api.requests.map((r) => r.path),
        isNot(contains('/api/teacher/schedule/my-slots')),
      );
      expect(data.config!.periods[2], (start: 585, end: 645));
    },
  );

  test('subject teachers and Overview keep their own teaching slots', () async {
    final api = _Api();
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);
    addTearDown(() => api.dio.close(force: true));
    final sub = container.listen(classScheduleProvider(false), (_, _) {});
    addTearDown(sub.close);
    final data = await container.read(classScheduleProvider(false).future);
    final overviewSlots = await container.read(adviserScheduleProvider.future);
    expect(data.entries.single.slot.subjectName, 'My Mathematics');
    expect(overviewSlots.single.subjectName, 'My Mathematics');
    expect(
      api.requests.map((r) => r.path),
      isNot(contains('/api/teacher/advisory/sections')),
    );
    expect(
      api.requests.where((r) => r.path.endsWith('/my-slots')),
      hasLength(1),
    );
  });

  test('Now uses Philippine time, term dates and exclusive end times', () {
    final entry = ClassScheduleEntry.fromJson(_entry(0, 'Math'), 'Arts');
    ClassSchedule schedule(Term term) => ClassSchedule(
      term: term,
      entries: [entry],
      config: SchoolDayConfig.fromJson(_config()),
    );
    expect(
      schedule(_term()).isNow(entry, DateTime.utc(2026, 11, 15, 23, 30)),
      isTrue,
    );
    expect(
      schedule(_term()).isNow(entry, DateTime.utc(2026, 11, 16, 0, 30)),
      isFalse,
    );
    expect(
      schedule(_term()).isNow(entry, DateTime.utc(2026, 11, 17, 0)),
      isFalse,
    );
    expect(
      schedule(_term()).isNow(entry, DateTime.utc(2027, 11, 15, 23, 30)),
      isFalse,
    );
    expect(
      schedule(
        Term(id: 'x', schoolYearId: 'year', schoolYearName: '', termNumber: 1),
      ).isNow(entry, DateTime.utc(2026, 11, 15, 23, 30)),
      isFalse,
    );
  });

  testWidgets(
    'Class Schedule shows ordered cards with teachers and actual times',
    (tester) async {
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api);
      await tester.tap(find.text('Mon 3'));
      await tester.pumpAndSettle();
      expect(find.text('Class Schedule'), findsOneWidget);
      expect(find.text('Section schedule'), findsNothing);
      expect(find.text('7:30 AM – 8:30 AM'), findsOneWidget);
      expect(find.text('9:45 AM – 10:45 AM'), findsOneWidget);
      expect(find.text('Leo Cruz'), findsOneWidget);
      expect(find.text('Unassigned'), findsOneWidget);
      expect(find.text('Hidden draft'), findsNothing);
      expect(
        tester.getTopLeft(find.text('Mathematics')).dy,
        lessThan(tester.getTopLeft(find.text('English')).dy),
      );
      await tester.tap(find.text('Tue 1'));
      await tester.pumpAndSettle();
      expect(find.text('Tuesday subject'), findsOneWidget);
      expect(find.text('Mathematics'), findsNothing);
      await tester.tap(find.text('Wed 0'));
      await tester.pumpAndSettle();
      expect(find.text('No classes on Wednesday'), findsOneWidget);
    },
  );

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('class cards fit $width at 1.5x text', (tester) async {
      final api = _Api()
        ..rows = [
          _entry(
            0,
            'Communication in a multicultural classroom',
            teacher: 'Maria Elena de los Santos',
          ),
        ];
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api, width: width, scale: 1.5);
      await tester.tap(find.text('Mon 1'));
      await tester.pumpAndSettle();
      expect(find.text('Maria Elena de los Santos'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('no advisory assignment is distinct from unpublished timetable', (
    tester,
  ) async {
    final api = _Api()..noSection = true;
    addTearDown(() => api.dio.close(force: true));
    final container = await _mount(tester, api);
    expect(find.text('No advisory section'), findsOneWidget);
    expect(
      api.requests.map((r) => r.path),
      isNot(contains('/api/teacher/schedule')),
    );
    api.noSection = false;
    api.rows = [];
    container.invalidate(classScheduleProvider(true));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(find.text('No published timetable'), findsOneWidget);
  });

  testWidgets(
    'missing API section surfaces error instead of false empty state',
    (tester) async {
      final api = _Api()..missingSection = true;
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api);
      expect(find.byType(ErrorView), findsOneWidget);
      expect(find.text('No published timetable'), findsNothing);
      api.missingSection = false;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.byType(ErrorView), findsNothing);
    },
  );

  testWidgets('configuration failures remain retryable errors', (tester) async {
    final api = _Api()..failPath = '/api/teacher/schedule/config';
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    expect(find.byType(ErrorView), findsOneWidget);
    api.failPath = null;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.byType(ErrorView), findsNothing);
  });

  testWidgets('sign-out removes the previous account schedule', (tester) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    final container = await _mount(tester, api);
    await tester.tap(find.text('Mon 3'));
    await tester.pumpAndSettle();
    expect(find.text('Mathematics'), findsOneWidget);
    (container.read(authProvider.notifier) as _Auth).signOut();
    await tester.pumpAndSettle();
    expect(find.text('Mathematics'), findsNothing);
    expect(find.byType(ErrorView), findsOneWidget);
  });

  testWidgets('pull-to-refresh reloads the timetable and preserves the day', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    await tester.tap(find.text('Tue 1'));
    await tester.pumpAndSettle();
    final before = api.requests.length;
    await tester.fling(find.byType(ListView), const Offset(0, 350), 1200);
    await tester.pumpAndSettle();
    expect(api.requests.length, greaterThan(before));
    expect(find.text('Tuesday subject'), findsOneWidget);
  });

  testWidgets('term changes reload the requested section without stale rows', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    final container = await _mount(tester, api);
    final before = api.requests.length;
    api.sectionId = 'new-section';
    api.rows = [_entry(0, 'New term class')];
    await container.read(termProvider.notifier).select(_term('next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mon 1'));
    await tester.pumpAndSettle();
    expect(api.requests.length, greaterThan(before));
    expect(find.text('New term class'), findsOneWidget);
    expect(find.text('Mathematics'), findsNothing);
    expect(
      api.requests
          .lastWhere((r) => r.path == '/api/teacher/schedule')
          .queryParameters,
      {'sectionId': 'new-section'},
    );
  });

  testWidgets('poll refreshes while visible and pauses in the background', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    final initial = api.requests.length;
    await tester.pump(const Duration(seconds: 20));
    await tester.pumpAndSettle();
    expect(api.requests.length, greaterThan(initial));
    final before = api.requests.length;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 40));
    expect(api.requests.length, before);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(api.requests.length, greaterThan(before));
  });

  test('Class Schedule is the advisory drawer/search title', () {
    expect(screenSearchSpecFor('/adviser/schedule').title, 'Class Schedule');
    expect(
      screenSearchCatalog(isAdviser: true).map((d) => d.label),
      contains('Class Schedule'),
    );
    expect(
      screenSearchCatalog(isAdviser: true).map((d) => d.label),
      isNot(contains('Section schedule')),
    );
  });
}
