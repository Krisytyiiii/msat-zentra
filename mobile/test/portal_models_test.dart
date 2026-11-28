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

  test('grades list carries every subject, including ones with no final yet', () {
    final grades = PortalGrades.fromJson({
      'term': {'id': 't1', 'termNumber': 2, 'schoolYearId': 'y1', 'schoolYearName': 'SY 2026-2027'},
      'grades': [
        {
          'id': 'subject:sub-2',
          'subjectId': 'sub-2',
          'subjectName': 'Math',
          'subjectCode': 'MATH7',
          'teacherName': 'Cindy Senso',
          'lockStatus': 'unlocked',
          'isFinal': false,
        },
        {
          'id': 'g1',
          'subjectId': 'sub-1',
          'subjectName': 'Aral Pan',
          'subjectCode': 'AP7',
          'transmutedGrade': 91,
          'lockStatus': 'locked',
          'isFinal': true,
        },
      ],
    });
    expect(grades.grades, hasLength(2));
    expect(grades.grades.first.teacherName, 'Cindy Senso');
    expect(grades.grades.first.isFinal, isFalse);
    expect(grades.grades.last.transmutedGrade, 91);
  });

  test('subject record parses components, scores and final state', () {
    final record = PortalSubjectRecord.fromJson({
      'subject': {'id': 'sub-1', 'name': 'Aral Pan', 'code': 'AP7'},
      'section': {'id': 'sec-1', 'name': 'Rizal', 'gradeLevel': 'G7'},
      'term': {'id': 't1', 'termNumber': 2, 'schoolYearId': 'y1', 'schoolYearName': 'SY 2026-2027'},
      'components': [
        {
          'id': 'c1',
          'type': 'WRITTEN_WORK',
          'label': 'WW',
          'weight': 15,
          'earned': 38,
          'possible': 50,
          'percentage': 76,
          'assessments': [
            {
              'id': 'a1',
              'title': 'Quiz 1',
              'maxScore': 20,
              'dateGiven': '2026-11-20T00:00:00.000Z',
              'rawScore': 18,
              'percentage': 90,
            },
            {
              'id': 'a2',
              'title': 'Quiz 2',
              'maxScore': 30,
              'dateGiven': null,
              'rawScore': null,
              'percentage': null,
            },
          ],
        },
      ],
      'final': {
        'computedAverage': 88.5,
        'transmutedGrade': 90,
        'remarks': 'Passed',
        'lockStatus': 'locked',
        'isFinal': true,
      },
    });

    expect(record.subjectName, 'Aral Pan');
    expect(record.sectionName, 'Rizal');
    expect(record.components.single.assessments, hasLength(2));
    expect(record.components.single.assessments.first.rawScore, 18);
    expect(record.components.single.assessments.last.rawScore, isNull);
    expect(record.isFinal, isTrue);
    expect(record.transmutedGrade, 90);
  });

  test('attendance classes carry teacher, marks flag and counts', () {
    final withMarks = PortalSubjectAttendance.fromJson({
      'subjectId': 'sub-1',
      'subjectName': 'Aral Pan',
      'subjectCode': 'AP7',
      'teacherName': 'Alan Gatdula',
      'present': 18,
      'absent': 2,
      'late': 1,
      'excused': 0,
      'total': 21,
      'hasMarks': true,
      'rate': 0.857,
    });
    final noMarks = PortalSubjectAttendance.fromJson({
      'subjectId': 'sub-2',
      'subjectName': 'Math',
      'subjectCode': 'MATH7',
      'present': 0,
      'absent': 0,
      'late': 0,
      'excused': 0,
      'total': 0,
      'rate': 0,
    });

    expect(withMarks.teacherName, 'Alan Gatdula');
    expect(withMarks.hasMarks, isTrue);
    expect(withMarks.percent, 86);
    expect(noMarks.hasMarks, isFalse, reason: 'legacy payload infers hasMarks from total');
    expect(noMarks.percent, 0);
  });

  test('subject attendance record parses summary, log and heatmap', () {
    final record = PortalSubjectAttendanceDetail.fromJson({
      'subject': {'id': 'sub-1', 'name': 'Aral Pan', 'code': 'AP7'},
      'section': {'id': 'sec-1', 'name': 'Rizal', 'gradeLevel': 'G7'},
      'term': {'id': 't1', 'termNumber': 2, 'schoolYearId': 'y1', 'schoolYearName': 'SY 2026-2027'},
      'summary': {
        'present': 3,
        'absent': 1,
        'late': 0,
        'excused': 0,
        'total': 4,
        'hasMarks': true,
        'rate': 0.75,
        'isRisk': true,
      },
      'log': [
        {'id': 'r1', 'date': '2026-11-24T00:00:00.000Z', 'slot': 0, 'session': 'AM', 'status': 'absent'},
        {'id': 'r2', 'date': '2026-11-23T00:00:00.000Z', 'slot': 2, 'session': 'AM', 'status': 'present'},
      ],
      'heatmap': {
        'startDate': '2026-09-16',
        'endDate': '2026-12-18',
        'today': '2026-11-28',
        'days': [
          {'date': '2026-11-23', 'state': 'present'},
          {'date': '2026-11-24', 'state': 'absent'},
          {'date': '2026-11-25', 'state': 'no-class'},
          {'date': '2026-11-26', 'state': 'missing'},
          {'date': '2026-11-27', 'state': 'upcoming'},
        ],
      },
    });

    expect(record.subjectName, 'Aral Pan');
    expect(record.summary.hasMarks, isTrue);
    expect(record.summary.percent, 75);
    expect(record.log, hasLength(2));
    expect(record.log.first.status, 'absent');
    expect(record.log.last.slot, 2);
    expect(record.days.map((d) => d.state), ['present', 'absent', 'no-class', 'missing', 'upcoming']);
    expect(record.heatStart, '2026-09-16');
  });

  test('portal term keeps authoritative start and end dates', () {
    final term = PortalTerm.fromJson({
      'id': 't2',
      'termNumber': 2,
      'schoolYearId': 'y1',
      'schoolYearName': 'SY 2026-2027',
      'startDate': '2026-09-16T00:00:00.000Z',
      'endDate': '2026-12-18T00:00:00.000Z',
    });
    expect(term.startDate, '2026-09-16T00:00:00.000Z');
    expect(term.endDate, '2026-12-18T00:00:00.000Z');
    expect(term.label, 'SY 2026-2027 · Term 2');
  });
}
