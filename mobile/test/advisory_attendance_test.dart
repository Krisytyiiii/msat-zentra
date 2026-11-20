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
import 'package:zentra_mobile/design/screen_search.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/advisory_attendance_data.dart';
import 'package:zentra_mobile/features/adviser/advisory_attendance_detail_page.dart';
import 'package:zentra_mobile/features/adviser/advisory_attendance_page.dart';
import 'package:zentra_mobile/shared/models.dart';
import 'package:zentra_mobile/shared/names.dart';

Map<String, dynamic> subjectRow(String id, String name, String code) => {
  'id': id,
  'name': name,
  'code': code,
};

Map<String, dynamic> studentRow({
  required String id,
  required String name,
  String lrn = '123456789012',
  String learnerType = 'regular',
  Map<String, double?> rates = const {},
  Map<String, int> meetups = const {},
  Map<String, int> presentMeetups = const {},
}) => {
  'studentId': id,
  'name': name,
  'lrn': lrn,
  'mascot': null,
  'learnerType': learnerType,
  'rates': rates,
  'meetups': meetups,
  'presentMeetups': presentMeetups,
};

Map<String, dynamic> matrixRow({
  required String sectionId,
  required String sectionName,
  List<Map<String, dynamic>> subjects = const [],
  List<Map<String, dynamic>> students = const [],
}) => {
  'sectionId': sectionId,
  'sectionName': sectionName,
  'termId': 'term-1',
  'subjects': subjects,
  'students': students,
};

Term selectedTerm() => Term(
  id: 'term-1',
  schoolYearId: 'year-1',
  schoolYearName: '2026–2027',
  termNumber: 1,
);

class AttendanceTerm extends TermNotifier {
  AttendanceTerm() {
    state = selectedTerm();
  }
  @override
  Future<void> select(Term term) async {
    state = term;
  }
}

class MissingTerm extends TermNotifier {
  MissingTerm() {
    state = null;
  }

  @override
  Future<void> select(Term term) async {
    state = term;
  }
}

class AttendanceAuth extends AuthNotifier {
  AttendanceAuth(super.api) {
    state = const AuthState(loggedIn: true, portal: 'staff', role: 'adviser');
  }
}

class AttendanceApi extends ApiClient {
  AttendanceApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          requests.add(options);
          try {
            if (options.method != 'GET') {
              throw StateError('Unexpected write: ${options.path}');
            }
            Object data;
            if (options.path == '/api/teacher/advisory/students') {
              data = {
                'students': const <Map<String, dynamic>>[],
                'advisorySections': sections,
              };
            } else if (options.path ==
                '/api/attendance/section-subject-matrix') {
              if (failMatrix) {
                handler.reject(
                  DioException(
                    requestOptions: options,
                    type: DioExceptionType.badResponse,
                    response: Response(
                      requestOptions: options,
                      statusCode: 503,
                      data: {
                        'error': {
                          'code': 'DATABASE_ERROR',
                          'message': 'private database details',
                        },
                      },
                    ),
                  ),
                );
                return;
              }
              final sectionId =
                  options.queryParameters['sectionId']?.toString() ?? '';
              final gate = gates[sectionId];
              if (gate != null) await gate.future;
              final matrix = matrices[sectionId];
              if (matrix == null) {
                handler.reject(
                  DioException(
                    requestOptions: options,
                    type: DioExceptionType.badResponse,
                    response: Response(
                      requestOptions: options,
                      statusCode: 404,
                      data: {
                        'error': {
                          'code': 'SECTION_NOT_FOUND',
                          'message': 'Section not found',
                        },
                      },
                    ),
                  ),
                );
                return;
              }
              data = matrix;
            } else {
              throw StateError('Unexpected endpoint: ${options.path}');
            }
            handler.resolve(
              Response(requestOptions: options, statusCode: 200, data: data),
            );
          } catch (error) {
            handler.reject(DioException(requestOptions: options, error: error));
          }
        },
      ),
    );
  }

  final requests = <RequestOptions>[];
  final sections = <Map<String, dynamic>>[];
  final matrices = <String, Map<String, dynamic>>{};
  final gates = <String, Completer<void>>{};
  bool failMatrix = false;

  Iterable<RequestOptions> get matrixRequests => requests.where(
    (request) => request.path == '/api/attendance/section-subject-matrix',
  );

  List<String> get matrixSections => [
    for (final request in matrixRequests)
      request.queryParameters['sectionId'].toString(),
  ];

  @override
  Future<String?> accessToken() async => null;
}

