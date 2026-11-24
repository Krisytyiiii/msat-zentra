import 'dart:io';

import 'package:hive/hive.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/anecdotal/anecdotal_data.dart';
import 'package:zentra_mobile/features/anecdotal/anecdotal_repo_page.dart';

MyAnecdotalRecord rec(
  String name,
  String category, {
  String date = '2026-11-10T08:00:00.000Z',
}) =>
    MyAnecdotalRecord(
      id: '$name-$category-$date',
      studentId: 'student-$name',
      studentName: name,
      lrn: '123456789012',
      section: 'Grade 7 - Rizal',
      observationDatetime: date,
      category: category,
      confidentialityLevel: 'restricted',
    );

Finder chip(String label) => find.byTooltip('$label records');

Future<void> mount(
  WidgetTester tester,
  List<MyAnecdotalRecord> records, {
  double width = 390,
  double height = 900,
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        anecdotalMineProvider.overrideWith((ref) async => records),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: const Scaffold(body: AnecdotalRepoPage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    final directory = await Directory.systemTemp.createTemp('anecdotal-tests');
    Hive.init(directory.path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() async => Hive.close());
  testWidgets('legend dots are compact and share the filters line', (
    tester,
  ) async {
    await mount(tester, const []);

    // The tall legend card is gone; its colours are the filter dots now.
    expect(find.text('Legend'), findsNothing);
    expect(find.text('What each folder color means.'), findsNothing);

    expect(find.text('All'), findsOneWidget);
    expect(find.text('Students'), findsNWidgets(2));

    final tabY = tester.getCenter(find.text('All')).dy;
    for (final label in anecdotalCategoryLabels.values) {
      final dot = chip(label);
      expect(dot, findsOneWidget);
      // Collapsed chips carry no label text at all.
      expect(find.text(label), findsNothing);
      // Same horizontal line as the view filters.
      expect((tester.getCenter(dot).dy - tabY).abs(), lessThan(3));
    }

    // The five dots together are one short run (5 × 30px + 4 × 6px gaps),
    // so the legend no longer eats the row.
    final dotsWidth =
        tester.getRect(chip('Health')).right - tester.getRect(chip('Behavioral')).left;
    expect(dotsWidth, lessThan(180));

    // Collapsed legend dot: a 30px circle, not a pill.
    expect(tester.getSize(find.byType(AnimatedSize).first), const Size(30, 30));
    expect(tester.takeException(), isNull);
  });

  testWidgets('tapping a dot expands it into a labelled filter', (
    tester,
  ) async {
    await mount(tester, [
      rec('Ana Reyes', 'behavioral'),
      rec('Ben Cruz', 'academic'),
    ]);

    expect(find.text('Ana Reyes'), findsOneWidget);
    expect(find.text('Ben Cruz'), findsOneWidget);
    // Only the record row carries the label while the chip is collapsed.
    expect(find.text('Behavioral'), findsOneWidget);

    await tester.tap(chip('Behavioral'));
    await tester.pumpAndSettle();

    // Expanded pill: label visible, still 30px tall.
    expect(find.text('Behavioral'), findsNWidgets(2));
    final expanded = tester.getSize(find.byType(AnimatedSize).first);
    expect(expanded.height, 30);
    expect(expanded.width, greaterThan(30));

    expect(find.text('Ana Reyes'), findsOneWidget);
    expect(find.text('Ben Cruz'), findsNothing);
    expect(find.text('Showing 1 records'), findsOneWidget);

    // Single-select: tapping the expanded chip collapses and clears it.
    await tester.tap(find.byTooltip('Show all categories'));
    await tester.pumpAndSettle();

    expect(find.text('Behavioral'), findsOneWidget);
    expect(find.text('Ana Reyes'), findsOneWidget);
    expect(find.text('Ben Cruz'), findsOneWidget);
    expect(find.text('Showing 2 records'), findsOneWidget);
  });

  testWidgets('filtered-empty state offers Clear filters and restores rows', (
    tester,
  ) async {
    await mount(tester, [
      rec('Ana Reyes', 'academic'),
      rec('Ben Cruz', 'academic'),
    ]);

    await tester.tap(chip('Behavioral'));
    await tester.pumpAndSettle();

    expect(find.text('No records match'), findsOneWidget);
    expect(find.text('Nothing filed under Behavioral yet.'), findsOneWidget);

    await tester.tap(find.text('Clear filters'));
    await tester.pumpAndSettle();

    expect(find.text('No records match'), findsNothing);
    expect(find.text('Behavioral'), findsNothing);
    expect(find.text('Ana Reyes'), findsOneWidget);
  });

  testWidgets('all records are scrollable without paging controls', (tester) async {
    final records = [
      for (var i = 0; i < 25; i++)
        rec('Learner $i', 'academic', date: '2026-11-${(i + 1).toString().padLeft(2, '0')}'),
    ];
    await mount(tester, records);

    expect(find.text('Showing 25 records'), findsOneWidget);
    expect(find.byTooltip('Previous page'), findsNothing);
    expect(find.byTooltip('Next page'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Learner 9'),
      300,
      scrollable: find.descendant(
        of: find.byType(CustomScrollView),
        matching: find.byWidgetPredicate(
          (widget) => widget is Scrollable &&
              widget.axisDirection == AxisDirection.down,
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('single page keeps the footer free of dead paging controls', (
    tester,
  ) async {
    await mount(tester, [rec('Ana Reyes', 'behavioral')]);

    expect(find.text('Showing 1 records'), findsOneWidget);
    expect(find.byTooltip('Next page'), findsNothing);
    expect(find.byTooltip('Previous page'), findsNothing);
  });

  testWidgets('fits a narrow phone with large text', (tester) async {
    await mount(
      tester,
      [rec('Ana Maria Reyes Santos', 'behavioral')],
      width: 320,
      textScale: 1.5,
    );

    expect(find.text('All'), findsOneWidget);
    expect(chip('Behavioral'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
