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
import 'package:zentra_mobile/design/bama_mascot.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/bama/bama_chat_page.dart';
import 'package:zentra_mobile/features/bama/bama_conversations.dart';
import 'package:zentra_mobile/features/bama/bama_flow.dart';
import 'package:zentra_mobile/features/bama/bama_history_page.dart';
import 'package:zentra_mobile/features/bama/bama_service.dart';
import 'package:zentra_mobile/features/bama/bama_writing_indicator.dart';
import 'package:zentra_mobile/shared/models.dart';

class _Api extends ApiClient {
  _Api() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options);
          if (options.method == 'POST') {
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: {'id': 'record-1', 'folderId': null},
              ),
            );
          } else {
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'students': [
                    {
                      'id': 'roster:learner',
                      'name': 'Ana Reyes',
                      'lrn': '123456789012',
                      'sectionId': 'section',
                    },
                  ],
                  'sectionClasses': [
                    {
                      'subjectId': 'subject',
                      'sectionId': 'section',
                      'termId': 'term',
                      'subjectName': 'Mathematics',
                      'sectionName': 'Grade 7 – Arts',
                    },
                  ],
                },
              ),
            );
          }
        },
      ),
    );
  }
  final requests = <RequestOptions>[];
}

class _Term extends TermNotifier {
  _Term() {
    state = Term(
      id: 'term',
      schoolYearId: 'year',
      schoolYearName: '2026–2027',
      termNumber: 1,
    );
  }
  @override
  Future<void> select(Term value) async {
    state = value;
  }
}

BamaConversation _convo(String id, String type) => BamaConversation(
  id: id,
  type: type,
  title: '$type saved chat',
  messages: [
    BamaMessage(
      id: id == 'legacy' ? 1 : 2,
      fromUser: false,
      text: 'Saved prompt',
      at: 1,
    ),
  ],
  updatedAt: 1,
);

