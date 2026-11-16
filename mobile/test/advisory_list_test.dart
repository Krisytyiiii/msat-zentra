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
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/advisory_list_page.dart';
import 'package:zentra_mobile/shared/models.dart';
import 'package:zentra_mobile/shared/widgets.dart' show RiskBadge;

Map<String, dynamic> activeStudent({
  String id = 'roster:learner-1',
  String name = 'Juan Active',
}) => {
  'studentId': id,
  'name': name,
  'lrn': '123456789012',
  'hasAccount': false,
  'attendanceRate': 0.875,
  'riskLevel': 'High',
  'flags': ['academic', 'attendance', 'behavioral'],
};
Map<String, dynamic> archivedStudent() => {
  'archiveId': 'archive-1',
  'studentId': 'roster:archived-learner',
  'name': 'Mira Archived',
  'lrn': '987654321012',
  'section': 'Grade 8 – Arts',
  'archivedAt': '2026-11-16T10:00:00.000Z',
  'hasAccount': false,
};
Term selectedTerm([String id = 'term-1']) => Term(
  id: id,
  schoolYearId: 'year-1',
  schoolYearName: '2026–2027',
  termNumber: 1,
);

class AdvisoryTerm extends TermNotifier {
  AdvisoryTerm() {
    state = selectedTerm();
  }
  @override
  Future<void> select(Term term) async {
    state = term;
  }
}

class AdvisoryAuth extends AuthNotifier {
  AdvisoryAuth(super.api) {
    state = const AuthState(loggedIn: true, portal: 'staff', role: 'adviser');
  }
}

