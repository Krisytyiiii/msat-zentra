import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/attendance_record_card.dart';

import 'package:zentra_mobile/features/workspace/attendance_record_page.dart';

void main() {
  testWidgets('learner card matches record rows and shows confirmed totals', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AttendanceRecordCard(
            learner: AttendanceLearner({
              'studentId': 'one',
              'name': 'Jane Doe',
              'lrn': '123',
            }),
            index: 0,
            summary: (present: 7, late: 1, absent: 2, rate: 0.8),
          ),
        ),
      ),
    );
    for (final label in [
      'Present',
      'Late',
      'Absent',
      'Attendance Rate',
      'LRN 123',
      '80.0%',
      'At risk',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('exempt learner has no fabricated attendance values', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AttendanceRecordCard(
            learner: AttendanceLearner({
              'studentId': 'one',
              'name': 'Jane Doe',
              'admExempt': true,
            }),
            index: 1,
          ),
        ),
      ),
    );
    expect(find.text('ADM exempt'), findsOneWidget);
    expect(find.text('—'), findsNWidgets(4));
    expect(tester.takeException(), isNull);
  });

  final calendar = {
    '2026-11-16': 1,
    '2026-11-17': 1,
    '2026-11-18': 1,
    '2026-11-19': 1,
    '2026-11-20': 1,
  };

  test('present, late and excused count; exactly 80% qualifies as risk', () {
    final rate = attendanceRecordRate(calendar, 5, [
      {'date': '2026-11-16', 'status': 'present'},
      {'date': '2026-11-17', 'status': 'late'},
      {'date': '2026-11-18', 'status': 'excused'},
      {'date': '2026-11-19', 'status': 'present'},
      {'date': '2026-11-20', 'status': 'absent'},
    ]);
    expect(rate, 0.8);
    expect(rate <= 0.8, isTrue);
  });

  test('transferee denominator uses only the eligible tail of meetings', () {
    expect(
      attendanceRecordRate(calendar, 2, [
        {'date': '2026-11-16', 'status': 'present'},
        {'date': '2026-11-19', 'status': 'late'},
        {'date': '2026-11-20', 'status': 'excused'},
      ]),
      1,
    );
  });

  test('caps each day and ignores future and unscheduled marks', () {
    expect(
      attendanceRecordRate(calendar, 5, [
        {'date': '2026-11-16', 'status': 'present'},
        {'date': '2026-11-16', 'status': 'late'},
        {'date': '2026-11-21', 'status': 'excused'},
      ]),
      0.2,
    );
  });

  test('counts multiple meetings on one date', () {
    expect(
      attendanceRecordRate(
        {'2026-11-16': 2},
        2,
        [
          {'date': '2026-11-16', 'status': 'present'},
          {'date': '2026-11-16', 'status': 'excused'},
        ],
      ),
      1,
    );
  });
}
