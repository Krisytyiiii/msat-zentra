import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/features/teacher/class_list_page.dart';
import 'package:zentra_mobile/features/teacher/gradebook_data.dart';
import 'package:zentra_mobile/design/adviser_navigation.dart';

ClassRecord record(String id) => ClassRecord.fromJson({
  'assignment': {
    'subjectName': id == 'math|arts' ? 'Mathematics' : 'Science',
    'sectionName': 'Arts',
    'schoolYear': '2026–2027',
    'termNumber': 1,
    'gradeLevel': 'G7',
  },
  'students': [
    {'id': 'roster:1', 'name': 'Juan Dela Cruz', 'lrn': '123456789012'},
    {'id': '2', 'name': 'Ana Santos', 'lrn': '123456789013', 'isAdm': true},
  ],
});

Future<GoRouter> mount(WidgetTester tester, {double width = 360}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 800);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final router = GoRouter(
    initialLocation: '/workspace/classes/math%7Carts/list',
    routes: [
      GoRoute(
        path: '/workspace/classes',
        builder: (_, _) => const Scaffold(body: Text('Classes')),
      ),
      GoRoute(
        path: '/workspace/classes/:id/list',
        builder: (_, state) =>
            ClassListPage(classId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/workspace/classes/:id',
        builder: (_, state) =>
            Scaffold(body: Text('Grades ${state.pathParameters['id']}')),
      ),
      GoRoute(
        path: '/workspace/attendance/records/:section/:subject',
        builder: (_, state) => Scaffold(
          body: Text(
            'Attendance ${state.pathParameters['section']} ${state.pathParameters['subject']}',
          ),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        classListProvider.overrideWith((ref, id) async => record(id)),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: const TextScaler.linear(1.5)),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  setUpAll(() async {
    Hive.init((await Directory.systemTemp.createTemp('class-list-test')).path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() => Hive.close());
  for (final width in [320.0, 360.0, 700.0]) {
    testWidgets('selected class roster fits $width and filters learners', (
      tester,
    ) async {
      await mount(tester, width: width);
      expect(find.text('Class List'), findsOneWidget);
      expect(
        tester.widget<AppBar>(find.byType(AppBar)).shape,
        const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
      );
      expect(find.text('Mathematics'), findsOneWidget);
      expect(find.text('Dela Cruz, Juan'), findsOneWidget);
      expect(find.text('Santos, Ana'), findsNothing);
      expect(find.text('Showing 1 record'), findsOneWidget);
      await tester.tap(find.widgetWithText(OutlinedButton, 'REG'));
      await tester.pumpAndSettle();
      expect(find.text('Dela Cruz, Juan'), findsNothing);
      expect(find.text('Santos, Ana'), findsOneWidget);
      expect(find.text('GRADING WEIGHTS'), findsNothing);
      expect(find.text('Term Grade'), findsNothing);
      await tester.enterText(find.byType(TextField), '123456789013');
      await tester.pump();
      expect(find.text('Dela Cruz, Juan'), findsNothing);
      expect(find.text('Santos, Ana'), findsOneWidget);
      await tester.tap(find.byTooltip('Class actions'));
      await tester.pumpAndSettle();
      expect(find.text('Enter grades'), findsOneWidget);
      expect(find.text('Attendance'), findsOneWidget);
    });
  }

  testWidgets('both actions open exactly the selected subject and section', (
    tester,
  ) async {
    final router = await mount(tester);
    await tester.tap(find.byTooltip('Class actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enter grades'));
    await tester.pumpAndSettle();
    expect(find.text('Grades math|arts'), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Class actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Attendance'));
    await tester.pumpAndSettle();
    expect(find.text('Attendance arts math'), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();
    router.go('/workspace/classes/science%7Carts/list');
    await tester.pumpAndSettle();
    expect(find.text('Science'), findsOneWidget);
    await tester.tap(find.byTooltip('Class actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enter grades'));
    await tester.pumpAndSettle();
    expect(find.text('Grades science|arts'), findsOneWidget);
  });

  test('Class List shares the persistent Class destination', () {
    expect(
      staffRecordDestination('/workspace/classes/math%7Carts/list'),
      '/workspace/classes',
    );
  });
}
