import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/student_detail_page.dart';
import 'package:zentra_mobile/shared/models.dart';

const longSubject = 'Contemporary Philippine Arts from the Regions';

class DetailApi extends ApiClient {
  DetailApi({this.empty = false}) {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options.path);
          final Object data;
          if (options.path.endsWith('/academic')) {
            data = empty
                ? <String, dynamic>{}
                : {
                    'summary': {
                      'subjects': 3,
                      'graded': 2,
                      'passed': 1,
                      'failed': 1,
                      'average': 80.5,
                    },
                    'grades': [
                      {
                        'subject': longSubject,
                        'computedAverage': 88.4,
                        'transmutedGrade': 90,
                        'remarks': 'Passed',
                        'lockStatus': 'adviser_approved',
                      },
                      {
                        'subject': 'Mathematics',
                        'computedAverage': 61.2,
                        'transmutedGrade': 71,
                        'remarks': 'Failed',
                        'lockStatus': 'locked',
                      },
                      {'subject': 'Science'},
                    ],
                  };
          } else if (options.path.endsWith('/attendance')) {
            data = empty
                ? <String, dynamic>{}
                : {
                    'summary': {},
                    'subjectSummary': {
                      'present': 8,
                      'absent': 2,
                      'late': 1,
                      'excused': 0,
                      'total': 10,
                      'rate': 0.8,
                      'bySubject': [
                        {
                          'subjectId': 'subject-1',
                          'name': longSubject,
                          'code': 'CPAR',
                          'present': 8,
                          'total': 10,
                          'rate': 0.8,
                        },
                      ],
                    },
                  };
          } else if (options.path == '/api/adm/my-cases') {
            data = <Object>[];
          } else {
            data = {
              'name': 'Maria Alexandra Dela Cruz',
              'lrn': '123456789012',
              'riskLevel': 'Moderate',
              'referrals': [
                {'referredToRole': 'guidance_counselor', 'status': 'pending'},
              ],
            };
          }
          handler.resolve(
            Response(requestOptions: options, data: data, statusCode: 200),
          );
        },
      ),
    );
  }

  final bool empty;
  final requests = <String>[];
}

Future<void> mount(
  WidgetTester tester,
  DetailApi api, {
  double width = 390,
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(() => api.dio.close(force: true));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(api)],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: StudentDetailPage(
          student: AdvisoryStudent(
            studentId: 'roster:learner-1',
            name: 'Maria Alexandra Dela Cruz',
            lrn: '123456789012',
            hasAccount: false,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('grade switch preserves values and does not refetch the page', (
    tester,
  ) async {
    final api = DetailApi();
    await mount(tester, api);
    expect(find.text('LRN 123456789012'), findsOneWidget);
    expect(find.text('Gen avg 80.5'), findsOneWidget);
    expect(find.text('2 of 3 graded'), findsOneWidget);
    expect(find.text('1 passed'), findsOneWidget);
    expect(find.text('1 failed'), findsOneWidget);
    expect(find.text('90'), findsOneWidget);
    final requestCount = api.requests.length;
    await tester.tap(find.text('Computed'));
    await tester.pumpAndSettle();
    expect(find.text('88.4'), findsOneWidget);
    expect(find.text('90'), findsNothing);
    expect(api.requests.length, requestCount);
    await tester.tap(find.text('Final'));
    await tester.pumpAndSettle();
    expect(find.text('90'), findsOneWidget);
    expect(api.requests.length, requestCount);
    expect(tester.takeException(), isNull);
  });

  for (final size in [
    (width: 320.0, scale: 1.0),
    (width: 320.0, scale: 2.0),
    (width: 700.0, scale: 1.0),
    (width: 1024.0, scale: 1.0),
  ]) {
    testWidgets('all sections fit at ${size.width}, text ${size.scale}', (
      tester,
    ) async {
      await mount(
        tester,
        DetailApi(),
        width: size.width,
        textScale: size.scale,
      );
      expect(tester.takeException(), isNull);
      // Inspect every portion, including long subject names and attendance rows.
      for (var i = 0; i < 25; i++) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -220));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
      expect(find.text('Guidance Counselor'), findsOneWidget);
    });
  }

  testWidgets('empty academic and attendance states remain available', (
    tester,
  ) async {
    await mount(tester, DetailApi(empty: true));
    expect(find.text('No grades encoded this term'), findsOneWidget);
    expect(find.text('No attendance yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  group('dedicated full-screen header', () {
    final learner = AdvisoryStudent(
      studentId: 'roster:learner-1',
      name: 'Maria Alexandra Dela Cruz',
      lrn: '123456789012',
      hasAccount: false,
    );

    Future<GoRouter> mountRouter(
      WidgetTester tester,
      DetailApi api, {
      required String initialLocation,
    }) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(() => api.dio.close(force: true));
      final router = GoRouter(
        initialLocation: initialLocation,
        routes: [
          GoRoute(
            path: '/adviser/advisory',
            builder: (_, _) =>
                const Scaffold(body: Center(child: Text('advisory list'))),
          ),
          GoRoute(
            path: '/adviser/students/:id',
            builder: (_, _) => StudentDetailPage(student: learner),
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [apiClientProvider.overrideWithValue(api)],
          child: MaterialApp.router(
            theme: zWorkspaceTheme(),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();
      return router;
    }

    testWidgets('names the learner and never repeats the name', (tester) async {
      await mount(tester, DetailApi());
      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('Maria Alexandra Dela Cruz'), findsOneWidget);
      expect(find.text('LRN 123456789012'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('pushed detail shows a back arrow and returns to the list', (
      tester,
    ) async {
      final router = await mountRouter(
        tester,
        DetailApi(),
        initialLocation: '/adviser/advisory',
      );
      router.push('/adviser/students/roster%3Alearner-1');
      await tester.pumpAndSettle();

      expect(find.text('Maria Alexandra Dela Cruz'), findsOneWidget);
      expect(find.byIcon(Icons.close), findsNothing);
      final back = find.byIcon(Icons.arrow_back);
      expect(back, findsOneWidget);

      await tester.tap(back);
      await tester.pumpAndSettle();
      expect(find.text('advisory list'), findsOneWidget);
    });

    testWidgets('deep-linked detail closes back to the advisory list', (
      tester,
    ) async {
      await mountRouter(
        tester,
        DetailApi(),
        initialLocation: '/adviser/students/roster%3Alearner-1',
      );
      // Nothing to pop: the header offers an explicit way out instead of a
      // back arrow that would do nothing.
      final close = find.byIcon(Icons.close);
      expect(close, findsOneWidget);
      expect(find.byIcon(Icons.arrow_back), findsNothing);

      await tester.tap(close);
      await tester.pumpAndSettle();
      expect(find.text('advisory list'), findsOneWidget);
    });
  });
}