AttendanceApi fullApi() {
  final math = subjectRow('math', 'Mathematics', 'MATH');
  final science = subjectRow('science', 'Science', 'SCI');
  final api = AttendanceApi();
  api.sections.addAll(const [
    {'id': 'section-a', 'name': 'Grade 8 – Arts'},
    {'id': 'section-b', 'name': 'Grade 9 – Sining'},
  ]);
  api.matrices['section-a'] = matrixRow(
    sectionId: 'section-a',
    sectionName: 'Grade 8 – Arts',
    subjects: [math, science],
    students: [
      studentRow(
        id: 'learner-juan',
        name: 'Juan Dela Cruz',
        rates: {'math': 1.0, 'science': 0.5},
        meetups: {'math': 3, 'science': 2},
        presentMeetups: {'math': 3, 'science': 1},
      ),
      studentRow(
        id: 'learner-maria',
        name: 'Maria Santos',
        lrn: '987654321012',
        learnerType: 'transferee',
      ),
    ],
  );
  api.matrices['section-b'] = matrixRow(
    sectionId: 'section-b',
    sectionName: 'Grade 9 – Sining',
    subjects: [math],
    students: [
      studentRow(
        id: 'learner-pedro',
        name: 'Pedro Reyes',
        lrn: '111222333444',
        rates: {'math': 0.8},
        meetups: {'math': 5},
        presentMeetups: {'math': 4},
      ),
    ],
  );
  return api;
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> mount(
  WidgetTester tester,
  AttendanceApi api, {
  double width = 390,
  double height = 900,
  double scale = 1,
  String initial = '/adviser/advisory/attendance',
  ScreenSearchController? search,
  bool noTerm = false,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(api.dio.close);
  final router = GoRouter(
    initialLocation: initial,
    routes: [
      GoRoute(
        path: '/adviser/advisory/attendance',
        builder: (_, _) => Scaffold(
          body: search == null
              ? const AdvisoryAttendancePage()
              : ScreenSearchScope(
                  controller: search,
                  child: const AdvisoryAttendancePage(),
                ),
        ),
      ),
      GoRoute(
        path: '/adviser/advisory/attendance/:studentId',
        builder: (_, state) {
          final extra = state.extra;
          final selection = extra is AdvisoryAttendanceSelection
              ? extra
              : null;
          return AdvisoryAttendanceDetailPage(
            studentId: Uri.decodeComponent(
              state.pathParameters['studentId'] ?? '',
            ),
            sectionId: state.uri.queryParameters['section'],
            student: selection?.student,
            subjects: selection?.subjects,
          );
        },
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        authProvider.overrideWith((ref) => AttendanceAuth(api)),
        termProvider.overrideWith(
          (ref) => noTerm ? MissingTerm() : AttendanceTerm(),
        ),
      ],
      child: MaterialApp.router(
        theme: zWorkspaceTheme(),
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
  await settle(tester);
}

Future<void> pickSection(WidgetTester tester, String name) async {
  await tester.tap(
    find.byKey(const ValueKey('advisory-attendance-section')),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(name));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temporary;

  setUpAll(() async {
    temporary = await Directory.systemTemp.createTemp('zentra-advisory-att-');
    Hive.init(temporary.path);
    await Hive.openBox(AppConfig.termScopeBox);
    await Hive.openBox(AppConfig.outboxBox);
  });

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('dev.fluttercommunity.plus/connectivity'),
          (call) async => ['wifi'],
        );
  });

  tearDownAll(() async {
    await Hive.close();
    await temporary.delete(recursive: true);
  });

  group('attendance maths', () {
    test('averages only the subjects that have marks', () {
      expect(attendanceOverall({'a': 1.0, 'b': null, 'c': 0.5}, 3), 0.75);
      expect(attendanceOverall({'a': null}, 1), isNull);
      expect(attendanceOverall(const {}, 0), isNull);
      expect(attendancePercent(0.866), 87);
      expect(attendancePercent(null), isNull);
    });

    test('totals every subject meetup in the learner window', () {
      final student = AdvisoryAttendanceStudent.fromJson(
        studentRow(
          id: 'learner-1',
          name: 'Juan Dela Cruz',
          meetups: {'math': 3, 'science': 2},
          presentMeetups: {'math': 3, 'science': 1},
        ),
      );
      final totals = attendanceMeetupTotals(student);
      expect(totals.present, 4);
      expect(totals.total, 5);
    });

    test('reads the matrix tolerantly', () {
      final matrix = SectionAttendanceMatrix.fromJson(
        matrixRow(
          sectionId: 'section-a',
          sectionName: 'Grade 8 – Arts',
          subjects: [subjectRow('math', 'Mathematics', 'MATH')],
          students: [
            {
              'studentId': 'learner-1',
              'name': 'Juan Dela Cruz',
              'lrn': '123456789012',
              'learnerType': 'transferee',
              'rates': {'math': null, 'missing': 'nope'},
              'meetups': {'math': 0},
            },
          ],
        ),
      );
      expect(matrix.subjects.single.code, 'MATH');
      final student = matrix.students.single;
      expect(student.isTransferee, isTrue);
      expect(student.rates['math'], isNull);
      expect(student.rates['missing'], isNull);
      expect(student.meetups['math'], 0);
      expect(student.presentMeetups, isEmpty);
    });
  });

  group('names', () {
    test('reads surname first and keeps particles', () {
      expect(formatSurnameFirst('Juan Dela Cruz'), 'Dela Cruz, Juan');
      expect(formatSurnameFirst('Dela Cruz, Juan'), 'Dela Cruz, Juan');
      expect(formatSurnameFirst('Cher'), 'Cher');
      expect(
        compareSurnameFirst('Juan Dela Cruz', 'Maria Santos'),
        lessThan(0),
      );
    });
  });

  testWidgets('loads the first advisory section with surname-first rows', (
    tester,
  ) async {
    final api = fullApi();
    await mount(tester, api);

    expect(api.matrixSections, ['section-a']);
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
    expect(find.text('75%'), findsOneWidget);
    expect(find.text('Santos, Maria'), findsOneWidget);
    expect(find.text('Transferee'), findsOneWidget);
    expect(find.text('LRN 987654321012'), findsOneWidget);
    expect(find.text('—'), findsOneWidget);
    expect(find.text('2 students'), findsOneWidget);
  });

  testWidgets('filters by name and LRN with a no-match callout', (
    tester,
  ) async {
    final api = fullApi();
    await mount(tester, api);

    await tester.enterText(find.byType(TextField), 'maria');
    await tester.pump();
    expect(find.text('Santos, Maria'), findsOneWidget);
    expect(find.text('Dela Cruz, Juan'), findsNothing);

    await tester.enterText(find.byType(TextField), '123456789012');
    await tester.pump();
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
    expect(find.text('Santos, Maria'), findsNothing);

    await tester.enterText(find.byType(TextField), 'nobody');
    await tester.pump();
    expect(find.text('No students match'), findsOneWidget);
  });

  testWidgets('shell search filters the roster without a local field', (
    tester,
  ) async {
    final api = fullApi();
    final search = ScreenSearchController();
    addTearDown(search.dispose);
    await mount(tester, api, search: search);

    expect(find.byType(TextField), findsNothing);
    search.setQuery('maria');
    await tester.pumpAndSettle();
    expect(find.text('Santos, Maria'), findsOneWidget);
    expect(find.text('Dela Cruz, Juan'), findsNothing);

    search.setQuery('nobody');
    await tester.pumpAndSettle();
    expect(find.text('No students match'), findsOneWidget);

    search.clear();
    await tester.pumpAndSettle();
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
  });

  testWidgets('a new shell query starts on the first page', (tester) async {
    final api = AttendanceApi();
    api.sections.add({'id': 'section-a', 'name': 'Grade 8 – Arts'});
    api.matrices['section-a'] = matrixRow(
      sectionId: 'section-a',
      sectionName: 'Grade 8 – Arts',
      subjects: [subjectRow('math', 'Mathematics', 'MATH')],
      students: [
        for (var i = 0; i < 16; i++)
          studentRow(
            id: 'learner-$i',
            name: 'Juan Learner${i.toString().padLeft(2, '0')}',
            rates: {'math': 1.0},
            meetups: {'math': 1},
            presentMeetups: {'math': 1},
          ),
      ],
    );
    final search = ScreenSearchController();
    addTearDown(search.dispose);
    await mount(tester, api, height: 2000, search: search);

    await tester.tap(find.byTooltip('Next page'));
    await tester.pump();
    expect(find.text('2 / 2'), findsOneWidget);

    search.setQuery('learner00');
    await tester.pumpAndSettle();
    expect(find.text('1 student'), findsOneWidget);
    expect(find.text('Learner00, Juan'), findsOneWidget);
    expect(find.text('Learner15, Juan'), findsNothing);
  });

  testWidgets('pages the roster 15 at a time', (tester) async {
    final api = AttendanceApi();
    api.sections.add({'id': 'section-a', 'name': 'Grade 8 – Arts'});
    api.matrices['section-a'] = matrixRow(
      sectionId: 'section-a',
      sectionName: 'Grade 8 – Arts',
      subjects: [subjectRow('math', 'Mathematics', 'MATH')],
      students: [
        for (var i = 0; i < 16; i++)
          studentRow(
            id: 'learner-$i',
            name: 'Juan Learner${i.toString().padLeft(2, '0')}',
            rates: {'math': 1.0},
            meetups: {'math': 1},
            presentMeetups: {'math': 1},
          ),
      ],
    );
    await mount(tester, api, height: 4000);

    expect(find.text('16 students'), findsOneWidget);
    expect(find.text('1 / 2'), findsOneWidget);
    expect(find.text('Learner14, Juan'), findsOneWidget);
    expect(find.text('Learner15, Juan'), findsNothing);

    await tester.tap(find.byTooltip('Next page'));
    await tester.pump();
    expect(find.text('2 / 2'), findsOneWidget);
    expect(find.text('Learner15, Juan'), findsOneWidget);
    expect(find.text('Learner00, Juan'), findsNothing);

    await tester.tap(find.byTooltip('Previous page'));
    await tester.pump();
    expect(find.text('1 / 2'), findsOneWidget);
    expect(find.text('Learner00, Juan'), findsOneWidget);
  });

  testWidgets('switching section never paints the previous section', (
    tester,
  ) async {
    final api = fullApi();
    final gate = Completer<void>();
    api.gates['section-a'] = gate;
    await mount(tester, api);

    expect(find.text('Dela Cruz, Juan'), findsNothing);
    await pickSection(tester, 'Grade 9 – Sining');
    expect(find.text('Reyes, Pedro'), findsOneWidget);
    expect(api.matrixSections, containsAll(['section-a', 'section-b']));

    gate.complete();
    await settle(tester);
    expect(find.text('Reyes, Pedro'), findsOneWidget);
    expect(find.text('Dela Cruz, Juan'), findsNothing);
  });

  testWidgets('row tap opens the subject board and returns to the list', (
    tester,
  ) async {
    final api = fullApi();
    await mount(tester, api);

    await tester.tap(find.text('Dela Cruz, Juan'));
    await tester.pumpAndSettle();

    expect(find.text('Juan Dela Cruz'), findsOneWidget);
    expect(find.text('Student attendance'), findsOneWidget);
    expect(find.text('Present rate per subject'), findsOneWidget);
    expect(find.text('75% overall'), findsOneWidget);
    expect(find.text('2 subjects'), findsOneWidget);
    expect(find.text('4 of 5 meetups'), findsOneWidget);
    expect(find.text('On track'), findsOneWidget);
    expect(find.text('Regular · counted from term start'), findsOneWidget);
    expect(find.text('Mathematics'), findsOneWidget);
    expect(find.text('MATH'), findsOneWidget);
    expect(find.text('100%'), findsOneWidget);
    expect(find.text('3 of 3 meetups present'), findsOneWidget);
    expect(find.text('Science'), findsOneWidget);
    expect(find.text('50%'), findsOneWidget);
    expect(find.text('1 of 2 meetups present'), findsOneWidget);

    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
  });

  testWidgets('a deep link reloads the matrix and offers Close', (
    tester,
  ) async {
    final api = fullApi();
    await mount(
      tester,
      api,
      initial: '/adviser/advisory/attendance/learner-maria?section=section-a',
    );

    expect(find.text('Maria Santos'), findsOneWidget);
    expect(find.text('No data'), findsOneWidget);
    expect(
      find.text('Transferee · counted since enlistment'),
      findsOneWidget,
    );
    expect(find.text('No meetups elapsed yet'), findsNWidgets(2));
    expect(find.byTooltip('Close'), findsOneWidget);

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
  });

  testWidgets('an unknown deep-linked learner shows an unavailable state', (
    tester,
  ) async {
    final api = fullApi();
    await mount(
      tester,
      api,
      initial: '/adviser/advisory/attendance/missing?section=section-a',
    );

    expect(find.text('Learner not available'), findsOneWidget);
    expect(find.byTooltip('Close'), findsOneWidget);
  });

  testWidgets('matrix failure keeps a retryable message', (tester) async {
    final api = fullApi();
    api.failMatrix = true;
    await mount(tester, api);

    expect(find.text('Try again'), findsOneWidget);
    expect(find.text('private database details'), findsNothing);

    api.failMatrix = false;
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.text('Dela Cruz, Juan'), findsOneWidget);
  });

  testWidgets('no advisory section and no learners have their own states', (
    tester,
  ) async {
    final noSection = fullApi();
    noSection.sections.clear();
    await mount(tester, noSection);
    expect(find.text('No advisory section'), findsOneWidget);
    expect(noSection.matrixRequests, isEmpty);

    final noLearners = fullApi();
    noLearners.matrices['section-a'] = matrixRow(
      sectionId: 'section-a',
      sectionName: 'Grade 8 – Arts',
    );
    await mount(tester, noLearners);
    expect(find.text('No advisory students yet'), findsOneWidget);
  });

  testWidgets('no selected term asks for one instead of fetching', (
    tester,
  ) async {
    final api = fullApi();
    await mount(tester, api, noTerm: true);

    expect(
      find.text('Choose a school year and term to continue.'),
      findsOneWidget,
    );
    expect(api.matrixRequests, isEmpty);
  });

  testWidgets('the board marks a learner below 75% as at risk', (tester) async {
    final api = AttendanceApi();
    api.sections.add({'id': 'section-a', 'name': 'Grade 8 – Arts'});
    api.matrices['section-a'] = matrixRow(
      sectionId: 'section-a',
      sectionName: 'Grade 8 – Arts',
      subjects: [subjectRow('math', 'Mathematics', 'MATH')],
      students: [
        studentRow(
          id: 'learner-low',
          name: 'Ana Cruz',
          rates: {'math': 0.4},
          meetups: {'math': 5},
          presentMeetups: {'math': 2},
        ),
      ],
    );
    await mount(tester, api);

    expect(find.text('40%'), findsOneWidget);
    await tester.tap(find.text('Cruz, Ana'));
    await tester.pumpAndSettle();

    expect(find.text('40% overall'), findsOneWidget);
    expect(find.text('At risk'), findsOneWidget);
    expect(find.text('Regular · counted from term start'), findsOneWidget);
    expect(find.text('2 of 5 meetups present'), findsOneWidget);
  });

  for (final width in [320.0, 720.0, 1100.0]) {
    testWidgets('fits width $width with larger text', (tester) async {
      final api = fullApi();
      await mount(tester, api, width: width, height: 1600, scale: 1.3);

      expect(tester.takeException(), isNull);
      expect(find.text('Dela Cruz, Juan'), findsOneWidget);

      await tester.tap(find.text('Dela Cruz, Juan'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Student attendance'), findsOneWidget);
    });
  }
}
