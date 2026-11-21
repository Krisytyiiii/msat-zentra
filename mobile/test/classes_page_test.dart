import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:intl/intl.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/schedule_timing.dart';
import 'package:zentra_mobile/features/teacher/classes_data.dart';
import 'package:zentra_mobile/features/teacher/classes_page.dart';

TeachingWeek week() => TeachingWeek(
  classes: [
    TeachingClass({
      'subjectId': 'math',
      'sectionId': 'arts',
      'subjectName': 'Mathematics',
      'sectionName': 'Arts',
      'gradeLevel': 'G7',
    }),
  ],
  periods: [
    for (final day in [1, 3])
      TeachingPeriod({
        'day': day,
        'period': 2,
        'subject': {'id': 'math'},
        'section': {'id': 'arts'},
      }),
  ],
  config: SchoolDayConfig.fromJson({
    'startTime': '07:30',
    'periodMins': 60,
    'lunch': {'afterPeriod': 4, 'mins': 90},
    'morningRecess': {'enabled': true, 'afterPeriod': 2, 'mins': 15},
    'afternoonRecess': {'enabled': false, 'afterPeriod': 6, 'mins': 15},
  }),
);

void main() {
  setUpAll(() async {
    Hive.init((await Directory.systemTemp.createTemp('classes-tests')).path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() async => Hive.close());

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('weekly class agenda fits $width with large text', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 1000);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [teachingWeekProvider.overrideWith((ref) async => week())],
          child: MaterialApp(
            theme: zWorkspaceTheme(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(1.5)),
              child: child!,
            ),
            home: const Scaffold(body: ClassesPage()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Weekly Period'), findsNothing);
      expect(find.text('Classes Today'), findsNothing);
      final month = DateFormat('EEE, MMM d, yyyy')
          .format(philippineTime(DateTime.now()));
      expect(find.text(month), findsOneWidget);
      await tester.tap(find.text(month));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      final selector = find.byKey(const ValueKey('class-date-selector'));
      await tester.scrollUntilVisible(
        selector,
        100,
        scrollable: find.byType(Scrollable).first,
      );
      final controller = tester.widget<PageView>(selector).controller!;
      final weekday = philippineTime(DateTime.now()).weekday;
      controller.jumpToPage(10000 + 1 - weekday);
      await tester.pumpAndSettle();
      expect(find.text('Mathematics'), findsOneWidget);
      expect(find.text('9:45 AM – 10:45 AM'), findsOneWidget);
      controller.nextPage(
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOut,
      );
      await tester.pumpAndSettle();
      expect(find.text('Mathematics'), findsNothing);
      expect(find.text('No scheduled classes on Tuesday.'), findsOneWidget);
      controller.previousPage(
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOut,
      );
      await tester.pumpAndSettle();
      expect(find.text('Mathematics'), findsOneWidget);
      controller.jumpToPage(10000 + 6 - weekday);
      await tester.pumpAndSettle();
      expect(find.text('No scheduled classes on Saturday.'), findsOneWidget);
      controller.jumpToPage(10000 + 7 - weekday);
      await tester.pumpAndSettle();
      expect(find.text('No scheduled classes on Sunday.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('empty teaching load shows a school-office message', (
    tester,
  ) async {
    final empty = week();
    empty.classes.clear();
    empty.periods.clear();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [teachingWeekProvider.overrideWith((ref) async => empty)],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: const Scaffold(body: ClassesPage()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Ask the school office'), findsOneWidget);
    expect(find.textContaining('Master Teacher'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
