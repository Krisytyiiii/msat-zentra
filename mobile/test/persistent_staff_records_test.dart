import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/notifications.dart';
import 'package:zentra_mobile/core/save_tasks.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/adviser_navigation.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/app_router.dart';
import 'package:zentra_mobile/features/settings/settings_data.dart';
import 'package:zentra_mobile/features/teacher/gradebook_page.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/attendance_record_page.dart';
import 'package:zentra_mobile/shared/models.dart';

class _Api extends ApiClient {
  _Api() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final data = switch (options.path) {
            '/api/attendance/section-roster' ||
            '/api/attendance/section-subject-matrix' => {
              'sectionId': 'section',
              'termId': 'term',
              'students': [],
            },
            '/api/attendance/subject-days' => {
              'subjectId': 'subject',
              'termId': 'term',
              'records': [],
            },
            _ => {
              'assignment': {'subjectName': 'Math'},
              'students': [],
              'components': [],
            },
          };
          handler.resolve(
            Response(requestOptions: options, statusCode: 200, data: data),
          );
        },
      ),
    );
  }
  @override
  Future<String?> accessToken() async => null;
}

class _Auth extends AuthNotifier {
  _Auth(String role) : super(_Api()) {
    state = AuthState(role: role, loggedIn: true);
  }
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
}

Future<(GoRouter, ProviderContainer)> mount(
  WidgetTester tester, {
  bool adviser = true,
  String? role,
  double width = 390,
  String initial = '/workspace/overview',
  bool unavailable = false,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final api = _Api();
  addTearDown(() => api.dio.close(force: true));
  final pair = AttendancePair('section', 'Arts', 'subject', 'Math');
  final c = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      termProvider.overrideWith((_) => _Term()),
      if (role != null) authProvider.overrideWith((_) => _Auth(role)),
      overviewProvider.overrideWith((_) async => {'isAdviser': adviser}),
      teacherProfileProvider.overrideWith(
        (_) async => const TeacherProfile(fullName: 'Teacher'),
      ),
      notificationsProvider.overrideWith((_) => <ZNotification>[]),
      attendanceRecordPairProvider('section|subject').overrideWith((_) async {
        if (unavailable) {
          throw ApiException('ACCESS_CHANGED', 'Class unavailable');
        }
        return pair;
      }),
    ],
  );
  addTearDown(c.dispose);
  final router = GoRouter(
    initialLocation: initial,
    routes: persistentStaffRoutes([
      for (final path in [
        '/workspace/overview',
        '/workspace/classes',
        '/workspace/gradebook',
        '/workspace/attendance',
        '/adviser/bama',
      ])
        GoRoute(
          path: path,
          builder: (_, _) => Center(child: Text(path)),
        ),
      GoRoute(
        path: '/workspace/classes/:id',
        builder: (_, state) =>
            GradebookPage(classId: state.pathParameters['id']!, title: 'Math'),
      ),
      GoRoute(
        path: '/workspace/attendance/records/:sectionId/:subjectId',
        builder: (_, state) => AttendanceRecordRoute(
          sectionId: state.pathParameters['sectionId']!,
          subjectId: state.pathParameters['subjectId']!,
        ),
      ),
      GoRoute(
        path: '/workspace/classes/:id/assessments/:assessmentId',
        builder: (_, _) => const Scaffold(body: Text('Score editor')),
      ),
    ]),
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: c,
      child: MaterialApp.router(theme: zLightTheme(), routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return (router, c);
}

void main() {
  setUpAll(() async {
    await Hive.openBox(AppConfig.termScopeBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.outboxBox, bytes: Uint8List(0));
  });
  tearDownAll(Hive.close);

  test('only record routes map to a persistent bottom destination', () {
    expect(
      staffRecordDestination('/workspace/classes/a'),
      '/workspace/classes',
    );
    expect(
      staffRecordDestination('/workspace/attendance/records/s/u'),
      '/workspace/attendance',
    );
    expect(
      staffRecordDestination('/workspace/classes/a/assessments/q'),
      isNull,
    );
    expect(staffRecordDestination('/adviser/students/a'), isNull);
  });

  for (final width in [320.0, 700.0]) {
    testWidgets('record navigation stays mounted at width $width', (
      tester,
    ) async {
      final (router, c) = await mount(tester, width: width);
      final task = c
          .read(saveTasksProvider)
          .submit(
            title: 'Saved marks',
            subtitle: 'Arts',
            action: () async => const SaveTaskResult(saved: 1),
          );
      await tester.pumpAndSettle();
      await task.finished;
      final bar = tester.element(find.byType(AdviserBottomNavigation));
      final pill = tester.element(find.byKey(const ValueKey('save-task-pill')));
      unawaited(router.push('/workspace/classes/class'));
      await tester.pumpAndSettle();
      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('Grade Record'), findsOneWidget);
      expect(tester.element(find.byType(AdviserBottomNavigation)), same(bar));
      expect(
        tester.element(find.byKey(const ValueKey('save-task-pill'))),
        same(pill),
      );
      expect(
        tester
            .widget<AdviserBottomNavigation>(
              find.byType(AdviserBottomNavigation),
            )
            .selectedPath,
        '/workspace/classes',
      );
      await tester.tap(find.byKey(const ValueKey('adviser-nav-Class')));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/workspace/classes',
      );
      expect(tester.element(find.byType(AdviserBottomNavigation)), same(bar));

      unawaited(router.push('/workspace/attendance/records/section/subject'));
      await tester.pumpAndSettle();
      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('Attendance Record'), findsOneWidget);
      expect(tester.element(find.byType(AdviserBottomNavigation)), same(bar));
      expect(
        tester
            .widget<AdviserBottomNavigation>(
              find.byType(AdviserBottomNavigation),
            )
            .selectedPath,
        '/workspace/attendance',
      );
      await tester.tap(find.byKey(const ValueKey('adviser-nav-Attendance')));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/workspace/attendance',
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('record Back pops and direct links have a list fallback', (
    tester,
  ) async {
    final (router, _) = await mount(
      tester,
      initial: '/workspace/attendance/records/section/subject',
    );
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      '/workspace/attendance',
    );
    unawaited(router.push('/workspace/attendance/records/section/subject'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      '/workspace/attendance',
    );
  });

  testWidgets('subject teachers share the four-desk bar on both records', (
    tester,
  ) async {
    final (router, _) = await mount(
      tester,
      adviser: false,
      role: 'subject_teacher',
      initial: '/workspace/classes/class',
    );
    expect(find.byType(AdviserBottomNavigation), findsOneWidget);
    router.go('/workspace/attendance/records/section/subject');
    await tester.pumpAndSettle();
    expect(find.byType(AdviserBottomNavigation), findsOneWidget);
    expect(find.byType(AppBar), findsOneWidget);
  });

  testWidgets('deep-link load errors keep navigation and a Back control', (
    tester,
  ) async {
    await mount(
      tester,
      unavailable: true,
      initial: '/workspace/attendance/records/section/subject',
    );
    expect(find.byType(AdviserBottomNavigation), findsOneWidget);
    expect(find.byTooltip('Back'), findsOneWidget);
    expect(find.byType(AttendanceRecordPage), findsNothing);
  });

  testWidgets('score editors stay outside persistent chrome', (tester) async {
    final (router, _) = await mount(tester);
    unawaited(router.push('/workspace/classes/class/assessments/quiz'));
    await tester.pumpAndSettle();
    expect(find.text('Score editor'), findsOneWidget);
    expect(find.byType(AdviserBottomNavigation), findsNothing);
  });
}
