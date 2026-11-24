import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/shared/widgets.dart';

void main() {
  for (final width in [320.0, 700.0]) {
    testWidgets('grade and matching section capsules sit with subject at $width', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(const MaterialApp(home: Scaffold(
        body: Padding(padding: EdgeInsets.all(12), child: ZContentHeader(
          title: 'Mathematics', icon: Icons.menu_book_outlined,
          description: 'Record learner scores.',
          titleMetadata: [
            ZScopePill(text: 'G7', kind: ScopePillKind.grade),
            ZScopePill(text: 'Arts', kind: ScopePillKind.grade, label: 'Section'),
          ],
        )),
      )));
      expect(find.byTooltip('Section'), findsOneWidget);
      final grade = tester.widget<Container>(find.descendant(
        of: find.byTooltip('Grade level'), matching: find.byType(Container)));
      final section = tester.widget<Container>(find.descendant(
        of: find.byTooltip('Section'), matching: find.byType(Container)));
      expect(grade.decoration, section.decoration);
      if (width == 700) {
        expect(tester.getCenter(find.text('G7')).dy,
          closeTo(tester.getCenter(find.text('Mathematics')).dy, 2));
        expect(tester.getTopLeft(find.text('G7')).dx,
          greaterThan(tester.getTopRight(find.text('Mathematics')).dx));
      }
      expect(tester.takeException(), isNull);
    });
  }
  for (final width in [320.0, 700.0, 1200.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('content header and scope reflow at $width / $scale', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, 900);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        var tapped = false;
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.dark(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: Scaffold(
              body: ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  ZContentHeader(
                    title: 'Attendance',
                    icon: Icons.calendar_month_outlined,
                    description: 'Choose a class to review and record learner attendance.',
                    trailing: OutlinedButton(
                      onPressed: () => tapped = true,
                      child: const Text('Regular'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      ZScopePill(
                        text: 'SY 2026–2027',
                        kind: ScopePillKind.schoolYear,
                      ),
                      ZScopePill(text: 'Term 2', kind: ScopePillKind.term),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
        final title = tester.widget<Text>(find.text('Attendance'));
        expect(title.style!.fontSize, 22);
        expect(title.style!.fontWeight, FontWeight.w700);
        expect(title.style!.color, const Color(0xFF171C36));
        final icon = tester.getRect(find.byIcon(Icons.calendar_month_outlined));
        final heading = tester.getRect(find.text('Attendance'));
        expect(icon.left, lessThan(heading.left));
        expect(
          tester.getTopLeft(find.text('SY 2026–2027')).dy,
          greaterThan(heading.bottom),
        );
        await tester.tap(find.text('Regular'));
        expect(tapped, isTrue);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
