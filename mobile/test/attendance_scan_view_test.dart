import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/features/workspace/attendance_scan_view.dart';

const snapshot = AttendanceScanSnapshot(
  learners: [
    AttendanceScanEntry(id: '1', name: 'Dela Cruz, Agnes', lrn: '123456789012'),
    AttendanceScanEntry(id: '2', name: 'Santos, Benedict', lrn: '123456789013'),
    AttendanceScanEntry(id: '3', name: 'Reyes, Clarence', lrn: '123456789014'),
    AttendanceScanEntry(id: '4', name: 'Cruz, Unmarked', lrn: '123456789015'),
  ],
  marks: {'1': 'present', '2': 'present', '3': 'late'},
  schoolYear: 'SY 2026–2027',
  term: 'Term 2',
  grade: 'G7',
  start: '7:30 AM',
  late: '7:35 AM',
  absent: '8:00 AM',
);

Future<void> mount(
  WidgetTester tester, {
  double width = 360,
  AttendanceScanSnapshot data = snapshot,
  Map<String, DateTime> times = const {},
  ValueChanged<int>? onLateAfterChanged,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1600);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    MaterialApp(
      home: AttendanceScanView(
        title: 'English 7 · dfdsfd',
        historyEdit: false,
        automatic: true,
        allowAutomatic: true,
        manual: 'present',
        message: 'Point the camera at a student’s Zentra QR code.',
        error: false,
        busy: false,
        snapshot: data,
        scanTimes: times,
        onLateAfterChanged: onLateAfterChanged,
        camera: const ColoredBox(color: Color(0xFF111827)),
        onDone: () {},
        onAutomaticChanged: (_) {},
        onManualChanged: (_) {},
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('teacher can choose a late threshold without changing marks', (
    tester,
  ) async {
    int? selected;
    await mount(tester, onLateAfterChanged: (value) => selected = value);
    await tester.ensureVisible(find.byType(DropdownButtonFormField<int>));
    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('10 min').last,
      -150,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('10 min').last);
    await tester.pumpAndSettle();
    expect(selected, 10);
    expect(snapshot.marks, {'1': 'present', '2': 'present', '3': 'late'});
  });
  for (final width in [320.0, 360.0, 700.0]) {
    testWidgets('reference scanner fits $width with real counts', (
      tester,
    ) async {
      await mount(tester, width: width);
      expect(find.text('Scan Attendance'), findsOneWidget);
      expect(find.text('English 7 · dfdsfd'), findsOneWidget);
      expect(find.text('SY 2026–2027'), findsOneWidget);
      expect(find.text('Term 2'), findsOneWidget);
      expect(find.text('G7'), findsOneWidget);
      expect(find.text('Attendance Rules'), findsOneWidget);
      expect(find.text('Start Time'), findsOneWidget);
      expect(find.text('Late After'), findsOneWidget);
      expect(find.text('Absent After'), findsOneWidget);
      expect(find.text('7:30 AM'), findsOneWidget);
      expect(find.text('7:35 AM'), findsOneWidget);
      expect(find.text('8:00 AM'), findsOneWidget);
      expect(find.text('Scanned (3)'), findsOneWidget);
      expect(find.text('Present (2)'), findsOneWidget);
      expect(find.text('Late (1)'), findsOneWidget);
      expect(find.text('Absent (0)'), findsOneWidget);
      expect(find.text('Dela Cruz, Agnes'), findsOneWidget);
      expect(find.text('Reyes, Clarence'), findsOneWidget);
      expect(find.text('Cruz, Unmarked'), findsNothing);
      expect(find.text('Done · Review Attendance'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('status tabs and search filter the scanned roster', (
    tester,
  ) async {
    await mount(tester, times: {'3': DateTime(2026, 11, 23, 7, 37)});
    expect(find.text('7:37 AM'), findsOneWidget);
    await tester.ensureVisible(find.text('Late (1)'));
    await tester.tap(find.text('Late (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Reyes, Clarence'), findsOneWidget);
    expect(find.text('Dela Cruz, Agnes'), findsNothing);
    await tester.ensureVisible(find.text('Absent (0)'));
    await tester.tap(find.text('Absent (0)'));
    await tester.pumpAndSettle();
    expect(find.text('No learners marked Absent yet.'), findsOneWidget);
    await tester.ensureVisible(find.text('Scanned (3)'));
    await tester.tap(find.text('Scanned (3)'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '123456789012');
    await tester.pumpAndSettle();
    expect(find.text('Dela Cruz, Agnes'), findsOneWidget);
    expect(find.text('Santos, Benedict'), findsNothing);
  });

  testWidgets('rules collapse and automatic marking stays available', (
    tester,
  ) async {
    await mount(tester);
    expect(find.byType(Switch), findsOneWidget);
    await tester.tap(find.text('Attendance Rules'));
    await tester.pumpAndSettle();
    expect(find.text('Start Time'), findsNothing);
    expect(find.byType(Switch), findsNothing);
    await tester.tap(find.text('Attendance Rules'));
    await tester.pumpAndSettle();
    expect(find.text('Start Time'), findsOneWidget);
  });
}
