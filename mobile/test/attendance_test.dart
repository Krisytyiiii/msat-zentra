import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/schedule_timing.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/workspace_attendance_page.dart';
import 'package:zentra_mobile/shared/models.dart';

final config = <String, dynamic>{
  'startTime': '07:00',
  'periodMins': 60,
  'lunch': {'afterPeriod': 4, 'mins': 60},
  'morningRecess': {'afterPeriod': 2, 'mins': 15, 'enabled': false},
  'afternoonRecess': {'afterPeriod': 6, 'mins': 15, 'enabled': false},
};

class TestTerm extends TermNotifier {
  TestTerm() {
    state = term('term');
  }
  static Term term(String id) => Term(
    id: id,
    schoolYearId: 'year',
    schoolYearName: '2026–2027',
    termNumber: 1,
  );
  @override
  Future<void> select(Term term) async {
    state = term;
  }
}

class AttendanceApi extends ApiClient {
  AttendanceApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (o, h) async {
          requests.add(o);
          Object data;
          if (o.path.endsWith('/teachers/me')) {
            data = {
              'teacherName': linked
                  ? {'id': 'teacher', 'name': 'Teacher'}
                  : null,
              'termGrant': entered ? {'attendanceVerified': verified} : null,
            };
          } else if (o.path.endsWith('/my-slots')) {
            data = {
              'slots': [
                for (final period in [0, 1])
                  {
                    'day': 2,
                    'period': period,
                    'status': 'APPROVED',
                    'section': {'id': 'section', 'name': 'Arts'},
                    'subject': {'id': 'subject', 'name': 'Mathematics'},
                  },
                {
                  'day': 2,
                  'period': 3,
                  'status': 'DRAFT',
                  'section': {'id': 'section', 'name': 'Arts'},
                  'subject': {'id': 'draft', 'name': 'Draft subject'},
                },
                if (extraSection)
                  {
                    'day': 3,
                    'period': 0,
                    'status': 'APPROVED',
                    'section': {'id': 'science', 'name': 'Science'},
                    'subject': {'id': 'physics', 'name': 'Physics'},
                  },
              ],
            };
          } else if (o.path.endsWith('/config')) {
            data = {'config': config};
          } else if (o.path.endsWith('/advisory/sections')) {
            data = {
              'advisorySections': advisory
                  ? [
                      {'id': 'section'},
                    ]
                  : [],
            };
          } else if (o.path.endsWith('/section-roster')) {
            if (holdRoster != null) await holdRoster!.future;
            data = {
              'sectionId': 'section',
              'termId': 'term',
              'students':
                  extraRoster ??
                  [
                    {
                      'studentId': 'roster:r1',
                      'name': 'Juan Dela Cruz',
                      'lrn': '111',
                    },
                    {'studentId': 'student', 'name': 'Ana Reyes', 'lrn': '222'},
                    {
                      'studentId': 'adm',
                      'name': 'Mira Luna',
                      'lrn': '333',
                      'admExempt': true,
                    },
                  ],
            };
          } else if (o.path.endsWith('/subject-days')) {
            data = {
              'termId': 'term',
              'termStart': '2026-11-01T00:00:00.000Z',
              'termEnd': '2026-12-31T23:59:59.000Z',
              'records': [],
            };
          } else if (o.path.endsWith('/subjects')) {
            data = {
              'subjects': [
                {
                  'subjectId': 'subject',
                  'canMark': true,
                  'isMine': true,
                  'assignmentId': 'other-assignment',
                  'myAssignmentId': 'mine',
                },
              ],
            };
          } else if (o.path.endsWith('/advisory/attendance')) {
            if (failMarks) {
              h.reject(error(o));
              return;
            }
            data = {
              'marks': [
                for (final m in marks.entries)
                  {'studentId': m.key, 'status': m.value},
              ],
              'mine': mine,
              'submittedBy': mine ? null : {'name': 'Other teacher'},
            };
          } else if (o.path.endsWith('/verify-attendance')) {
            verified = true;
            data = {'verified': true};
          } else if (o.path.endsWith('/bulk')) {
            if (holdSave != null) await holdSave!.future;
            if (failSave ||
                requests.where((r) => r.path.endsWith('/bulk')).length ==
                    failSaveNumber) {
              h.reject(error(o));
              return;
            }
            final rows = (o.data as Map)['records'] as List;
            for (final row in rows) {
              marks[row['studentId'] as String] = row['status'] as String;
            }
            data = {'count': rows.length};
          } else {
            h.reject(error(o));
            return;
          }
          h.resolve(Response(requestOptions: o, statusCode: 200, data: data));
        },
      ),
    );
  }
  DioException error(RequestOptions o) => DioException(
    requestOptions: o,
    type: DioExceptionType.badResponse,
    response: Response(
      requestOptions: o,
      statusCode: 503,
      data: {
        'error': {'code': 'INTERNAL_ERROR', 'message': 'PRIVATE_DIAGNOSTIC'},
      },
    ),
  );
  bool linked = true, entered = true, verified = true, advisory = false;
  bool mine = true, failMarks = false, failSave = false, extraSection = false;
  Completer<void>? holdRoster, holdSave;
  List<Map<String, dynamic>>? extraRoster;
  int? failSaveNumber;
  final marks = <String, String>{};
  final requests = <RequestOptions>[];
}

