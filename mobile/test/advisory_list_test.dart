import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/screen_search.dart';
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
  @override
  Future<String?> accessToken() async => null;

  AdvisoryApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          requests.add(options);
          if (options.path.endsWith('/students') && pendingRead != null) {
            await pendingRead!.future;
          }
          if (options.path.endsWith('/students') && failActive) {
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
          final Object data;
          if (options.path == '/api/teacher/advisory/students') {
            data = {
              'students': List.of(active),
              'advisorySections': [
                {'id': 'section-1', 'name': 'Grade 8 – Arts'},
              ],
            };
          } else if (options.path == '/api/teacher/advisory/archived') {
            data = {
              'students': [
                {
                  'archiveId': 'archive-1',
                  'studentId': 'roster:archived-learner',
                  'name': 'Mira Archived',
                  'lrn': '987654321012',
                  'section': 'Grade 8 – Arts',
                  'archivedAt': '2026-11-16T10:00:00Z',
                  'hasAccount': false,
                },
              ],
            };
          } else {
            data = {'ok': true};
          }
          handler.resolve(
            Response(requestOptions: options, statusCode: 200, data: data),
          );
        },
      ),
    );
  }
  final active = <Map<String, dynamic>>[activeStudent()];
  final requests = <RequestOptions>[];
  bool failActive = false;
  Completer<void>? pendingRead;
  int gets(String suffix) => requests
      .where((r) => r.method == 'GET' && r.path.endsWith(suffix))
      .length;
  List<RequestOptions> get writes =>
      requests.where((r) => r.method != 'GET').toList();
}