class AdvisoryApi extends ApiClient {
  AdvisoryApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          requests.add(options);
          try {
            Object data;
            final path = options.path;
            final mutating = options.method != 'GET';
            if (mutating && pendingWrite != null) await pendingWrite!.future;
            if ((path.endsWith('/archived') && failArchived) ||
                (path.endsWith('/students') && failActive) ||
                (mutating && failWrite)) {
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
            if (path == '/api/teacher/advisory/students') {
              data = {
                'students': List.of(active),
                'advisorySections': [
                  {'id': 'section-1', 'name': 'Grade 8 – Arts'},
                ],
              };
            } else if (path == '/api/teacher/advisory/archived') {
              data = {'students': List.of(archived)};
            } else if (options.method == 'DELETE' &&
                path.startsWith('/api/teacher/advisory/roster/')) {
              final id = Uri.decodeComponent(path.split('/').last);
              final learner = active.firstWhere(
                (row) => row['studentId'] == id,
              );
              active.remove(learner);
              archived.add({
                ...learner,
                'archiveId': 'archive-new',
                'section': 'Grade 8 – Arts',
                'archivedAt': '2026-11-16T10:00:00Z',
              });
              data = {'archived': true};
            } else if (options.method == 'POST' && path.endsWith('/restore')) {
              final id = Uri.decodeComponent(path.split('/')[5]);
              final learner = archived.firstWhere(
                (row) => row['archiveId'] == id,
              );
              archived.remove(learner);
              active.add({...learner, 'riskLevel': 'Low', 'flags': <String>[]});
              data = {'restored': true};
            } else if (options.method == 'POST' &&
                path == '/api/teacher/advisory/roster') {
              final body = options.data as Map;
              active.add({
                ...activeStudent(
                  id: 'roster:new',
                  name: body['fullName'] as String,
                ),
                'lrn': body['lrn'],
              });
              data = {'studentId': 'roster:new'};
            } else {
              throw StateError('Unexpected endpoint: ${options.method} $path');
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
  final active = <Map<String, dynamic>>[activeStudent()];
  final archived = <Map<String, dynamic>>[archivedStudent()];
  bool failArchived = false;
  bool failActive = false;
  bool failWrite = false;
  Completer<void>? pendingWrite;
  Iterable<RequestOptions> get writes =>
      requests.where((request) => request.method != 'GET');
  int gets(String suffix) => requests
      .where(
        (request) => request.method == 'GET' && request.path.endsWith(suffix),
      )
      .length;
  @override
  Future<String?> accessToken() async => null;
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> mount(
  WidgetTester tester,
  AdvisoryApi api, {
  double width = 390,
  double scale = 1,
  bool reducedMotion = true,
}) async {
  tester.view.physicalSize = Size(width, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(api.dio.close);
  final router = GoRouter(
    initialLocation: '/adviser/list',
    routes: [
      GoRoute(
        path: '/adviser/list',
        builder: (_, _) => const Scaffold(body: AdvisoryListPage()),
      ),
      GoRoute(
        path: '/adviser/students/:id',
        builder: (_, state) =>
            Scaffold(body: Text('Learner ${state.pathParameters['id']}')),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        authProvider.overrideWith((ref) => AdvisoryAuth(api)),
        termProvider.overrideWith((ref) => AdvisoryTerm()),
        overviewProvider.overrideWith((ref) => {'isAdviser': true}),
      ],
      child: MaterialApp.router(
        theme: zWorkspaceTheme(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: reducedMotion,
            textScaler: TextScaler.linear(scale),
          ),
          child: child!,
        ),
      ),
    ),
  );
  await settle(tester);
}

Future<void> archives(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Advisory actions'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('advisory-dial-archived')));
  await settle(tester);
}

Future<void> addStudent(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Advisory actions'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('advisory-dial-add')));
  await settle(tester);
}

Future<void> openArchiveConfirmation(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Actions for Juan Active'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Archive student'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temporary;
  var offline = false;
  const connectivity = MethodChannel('dev.fluttercommunity.plus/connectivity');
  setUpAll(() async {
    temporary = await Directory.systemTemp.createTemp('zentra-advisory-tests-');
    Hive.init(temporary.path);
    await Hive.openBox(AppConfig.termScopeBox);
    await Hive.openBox(AppConfig.outboxBox);
  });
  setUp(() {
    offline = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          connectivity,
          (call) async => offline ? ['none'] : ['wifi'],
        );
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(connectivity, null),
  );
  tearDownAll(() async {
    await Hive.close();
    await temporary.delete(recursive: true);
  });

  test(
    'archive DTO retains archive identity and does not fabricate risk data',
    () {
      final learner = ArchivedAdvisoryStudent.fromJson(archivedStudent());
      expect(learner.archiveId, 'archive-1');
      expect(learner.studentId, 'roster:archived-learner');
      expect(learner.archivedAt, DateTime.utc(2026, 11, 16, 10));
      final roster = AdvisoryRoster.fromJson({
        'students': [],
        'advisorySections': [
          {'id': 's', 'name': 'Arts'},
        ],
      });
      expect(roster.students, isEmpty);
      expect(roster.sections.single.id, 's');
      expect(
        AdvisoryRoster.fromJson({
          'students': [activeStudent()],
        }).students.single.attendancePercentage,
        87.5,
      );
    },
  );
  test(
    'services use exact web methods and encode learner/archive IDs separately',
    () async {
      final api = AdvisoryApi();
      addTearDown(api.dio.close);
      final service = AdvisoryListService(api);
      await service.active();
      expect((await service.archived()).single.archiveId, 'archive-1');
      await service.archive('roster:learner-1');
      await service.restore('archive-1');
      expect(api.requests.map((r) => '${r.method} ${r.path}').toList(), [
        'GET /api/teacher/advisory/students',
        'GET /api/teacher/advisory/archived',
        'DELETE /api/teacher/advisory/roster/roster%3Alearner-1',
        'POST /api/teacher/advisory/archived/archive-1/restore',
      ]);
      expect(api.requests.first.queryParameters, isEmpty);
    },
  );
  test('an empty active roster keeps its sections and never falls back to overview', () async {
    final api = AdvisoryApi()..active.clear();
    addTearDown(api.dio.close);
    final roster = await AdvisoryListService(api).active();
    expect(roster.students, isEmpty);
    expect(roster.sections.single.id, 'section-1');
    expect(api.requests.length, 1);
  });
  test(
    'active failures stay visible instead of being swallowed by a fallback',
    () async {
      final api = AdvisoryApi()..failActive = true;
      addTearDown(api.dio.close);
      await expectLater(
        AdvisoryListService(api).active(),
        throwsA(isA<ApiException>()),
      );
      expect(api.requests.length, 1);
    },
  );
  testWidgets(
    'only floating menu exposes add/archive navigation and can be dismissed',
    (tester) async {
      final api = AdvisoryApi();
      await mount(tester, api);
      expect(find.text('Add student'), findsNothing);
      expect(find.text('Archived students'), findsNothing);
      expect(find.byType(FloatingActionButton), findsOneWidget);
      final position = tester.getBottomRight(find.byType(FloatingActionButton));
      expect(position.dx, 374);
      expect(position.dy, 812); // Same bottom: 88 anchor as Bama.
      await tester.tap(find.byTooltip('Advisory actions'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('advisory-dial-add')), findsOneWidget);
      expect(
        find.byKey(const ValueKey('advisory-dial-archived')),
        findsOneWidget,
      );
      expect(tester.hasRunningAnimations, isFalse);
      await tester.tapAt(const Offset(20, 350));
      await tester.pumpAndSettle();
      expect(find.text('Add student'), findsNothing);
      expect(api.gets('/archived'), 0);
    },
  );
  testWidgets(
    'dial matches Bama button sizes, label treatment and eight-pixel gaps',
    (tester) async {
      await mount(tester, AdvisoryApi());
      final main = find.byKey(const ValueKey('advisory-main-action'));
      expect(tester.getSize(main), const Size(56, 56));
      expect(tester.getBottomRight(main), const Offset(374, 812));
      await tester.tap(main);
      await tester.pumpAndSettle();
      final add = find.byKey(const ValueKey('advisory-dial-add'));
      final archived = find.byKey(const ValueKey('advisory-dial-archived'));
      // small FABs retain their 40px visual body inside a 48px touch target.
      expect(tester.getSize(add), const Size(48, 48));
      expect(tester.getSize(archived), const Size(48, 48));
      expect(tester.getBottomRight(add).dx, tester.getBottomRight(main).dx);
      expect(
        tester.getBottomRight(archived).dx,
        tester.getBottomRight(main).dx,
      );
      expect(
        tester.getTopLeft(main).dy - tester.getBottomRight(archived).dy,
        8,
      );
      expect(tester.getTopLeft(archived).dy - tester.getBottomRight(add).dy, 8);
      final label = find
          .ancestor(
            of: find.text('Add student'),
            matching: find.byType(Container),
          )
          .first;
      final container = tester.widget<Container>(label);
      expect(
        container.padding,
        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      );
      expect(
        (container.decoration! as BoxDecoration).borderRadius,
        BorderRadius.circular(6),
      );
      expect(tester.getTopLeft(add).dx - tester.getBottomRight(label).dx, 8);
      final copy = tester.widget<Text>(find.text('Add student')).style!;
      expect(copy.fontSize, 12);
      expect(copy.fontWeight, FontWeight.w600);
      expect(tester.widget<FloatingActionButton>(main).backgroundColor, isNull);
      expect(tester.widget<FloatingActionButton>(add).backgroundColor, isNull);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'dial expands and reverses in 150ms without changing its anchor',
    (tester) async {
      await mount(tester, AdvisoryApi(), reducedMotion: false);
      final main = find.byKey(const ValueKey('advisory-main-action'));
      final anchor = tester.getBottomRight(main);
      await tester.tap(main);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 75));
      final transition = tester.widget<SizeTransition>(
        find.byKey(const ValueKey('advisory-dial-options')),
      );
      expect(transition.sizeFactor.value, greaterThan(0));
      expect(transition.sizeFactor.value, lessThan(1));
      expect(tester.getBottomRight(main), anchor);
      await tester.pump(const Duration(milliseconds: 75));
      expect(transition.sizeFactor.value, 1);
      final rotation = tester.widget<RotationTransition>(
        find.byKey(const ValueKey('advisory-dial-rotation')),
      );
      expect(rotation.turns.value, 0.125);
      await tester.tap(main);
      await tester.pumpAndSettle();
      expect(find.text('Add student'), findsNothing);
      expect(tester.getBottomRight(main), anchor);
    },
  );
  testWidgets(
    'archived view fetches the web endpoint and ignores active risk/search filters',
    (tester) async {
      final api = AdvisoryApi();
      await mount(tester, api);
      await tester.enterText(find.byType(TextField), 'Juan');
      await tester.tap(find.widgetWithText(ChoiceChip, 'High'));
      await archives(tester);
      expect(api.gets('/archived'), 1);
      expect(find.text('Mira Archived'), findsOneWidget);
      expect(find.text('Grade 8 – Arts'), findsOneWidget);
      expect(find.textContaining('Archived Nov'), findsOneWidget);
      expect(find.byType(RiskBadge), findsNothing);
      expect(find.textContaining('Att '), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      await tester.enterText(find.byType(TextField), 'nothing');
      await tester.pumpAndSettle();
      expect(find.text('No archived students match'), findsOneWidget);
      await tester.tap(find.text('Back to advisory list'));
      await tester.pumpAndSettle();
      expect(find.text('Juan Active'), findsOneWidget);
    },
  );
  testWidgets(
    'restore uses archiveId, blocks duplicate writes, and refreshes both lists',
    (tester) async {
      final api = AdvisoryApi()..pendingWrite = Completer<void>();
      await mount(tester, api);
      await archives(tester);
      await tester.tap(find.text('Restore student'));
      await settle(tester);
      expect(find.text('Restoring…'), findsOneWidget);
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Restoring…'),
            )
            .onPressed,
        isNull,
      );
      expect(api.writes.length, 1);
      expect(
        api.writes.single.path,
        '/api/teacher/advisory/archived/archive-1/restore',
      );
      api.pendingWrite!.complete();
      await settle(tester);
      expect(find.text('No archived students'), findsOneWidget);
      expect(api.gets('/students'), 2);
      expect(api.gets('/archived'), 2);
      await tester.tap(find.text('Back to advisory list'));
      await tester.pumpAndSettle();
      expect(find.text('Mira Archived'), findsOneWidget);
    },
  );
  testWidgets(
    'archive has a named confirmation and cancellation never writes',
    (tester) async {
      final api = AdvisoryApi();
      await mount(tester, api);
      await openArchiveConfirmation(tester);
      expect(find.textContaining('not from the school'), findsOneWidget);
      expect(find.text('Juan Active'), findsNWidgets(2));
      expect(find.text('LRN 123456789012'), findsNWidgets(2));
      await tester.tap(find.text('Keep student'));
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
      await openArchiveConfirmation(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Archive student'));
      await settle(tester);
      expect(api.writes.single.method, 'DELETE');
      expect(
        api.writes.single.path,
        '/api/teacher/advisory/roster/roster%3Alearner-1',
      );
      expect(find.text('No advisees yet'), findsOneWidget);
      await archives(tester);
      expect(find.text('Juan Active'), findsOneWidget);
    },
  );
  testWidgets('restore/archive errors are friendly and preserve rows', (
    tester,
  ) async {
    final api = AdvisoryApi()..failWrite = true;
    await mount(tester, api);
    await archives(tester);
    await tester.tap(find.text('Restore student'));
    await settle(tester);
    expect(find.text('Mira Archived'), findsOneWidget);
    expect(find.text('Restore student'), findsOneWidget);
    expect(find.textContaining('private database'), findsNothing);
    expect(
      find.text('Something went wrong on our side. Please try again shortly.'),
      findsOneWidget,
    );
  });
  testWidgets(
    'archived errors retry and can load even if active roster failed',
    (tester) async {
      final api = AdvisoryApi()
        ..failActive = true
        ..failArchived = true;
      await mount(tester, api);
      await archives(tester);
      expect(find.text('Try again'), findsOneWidget);
      api.failArchived = false;
      await tester.tap(find.text('Try again'));
      await settle(tester);
      expect(find.text('Mira Archived'), findsOneWidget);
      expect(api.gets('/archived'), 2);
    },
  );
  testWidgets(
    'empty archives still support a refresh that waits for requests',
    (tester) async {
      final api = AdvisoryApi()..archived.clear();
      await mount(tester, api);
      await archives(tester);
      expect(find.text('No archived students'), findsOneWidget);
      final refresh = tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh();
      await settle(tester);
      await refresh;
      await tester.pumpAndSettle();
      expect(api.gets('/students'), 2);
      expect(api.gets('/archived'), 2);
    },
  );
  testWidgets('adding uses a keyboard-safe form and the unchanged roster API', (
    tester,
  ) async {
    final api = AdvisoryApi();
    await mount(tester, api, width: 320, scale: 1.5);
    await addStudent(tester);
    await tester.ensureVisible(find.text('Enlist student'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enlist student'));
    await tester.pumpAndSettle();
    expect(find.textContaining('12-digit LRN'), findsWidgets);
    expect(api.writes, isEmpty);
    final fields = find.byType(TextField);
    // The underlying search is also mounted; use the labeled form fields.
    await tester.enterText(
      find.widgetWithText(TextField, 'Full name'),
      'New Learner',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'LRN'),
      '111122223333',
    );
    expect(fields, findsNWidgets(3));
    tester.view.viewInsets = const FakeViewPadding(bottom: 320);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Enlist student'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enlist student'));
    await settle(tester);
    expect(api.writes.single.path, '/api/teacher/advisory/roster');
    expect(api.writes.single.data, {
      'fullName': 'New Learner',
      'lrn': '111122223333',
      'sectionId': 'section-1',
      'learnerType': 'regular',
    });
    expect(tester.takeException(), isNull);
  });
  testWidgets('offline restoration does not send a write', (tester) async {
    final api = AdvisoryApi();
    await mount(tester, api);
    await archives(tester);
    offline = true;
    await tester.tap(find.text('Restore student'));
    await settle(tester);
    expect(api.writes, isEmpty);
    expect(find.text('Mira Archived'), findsOneWidget);
    expect(find.textContaining('internet connection'), findsOneWidget);
  });
  testWidgets(
    'transferee selection preserves form data, is sent and locks during saving',
    (tester) async {
      final api = AdvisoryApi()..pendingWrite = Completer<void>();
      await mount(tester, api, width: 320, scale: 1.5);
      await addStudent(tester);
      final regular = find.widgetWithText(OutlinedButton, 'Regular student');
      final transferee = find.widgetWithText(OutlinedButton, 'Transferee');
      final scheme = Theme.of(tester.element(regular)).colorScheme;
      expect(
        tester
            .widget<OutlinedButton>(regular)
            .style!
            .backgroundColor!
            .resolve({}),
        scheme.primary.withValues(alpha: 0.10),
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Full name'),
        'Transfer Learner',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'LRN'),
        '111122223333',
      );
      await tester.ensureVisible(transferee);
      await tester.pumpAndSettle();
      await tester.tap(transferee);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<OutlinedButton>(transferee)
            .style!
            .backgroundColor!
            .resolve({}),
        scheme.primary.withValues(alpha: 0.10),
      );
      expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'Full name'))
            .controller!
            .text,
        'Transfer Learner',
      );
      expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'LRN'))
            .controller!
            .text,
        '111122223333',
      );
      expect(
        find.text(
          'Attendance starts on the day this student is enlisted, not the term start.',
        ),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Enlist student'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enlist student'));
      await settle(tester);
      expect(api.writes.single.data, {
        'fullName': 'Transfer Learner',
        'lrn': '111122223333',
        'sectionId': 'section-1',
        'learnerType': 'transferee',
      });
      expect(tester.widget<OutlinedButton>(regular).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(transferee).onPressed, isNull);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Enlisting…'),
            )
            .onPressed,
        isNull,
      );
      api.pendingWrite!.complete();
      await settle(tester);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'failed enlistment retains learner type and retry submits the same selection',
    (tester) async {
      final api = AdvisoryApi()..failWrite = true;
      await mount(tester, api);
      await addStudent(tester);
      await tester.enterText(
        find.widgetWithText(TextField, 'Full name'),
        'Transfer Learner',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'LRN'),
        '111122223333',
      );
      await tester.ensureVisible(find.text('Transferee'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Transferee'));
      await tester.ensureVisible(find.text('Enlist student'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enlist student'));
      await settle(tester);
      expect(
        find.text(
          'Something went wrong on our side. Please try again shortly.',
        ),
        findsOneWidget,
      );
      final selected = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Transferee'),
      );
      expect(selected.onPressed, isNotNull);
      expect(
        selected.style!.backgroundColor!.resolve({}),
        const Color(0xFF7EF5D0).withValues(alpha: 0.10),
      );
      api.failWrite = false;
      await tester.ensureVisible(find.text('Enlist student'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enlist student'));
      await settle(tester);
      expect(api.writes.length, 2);
      expect(
        api.writes.every(
          (request) => (request.data as Map)['learnerType'] == 'transferee',
        ),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'a newly opened add form defaults to regular rather than retaining the prior selection',
    (tester) async {
      await mount(tester, AdvisoryApi());
      await addStudent(tester);
      await tester.ensureVisible(find.text('Transferee'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Transferee'));
      await tester.pumpAndSettle();
      Navigator.of(tester.element(find.text('Learner type'))).pop();
      await settle(tester);
      await addStudent(tester);
      final regular = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Regular student'),
      );
      expect(
        regular.style!.backgroundColor!.resolve({}),
        const Color(0xFF7EF5D0).withValues(alpha: 0.10),
      );
      expect(
        find.text('Attendance is rated from the start of the term.'),
        findsOneWidget,
      );
    },
  );
  testWidgets('selected term changes refetch active and archived lists', (
    tester,
  ) async {
    final api = AdvisoryApi();
    await mount(tester, api);
    await archives(tester);
    api.archived.clear();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(AdvisoryListPage)),
    );
    await container.read(termProvider.notifier).select(selectedTerm('term-2'));
    await settle(tester);
    expect(find.text('No archived students'), findsOneWidget);
    expect(api.gets('/students'), 2);
    expect(api.gets('/archived'), 2);
  });
  testWidgets('failed archive keeps the active learner and allows retry', (
    tester,
  ) async {
    final api = AdvisoryApi()..failWrite = true;
    await mount(tester, api);
    await openArchiveConfirmation(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Archive student'));
    await settle(tester);
    expect(find.text('Juan Active'), findsOneWidget);
    expect(find.textContaining('private database'), findsNothing);
    expect(api.writes.single.method, 'DELETE');
    api.failWrite = false;
    await openArchiveConfirmation(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Archive student'));
    await settle(tester);
    expect(find.text('No advisees yet'), findsOneWidget);
    expect(api.writes.length, 2);
  });
  testWidgets('dismissing a saving add sheet cannot start a second mutation', (
    tester,
  ) async {
    final api = AdvisoryApi()..pendingWrite = Completer<void>();
    await mount(tester, api);
    await addStudent(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Full name'),
      'New Learner',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'LRN'),
      '111122223333',
    );
    await tester.ensureVisible(find.text('Enlist student'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enlist student'));
    await settle(tester);
    expect(api.writes.length, 1);
    Navigator.of(tester.element(find.text('Enlisting…'))).pop();
    await settle(tester);
    expect(
      tester
          .widget<FloatingActionButton>(find.byType(FloatingActionButton))
          .onPressed,
      isNull,
    );
    api.pendingWrite!.complete();
    await settle(tester);
    expect(find.text('New Learner'), findsOneWidget);
    expect(api.writes.length, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'bottom list padding keeps the last learner clear of the floating button',
    (tester) async {
      final api = AdvisoryApi();
      api.active
        ..clear()
        ..addAll(
          List.generate(
            20,
            (i) => activeStudent(id: 'roster:$i', name: 'Learner $i'),
          ),
        );
      await mount(tester, api, width: 320);
      final scrollable = find.descendant(
        of: find.byKey(const PageStorageKey('active-advisees')),
        matching: find.byType(Scrollable),
      );
      final state = tester.state<ScrollableState>(scrollable);
      state.position.jumpTo(state.position.maxScrollExtent);
      await tester.pumpAndSettle();
      final row = find.byKey(const ValueKey('active-roster:19'));
      expect(row, findsOneWidget);
      expect(
        tester.getBottomRight(row).dy,
        lessThan(tester.getTopLeft(find.byType(FloatingActionButton)).dy),
      );
    },
  );
  testWidgets(
    'a term change while confirming prevents archiving the wrong scope',
    (tester) async {
      final api = AdvisoryApi();
      await mount(tester, api);
      await openArchiveConfirmation(tester);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AdvisoryListPage)),
      );
      await container
          .read(termProvider.notifier)
          .select(selectedTerm('term-2'));
      await settle(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Archive student'));
      await settle(tester);
      expect(api.writes, isEmpty);
      expect(find.textContaining('selected term changed'), findsOneWidget);
    },
  );
  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('active and archived layouts fit $width at larger text', (
      tester,
    ) async {
      final api = AdvisoryApi();
      await mount(tester, api, width: width, scale: 1.5);
      expect(tester.takeException(), isNull);
      await archives(tester);
      expect(find.text('Mira Archived'), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(
        tester
            .getSize(find.widgetWithText(OutlinedButton, 'Restore student'))
            .height,
        greaterThanOrEqualTo(48),
      );
    });
  }
}