Future<ProviderContainer> mount(
  WidgetTester tester,
  AttendanceApi api, {
  double width = 390,
  double scale = 1,
  DateTime? now,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      termProvider.overrideWith((_) => TestTerm()),
      schoolYearsProvider.overrideWith(
        (_) async => [
          SchoolYear(
            id: 'year',
            name: '2026–2027',
            isActive: true,
            terms: [
              Term(
                id: 'term',
                schoolYearId: 'year',
                schoolYearName: '2026–2027',
                termNumber: 1,
                startDate: DateTime.utc(2026, 11, 1),
                endDate: DateTime.utc(2026, 12, 31),
              ),
              Term(
                id: 'different',
                schoolYearId: 'year',
                schoolYearName: '2026–2027',
                termNumber: 2,
                startDate: DateTime.utc(2027, 1, 1),
                endDate: DateTime.utc(2027, 3, 31),
              ),
            ],
          ),
        ],
      ),
      attendanceClockProvider.overrideWithValue(
        () => now ?? DateTime.utc(2026, 11, 17, 0, 30),
      ),
      overviewProvider.overrideWith((_) async => {}),
      overviewSecondaryProvider.overrideWith((_) async => {}),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(() => api.dio.close(force: true));
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
        home: const Scaffold(body: WorkspaceAttendancePage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

Future<void> openSheet(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Open attendance sheet').first);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Open attendance sheet'));
  await tester.pumpAndSettle();
}

Finder mark(String id, String status) =>
    find.byKey(ValueKey('attendance-$id-$status'));
Future<void> pick(WidgetTester tester, String id, String status) async {
  await tester.ensureVisible(mark(id, status));
  await tester.tap(mark(id, status));
  await tester.pumpAndSettle();
}

Future<void> save(WidgetTester tester) async {
  await tester.tap(find.text('Review changes'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Save attendance'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  var offline = false;
  const connectivity = MethodChannel('dev.fluttercommunity.plus/connectivity');
  setUpAll(() async {
    await Hive.openBox(AppConfig.termScopeBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.cacheBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.outboxBox, bytes: Uint8List(0));
  });
  setUp(() async {
    offline = false;
    await Hive.box(AppConfig.cacheBox).clear();
    await Hive.box(AppConfig.outboxBox).clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          connectivity,
          (_) async => [offline ? 'none' : 'wifi'],
        );
  });
  tearDownAll(() async {
    await Hive.close();
  });

  test('PH date and schedule gates match web live/past/week/term rules', () {
    final pair = AttendancePair('s', 'Arts', 'u', 'Math')
      ..slots.addAll([(day: 2, period: 0), (day: 2, period: 1)]);
    final timing = SchoolDayConfig.fromJson(config);
    AttendanceGate gate(String date, DateTime now) =>
        attendanceGate(pair, timing, date, '2026-11-01', '2026-12-31', now);
    final now = DateTime.utc(2026, 11, 17, 0, 30); // PH 08:30, period 2
    expect(gate('2026-11-17', now).slot, 2);
    expect(gate('2026-11-17', now).locked, false);
    expect(gate('2026-11-17', DateTime.utc(2026, 11, 16, 22)).locked, true);
    expect(gate('2026-11-17', DateTime.utc(2026, 11, 17, 2)).pastDue, true);
    expect(gate('2026-11-10', now).locked, true);
    expect(gate('2026-11-24', now).locked, true);
    expect(gate('2026-11-18', now).locked, true);
    expect(gate('2027-01-05', now).locked, true);
    expect(
      attendanceDay(philippineTime(DateTime.utc(2026, 11, 16, 17))),
      '2026-11-17',
    );
    final thursday = DateTime.utc(2026, 11, 19, 1);
    expect(gate('2026-11-17', thursday).locked, false);
    expect(gate('2026-11-17', thursday).slot, 1);
  });

  for (final linked in [false, true]) {
    testWidgets('code/entry gate prevents loading classes: linked=$linked', (
      tester,
    ) async {
      final api = AttendanceApi()
        ..linked = linked
        ..entered = false;
      await mount(tester, api);
      expect(
        find.text(linked ? 'Enter your school year' : 'Link your teacher code'),
        findsOneWidget,
      );
      expect(api.requests.any((r) => r.path.endsWith('/my-slots')), false);
    });
  }

  testWidgets('class screen defaults to today and explains empty dates', (
    tester,
  ) async {
    await mount(tester, AttendanceApi());
    expect(find.text('1 class · Tue, Nov 17'), findsOneWidget);
    expect(find.text('Tue, Nov 17, 2026'), findsOneWidget);
    expect(find.text('Live'), findsOneWidget);
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Today'))
          .onPressed,
      isNull,
    );
    await tester.tap(find.byTooltip('Next day'));
    await tester.pumpAndSettle();
    expect(find.text('0 classes · Wed, Nov 18'), findsOneWidget);
    expect(find.text('No scheduled classes on this date'), findsOneWidget);
    await tester.tap(find.text('Show all classes'));
    await tester.pumpAndSettle();
    expect(find.text('1 class · Wed, Nov 18'), findsOneWidget);
    expect(find.text('Read-only'), findsOneWidget);
    expect(find.text('No scheduled meetup on this date.'), findsOneWidget);
    await tester.tap(find.text('Today'));
    await tester.pumpAndSettle();
    expect(find.text('Live'), findsOneWidget);
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Today'))
          .onPressed,
      isNull,
    );
  });

  testWidgets('class screen filters by section and search', (tester) async {
    final api = AttendanceApi()..extraSection = true;
    await mount(tester, api);
    expect(find.text('Mathematics'), findsOneWidget);
    expect(find.text('Physics'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('attendance-all')));
    await tester.pumpAndSettle();
    expect(find.text('2 classes · Tue, Nov 17'), findsOneWidget);
    expect(find.text('Physics'), findsOneWidget);

    await tester.tap(find.text('All sections'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Science').last);
    await tester.pumpAndSettle();
    expect(find.text('1 class · Tue, Nov 17'), findsOneWidget);
    expect(find.text('Physics'), findsOneWidget);
    expect(find.text('Mathematics'), findsNothing);

    await tester.enterText(
      find.widgetWithText(TextField, 'Search subject or section'),
      'physics',
    );
    await tester.pumpAndSettle();
    expect(find.text('1 class · Tue, Nov 17'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'Search subject or section'),
      'nothing',
    );
    await tester.pumpAndSettle();
    expect(find.text('No classes match these filters'), findsOneWidget);
  });

  testWidgets('the class screen opens the selected day spreadsheet', (
    tester,
  ) async {
    final api = AttendanceApi();
    await mount(tester, api);
    await tester.tap(find.byKey(const ValueKey('attendance-all')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Previous day'));
    await tester.pumpAndSettle();
    expect(find.text('Mon, Nov 16, 2026'), findsOneWidget);
    final card = find.byKey(const ValueKey('attendance-class-section|subject'));
    await tester.ensureVisible(card);
    await tester.pumpAndSettle();
    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(
      api.requests
          .lastWhere((r) => r.path.endsWith('/advisory/attendance'))
          .queryParameters['date'],
      '2026-11-16T00:00:00Z',
    );
    expect(find.text('No scheduled meetup on this date.'), findsWidgets);
  });

  testWidgets('an out-of-term clock is clamped into the selected term', (
    tester,
  ) async {
    await mount(tester, AttendanceApi(), now: DateTime.utc(2027, 2, 1, 0, 30));
    expect(find.text('Thu, Dec 31, 2026'), findsOneWidget);
    expect(find.text('0 classes · Thu, Dec 31'), findsOneWidget);
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Today'))
          .onPressed,
      isNull,
    );
  });

  testWidgets(
    'deduplicates classes and uses roster, actual slot and dirty-only web payload',
    (tester) async {
      final api = AttendanceApi();
      await mount(tester, api);
      expect(find.text('Mathematics'), findsOneWidget);
      expect(find.text('Draft subject'), findsNothing);
      await openSheet(tester);
      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('Dela Cruz, Juan'), findsOneWidget);
      expect(find.text('Unmarked'), findsWidgets);
      expect(mark('adm', 'present'), findsNothing);
      expect(
        api.requests
            .lastWhere((r) => r.path.endsWith('/advisory/attendance'))
            .queryParameters['slot'],
        2,
      );
      await pick(tester, 'roster:r1', 'present');
      await save(tester);
      final post = api.requests.singleWhere((r) => r.path.endsWith('/bulk'));
      expect(post.data, {
        'sectionId': 'section',
        'termId': 'term',
        'date': '2026-11-17T00:00:00Z',
        'subjectId': 'subject',
        'slot': 2,
        'assignmentId': 'mine',
        'records': [
          {'studentId': 'roster:r1', 'status': 'present'},
        ],
      });
      expect(find.text('1 attendance marks saved.'), findsOneWidget);
      expect(find.text('0 changed · 0 queued'), findsOneWidget);
    },
  );

  testWidgets('marks failure never produces an editable all-Present sheet', (
    tester,
  ) async {
    final api = AttendanceApi()..failMarks = true;
    await mount(tester, api);
    await openSheet(tester);
    expect(mark('roster:r1', 'present'), findsNothing);
    expect(find.textContaining('PRIVATE_DIAGNOSTIC'), findsNothing);
    expect(api.requests.any((r) => r.method == 'POST'), false);
  });

  testWidgets('another teacher owns the sheet: no editing or save', (
    tester,
  ) async {
    final api = AttendanceApi()..mine = false;
    await mount(tester, api);
    await openSheet(tester);
    expect(find.textContaining('Other teacher'), findsOneWidget);
    expect(
      tester.widget<OutlinedButton>(mark('roster:r1', 'present')).onPressed,
      isNull,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Review changes'),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets(
    'failed saves retain draft for retry and only explicit changes are sent',
    (tester) async {
      final api = AttendanceApi()..failSave = true;
      await mount(tester, api);
      await openSheet(tester);
      await pick(tester, 'roster:r1', 'late');
      await save(tester);
      expect(find.text('1 changed · 0 queued'), findsOneWidget);
      expect(find.textContaining('PRIVATE_DIAGNOSTIC'), findsNothing);
      api.failSave = false;
      await save(tester);
      expect(find.text('0 changed · 0 queued'), findsOneWidget);
      expect(api.requests.where((r) => r.path.endsWith('/bulk')), hasLength(2));
    },
  );

  testWidgets('Back keeps a scoped draft and refresh does not overwrite it', (
    tester,
  ) async {
    final api = AttendanceApi();
    await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'excused');
    api.marks['student'] = 'present';
    await tester.tap(find.byTooltip('Refresh attendance'));
    await tester.pumpAndSettle();
    expect(find.text('1 changed · 0 queued'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    await openSheet(tester);
    expect(find.text('1 changed · 0 queued'), findsOneWidget);
    await save(tester);
    expect(
      (api.requests.lastWhere((r) => r.path.endsWith('/bulk')).data
          as Map)['records'],
      [
        {'studentId': 'roster:r1', 'status': 'excused'},
      ],
    );
  });

  testWidgets('offline saves queue and newer edits keep FIFO after reconnect', (
    tester,
  ) async {
    final api = AttendanceApi();
    await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'present');
    offline = true;
    await save(tester);
    expect(find.text('0 changed · 1 queued'), findsOneWidget);
    offline = false;
    await pick(tester, 'roster:r1', 'late');
    await save(tester);
    final ops = Hive.box(AppConfig.outboxBox).values.toList();
    expect(ops, hasLength(2));
    expect(ops[0]['body']['records'][0]['status'], 'present');
    expect(ops[1]['body']['records'][0]['status'], 'late');
    expect(api.requests.where((r) => r.path.endsWith('/bulk')), isEmpty);
  });

  testWidgets('ownership is rechecked after review before posting', (
    tester,
  ) async {
    final api = AttendanceApi();
    await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'absent');
    await tester.tap(find.text('Review changes'));
    await tester.pumpAndSettle();
    api.mine = false;
    await tester.tap(find.text('Save attendance'));
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.path.endsWith('/bulk')), isEmpty);
    expect(find.text('1 changed · 0 queued'), findsOneWidget);
  });

  testWidgets('term changes lock the sheet and reject stale confirmation', (
    tester,
  ) async {
    final api = AttendanceApi();
    final container = await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'present');
    await tester.tap(find.text('Review changes'));
    await tester.pumpAndSettle();
    await container
        .read(termProvider.notifier)
        .select(TestTerm.term('different'));
    await tester.pump();
    await tester.tap(find.text('Save attendance'));
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.path.endsWith('/bulk')), isEmpty);
    expect(find.textContaining('selected term changed'), findsOneWidget);
  });

  testWidgets('advisory-only grant cannot mark non-advisory classes', (
    tester,
  ) async {
    final api = AttendanceApi()..verified = false;
    await mount(tester, api);
    await openSheet(tester);
    expect(find.text('Verify teacher code'), findsOneWidget);
    expect(
      tester.widget<OutlinedButton>(mark('roster:r1', 'present')).onPressed,
      isNull,
    );
  });

  testWidgets(
    'adviser can mark own advisory with unverified attendance grant',
    (tester) async {
      final api = AttendanceApi()
        ..verified = false
        ..advisory = true;
      await mount(tester, api);
      await openSheet(tester);
      expect(
        tester.widget<OutlinedButton>(mark('roster:r1', 'present')).onPressed,
        isNotNull,
      );
    },
  );

  testWidgets('code verification unlocks the sheet with the web endpoint', (
    tester,
  ) async {
    final api = AttendanceApi()..verified = false;
    await mount(tester, api);
    await openSheet(tester);
    await tester.tap(find.text('Verify teacher code'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Teacher code'),
      'CODE123',
    );
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();
    expect(
      api.requests
          .singleWhere((r) => r.path.endsWith('/verify-attendance'))
          .data,
      {'code': 'CODE123'},
    );
    expect(
      tester.widget<OutlinedButton>(mark('roster:r1', 'present')).onPressed,
      isNotNull,
    );
  });

  testWidgets('search hides rows without losing changed statuses', (
    tester,
  ) async {
    final api = AttendanceApi();
    await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'late');
    await tester.enterText(
      find.widgetWithText(TextField, 'Search learner or LRN'),
      '222',
    );
    await tester.pumpAndSettle();
    expect(mark('roster:r1', 'late'), findsNothing);
    expect(find.text('Reyes, Ana'), findsOneWidget);
    await save(tester);
    expect(
      (api.requests.singleWhere((r) => r.path.endsWith('/bulk')).data
          as Map)['records'],
      [
        {'studentId': 'roster:r1', 'status': 'late'},
      ],
    );
  });

  testWidgets('repeated taps revert the draft to the saved server status', (
    tester,
  ) async {
    final api = AttendanceApi()..marks['roster:r1'] = 'present';
    await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'late');
    expect(find.text('1 changed · 0 queued'), findsOneWidget);
    await pick(tester, 'roster:r1', 'late');
    expect(find.text('0 changed · 0 queued'), findsOneWidget);
    expect(api.requests.any((r) => r.method == 'POST'), false);
  });

  testWidgets(
    'date switching keeps separate drafts and previous-week sheets locked',
    (tester) async {
      final api = AttendanceApi();
      await mount(tester, api);
      await openSheet(tester);
      await pick(tester, 'roster:r1', 'late');
      Future<void> choose(String date) async {
        await tester.tap(find.byIcon(Icons.calendar_today_outlined));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Switch to input'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField).last, date);
        await tester.tap(find.text('OK'));
        await tester.pumpAndSettle();
      }

      await choose('11/10/2026');
      expect(
        find.text('Previous-week attendance is read-only.'),
        findsOneWidget,
      );
      expect(
        tester.widget<OutlinedButton>(mark('roster:r1', 'present')).onPressed,
        isNull,
      );
      expect(find.text('Absent · not recorded'), findsWidgets);
      expect(find.text('0 changed · 0 queued'), findsOneWidget);
      await choose('11/17/2026');
      expect(find.text('1 changed · 0 queued'), findsOneWidget);
    },
  );

  testWidgets('saves at most 300 rows and retries only the failed batch', (
    tester,
  ) async {
    final api = AttendanceApi()
      ..failSaveNumber = 2
      ..extraRoster = [
        for (var i = 0; i < 301; i++)
          {'studentId': 'roster:$i', 'name': 'Learner $i', 'lrn': '$i'},
      ];
    await Hive.box(AppConfig.cacheBox).put(
      'attendance.draft.teacher.year:term.section|subject.2026-11-17.2',
      {for (var i = 0; i < 301; i++) 'roster:$i': 'present'},
    );
    await mount(tester, api);
    await openSheet(tester);
    expect(find.text('301 changed · 0 queued'), findsOneWidget);
    await save(tester);
    expect(find.text('1 changed · 0 queued'), findsOneWidget);
    final posts = api.requests.where((r) => r.path.endsWith('/bulk')).toList();
    expect((posts[0].data as Map)['records'], hasLength(300));
    expect((posts[1].data as Map)['records'], hasLength(1));
    await save(tester);
    expect(
      (api.requests.lastWhere((r) => r.path.endsWith('/bulk')).data
          as Map)['records'],
      hasLength(1),
    );
    expect(find.text('0 changed · 0 queued'), findsOneWidget);
  });

  testWidgets('saving blocks duplicate submissions and back navigation', (
    tester,
  ) async {
    final api = AttendanceApi()..holdSave = Completer<void>();
    await mount(tester, api);
    await openSheet(tester);
    await pick(tester, 'roster:r1', 'present');
    await tester.tap(find.text('Review changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save attendance'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<IconButton>(
            find.byWidgetPredicate(
              (w) => w is IconButton && w.tooltip == 'Back',
            ),
          )
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Saving…'))
          .onPressed,
      isNull,
    );
    api.holdSave!.complete();
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.path.endsWith('/bulk')), hasLength(1));
  });

  testWidgets('narrow search remains usable with keyboard and larger text', (
    tester,
  ) async {
    await mount(tester, AttendanceApi(), width: 320, scale: 1.5);
    await openSheet(tester);
    await tester.tap(find.widgetWithText(TextField, 'Search learner or LRN'));
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester.getBottomLeft(find.text('Review changes')).dy,
      lessThanOrEqualTo(620),
    );
  });

  testWidgets('a late roster response after Back is ignored safely', (
    tester,
  ) async {
    final api = AttendanceApi()..holdRoster = Completer<void>();
    await mount(tester, api);
    await tester.tap(find.text('Open attendance sheet'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    api.holdRoster!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Take attendance'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 760.0, 1100.0]) {
    testWidgets('attendance fits width $width with larger text', (
      tester,
    ) async {
      await mount(tester, AttendanceApi(), width: width, scale: 1.5);
      expect(tester.takeException(), isNull);
      await openSheet(tester);
      expect(tester.takeException(), isNull);
      await pick(tester, 'roster:r1', 'present');
      await tester.tap(find.text('Review changes'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
