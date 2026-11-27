// Notifications inbox — web parity (NotificationsBell + label.ts).
// GET /api/notifications/ (latest 50, desc), POST /read/:id, POST /read-all.
// Unread is client-derived. Titles/taps port teacherNotificationTitle/Target.

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'api_client.dart';

class ZNotification {
  final String id;
  final String type;
  final String? sourceTable;
  final String? sourceId;
  final String message;
  final bool isRead;
  final String createdAt;
  const ZNotification({
    required this.id,
    required this.type,
    this.sourceTable,
    this.sourceId,
    required this.message,
    required this.isRead,
    required this.createdAt,
  });
  factory ZNotification.fromJson(Map<String, dynamic> j) => ZNotification(
    id: j['id']?.toString() ?? '',
    type: j['type']?.toString() ?? '',
    sourceTable: j['sourceTable']?.toString(),
    sourceId: j['sourceId']?.toString(),
    message: j['message']?.toString() ?? '',
    isRead: (j['isRead'] ?? false) as bool,
    createdAt: j['createdAt']?.toString() ?? '',
  );
}

final notificationsProvider = FutureProvider.autoDispose<List<ZNotification>>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.dio.get('/api/notifications/');
    final data = res.data;
    final List list = data is List
        ? data
        : (data is Map && data['notifications'] is List
              ? data['notifications'] as List
              : []);
    return [
      for (final n in list) ZNotification.fromJson(n as Map<String, dynamic>),
    ];
  } on DioException catch (e) {
    throw api.toApiException(e);
  }
});

Future<void> markNotificationRead(WidgetRef ref, String id) async {
  final api = ref.read(apiClientProvider);
  try {
    await api.dio.post('/api/notifications/read/$id');
  } on DioException catch (e) {
    api.throwApi(e);
  }
  ref.invalidate(notificationsProvider);
}

Future<int> markAllNotificationsRead(WidgetRef ref) async {
  final api = ref.read(apiClientProvider);
  try {
    final res = await api.dio.post('/api/notifications/read-all');
    ref.invalidate(notificationsProvider);
    return (res.data['updated'] ?? 0) as int;
  } on DioException catch (e) {
    api.throwApi(e);
  }
}

/// YYYY-MM-DD HH:MM (mirrors web formatBellDate).
String formatBellDate(String iso) {
  try {
    return DateFormat('yyyy-MM-dd HH:mm').format(DateTime.parse(iso).toLocal());
  } catch (_) {
    return iso;
  }
}

String _prettifyType(String type) => type
    .split('_')
    .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
    .join(' ');

bool _has(RegExp re, String s) => re.hasMatch(s);

/// "…locked 10 Math 9 (MATH9) grades for G9-B — …" → "Math 9 (MATH9) grades locked — G9-B"
String _gradeLockedTitle(String msg) {
  final subject = RegExp(
    r'locked \d+ (.+?) grades? for',
    caseSensitive: false,
  ).firstMatch(msg)?.group(1)?.trim();
  final section = RegExp(
    r'grades? for (\S+)',
    caseSensitive: false,
  ).firstMatch(msg)?.group(1)?.replaceAll(RegExp(r'[.,—–-]+$'), '');
  if (subject != null && subject.isNotEmpty) {
    if (section != null && section.isNotEmpty) {
      return '$subject grades locked — $section';
    }
    return '$subject grades locked';
  }
  return 'Grades locked';
}

