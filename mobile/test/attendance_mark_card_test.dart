import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/overview_theme.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/attendance_mark_card.dart';

void main() {
  AttendanceLearner learner({bool exempt = false}) => AttendanceLearner({
    'studentId': 'student',
    'name': 'Jeslito Geverola',
    'lrn': '123456789012',
    'admExempt': exempt,
  });

  testWidgets(
    'reference card has initials, saved badge and equal status buttons',
    (tester) async {
      String? selected;
      final theme = overviewScreenTheme(ThemeData());
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 360,
                child: AttendanceMarkCard(
                  learner: learner(),
                  index: 0,
                  value: 'absent',
                  recordState: 'Saved',
                  enabled: true,
                  onSelect: (status) => selected = status,
                ),
              ),
            ),
          ),
        ),
      );
      expect(find.text('GJ'), findsOneWidget);
      expect(find.text(learner().name), findsOneWidget);
      expect(find.text('123456789012'), findsOneWidget);
      expect(find.text('Saved'), findsOneWidget);
      expect(find.text('Absent recorded'), findsNothing);
      expect(find.byType(Divider), findsOneWidget);
      expect(find.text('Verified'), findsNothing);
      expect(find.text('Add note'), findsNothing);
      final buttons = [
        for (final status in ['present', 'absent', 'late', 'excused'])
          find.byKey(ValueKey('attendance-student-$status')),
      ];
      final divider = tester.getRect(find.byType(Divider));
      expect(
        divider.top,
        greaterThan(tester.getRect(find.text('123456789012')).bottom),
      );
      expect(divider.bottom, lessThan(tester.getRect(buttons.first).top));
      final first = tester.getRect(buttons.first);
      for (final button in buttons) {
        final rect = tester.getRect(button);
        expect(rect.width, closeTo(first.width, 0.01));
        expect(rect.top, first.top);
        expect(rect.height, greaterThanOrEqualTo(48));
        final style = tester.widget<OutlinedButton>(button).style!;
        expect(style.minimumSize!.resolve({})!.height, 36);
        expect(
          style.textStyle!.resolve({})!.fontWeight!.value,
          greaterThanOrEqualTo(FontWeight.w600.value),
        );
      }
      final absent = tester.widget<OutlinedButton>(buttons[1]);
      expect(
        absent.style!.backgroundColor!.resolve({}),
        const Color(0xFFEF5E68),
      );
      await tester.tap(buttons.first);
      expect(selected, 'present');
      expect(tester.takeException(), isNull);
    },
  );

  for (final state in ['Unsaved', 'Queued', 'Absent · not recorded']) {
    testWidgets('$state retains truthful record state', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AttendanceMarkCard(
              learner: learner(),
              index: 1,
              value: 'absent',
              recordState: state,
              enabled: false,
              onSelect: (_) => fail('Read-only card changed'),
            ),
          ),
        ),
      );
      expect(
        find.text(state == 'Absent · not recorded' ? 'Unrecorded' : state),
        findsOneWidget,
      );
      expect(find.text('Saved'), findsNothing);
      for (final button in tester.widgetList<OutlinedButton>(
        find.byType(OutlinedButton),
      )) {
        expect(button.onPressed, isNull);
      }
    });
  }

  for (final width in [320.0, 700.0]) {
    testWidgets('marking card fits $width with large text', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 1000);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(width, 1000),
              textScaler: const TextScaler.linear(2),
            ),
            child: Scaffold(
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: AttendanceMarkCard(
                  learner: learner(),
                  index: 2,
                  value: 'present',
                  recordState: 'Saved',
                  enabled: true,
                  onSelect: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      expect(find.text('E'), findsOneWidget);
      expect(find.byTooltip('Excused'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('exempt learner has no marking controls', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AttendanceMarkCard(
            learner: learner(exempt: true),
            index: 0,
            value: null,
            recordState: 'ADM exempt',
            enabled: false,
            onSelect: (_) => fail('Exempt learner changed'),
          ),
        ),
      ),
    );
    expect(find.byType(OutlinedButton), findsNothing);
    expect(
      find.textContaining('seat-time attendance is not recorded'),
      findsOneWidget,
    );
  });
}
