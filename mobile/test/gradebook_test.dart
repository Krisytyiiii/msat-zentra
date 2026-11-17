import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/teacher/gradebook_data.dart';
import 'package:zentra_mobile/features/teacher/gradebook_page.dart';
import 'package:zentra_mobile/features/teacher/assessment_score_page.dart';
import 'package:zentra_mobile/features/teacher/gradebook_dashboard_page.dart';
import 'package:zentra_mobile/shared/models.dart';

Map<String, dynamic> fixture() => {
  'assignment': {
    'subjectName': 'Mathematics',
    'sectionName': 'Arts',
    'termNumber': 1,
    'schoolYear': '2026–2027',
  },
  'students': [
    {
      'id': 'student',
      'name': 'Ana Reyes',
      'lrn': '111',
      'final': {'lockStatus': 'unlocked', 'transmutedGrade': 85},
    },
    {
      'id': 'roster:r1',
      'name': 'Juan Dela Cruz',
      'lrn': '222',
      'hasAccount': false,
    },
    {
      'id': 'locked',
      'name': 'Zed Santos',
      'lrn': '333',
      'final': {'lockStatus': 'adviser_approved', 'transmutedGrade': 90},
    },
    {'id': 'adm', 'name': 'Mira Luna', 'lrn': '444', 'isAdm': true},
  ],
  'components': [
    {
      'type': 'WRITTEN_WORK',
      'weight': 40,
      'assessments': [
        {
          'id': 'quiz',
          'title': 'Quiz 1',
          'maxScore': 20,
          'audience': 'regular',
          'scores': {'roster:r1': 0, 'locked': 18},
        },
        {
          'id': 'adm-quiz',
          'title': 'ADM quiz',
          'maxScore': 50,
          'audience': 'adm',
          'scores': {},
        },
      ],
    },
    {
      'type': 'PERFORMANCE_TASK',
      'weight': 40,
      'assessments': [
        {'id': 'task', 'title': 'Project', 'maxScore': 100, 'scores': {}},
      ],
    },
    {
      'type': 'EXAM',
      'weight': 20,
      'assessments': [
        {'id': 'exam', 'title': 'Term exam', 'maxScore': 50, 'scores': {}},
      ],
    },
  ],
};

class TestTerm extends TermNotifier {
  TestTerm() {
    state = term();
  }
  static Term term([String id = 'term']) => Term(
    id: id,
    schoolYearId: 'year',
    schoolYearName: '2026–2027',
    termNumber: 1,
  );
  @override
  Future<void> select(Term value) async {
    state = value;
  }
}

class GradeApi extends ApiClient {
  GradeApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          requests.add(options);
          if (options.method == 'GET') {
            if (failLoad) {
              handler.reject(_error(options));
            } else {
              handler.resolve(
                Response(requestOptions: options, statusCode: 200, data: data),
              );
            }
          } else if (options.path.endsWith('/scores')) {
            if (holdScore != null) await holdScore!.future;
            if (failScore) {
              handler.reject(_error(options));
            } else {
              final body = options.data as Map;
              final scores = body['scores'] as List;
              final id = Uri.decodeComponent(options.path.split('/')[4]);
              for (final comp in data['components'] as List) {
                for (final assessment in comp['assessments'] as List) {
                  if (assessment['id'] == id) {
                    for (final score in scores) {
                      if (failedIds.contains(score['studentId'])) continue;
                      assessment['scores'] = <String, dynamic>{
                        ...Map<String, dynamic>.from(
                          assessment['scores'] as Map,
                        ),
                        score['studentId'] as String: score['rawScore'],
                      };
                    }
                  }
                }
              }
              handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'saved': scores
                        .where((s) => !failedIds.contains(s['studentId']))
                        .length,
                    'total': scores.length,
                    'results': [
                      for (final score in scores)
                        {
                          'studentId': score['studentId'],
                          'ok': !failedIds.contains(score['studentId']),
                        },
                    ],
                  },
                ),
              );
            }
          } else {
            final body = options.data as Map;
            final comp = (data['components'] as List).cast<Map>().firstWhere(
              (c) => c['type'] == body['componentType'],
            );
            (comp['assessments'] as List).add(<String, Object>{
              'id': 'added',
              'title': body['title'] as String,
              'maxScore': body['maxScore'] as num,
              'audience': body['audience'] as String,
              'scores': <String, dynamic>{},
            });
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: {'id': 'added'},
              ),
            );
          }
        },
      ),
    );
  }
  DioException _error(RequestOptions options) => DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(
      requestOptions: options,
      statusCode: 503,
      data: {
        'error': {'code': 'INTERNAL_ERROR', 'message': 'PRIVATE_DIAGNOSTIC'},
      },
    ),
  );
  Map<String, dynamic> data = fixture();
  bool failLoad = false;
  bool failScore = false;
  final failedIds = <String>{};
  Completer<void>? holdScore;
  final requests = <RequestOptions>[];
}