/// Port of teacherNotificationTitle (frontend/src/lib/notifications/label.ts)
/// — keep the rules and their order in sync with the web desk.
String teacherNotificationTitle(ZNotification n) {
  final msg = n.message;
  if (n.type == 'finals_ready' ||
      _has(RegExp(r'approved.*for .* \(.*\) —', caseSensitive: false), msg)) {
    final m = RegExp(
      r'approved(.*?)for (.+?) \(([^)]+)\)',
      caseSensitive: false,
    ).firstMatch(msg);
    if (m != null) {
      return 'Grades approved — ${m.group(2)!.trim()} (${m.group(3)!.trim()})';
    }
    return 'Grades approved';
  }
  if (n.type == 'grade_locked' ||
      _has(RegExp(r'locked \d+ .* grades? for', caseSensitive: false), msg)) {
    return _gradeLockedTitle(msg);
  }
  if (n.sourceTable == 'advisory_module_submissions') {
    return _has(RegExp(r'submitted', caseSensitive: false), msg)
        ? 'Module submitted'
        : 'Module update';
  }
  if (n.sourceTable == 'adm_devices') return 'Device update';
  if (n.sourceTable == 'adm_learner_profiles') {
    if (_has(
      RegExp(r'returned .*revision|sent it back', caseSensitive: false),
      msg,
    )) {
      return 'ADM case returned';
    }
    if (_has(
      RegExp(r'signed|approved by the principal', caseSensitive: false),
      msg,
    )) {
      return 'ADM case signed';
    }
    if (_has(RegExp(r'completed the ADM case', caseSensitive: false), msg)) {
      return 'ADM case completed';
    }
    if (_has(RegExp(r'certified the ADM case', caseSensitive: false), msg)) {
      return 'ADM case certified';
    }
    return 'ADM case update';
  }
  if (n.type == 'principal_verdict') return 'Principal verdict';
  if (n.sourceTable == 'section_timetable_entries') {
    if (_has(RegExp(r'sent back', caseSensitive: false), msg)) {
      return 'Schedule sent back';
    }
    if (_has(
      RegExp(r'you sent .* principal review', caseSensitive: false),
      msg,
    )) {
      return 'Sent to principal';
    }
    return 'Schedule approved';
  }
  if (n.sourceTable == 'teacher_names') {
    if (_has(RegExp(r'unlinked', caseSensitive: false), msg)) {
      return 'Teacher code unlinked';
    }
    if (_has(RegExp(r'unlocked attendance', caseSensitive: false), msg)) {
      return 'Attendance unlocked';
    }
    return 'Teacher code linked';
  }
  if (_has(
    RegExp(r'attendance .* (submitted|marked)', caseSensitive: false),
    msg,
  )) {
    return 'Attendance submitted';
  }
  if (_has(RegExp(r'you saved scores', caseSensitive: false), msg)) {
    return 'Scores saved';
  }
  if (_has(
    RegExp(r'you filed an anecdotal record', caseSensitive: false),
    msg,
  )) {
    return 'Record filed';
  }
  if (_has(RegExp(r'you enlisted', caseSensitive: false), msg)) {
    return 'Student enlisted';
  }
  if (_has(RegExp(r'you archived', caseSensitive: false), msg)) {
    return 'Student archived';
  }
  if (_has(RegExp(r'you restored', caseSensitive: false), msg)) {
    return 'Student restored';
  }
  if (_has(RegExp(r'you linked code', caseSensitive: false), msg)) {
    return 'Teacher code linked';
  }
  if (_has(RegExp(r'you withdrew a referral', caseSensitive: false), msg)) {
    return 'Referral withdrawn';
  }
  if (_has(RegExp(r're-submitted', caseSensitive: false), msg)) {
    return 'Referral re-submitted';
  }
  if (_has(
    RegExp(r'invited you to a parent meeting', caseSensitive: false),
    msg,
  )) {
    return 'Parent meeting invitation';
  }
  if (n.sourceTable == 'adm_parent_meetings') {
    if (n.type == 'generic_adm_parent_meetings_outcome') {
      return 'Meeting outcome recorded';
    }
    return 'Parent meeting booked';
  }
  if (n.sourceTable == 'referrals' || n.type == 'referral_status_change') {
    if (_has(
      RegExp(r'clinic accepted your referral', caseSensitive: false),
      msg,
    )) {
      return 'Clinic accepted your referral';
    }
    if (_has(RegExp(r'clinic booked a session', caseSensitive: false), msg)) {
      return 'Clinic session booked';
    }
    if (_has(
      RegExp(r'clinic completed a session', caseSensitive: false),
      msg,
    )) {
      return 'Clinic session completed';
    }
    if (_has(
      RegExp(r'clinic rescheduled a session', caseSensitive: false),
      msg,
    )) {
      return 'Clinic session rescheduled';
    }
    if (_has(
      RegExp(r'clinic cancelled a session', caseSensitive: false),
      msg,
    )) {
      return 'Clinic session cancelled';
    }
    if (_has(
      RegExp(r'clinic resolved your referral', caseSensitive: false),
      msg,
    )) {
      return 'Clinic resolved your referral';
    }
    if (_has(
      RegExp(r'clinic requested more info', caseSensitive: false),
      msg,
    )) {
      return 'Clinic requested more info';
    }
    if (_has(RegExp(r'clinic set a follow-up', caseSensitive: false), msg)) {
      return 'Clinic follow-up set';
    }
    if (_has(
      RegExp(r'clinic completed the referral form', caseSensitive: false),
      msg,
    )) {
      return 'Clinic completed referral form';
    }
    if (_has(RegExp(r'clinic started handling', caseSensitive: false), msg)) {
      return 'Clinic started handling';
    }
    if (_has(RegExp(r'was closed', caseSensitive: false), msg)) {
      return 'Clinic referral closed';
    }
    if (_has(RegExp(r'escalated to the clinic', caseSensitive: false), msg)) {
      return 'Referral escalated to clinic';
    }
    if (_has(RegExp(r'escalated to ADM', caseSensitive: false), msg)) {
      return 'Referral escalated to ADM';
    }
    if (_has(RegExp(r'was escalated', caseSensitive: false), msg)) {
      return 'Referral escalated';
    }
    if (_has(RegExp(r'reassigned to the clinic', caseSensitive: false), msg)) {
      return 'Referral reassigned to clinic';
    }
    if (_has(RegExp(r'was reassigned', caseSensitive: false), msg)) {
      return 'Referral reassigned';
    }
    if (_has(RegExp(r'follow-up was set', caseSensitive: false), msg)) {
      return 'Follow-up set';
    }
    if (_has(RegExp(r'was dismissed', caseSensitive: false), msg)) {
      return 'Referral dismissed';
    }
    if (_has(RegExp(r'more info was requested', caseSensitive: false), msg)) {
      return 'Info requested';
    }
    if (_has(RegExp(r'is now in progress', caseSensitive: false), msg)) {
      return 'Referral in progress';
    }
    if (_has(RegExp(r'was marked resolved', caseSensitive: false), msg)) {
      return 'Referral resolved';
    }
    if (_has(RegExp(r'pending review again', caseSensitive: false), msg)) {
      return 'Referral pending';
    }
    if (_has(
      RegExp(r'guidance resolved your referral', caseSensitive: false),
      msg,
    )) {
      return 'Guidance resolved';
    }
    if (_has(RegExp(r'adm consultation endorsed', caseSensitive: false), msg)) {
      return 'Sent to ADM coordinator';
    }
    if (_has(
      RegExp(r'forwarded to the coordinator', caseSensitive: false),
      msg,
    )) {
      return 'Sent to ADM coordinator';
    }
    if (_has(
      RegExp(r'not endorsed — case closed', caseSensitive: false),
      msg,
    )) {
      return 'ADM referral closed';
    }
    if (_has(
      RegExp(r'guidance accepted your referral', caseSensitive: false),
      msg,
    )) {
      return 'Guidance accepted your referral';
    }
    if (_has(RegExp(r'guidance booked a session', caseSensitive: false), msg)) {
      return 'Guidance session booked';
    }
    if (_has(
      RegExp(r'guidance completed a session', caseSensitive: false),
      msg,
    )) {
      return 'Guidance session completed';
    }
    if (_has(RegExp(r'guidance rescheduled', caseSensitive: false), msg)) {
      return 'Guidance session rescheduled';
    }
    if (_has(RegExp(r'guidance cancelled', caseSensitive: false), msg)) {
      return 'Guidance session cancelled';
    }
    if (_has(
      RegExp(r'guidance resolved your referral', caseSensitive: false),
      msg,
    )) {
      return 'Guidance resolved your referral';
    }
    if (_has(RegExp(r'sent to ADM', caseSensitive: false), msg)) {
      return 'Sent to ADM';
    }
    if (_has(RegExp(r'sent to the clinic', caseSensitive: false), msg)) {
      return 'Sent to clinic';
    }
    if (_has(RegExp(r're-submitted', caseSensitive: false), msg)) {
      return 'Referral re-submitted';
    }
    if (_has(
      RegExp(r'withdrew a referral|you withdrew', caseSensitive: false),
      msg,
    )) {
      return 'Referral withdrawn';
    }
    return 'Referral update';
  }
  if (n.type == 'new_followup') return 'New follow-up';
  if (n.sourceTable == 'adviser_sf10_access_requests') {
    if (_has(RegExp(r'denied', caseSensitive: false), msg)) {
      return 'SF10 access denied';
    }
    if (_has(RegExp(r'approved', caseSensitive: false), msg)) {
      return 'SF10 access approved';
    }
    if (_has(RegExp(r'No SF10 on file|reported missing'), msg)) {
      return 'SF10 missing';
    }
    return 'SF10 access update';
  }
  if (n.sourceTable == 'sf10_records' || n.type == 'sf10_needs_validation') {
    return 'SF10 update';
  }
  if (n.sourceTable == 'interventions') {
    if (_has(RegExp(r'flagged to guidance', caseSensitive: false), msg)) {
      return 'Advisee flagged to guidance';
    }
    if (_has(RegExp(r'reassigned the follow-up', caseSensitive: false), msg)) {
      return 'Follow-up reassigned';
    }
    if (_has(RegExp(r'documentation was added', caseSensitive: false), msg)) {
      return 'Follow-up documentation added';
    }
    if (_has(RegExp(r'documentation was removed', caseSensitive: false), msg)) {
      return 'Follow-up documentation removed';
    }
    if (_has(
      RegExp(r'booked an intervention session', caseSensitive: false),
      msg,
    )) {
      return 'Intervention session booked';
    }
    if (_has(
      RegExp(r'completed an intervention session', caseSensitive: false),
      msg,
    )) {
      return 'Intervention session completed';
    }
    if (_has(
      RegExp(r'rescheduled an intervention session', caseSensitive: false),
      msg,
    )) {
      return 'Intervention session rescheduled';
    }
    if (_has(
      RegExp(r'cancelled an intervention session', caseSensitive: false),
      msg,
    )) {
      return 'Intervention session cancelled';
    }
    if (_has(RegExp(r'opened a follow-up for', caseSensitive: false), msg)) {
      return 'Follow-up opened';
    }
    if (_has(RegExp(r'recorded an outcome for', caseSensitive: false), msg)) {
      return 'Follow-up outcome recorded';
    }
    if (_has(RegExp(r'the intervention plan for', caseSensitive: false), msg)) {
      return 'Intervention plan reviewed';
    }
  }
  if (n.type == 'intervention_detected') {
    if (_has(RegExp(r'flagged Moderate risk', caseSensitive: false), msg)) {
      return 'Advisee flagged Moderate risk';
    }
    return 'Advisee flagged High risk';
  }
  if (_has(RegExp(r'grade flag', caseSensitive: false), msg)) {
    if (_has(RegExp(r'resolved', caseSensitive: false), msg)) {
      return 'Grade flag resolved';
    }
    return 'Grade flag opened';
  }
  if (_has(
    RegExp(
      r'listed as adviser|assigned to .* in .* — Term',
      caseSensitive: false,
    ),
    msg,
  )) {
    return 'New class assignment';
  }
  if (_has(RegExp(r'assignment.*removed', caseSensitive: false), msg)) {
    return 'Assignment removed';
  }
  if (_has(RegExp(r'auto-absent sweep', caseSensitive: false), msg)) {
    return 'Auto-absent sweep';
  }
  if (_has(RegExp(r'advisory attendance', caseSensitive: false), msg)) {
    return 'Attendance saved';
  }
  return _prettifyType(n.type);
}

