import 'dart:io';
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/shared/models.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/referral/referral_page.dart';

class ReferralApi extends ApiClient {
  ReferralApi() {
    dio.options.baseUrl = 'https://zentra.test';
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          requests.add(options);
          if (block != null) await block!.future;
          if (options.method == 'POST') onPost?.call();
          handler.resolve(
            Response(
              requestOptions: options,
              data: options.method == 'GET' ? response : {'id': 'a'},
            ),
          );
        },
      ),
    );
  }
  final requests = <RequestOptions>[];
  Completer<void>? block;
  Object response = <dynamic>[];
  VoidCallback? onPost;
  @override
  Future<String?> accessToken() async => null;
}

Future<void> mount(
  WidgetTester tester, {
  List<Map<String, dynamic>> referrals = const [],
  double width = 390,
  double scale = 1,
  ReferralApi? api,
  List<Map<String, dynamic>> referables = const [],
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (api != null) apiClientProvider.overrideWithValue(api),
        referralsProvider.overrideWith((ref) async => referrals),
        referableProvider.overrideWith((ref) async => referables),
        overviewProvider.overrideWith(
          (ref) async => {
            'teacherName': 'Teacher',
            'isAdviser': true,
            'advisorySection': {'name': 'Arts'},
          },
        ),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const Scaffold(body: ReferralPage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    FlutterSecureStorage.setMockInitialValues({});
    Hive.init((await Directory.systemTemp.createTemp('referral-header')).path);
    await Hive.openBox(AppConfig.termScopeBox);
    final term = Term(
      id: 'term',
      schoolYearId: 'year',
      schoolYearName: '2026–2027',
      termNumber: 2,
    );
    await Hive.box(AppConfig.termScopeBox).put('scope', term.toJson());
  });
  tearDownAll(() => Hive.close());
  test('list service reads supported full-list and envelope responses from the web endpoint', () async {
    final api = ReferralApi();
    final container = ProviderContainer(
      overrides: [apiClientProvider.overrideWithValue(api)],
    );
    try {
      api.response = [
        {'id': 'a', 'studentName': 'Ana'},
      ];
      expect(
        (await container.read(referralsProvider.future)).single['id'],
        'a',
      );
      expect(api.requests.single.path, '/api/referrals/mine');
      expect(api.requests.single.queryParameters, isEmpty);
      api.response = {
        'referrals': [
          {'id': 'b'},
        ],
      };
      expect(
        (await container.refresh(referralsProvider.future)).single['id'],
        'b',
      );
    } finally {
      container.dispose();
      api.dio.close(force: true);
    }
  });

  for (final adm in [false, true]) {
    testWidgets('composer sends canonical guidance role (ADM=$adm)', (
      tester,
    ) async {
      final api = ReferralApi();
      addTearDown(() => api.dio.close(force: true));
      await mount(
        tester,
        api: api,
        referables: [
          {
            'id': 'record',
            'studentId': 'student',
            'studentName': 'Ana',
            'lrn': '111',
            'category': 'behavior',
            'observationDate': '2026-11-23',
          },
        ],
      );
      await tester.tap(find.byTooltip('New referral'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ana · 111').last);
      await tester.pumpAndSettle();
      await tester.tap(
        find.byType(DropdownButtonFormField<Map<String, dynamic>>),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('2026-11-23 · Behavior').last);
      await tester.pumpAndSettle();
      if (adm) {
        await tester.tap(find.text('ADM case'));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(DropdownButtonFormField<String>).last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Guidance (ADM)').last);
        await tester.pumpAndSettle();
      }
      await tester.enterText(find.byType(TextField).last, 'Needs support');
      await tester.ensureVisible(find.text('Send referral'));
      await tester.tap(find.text('Send referral'));
      await tester.pumpAndSettle();
      expect(api.requests.single.path, '/api/anecdotal/record/refer');
      expect(api.requests.single.data, {
        'referredToRole': adm ? 'adm_coordinator' : 'guidance_counselor',
        'reason': 'Needs support',
        if (adm) 'consultReviewer': 'guidance_counselor',
      });
    });
  }
  testWidgets(
    'whole card opens draggable details; cancel requires reason and prevents duplicate writes',
    (tester) async {
      final api = ReferralApi();
      addTearDown(() => api.dio.close(force: true));
      final rows = <Map<String, dynamic>>[
        {
          'id': 'a',
          'studentName': 'Ana Reyes',
          'lrn': '111',
          'targetRole': 'nurse',
          'status': 'pending',
          'reason': 'Health concern',
          'referredAt': '2026-11-23T00:00:00Z',
          'timeline': [
            {'label': 'Referral sent', 'date': '2026-11-23'},
          ],
        },
      ];
      api.onPost = () => rows.single['status'] = 'dismissed';
      await mount(tester, api: api, referrals: rows);
      expect(find.text('Track'), findsNothing);
      expect(find.byIcon(Icons.more_vert), findsNothing);
      expect(find.text('Cancel referral'), findsNothing);
      await tester.ensureVisible(find.byKey(const ValueKey('referral-card-a')));
      await tester.tap(find.text('Ana Reyes'));
      await tester.pumpAndSettle();
      expect(find.byType(DraggableScrollableSheet), findsNothing);
      final sheet = tester.getRect(find.byType(BottomSheet));
      expect(sheet.height, lessThanOrEqualTo(tester.view.physicalSize.height /
          tester.view.devicePixelRatio * 0.5));
      expect(find.text('Referral details'), findsOneWidget);
      expect(find.text('Health concern'), findsOneWidget);
      expect(find.text('Referral sent'), findsOneWidget);
      await tester.ensureVisible(find.text('Cancel referral'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel referral'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(FilledButton, 'Cancel referral').last,
      );
      await tester.pumpAndSettle();
      expect(find.text('A reason is required.'), findsOneWidget);
      expect(api.requests, isEmpty);
      await tester.enterText(
        find.byType(TextField).last,
        '  Parent requested withdrawal  ',
      );
      api.block = Completer<void>();
      await tester.tap(
        find.widgetWithText(FilledButton, 'Cancel referral').last,
      );
      await tester.pump();
      expect(find.text('Cancelling…'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Cancelling…'),
            )
            .onPressed,
        isNull,
      );
      api.block!.complete();
      await tester.pumpAndSettle();
      expect(api.requests.length, 1);
      expect(api.requests.single.path, '/api/referrals/a/cancel');
      expect(api.requests.single.data, {
        'reason': 'Parent requested withdrawal',
      });
      expect(find.text('Cancel this referral?'), findsNothing);
      expect(find.text('Cancel referral'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  for (final status in ['resolved', 'dismissed']) {
    testWidgets('$status referrals show read-only details', (tester) async {
      await mount(
        tester,
        referrals: [
          {
            'id': 'a',
            'studentName': 'Ana',
            'status': status,
            'targetRole': 'nurse',
          },
        ],
      );
      await tester.ensureVisible(find.text('Ana'));
      await tester.tap(find.text('Ana'));
      await tester.pumpAndSettle();
      expect(find.text('Referral details'), findsOneWidget);
      expect(find.text('Cancel referral'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    });
  }
  testWidgets(
    'long identity card and draggable details fit narrow large text',
    (tester) async {
      await mount(
        tester,
        width: 320,
        scale: 1.5,
        referrals: [
          {
            'id': 'a',
            'studentName': 'Maria Ana Dela Cruz Santos',
            'lrn': '123456789012',
            'targetRole': 'guidance_counselor',
            'status': 'info_requested',
            'track': 'adm',
            'consultReviewer': 'guidance_counselor',
            'reason': 'Needs additional follow-up and supporting evidence.',
          },
        ],
      );
      await tester.scrollUntilVisible(
        find.text('Maria Ana Dela Cruz Santos'),
        250,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.ensureVisible(find.text('Maria Ana Dela Cruz Santos'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Maria Ana Dela Cruz Santos'));
      await tester.pumpAndSettle();
      expect(find.text('Referral details'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
  testWidgets(
    'filters combine, sorting works and counters retain the full cohort',
    (tester) async {
      await mount(
        tester,
        referrals: [
          {
            'id': 'a',
            'studentName': 'Ana',
            'lrn': '111',
            'targetRole': 'nurse',
            'status': 'pending',
          },
          {
            'id': 'b',
            'studentName': 'Ben',
            'lrn': '222',
            'targetRole': 'guidance_counselor',
            'status': 'in_progress',
          },
          {
            'id': 'c',
            'studentName': 'Carl',
            'lrn': '333',
            'targetRole': 'adm_coordinator',
            'track': 'adm',
            'status': 'resolved',
          },
        ],
      );
      expect(find.text('Showing 3 records'), findsOneWidget);
      expect(
        find.textContaining('1\nPending', findRichText: true),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Type'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Other matters').last);
      await tester.pumpAndSettle();
      expect(find.text('Showing 2 records'), findsOneWidget);
      await tester.tap(find.byTooltip('Receiving desk'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nurse').last);
      await tester.pumpAndSettle();
      expect(find.text('Showing 1 records'), findsOneWidget);
      expect(
        find.textContaining('1\nResolved', findRichText: true),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Status'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resolved').last);
      await tester.pumpAndSettle();
      expect(find.text('No referrals match'), findsOneWidget);
      await tester.tap(find.text('Name (A-Z)'));
      await tester.pumpAndSettle();
      expect(find.text('Name (Z-A)'), findsOneWidget);
    },
  );

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('reference header fits $width at large text', (tester) async {
      await mount(tester, width: width, scale: 1.5);
      expect(find.text('Referrals'), findsOneWidget);
      expect(find.byTooltip('Receiving desk'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('floating plus replaces the top referral composer card', (
    tester,
  ) async {
    await mount(tester);
    expect(find.text('Refer'), findsNothing);
    expect(
      find.text('Pick a filed anecdotal record, then route it.'),
      findsNothing,
    );
    expect(find.text('Referrals'), findsOneWidget);
    expect(find.text('FILTER REFERRALS'), findsOneWidget);
    expect(find.text('2026–2027'), findsOneWidget);
    expect(find.text('Term 2'), findsOneWidget);
    expect(find.text('Arts'), findsOneWidget);
    expect(find.byTooltip('New referral'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.text('No referrals this term'), findsOneWidget);
    final fab = tester.getRect(find.byType(FloatingActionButton));
    expect(fab.right, closeTo(374, 1));
    expect(fab.bottom, closeTo(808, 1));
  });

  testWidgets(
    'plus opens the existing composer once, and can reopen after dismissal',
    (tester) async {
      await mount(tester);
      final add = find.byTooltip('New referral');
      final open = tester
          .widget<FloatingActionButton>(find.byType(FloatingActionButton))
          .onPressed!;
      open();
      open(); // prevent duplicate same-frame sheets
      await tester.pumpAndSettle();
      expect(find.text('New referral'), findsOneWidget);
      expect(find.text('Anecdotal record'), findsOneWidget);
      expect(find.text('Send referral'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Send referral'), findsNothing);
      await tester.tap(add);
      await tester.pumpAndSettle();
      expect(find.text('Send referral'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('last timeline card can scroll fully above the floating button', (
    tester,
  ) async {
    await mount(
      tester,
      referrals: [
        for (var i = 0; i < 12; i++)
          {
            'id': 'referral-$i',
            'studentName': 'Learner $i',
            'lrn': '123456789012',
            'targetRole': 'nurse',
            'status': 'pending',
          },
      ],
    );
    await tester.scrollUntilVisible(
      find.text('Learner 9'),
      450,
      scrollable: find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    final last = find.ancestor(
      of: find.text('Learner 9'),
      matching: find.byType(Card),
    );
    expect(last, findsOneWidget);
    expect(
      tester.getRect(last).bottom,
      lessThan(tester.getRect(find.byType(FloatingActionButton)).top),
    );
  });

  testWidgets('empty state keeps refresh and fits narrow large-text layouts', (
    tester,
  ) async {
    await mount(tester, width: 320, scale: 1.5);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.text('No referrals this term'), findsOneWidget);
    expect(find.byTooltip('New referral'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
