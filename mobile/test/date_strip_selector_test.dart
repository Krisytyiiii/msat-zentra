import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/shared/date_strip_selector.dart';

void main() {
  final today = DateTime.utc(2026, 11, 17);

  testWidgets(
    'arrows, swipe, Today and calendar honor bounds and allowed days',
    (tester) async {
      var selected = today;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => DateStripSelector(
                selectedDate: selected,
                today: today,
                firstDate: DateTime.utc(2026, 11, 16),
                lastDate: DateTime.utc(2026, 11, 20),
                selectableDayPredicate: (date) =>
                    date.weekday == 2 || date.weekday == 4,
                onChanged: (date) => setState(() => selected = date),
              ),
            ),
          ),
        ),
      );
      expect(
        tester
            .widget<IconButton>(
              find.widgetWithIcon(IconButton, Icons.chevron_left),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.byTooltip('Next day'));
      await tester.pumpAndSettle();
      expect(selected, DateTime.utc(2026, 11, 19));
      expect(
        tester
            .widget<IconButton>(
              find.widgetWithIcon(IconButton, Icons.chevron_right),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('Today'));
      await tester.pumpAndSettle();
      expect(selected, today);
      final pages = tester.widget<PageView>(find.byType(PageView)).controller!;
      pages.jumpToPage(2); // Wednesday is disabled; move forward to Thursday.
      await tester.pumpAndSettle();
      expect(selected, DateTime.utc(2026, 11, 19));
      await tester.tap(find.text('Thu, Nov 19, 2026'));
      await tester.pumpAndSettle();
      final picker = tester.widget<DatePickerDialog>(
        find.byType(DatePickerDialog),
      );
      expect(picker.firstDate, DateTime(2026, 11, 16));
      expect(picker.lastDate, DateTime(2026, 11, 20));
      expect(picker.selectableDayPredicate!(DateTime(2026, 11, 18)), isFalse);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('pending/rejected date changes do not change the selected date', (
    tester,
  ) async {
    final pending = Completer<void>();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DateStripSelector(
            selectedDate: today,
            today: today,
            firstDate: today,
            lastDate: today.add(const Duration(days: 3)),
            onChanged: (_) => pending.future,
          ),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Next day'));
    await tester.pump();
    expect(
      tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, Icons.chevron_right),
          )
          .onPressed,
      isNull,
    );
    expect(find.text('Tue, Nov 17, 2026'), findsOneWidget);
    pending.complete(); // Parent did not accept the date (e.g. draft-save failure).
    await tester.pumpAndSettle();
    expect(tester.widget<PageView>(find.byType(PageView)).controller!.page, 0);
    expect(find.text('Tue, Nov 17, 2026'), findsOneWidget);
  });

  for (final width in [320.0, 700.0, 1200.0]) {
    testWidgets('date selector fits $width with large text', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(width, 900),
              textScaler: const TextScaler.linear(2),
            ),
            child: Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: DateStripSelector(
                  selectedDate: today,
                  today: today,
                  firstDate: today.subtract(const Duration(days: 20)),
                  lastDate: today.add(const Duration(days: 20)),
                  onChanged: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
    });
  }
}