/// Port of teacherNotificationTarget (label.ts), mapped onto mobile routes.
/// Only destinations the mobile app actually has are returned; `null` means
/// the notification opens the dedicated notifications screen instead.
String? teacherNotificationTarget(ZNotification n, {required bool isAdviser}) {
  final table = n.sourceTable;
  final msg = n.message;
  if (table == 'section_timetable_entries') {
    // The class list is the mobile teacher's only view of the timetable.
    return isAdviser ? '/adviser/schedule' : '/workspace/classes';
  }
  if (table == 'referrals') {
    if (!isAdviser) return null;
    return _has(RegExp(r'adm', caseSensitive: false), msg)
        ? '/adviser/adm-cases'
        : '/adviser/referrals';
  }
  if (table == 'counseling_sessions') {
    return isAdviser ? '/adviser/referrals' : null;
  }
  if (table == 'interventions') return isAdviser ? '/adviser/referrals' : null;
  // No mobile SF10 access desk yet.
  if (table == 'adviser_sf10_access_requests' || table == 'sf10_records') {
    return null;
  }
  if (table == 'adm_parent_meetings' || table == 'adm_profiles') {
    return isAdviser ? '/adviser/referrals' : null;
  }
  if (table == 'adm_learner_profiles' || table == 'adm_devices') {
    return isAdviser ? '/adviser/adm-cases' : null;
  }
  // No mobile advisory modules desk yet.
  if (table == 'advisory_module_submissions') return null;
  if (table == 'student_roster') return isAdviser ? '/adviser/advisory' : null;
  if (table == 'anecdotal_record_followups') {
    return isAdviser ? '/adviser/anecdotal' : null;
  }
  if (table == 'teacher_names' ||
      table == 'sections' ||
      table == 'teacher_subject_assignments') {
    return '/workspace/classes';
  }
  // No mobile grade-flags screen; open the notifications screen instead.
  if (table == 'grade_flags') return null;
  if (table == 'final_grades') return '/workspace/gradebook';
  if (table == 'attendance_records') return '/workspace/attendance';
  return null;
}

/// Portal titles: module releases get a first-class title; everything else
/// reuses the staff label map.
String portalNotificationTitle(ZNotification n) {
  if (n.type == 'module_released' || n.sourceTable == 'advisory_modules') {
    return 'New module released';
  }
  return teacherNotificationTitle(n);
}

/// Portal notification taps: modules land on the module list, everything
/// learner-related lands on the portal home (where sessions are surfaced).
String portalNotificationTarget(ZNotification n, String portal) {
  if (n.sourceTable == 'advisory_modules') return '/$portal/modules';
  return '/$portal/home';
}
