import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/core/notifications.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_notifications.dart';

ZNotification n({
  String type = 'generic',
  String? sourceTable,
  String message = '',
  String? sourceId,
}) => ZNotification(
  id: 'n',
  type: type,
  sourceTable: sourceTable,
  sourceId: sourceId,
  message: message,
  isRead: false,
  createdAt: '2026-11-27T08:00:00Z',
);

void main() {
  group('teacher titles match the web map', () {
    test('grades approved and locked keep subject/section detail', () {
      expect(
        teacherNotificationTitle(
          n(
            type: 'finals_ready',
            message:
                'You approved all subjects for Juan Dela Cruz (G9-B) — Term 1',
          ),
        ),
        'Grades approved — Juan Dela Cruz (G9-B)',
      );
      expect(
        teacherNotificationTitle(
          n(
            type: 'grade_locked',
            message: 'You locked 10 Math 9 (MATH9) grades for G9-B — Term 1',
          ),
        ),
        'Math 9 (MATH9) grades locked — G9-B',
      );
    });

    test('referral, SF10, intervention and ADM titles', () {
      expect(
        teacherNotificationTitle(
          n(
            type: 'referral_status_change',
            sourceTable: 'referrals',
            message: 'Guidance rescheduled an intervention session for Maria.',
          ),
        ),
        'Guidance session rescheduled',
      );
      expect(
        teacherNotificationTitle(
          n(
            type: 'sf10_missing',
            sourceTable: 'adviser_sf10_access_requests',
            message: 'No SF10 on file for Maria Santos.',
          ),
        ),
        'SF10 missing',
      );
      expect(
        teacherNotificationTitle(
          n(
            type: 'intervention_session',
            sourceTable: 'interventions',
            message: 'Guidance booked an intervention session for Maria.',
          ),
        ),
        'Intervention session booked',
      );
      expect(
        teacherNotificationTitle(
          n(
            sourceTable: 'adm_learner_profiles',
            message: 'The principal signed the ADM case.',
          ),
        ),
        'ADM case signed',
      );
    });

    test('self-action and fallback titles', () {
      expect(
        teacherNotificationTitle(n(message: 'You saved scores for Math 9.')),
        'Scores saved',
      );
      expect(
        teacherNotificationTitle(n(type: 'something_new')),
        'Something New',
      );
    });
  });

  group('teacher targets use mobile routes only', () {
    test('adviser referral family keeps its desk', () {
      expect(
        teacherNotificationTarget(
          n(
            sourceTable: 'referrals',
            sourceId: 'r1',
            message: 'ADM consultation endorsed',
          ),
          isAdviser: true,
        ),
        '/adviser/adm-cases',
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'referrals', sourceId: 'r1'),
          isAdviser: true,
        ),
        '/adviser/referrals',
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'counseling_sessions', sourceId: 's1'),
          isAdviser: true,
        ),
        '/adviser/referrals',
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'referrals', sourceId: 'r1'),
          isAdviser: false,
        ),
        isNull,
      );
    });

    test('teacher desks and unknown sources', () {
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'section_timetable_entries'),
          isAdviser: true,
        ),
        '/adviser/schedule',
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'section_timetable_entries'),
          isAdviser: false,
        ),
        '/workspace/classes',
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'final_grades'),
          isAdviser: true,
        ),
        '/workspace/gradebook',
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'attendance_records'),
          isAdviser: true,
        ),
        '/workspace/attendance',
      );
      // No mobile desk: the dedicated notifications screen is the fallback.
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'grade_flags'),
          isAdviser: true,
        ),
        isNull,
      );
      expect(
        teacherNotificationTarget(
          n(sourceTable: 'unknown_table'),
          isAdviser: true,
        ),
        isNull,
      );
    });
  });

  group('coordinator map matches the web desk', () {
    test('titles', () {
      expect(
        coordinatorNotificationTitle(n(type: 'device_overdue')),
        'Device return overdue',
      );
      expect(
        coordinatorNotificationTitle(
          n(message: 'You booked a parent meeting for Maria.'),
        ),
        'Action recorded',
      );
      expect(
        coordinatorNotificationTitle(
          n(
            sourceTable: 'adm_parent_meetings',
            message: 'New parent meeting booked.',
          ),
        ),
        'Parent meeting update',
      );
      expect(
        coordinatorNotificationTitle(n(type: 'something_new')),
        'Something New',
      );
    });

    test('targets and the notifications-screen fallback', () {
      expect(
        coordinatorNotificationTarget(n(sourceTable: 'adm_devices')),
        '/coordinator/devices',
      );
      expect(
        coordinatorNotificationTarget(
          n(sourceTable: 'adm_learner_profiles', sourceId: 'case-1'),
        ),
        '/coordinator/referrals/case-1',
      );
      expect(
        coordinatorNotificationTarget(n(sourceTable: 'unknown_table')),
        isNull,
      );
    });
  });
}