Future<ScreenSearchController> mount(
  WidgetTester tester,
  AdvisoryApi api, {
  double width = 390,
  double height = 900,
  double scale = 1,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(api.dio.close);
  final search = ScreenSearchController();
  addTearDown(search.dispose);
  final router = GoRouter(
    initialLocation: '/adviser/list',
    routes: [
      GoRoute(
        path: '/adviser/list',
        builder: (_, _) => ScreenSearchScope(
          controller: search,
          child: const Scaffold(body: AdvisoryListPage()),
        ),
      ),
      GoRoute(
        path: '/adviser/students/:id',
        builder: (_, state) {
          final student = state.extra! as AdvisoryStudent;
          return Scaffold(body: Text('Student details: ${student.name}'));
        },
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
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return search;
}

Future<void> selectFilter(
  WidgetTester tester,
  String label,
  String option,
) async {
  await tester.tap(find.byTooltip(label));
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temporary;
  setUpAll(() async {
    temporary = await Directory.systemTemp.createTemp('zentra-advisory-tests-');
    Hive.init(temporary.path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() async {
    await Hive.close();
    await temporary.delete(recursive: true);
  });

  test(
    'archive DTO and retained service contracts remain compatible',
    () async {
      final api = AdvisoryApi();
      addTearDown(api.dio.close);
      final service = AdvisoryListService(api);
      final roster = await service.active();
      expect(roster.students.single.attendancePercentage, 87.5);
      final archived = (await service.archived()).single;
      expect(archived.archiveId, 'archive-1');
      expect(archived.studentId, 'roster:archived-learner');
      expect(archived.archivedAt, DateTime.utc(2026, 11, 16, 10));
      await service.archive('roster:learner-1');
      await service.restore('archive-1');
      expect(api.requests.map((r) => '${r.method} ${r.path}'), [
        'GET /api/teacher/advisory/students',
        'GET /api/teacher/advisory/archived',
        'DELETE /api/teacher/advisory/roster/roster%3Alearner-1',
        'POST /api/teacher/advisory/archived/archive-1/restore',
      ]);
      await service.enlist(
        fullName: 'Transferee',
        lrn: '111122223333',
        sectionId: 'section-1',
        learnerType: AdvisoryLearnerType.transferee,
      );
      expect(api.requests.last.data['learnerType'], 'transferee');
    },
  );

  test(
    'empty rosters keep sections and service errors do not fall back',
    () async {
      final api = AdvisoryApi()..active.clear();
      addTearDown(api.dio.close);
      final service = AdvisoryListService(api);
      expect((await service.active()).sections.single.id, 'section-1');
      api.failActive = true;
      await expectLater(service.active(), throwsA(isA<ApiException>()));
      expect(api.gets('/archived'), 0);
    },
  );

  testWidgets(
    'screen is read-only and one risk indicator replaces the archive action',
    (tester) async {
      final api = AdvisoryApi();
      await mount(tester, api);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(find.text('Add student'), findsNothing);
      expect(find.text('Archived students'), findsNothing);
      expect(find.text('Archive student'), findsNothing);
      expect(find.text('Restore student'), findsNothing);
      expect(find.byTooltip('Advisory actions'), findsNothing);
      expect(find.byTooltip('Actions for Juan Active'), findsNothing);
      expect(find.byIcon(LucideIcons.ellipsis), findsNothing);
      final risk = find.byKey(const ValueKey('risk-roster:learner-1'));
      expect(find.byType(RiskBadge), findsOneWidget);
      expect(risk, findsOneWidget);
      expect(
        tester.getTopLeft(risk).dy,
        lessThan(tester.getTopLeft(find.text('Att 87.5%')).dy),
      );
      expect(
        tester.getTopLeft(risk).dx,
        greaterThan(tester.getTopLeft(find.text('Juan Active')).dx),
      );
      expect(api.writes, isEmpty);
      expect(api.gets('/archived'), 0);
      expect(find.byType(TextField), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('learner details still open with the original learner identity', (
    tester,
  ) async {
    final api = AdvisoryApi();
    await mount(tester, api);
    await tester.tap(find.text('Juan Active'));
    await tester.pumpAndSettle();
    expect(find.text('Student details: Juan Active'), findsOneWidget);
    expect(api.writes, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'full-roster summary excludes unknown attendance and search/sort work',
    (tester) async {
      final api = AdvisoryApi();
      api.active
        ..clear()
        ..addAll([
          activeStudent(id: 'roster:zed', name: 'Zed Reyes'),
          {
            ...activeStudent(id: 'roster:amy', name: 'Amy Cruz'),
            'riskLevel': 'Low',
            'flags': <String>[],
            'attendanceRate': null,
          },
        ]);
      final search = await mount(tester, api);
      expect(find.text('87.5%'), findsOneWidget);
      expect(find.text('Flagged'), findsOneWidget);
      expect(find.text('Advisees'), findsOneWidget);
      expect(find.text('Avg Att.'), findsOneWidget);
      expect(find.byTooltip('Avg Attendance'), findsOneWidget);
      expect(find.text('Showing 2 of 2 students'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Amy Cruz')).dy,
        lessThan(tester.getTopLeft(find.text('Zed Reyes')).dy),
      );
      await tester.tap(find.text('Name (A-Z)'));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Zed Reyes')).dy,
        lessThan(tester.getTopLeft(find.text('Amy Cruz')).dy),
      );
      search.setQuery('Amy');
      await tester.pumpAndSettle();
      expect(find.text('Showing 1 of 1 students'), findsOneWidget);
      expect(find.text('Zed Reyes'), findsNothing);
      expect(find.text('87.5%'), findsOneWidget);
      expect(find.text('Att —'), findsOneWidget);
      expect(find.text('Avg —'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'risk and factor filters combine and All clears each without Reset',
    (tester) async {
      await mount(tester, AdvisoryApi());
      expect(find.text('FILTER ADVISEES'), findsOneWidget);
      expect(find.text('Reset'), findsNothing);
      await selectFilter(tester, 'Risk level', 'Low risk');
      expect(find.text('No students match'), findsOneWidget);
      await selectFilter(tester, 'Risk level', 'All Risk Levels');
      await selectFilter(tester, 'Factor', 'Academic');
      expect(find.text('Juan Active'), findsOneWidget);
      await selectFilter(tester, 'Risk level', 'Moderate risk');
      expect(find.text('No students match'), findsOneWidget);
      await selectFilter(tester, 'Factor', 'All');
      expect(find.text('No students match'), findsOneWidget);
      await selectFilter(tester, 'Risk level', 'High risk');
      expect(find.text('Juan Active'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'ten-per-page pagination returns to the top and search resets the page',
    (tester) async {
      final api = AdvisoryApi();
      api.active
        ..clear()
        ..addAll(
          List.generate(
            20,
            (i) => activeStudent(
              id: 'roster:$i',
              name: 'Learner ${i.toString().padLeft(2, '0')}',
            ),
          ),
        );
      final search = await mount(tester, api, width: 320);
      expect(find.text('Showing 10 of 20 students'), findsOneWidget);
      expect(find.byKey(const ValueKey('active-roster:10')), findsNothing);
      final scrollable = find.descendant(
        of: find.byKey(const PageStorageKey('active-advisees')),
        matching: find.byType(Scrollable),
      );
      await tester.scrollUntilVisible(
        find.byTooltip('Next page'),
        300,
        scrollable: scrollable,
      );
      await tester.ensureVisible(find.byTooltip('Next page'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Next page'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('active-roster:10')), findsOneWidget);
      expect(find.byKey(const ValueKey('active-roster:0')), findsNothing);
      search.setQuery('Learner 00');
      await tester.pumpAndSettle();
      expect(find.text('Showing 1 of 1 students'), findsOneWidget);
      expect(find.text('Learner 00'), findsOneWidget);
      expect(find.byTooltip('Next page'), findsNothing);
      expect(api.writes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('empty and failed rosters never offer mutation actions', (
    tester,
  ) async {
    final api = AdvisoryApi()..active.clear();
    await mount(tester, api);
    expect(find.text('No advisees yet'), findsOneWidget);
    expect(find.text('Grade 8 – Arts'), findsOneWidget);
    expect(find.textContaining('Use the +'), findsNothing);
    expect(find.byType(FloatingActionButton), findsNothing);
    expect(api.gets('/archived'), 0);
    expect(api.writes, isEmpty);
  });

  testWidgets('refresh waits for the roster read without fetching archives', (
    tester,
  ) async {
    final api = AdvisoryApi();
    await mount(tester, api);
    api.pendingRead = Completer<void>();
    var complete = false;
    final refresh = tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh()
        .then((_) => complete = true);
    await tester.pump();
    expect(complete, isFalse);
    api.pendingRead!.complete();
    await tester.pumpAndSettle();
    await refresh;
    expect(api.gets('/students'), 2);
    expect(api.gets('/archived'), 0);
    expect(api.writes, isEmpty);
  });

  testWidgets('term changes refetch the active roster only', (tester) async {
    final api = AdvisoryApi();
    await mount(tester, api);
    api.active
      ..clear()
      ..add(activeStudent(id: 'roster:new', name: 'Next Term Learner'));
    final container = ProviderScope.containerOf(
      tester.element(find.byType(AdvisoryListPage)),
    );
    await container.read(termProvider.notifier).select(selectedTerm('term-2'));
    await tester.pumpAndSettle();
    expect(find.text('Next Term Learner'), findsOneWidget);
    expect(find.text('Juan Active'), findsNothing);
    expect(api.gets('/students'), 2);
    expect(api.gets('/archived'), 0);
  });

  testWidgets(
    'loading failures are retryable and do not reveal backend details',
    (tester) async {
      final api = AdvisoryApi()..failActive = true;
      await mount(tester, api);
      expect(find.textContaining('private database details'), findsNothing);
      api.failActive = false;
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AdvisoryListPage)),
      );
      await tester.runAsync(() async {
        container.invalidate(advisoryProvider);
        await container.read(advisoryProvider.future);
      });
      await tester.pumpAndSettle();
      expect(find.text('Juan Active'), findsOneWidget);
      expect(api.gets('/students'), 2);
      expect(tester.takeException(), isNull);
    },
  );

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('read-only cards fit $width at larger text', (tester) async {
      await mount(tester, AdvisoryApi(), width: width, scale: 1.5);
      expect(find.byType(RiskBadge), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('short screens retain filters, cards and risk without overflow', (
    tester,
  ) async {
    await mount(tester, AdvisoryApi(), width: 320, height: 500, scale: 1.5);
    expect(find.byTooltip('Risk level'), findsOneWidget);
    expect(find.byType(RiskBadge), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