Future<ProviderContainer> mount(
  WidgetTester tester,
  GradeApi api, {
  double width = 390,
  double scale = 1,
  bool reduced = true,
  bool dashboard = false,
  bool secondaryFailure = false,
  String? initialLocation,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      termProvider.overrideWith((ref) => TestTerm()),
      overviewProvider.overrideWith(
        (ref) async => {
          'classes': [
            {
              'id': 'subject|section',
              'subject': 'A subject with a long title',
              'section': 'Grade 7 – A section with a long name',
              'gradeLevel': 'G7',
              'studentCount': 4,
            },
          ],
        },
      ),
      overviewSecondaryProvider.overrideWith((ref) async {
        if (secondaryFailure) throw ApiException('NETWORK', 'Offline');
        return {'assessments': [], 'standings': []};
      }),
    ],
  );
  addTearDown(container.dispose);
  final router = GoRouter(
    initialLocation:
        initialLocation ??
        (dashboard
            ? '/workspace/gradebook'
            : '/workspace/classes/subject%7Csection'),
    routes: [
      GoRoute(
        path: '/workspace/gradebook',
        builder: (_, _) => const Scaffold(body: GradebookDashboardPage()),
      ),
      GoRoute(
        path: '/workspace/classes',
        builder: (_, _) => const Scaffold(body: Text('Class list')),
      ),
      GoRoute(
        path: '/workspace/classes/:id',
        builder: (_, state) => GradebookPage(
          classId: state.pathParameters['id']!,
          title: 'Mathematics · Arts',
        ),
      ),
      GoRoute(
        path: '/workspace/classes/:id/assessments/:assessmentId',
        builder: (_, state) => AssessmentScorePage(
          classId: state.pathParameters['id']!,
          assessmentId: state.pathParameters['assessmentId']!,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            disableAnimations: reduced,
          ),
          child: child!,
        ),
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

Finder score([String learner = 'roster:r1', String assessment = 'quiz']) =>
    find.byKey(ValueKey('score-$assessment-$learner'));
Finder get scoreInput =>
    find.byKey(const ValueKey('assessment-score-roster:r1'));

void main() {
  var offline = false;
  const connectivity = MethodChannel('dev.fluttercommunity.plus/connectivity');
  setUpAll(() async {
    await Hive.openBox(AppConfig.termScopeBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.outboxBox, bytes: Uint8List(0));
  });
  setUp(() async {
    offline = false;
    await Hive.box(AppConfig.outboxBox).clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          connectivity,
          (_) async => [offline ? 'none' : 'wifi'],
        );
  });
  tearDownAll(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(connectivity, null);
    await Hive.close();
  });

  test('web DTOs retain roster IDs, surname order, locks and audiences', () {
    final data = ClassRecord.fromJson(fixture());
    expect(data.learners.map((s) => s.displayName), [
      'Dela Cruz, Juan',
      'Luna, Mira',
      'Reyes, Ana',
      'Santos, Zed',
    ]);
    expect(data.learners.first.id, 'roster:r1');
    expect(data.learners.last.locked, isTrue);
    expect(data.assessments.first.scores['roster:r1'], 0);
    expect(data.assessments[1].audience, 'adm');
    expect(gradeNumber(0), '0');
    expect(gradeNumber(9.5), '9.5');
  });

  testWidgets('opens the editable Class Record with frozen learner names', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    expect(find.text('Class Record'), findsOneWidget);
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
    expect(find.text('Luna, Mira'), findsNothing);
    expect(find.text('Quiz 1'), findsOneWidget);
    expect(find.byType(ExpansionTile), findsNothing);
    expect(
      find.descendant(of: score(), matching: find.text('0')),
      findsOneWidget,
    );
    final before = tester.getTopLeft(find.text('Dela Cruz, Juan'));
    await tester.drag(
      find.byKey(const ValueKey('record-horizontal')),
      const Offset(-700, 0),
    );
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Dela Cruz, Juan')), before);
    expect(
      api.requests.first.path,
      '/api/teacher/grading/classes/subject%7Csection',
    );
  });

  testWidgets('validates and saves roster scores using the web endpoint', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    for (final invalid in ['21', '-1', 'NaN', '']) {
      await tester.enterText(scoreInput, invalid);
      await tester.pump();
      await tester.tap(find.text('Save scores'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a score from 0 to 20.'), findsOneWidget);
      expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
    }
    await tester.enterText(scoreInput, '9.5');
    await tester.pump();
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    final post = api.requests.singleWhere((r) => r.method == 'POST');
    expect(post.path, '/api/grades/assessments/quiz/scores');
    expect(post.data, {
      'scores': [
        {'studentId': 'roster:r1', 'rawScore': 9.5},
      ],
    });
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: score(), matching: find.text('9.5')),
      findsOneWidget,
    );
  });

  testWidgets('unchanged values do not write and locked cells cannot edit', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    final locked = tester.widget<TextFormField>(
      find.byKey(const ValueKey('assessment-score-locked')),
    );
    expect(locked.enabled, isFalse);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Save scores'),
          )
          .onPressed,
      isNull,
    );
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
  });

  testWidgets('failed save retains entered score for retry', (tester) async {
    final api = GradeApi()..failScore = true;
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    await tester.enterText(scoreInput, '15');
    await tester.pump();
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    expect(scoreInput, findsOneWidget);
    expect(tester.widget<TextFormField>(scoreInput).controller!.text, '15');
    expect(find.textContaining('PRIVATE_DIAGNOSTIC'), findsNothing);
    api.failScore = false;
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    expect(find.text('0 changed'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: score(), matching: find.text('15')),
      findsOneWidget,
    );
  });

  testWidgets('same-frame double save sends only one write', (tester) async {
    final api = GradeApi()..holdScore = Completer<void>();
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    await tester.enterText(scoreInput, '12');
    await tester.pump();
    final save = tester
        .widget<FilledButton>(find.widgetWithText(FilledButton, 'Save scores'))
        .onPressed!;
    save();
    save();
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.method == 'POST'), hasLength(1));
    api.holdScore!.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('offline scores remain visibly queued, not falsely saved', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    offline = true;
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    await tester.enterText(scoreInput, '10');
    await tester.pump();
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    expect(find.text('Queued'), findsOneWidget);
    expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
    final operation = Hive.box(AppConfig.outboxBox).values.single as Map;
    expect(operation['path'], '/api/grades/assessments/quiz/score');
    expect(operation['body'], {'studentId': 'roster:r1', 'rawScore': 10.0});
  });

  testWidgets('Regular and ADM pools do not mix learners or assessments', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(find.widgetWithText(TextButton, 'ADM'));
    await tester.pumpAndSettle();
    expect(find.text('Luna, Mira'), findsOneWidget);
    expect(find.text('Dela Cruz, Juan'), findsNothing);
    expect(find.text('ADM quiz'), findsOneWidget);
    expect(find.text('Quiz 1'), findsNothing);
  });

  testWidgets(
    'workspace is view-only and assessment headers open a dedicated page',
    (tester) async {
      final api = GradeApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(tester, api);
      expect(find.byType(TextFormField), findsNothing);
      await tester.tap(find.byKey(const ValueKey('open-assessment-quiz')));
      await tester.pumpAndSettle();
      expect(find.byType(AssessmentScorePage), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('Quiz 1'), findsOneWidget);
      expect(find.text('Class Record'), findsNothing);
      expect(find.text('Save scores'), findsOneWidget);
    },
  );

  testWidgets('partial bulk success retries only failed learners', (
    tester,
  ) async {
    final api = GradeApi()..failedIds.add('student');
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    await tester.enterText(scoreInput, '12');
    final other = find.byKey(const ValueKey('assessment-score-student'));
    await tester.enterText(other, '15');
    await tester.pump();
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    expect(find.text('1 changed'), findsOneWidget);
    expect(find.text('Failed'), findsOneWidget);
    expect(tester.widget<TextFormField>(other).controller!.text, '15');
    final first = api.requests.singleWhere((r) => r.method == 'POST');
    expect((first.data as Map)['scores'], hasLength(2));
    api.failedIds.clear();
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    final retry = api.requests.lastWhere((r) => r.method == 'POST');
    expect(retry.data, {
      'scores': [
        {'studentId': 'student', 'rawScore': 15.0},
      ],
    });
    expect(find.text('0 changed'), findsOneWidget);
    expect(find.text('Failed'), findsNothing);
  });

  testWidgets(
    'Back offers keep/discard without silently losing unsaved edits',
    (tester) async {
      final api = GradeApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(tester, api);
      await tester.tap(score());
      await tester.pumpAndSettle();
      await tester.enterText(scoreInput, '11');
      await tester.pump();
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Discard unsaved scores?'), findsOneWidget);
      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextFormField>(scoreInput).controller!.text, '11');
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard changes'));
      await tester.pumpAndSettle();
      expect(find.text('Class Record'), findsOneWidget);
      expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
    },
  );

  testWidgets('Missing filter does not omit dirty edits hidden from view', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    await tester.enterText(scoreInput, '7');
    await tester.pump();
    await tester.tap(find.widgetWithText(TextButton, 'Missing'));
    await tester.pumpAndSettle();
    expect(scoreInput, findsNothing);
    expect(
      find.byKey(const ValueKey('assessment-score-student')),
      findsOneWidget,
    );
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    expect(api.requests.singleWhere((r) => r.method == 'POST').data, {
      'scores': [
        {'studentId': 'roster:r1', 'rawScore': 7.0},
      ],
    });
  });

  testWidgets('assessment deep links have a Close fallback to Class Record', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(
      tester,
      api,
      initialLocation: '/workspace/classes/subject%7Csection/assessments/quiz',
    );
    expect(find.byTooltip('Close'), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Class Record'), findsOneWidget);
  });

  testWidgets('score entry fits narrow screens with keyboard and larger text', (
    tester,
  ) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(
      tester,
      api,
      width: 320,
      scale: 1.5,
      initialLocation: '/workspace/classes/subject%7Csection/assessments/quiz',
    );
    await tester.enterText(scoreInput, '10');
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(
      tester.getBottomLeft(find.text('Save scores')).dy,
      lessThanOrEqualTo(620),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('vertical scrolling keeps score rows aligned with pinned names', (
    tester,
  ) async {
    final api = GradeApi();
    api.data['students'] = [
      for (var i = 0; i < 40; i++)
        {
          'id': 's$i',
          'name': 'Learner ${i.toString().padLeft(2, '0')}',
          'lrn': '$i',
        },
    ];
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    final header = tester.getTopLeft(find.text('Quiz 1'));
    await tester.drag(
      find.byKey(const ValueKey('record-names')),
      const Offset(0, -200),
    );
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.byKey(const ValueKey('learner-s4'))).dy,
      closeTo(tester.getTopLeft(score('s4')).dy, 1),
    );
    expect(tester.getTopLeft(find.text('Quiz 1')), header);
  });

  testWidgets(
    'empty assessment categories still open Class Record with the add menu',
    (tester) async {
      final api = GradeApi();
      api.data['components'] = <Map<String, dynamic>>[];
      addTearDown(() => api.dio.close(force: true));
      await mount(tester, api);
      expect(find.text('Class Record'), findsOneWidget);
      expect(find.text('Dela Cruz, Juan'), findsOneWidget);
      expect(find.text('No assessments'), findsNWidgets(3));
      expect(find.byTooltip('Add assessment'), findsOneWidget);
    },
  );

  testWidgets(
    'ADM creation carries the selected audience to the existing API',
    (tester) async {
      final api = GradeApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(tester, api);
      await tester.tap(find.widgetWithText(TextButton, 'ADM'));
      await tester.tap(find.byTooltip('Add assessment'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('assessment-dial-WRITTEN_WORK')),
      );
      await tester.pumpAndSettle();
      expect(find.text('ADM assessment'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Assessment title'),
        'Module task',
      );
      await tester.tap(find.text('Add assessment'));
      await tester.pumpAndSettle();
      expect(
        (api.requests.singleWhere((r) => r.method == 'POST').data
            as Map)['audience'],
        'adm',
      );
    },
  );

  testWidgets('load errors retry without exposing internal diagnostics', (
    tester,
  ) async {
    final api = GradeApi()..failLoad = true;
    addTearDown(() => api.dio.close(force: true));
    await mount(tester, api);
    expect(find.text('Try again'), findsOneWidget);
    expect(find.textContaining('PRIVATE_DIAGNOSTIC'), findsNothing);
    api.failLoad = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Class Record'), findsOneWidget);
  });

  for (final type in assessmentTypes.keys) {
    testWidgets(
      'floating menu creates a $type assessment with validated inputs',
      (tester) async {
        final api = GradeApi();
        addTearDown(() => api.dio.close(force: true));
        await mount(tester, api);
        await tester.tap(find.byTooltip('Add assessment'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(ValueKey('assessment-dial-$type')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Add assessment'));
        await tester.pumpAndSettle();
        expect(find.text('Enter an assessment title.'), findsOneWidget);
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Assessment title'),
          'New task',
        );
        await tester.enterText(
          find.byKey(const ValueKey('assessment-max-score')),
          '0',
        );
        await tester.tap(find.text('Add assessment'));
        await tester.pumpAndSettle();
        expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
        await tester.enterText(
          find.byKey(const ValueKey('assessment-max-score')),
          '25',
        );
        await tester.tap(find.text('Add assessment'));
        await tester.pumpAndSettle();
        final post = api.requests.singleWhere((r) => r.method == 'POST');
        expect(
          post.path,
          '/api/teacher/grading/classes/subject%7Csection/assessments',
        );
        expect(post.data, {
          'componentType': type,
          'title': 'New task',
          'maxScore': 25.0,
          'audience': 'regular',
        });
        expect(find.byType(AssessmentScorePage), findsOneWidget);
        expect(find.text('New task'), findsOneWidget);
      },
    );
  }

  testWidgets(
    'assessment dial matches advisory animation, dimensions and spacing',
    (tester) async {
      final api = GradeApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(tester, api, reduced: false);
      final main = find.byKey(const ValueKey('assessment-main-action'));
      expect(tester.getSize(main), const Size(56, 56));
      final anchor = tester.getBottomRight(main);
      await tester.tap(main);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 75));
      final rotation = tester.widget<RotationTransition>(
        find.byKey(const ValueKey('assessment-dial-rotation')),
      );
      expect(rotation.turns.value, greaterThan(0));
      expect(rotation.turns.value, lessThan(0.125));
      await tester.pump(const Duration(milliseconds: 75));
      expect(rotation.turns.value, 0.125);
      expect(tester.getBottomRight(main), anchor);
      final first = find.byKey(const ValueKey('assessment-dial-WRITTEN_WORK'));
      final next = find.byKey(
        const ValueKey('assessment-dial-PERFORMANCE_TASK'),
      );
      // Same as advisory: 40px visual small FAB within a 48px touch target.
      expect(tester.getSize(first), const Size(48, 48));
      expect(tester.getTopLeft(next).dy - tester.getBottomLeft(first).dy, 8);
      await tester.tapAt(const Offset(16, 250));
      await tester.pumpAndSettle();
      expect(first, findsNothing);
    },
  );

  testWidgets('term changes reject stale score confirmations', (tester) async {
    final api = GradeApi();
    addTearDown(() => api.dio.close(force: true));
    final container = await mount(tester, api);
    await tester.tap(score());
    await tester.pumpAndSettle();
    await tester.enterText(scoreInput, '15');
    await container.read(termProvider.notifier).select(TestTerm.term('next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save scores'));
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
    expect(find.textContaining('selected term changed'), findsOneWidget);
  });

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('Class Record fits $width with 1.5x text', (tester) async {
      final api = GradeApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(tester, api, width: width, scale: 1.5);
      expect(find.text('Class Record'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Add assessment'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'dashboard cards fit long names and never turn failed counts into zero',
    (tester) async {
      final api = GradeApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(
        tester,
        api,
        dashboard: true,
        width: 320,
        scale: 1.5,
        secondaryFailure: true,
      );
      expect(find.text('Open Class Record'), findsOneWidget);
      expect(find.text('Assessment counts unavailable. Retry'), findsOneWidget);
      expect(find.text('0'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
