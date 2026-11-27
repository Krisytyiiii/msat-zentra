import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/screen_search.dart';
import 'package:zentra_mobile/features/adviser/schedule_timing.dart';
import 'package:zentra_mobile/shared/models.dart';

void main() {
  test('portal headers filter their own content, never open a page finder', () {
    for (final path in [
      '/student/home',
      '/parent/home',
      '/student/overview',
      '/parent/overview',
      '/student/grades',
      '/parent/attendance',
      '/student/schedule',
      '/parent/modules',
      '/student/sessions',
      '/portal/notifications',
      '/student/profile',
    ]) {
      final spec = screenSearchSpecFor(path);
      expect(spec.filtersContent, isTrue, reason: path);
      expect(spec.hint, isNotEmpty, reason: path);
    }
  });

  test('schedule payload keeps the published grid, day config and classes', () {
    final schedule = PortalSchedule.fromJson({
      'term': {'id': 't1', 'termNumber': 1, 'schoolYearId': 'y1', 'schoolYearName': '2026-2027'},
      'sectionId': 'sec-1',
      'sectionName': 'G7-A',
      'config': {
        'startTime': '07:30',
        'periodMins': 60,
        'lunch': {'afterPeriod': 4, 'mins': 90},
        'morningRecess': {'enabled': false, 'afterPeriod': 2, 'mins': 15},
        'afternoonRecess': {'enabled': false, 'afterPeriod': 6, 'mins': 15},
      },
      'slots': [
        {
          'id': 'slot-1',
          'day': 1,
          'period': 0,
          'status': 'APPROVED',
          'subjectId': 'sub-1',
          'subjectName': 'Mathematics',
          'subjectCode': 'MATH7',
          'teacherName': 'MS. CRUZ',
        },
      ],
      'classes': [
        {
          'subjectId': 'sub-1',
          'subjectName': 'Mathematics',
          'subjectCode': 'MATH7',
          'teacherName': 'MS. CRUZ',
          'days': [1, 3],
          'periods': [0],
        },
      ],
    });

    expect(schedule.sectionName, 'G7-A');
    expect(schedule.slots.single.subjectId, 'sub-1');
    expect(schedule.classes.single.days, [1, 3]);
    expect(schedule.config, isNotNull);

    final config = SchoolDayConfig.fromJson(schedule.config!);
    expect(clockLabel(config.periods[0].start), '7:30 AM');
    expect(clockLabel(config.periods[0].end), '8:30 AM');
  });

  test('only a locked final grade carries an official mark', () {
    final locked = PortalGrade.fromJson({
      'id': 'g1',
      'subjectName': 'Mathematics',
      'subjectCode': 'MATH7',
      'transmutedGrade': 92,
      'lockStatus': 'locked',
      'isFinal': true,
    });
    final open = PortalGrade.fromJson({
      'id': 'g2',
      'subjectName': 'Science',
      'subjectCode': 'SCI7',
      'transmutedGrade': 88,
      'lockStatus': 'unlocked',
      'isFinal': false,
    });

    expect(locked.isFinal, isTrue);
    expect(open.isFinal, isFalse);
  });

  test('attendance without a recorded meetup reports no marks', () {
    final summary = PortalAttendanceSummary.fromJson({
      'rate': 1,
      'present': 0,
      'absent': 0,
      'late': 0,
      'excused': 0,
      'total': 0,
      'isRisk': false,
      'hasMarks': false,
    });
    expect(summary.hasMarks, isFalse);
    expect(summary.percent, 100, reason: 'rate stays 1 for legacy payloads');
  });
}