Future<ProviderContainer> _mount(
  WidgetTester tester,
  _Api api, {
  bool reducedMotion = false,
  bool fresh = true,
  Widget? child,
  String initialLocation = '/adviser/bama',
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      termProvider.overrideWith((ref) => _Term()),
      overviewProvider.overrideWith((ref) async => {'isAdviser': true}),
    ],
  );
  addTearDown(container.dispose);
  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        path: '/adviser/bama',
        builder: (_, state) => Scaffold(
          appBar: AppBar(title: const Text('Staff shell header')),
          body:
              child ??
              BamaChatPage(
                freshEntry: fresh || state.uri.queryParameters['new'] == '1',
              ),
        ),
      ),
      GoRoute(
        path: '/adviser/bama/conversation/:conversationId',
        builder: (_, state) => BamaChatPage(
          key: ValueKey(state.pathParameters['conversationId']),
          conversationId: state.pathParameters['conversationId'],
          newConversation: state.uri.queryParameters['new'] == '1',
        ),
      ),
      GoRoute(
        path: '/adviser/bama/history',
        builder: (_, state) {
          final extra = state.extra as Map;
          return Scaffold(
            appBar: AppBar(title: const Text('Staff shell history')),
            body: BamaHistoryPage(
              type: 'anecdotal',
              conversations: extra['conversations'] as List<BamaConversation>,
              onResume: extra['onResume'] as Future<void> Function(String),
              onDelete: extra['onDelete'] as ValueChanged<BamaConversation>,
            ),
          );
        },
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
            disableAnimations: reducedMotion,
            textScaler: TextScaler.linear(scale),
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

void main() {
  setUpAll(() async {
    // Memory-backed Hive exercises the real serializers without filesystem
    // flushes escaping WidgetTester's fake clock.
    await Hive.openBox(AppConfig.bamaBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.termScopeBox, bytes: Uint8List(0));
  });
  setUp(() async => Hive.box(AppConfig.bamaBox).clear());
  tearDownAll(() async {
    await Hive.close();
  });

  test(
    'service uses web anecdotal options and create contracts unchanged',
    () async {
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      final service = BamaService(api);
      final options = await service.fetchOptions();
      expect((options['students'] as List).single['id'], 'roster:learner');
      final payload = buildAnecdotalBody(
        studentId: 'roster:learner',
        sectionId: 'section',
        termId: 'term',
        observationDate: '2026-11-10',
        observationTime: '08:30',
        incident: 'Observed incident',
        location: 'Classroom',
        notes: '',
        classPerformance: '',
        attendanceSummary: '',
        category: 'behavioral',
        tier: 'restricted',
      );
      expect((await service.createRecord(payload))['id'], 'record-1');
      expect(api.requests.map((r) => '${r.method} ${r.path}'), [
        'GET /api/teacher/grade-flags/options',
        'POST /api/anecdotal',
      ]);
      expect(api.requests.last.data, payload);
    },
  );

  testWidgets('only anecdotal entry points are visible', (tester) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    expect(find.text('Anecdotal record'), findsOneWidget);
    expect(find.text('Grade flag'), findsNothing);
    expect(find.text('Grade flag logs'), findsNothing);
    expect(find.byType(BamaMascot), findsOneWidget);
    expect(bamaChatTypes, ['anecdotal']);
  });

  testWidgets('new conversation has one full-screen header outside the shell', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    expect(find.text('Staff shell header'), findsOneWidget);
    await tester.tap(find.text('Anecdotal record'));
    await tester.pumpAndSettle();
    expect(find.text('Staff shell header'), findsNothing);
    expect(find.byType(AppBar), findsOneWidget);
    expect(find.text('Bama'), findsOneWidget);
    expect(find.text('Anecdotal Record Assistant'), findsOneWidget);
    expect(find.byTooltip('Back'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Staff shell header'), findsOneWidget);
    expect(find.text('Anecdotal record'), findsOneWidget);
  });

  testWidgets(
    'leaving during writing preserves the answered draft for resume',
    (tester) async {
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api);
      await tester.tap(find.text('Anecdotal record'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ana Reyes'));
      await tester.pump();
      expect(find.byType(BamaWritingIndicator), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(BamaWritingIndicator),
          matching: find.byType(BamaMascot),
        ),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Staff shell header'), findsOneWidget);
      expect(find.text('Ana Reyes'), findsOneWidget);
      await tester.tap(find.text('Ana Reyes'));
      await tester.pumpAndSettle();
      expect(find.text('Staff shell header'), findsNothing);
      expect(find.byType(BamaWritingIndicator), findsNothing);
      expect(find.text('Mathematics · Grade 7 – Arts'), findsOneWidget);
      final stored = Hive.box(AppConfig.bamaBox).get('conversations') as List;
      expect(stored, hasLength(1));
      expect((stored.single as Map)['messages'] as List, hasLength(3));
    },
  );

  testWidgets(
    'history resumes into the dedicated route without immediately popping it',
    (tester) async {
      await tester.runAsync(() async {
        await Hive.box(AppConfig.bamaBox).putAll({
          'conversations': [_convo('history-chat', 'anecdotal').toJson()],
          'nextId': 10,
        });
      });
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api);
      await tester.tap(find.text('See all (1)'));
      await tester.pumpAndSettle();
      expect(find.text('Staff shell history'), findsOneWidget);
      await tester.tap(find.text('anecdotal saved chat'));
      await tester.pumpAndSettle();
      expect(find.text('Saved prompt'), findsOneWidget);
      expect(find.text('Staff shell history'), findsNothing);
      expect(find.text('Staff shell header'), findsNothing);
      expect(find.byType(AppBar), findsOneWidget);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Staff shell history'), findsOneWidget);
    },
  );

  testWidgets('missing direct-link conversation has a Close fallback', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(
      tester,
      api,
      initialLocation: '/adviser/bama/conversation/missing',
      fresh: false,
    );
    expect(find.text('Conversation unavailable'), findsOneWidget);
    expect(find.byTooltip('Close'), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Staff shell header'), findsOneWidget);
    expect(find.text('Anecdotal record'), findsOneWidget);
  });

  testWidgets(
    'saved direct link resumes without replay and closes to welcome',
    (tester) async {
      await tester.runAsync(() async {
        await Hive.box(AppConfig.bamaBox).putAll({
          'conversations': [_convo('direct', 'anecdotal').toJson()],
          'activeId': 'direct',
          'nextId': 10,
        });
      });
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(
        tester,
        api,
        initialLocation: '/adviser/bama/conversation/direct',
        fresh: false,
      );
      expect(find.text('Saved prompt'), findsOneWidget);
      expect(find.byType(BamaWritingIndicator), findsNothing);
      expect(find.byTooltip('Close'), findsOneWidget);
      expect(find.byType(BamaMascot), findsNWidgets(2));
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.text('Staff shell header'), findsOneWidget);
      expect(find.text('anecdotal saved chat'), findsOneWidget);
      expect(find.text('Saved prompt'), findsNothing);
    },
  );

  testWidgets(
    'starting a new chat after filing preserves the caller and latest draft',
    (tester) async {
      await tester.runAsync(() async {
        await Hive.box(AppConfig.bamaBox).putAll({
          'conversations': [
            BamaConversation(
              id: 'old-filed',
              type: 'anecdotal',
              title: 'Old filed chat',
              messages: [],
              updatedAt: 1,
              filed: true,
            ).toJson(),
          ],
          'activeId': 'old-filed',
          'nextId': 10,
        });
      });
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api, fresh: false);
      await tester.tap(find.text('Start new chat'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ana Reyes'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Staff shell header'), findsOneWidget);
      expect(find.text('Ana Reyes'), findsOneWidget);
      expect(find.text('Old filed chat'), findsOneWidget);
    },
  );

  testWidgets('system Back cancels a pending prompt and returns to the shell', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    await tester.tap(find.text('Anecdotal record'));
    await tester.pump();
    await tester.pump();
    expect(find.byType(BamaWritingIndicator), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Staff shell header'), findsOneWidget);
    expect(find.byType(BamaWritingIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 700.0]) {
    testWidgets('conversation fits keyboard and larger text at $width', (
      tester,
    ) async {
      await tester.runAsync(() async {
        await Hive.box(AppConfig.bamaBox).putAll({
          'conversations': [_convo('keyboard', 'anecdotal').toJson()],
          'flows': {
            'keyboard': FlowSnapshot(
              studentId: 'roster:learner',
              classKey: 'subject|section|term',
              category: 'behavioral',
              tier: 'restricted',
              observationDate: '2026-11-10',
              textQuestion: TextQuestion.incident,
            ).toJson(),
          },
        });
      });
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(
        tester,
        api,
        width: width,
        scale: 1.5,
        initialLocation: '/adviser/bama/conversation/keyboard',
      );
      await tester.enterText(
        find.byType(TextField).last,
        'First line\nSecond line\nThird line\nFourth line',
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();
      final composer = find.byType(TextField).last;
      expect(tester.getBottomLeft(composer).dy, lessThanOrEqualTo(600));
      expect(find.byType(AppBar), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('writing precedes opening prompt and picker', (tester) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    await tester.tap(find.text('Anecdotal record'));
    await tester.pump();
    await tester.pump(); // GoRouter installs the dedicated route next frame.
    expect(find.byType(BamaWritingIndicator), findsOneWidget);
    expect(find.text(bamaGreetings['anecdotal']!), findsNothing);
    expect(find.text('Pick a student'), findsNothing);
    await tester.pump(const Duration(milliseconds: 599));
    expect(find.text('Pick a student'), findsNothing);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pumpAndSettle();
    expect(find.byType(BamaWritingIndicator), findsNothing);
    expect(find.text(bamaGreetings['anecdotal']!), findsOneWidget);
    expect(find.text('Pick a student'), findsOneWidget);
  });

  testWidgets(
    'next prompt and choices wait together; old answer cannot be tapped twice',
    (tester) async {
      final api = _Api();
      addTearDown(() => api.dio.close(force: true));
      await _mount(tester, api);
      await tester.tap(find.text('Anecdotal record'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ana Reyes'));
      await tester.pump();
      expect(find.byType(BamaWritingIndicator), findsOneWidget);
      expect(find.text('Mathematics · Grade 7 – Arts'), findsNothing);
      expect(find.text('Which class is this report for?'), findsNothing);
      final composer = tester.widget<TextField>(find.byType(TextField).last);
      expect(composer.enabled, isFalse);
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();
      expect(find.text('Mathematics · Grade 7 – Arts'), findsOneWidget);
      await tester.tap(find.text('Mathematics · Grade 7 – Arts'));
      await tester.pumpAndSettle();
      expect(find.text('Behavioral'), findsOneWidget);
      expect(find.text('Ana Reyes'), findsOneWidget); // one answer, not two
    },
  );

  testWidgets('leaving a draft cancels writing without creating a chat', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api);
    await tester.tap(find.text('Anecdotal record'));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Anecdotal record'), findsOneWidget);
    expect(find.byType(BamaWritingIndicator), findsNothing);
    expect(Hive.box(AppConfig.bamaBox).get('conversations') as List, isEmpty);
  });

  testWidgets('term change cancels pending prompt and reloads options', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    final container = await _mount(tester, api);
    await tester.tap(find.text('Anecdotal record'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ana Reyes'));
    await tester.pump();
    final before = api.requests.length;
    await container
        .read(termProvider.notifier)
        .select(
          Term(
            id: 'next',
            schoolYearId: 'year',
            schoolYearName: '2026–2027',
            termNumber: 2,
          ),
        );
    await tester.pumpAndSettle();
    expect(find.byType(BamaWritingIndicator), findsNothing);
    expect(find.text('Anecdotal record'), findsOneWidget);
    expect(api.requests.length, greaterThan(before));
  });

  testWidgets('legacy grade-flag chats remain stored but cannot resume', (
    tester,
  ) async {
    final legacy = _convo('legacy', 'grade-flag').toJson();
    await tester.runAsync(() async {
      await Hive.box(AppConfig.bamaBox).putAll({
        'conversations': [legacy, _convo('anecdote', 'anecdotal').toJson()],
        'activeId': 'legacy',
        'nextId': 10,
      });
    });
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api, fresh: false);
    expect(find.text('grade-flag saved chat'), findsNothing);
    expect(find.text('anecdotal saved chat'), findsOneWidget);
    await tester.tap(find.text('anecdotal saved chat'));
    await tester.pumpAndSettle();
    expect(find.text('Saved prompt'), findsOneWidget);
    expect(find.byType(BamaWritingIndicator), findsNothing);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    final stored = Hive.box(AppConfig.bamaBox).get('conversations') as List;
    expect(
      stored.whereType<Map>().where((c) => c['id'] == 'legacy').single,
      legacy,
    );
  });

  testWidgets('history refuses grade-flag records even through a legacy type', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(
      tester,
      api,
      child: BamaHistoryPage(
        type: 'grade-flag',
        conversations: [
          _convo('legacy', 'grade-flag'),
          _convo('anecdote', 'anecdotal'),
        ],
        onResume: (_) async {},
        onDelete: (_) {},
      ),
    );
    expect(find.text('grade-flag saved chat'), findsNothing);
    expect(find.text('anecdotal saved chat'), findsOneWidget);
  });

  testWidgets('reduced motion keeps a static accessible writing indicator', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(
      tester,
      api,
      reducedMotion: true,
      child: const BamaWritingIndicator(),
    );
    expect(find.text('Bama is writing…'), findsOneWidget);
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('writing dots animate and dispose without a pending ticker', (
    tester,
  ) async {
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    // Do not pumpAndSettle while mounting a deliberately repeating indicator.
    await tester.pumpWidget(
      MaterialApp(
        theme: zWorkspaceTheme(),
        home: const Scaffold(body: BamaWritingIndicator()),
      ),
    );
    List<double> opacity() => tester
        .widgetList<Opacity>(
          find.descendant(
            of: find.byType(BamaWritingIndicator),
            matching: find.byType(Opacity),
          ),
        )
        .map((w) => w.opacity)
        .toList();
    final before = opacity();
    await tester.pump(const Duration(milliseconds: 180));
    expect(opacity(), isNot(before));
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('a successful filing ends the thread and uses the web payload', (
    tester,
  ) async {
    final ready = FlowSnapshot(
      studentId: 'roster:learner',
      classKey: 'subject|section|term',
      category: 'behavioral',
      tier: 'restricted',
      observationDate: '2026-11-10',
      observationTime: '08:30',
      incident: 'Observed incident',
      location: 'Classroom',
      previewShown: true,
    );
    await tester.runAsync(() async {
      await Hive.box(AppConfig.bamaBox).putAll({
        'conversations': [_convo('ready', 'anecdotal').toJson()],
        'activeId': 'ready',
        'nextId': 10,
        'flows': {'ready': ready.toJson()},
      });
    });
    const channel = MethodChannel('dev.fluttercommunity.plus/connectivity');
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (_) async => ['wifi'],
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      ),
    );
    final api = _Api();
    addTearDown(() => api.dio.close(force: true));
    await _mount(tester, api, fresh: false);
    await tester.tap(find.byTooltip('File record'));
    await tester.pumpAndSettle();
    final confirm = find.widgetWithText(FilledButton, 'File record').last;
    await tester.tap(confirm);
    await tester.tap(confirm); // same-frame double tap must not file twice
    await tester.pumpAndSettle();
    expect(api.requests.where((r) => r.method == 'POST'), hasLength(1));
    final payload =
        api.requests.lastWhere((r) => r.method == 'POST').data as Map;
    expect(payload['studentId'], 'roster:learner');
    expect(payload['sectionId'], 'section');
    expect(payload['termId'], 'term');
    expect(payload['category'], 'behavioral');
    expect(payload['confidentialityLevel'], 'restricted');
    expect(find.text('This chat has ended.'), findsOneWidget);
    final stored = Hive.box(AppConfig.bamaBox).get('conversations') as List;
    expect((stored.single as Map)['filed'], isTrue);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Ana Reyes · Behavioral · Filed'), findsOneWidget);
  });
}
