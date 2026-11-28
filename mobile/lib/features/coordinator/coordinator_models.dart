// Wire models for the existing coordinator desk. IDs remain opaque.
typedef AdmJson = Map<String, dynamic>;

AdmJson admMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};
List<AdmJson> admMaps(Object? value) =>
    value is List ? value.whereType<Map>().map(admMap).toList() : [];
String admText(Object? value) => value?.toString() ?? '';
int admInt(Object? value) => value is num ? value.toInt() : 0;

const admStages = {
  'anecdotal': 'Anecdotal',
  'consultation': 'Consultation',
  'meeting_parents': 'Parent meeting',
  'home_visitation': 'Home visitation',
  'certification': 'Certification / revision',
  'principal_approval': 'Awaiting principal',
  'enrollment_monitoring': 'Enrollment monitoring',
  'completion': 'Completed',
};

String admLabel(String value) =>
    admStages[value] ??
    value
        .replaceAll('_', ' ')
        .split(' ')
        .map(
          (part) => part.isEmpty
              ? ''
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');

const _admActionLabels = {
  'anecdotal_edit': 'Anecdotal record',
  'referral_status_change': 'Referral update',
  'referral_adm_initiated': 'Forwarded to ADM',
  'referral_accepted': 'Referral accepted',
  'referral_escalated': 'Referral escalated',
  'referral_reassigned': 'Referral reassigned',
  'referral_note_added': 'Referral note',
  'referral_follow_up': 'Referral follow-up',
  'referral_dismissed': 'Referral dismissed',
  'referral_referred_specialist': 'Referred to specialist',
  'adm_edit': 'ADM update',
  'intervention_approval': 'Intervention approval',
  'account_approval': 'Account approval',
};

/// Web `friendlyActionType` — the case timeline's action wording.
String admActionLabel(String actionType) =>
    _admActionLabels[actionType] ?? admLabel(actionType);

/// One case's workflow status, derived exactly like web
/// `deriveAdmCaseStatus` (`frontend/src/services/coordinator/labels.ts`): the
/// closed referral wins over the stage, so a cancelled case never reads as
/// "Consultation" / "Pending".
class AdmCaseStatus {
  const AdmCaseStatus(this.key, this.label);
  final String key, label;
}

AdmCaseStatus admCaseStatus({
  required String stage,
  required String eligibility,
  required String approvedBy,
  required String referralStatus,
}) {
  if (referralStatus == 'dismissed') {
    return const AdmCaseStatus('cancelled', 'Cancelled');
  }
  if (referralStatus == 'resolved') {
    return const AdmCaseStatus('resolved_case', 'Resolved');
  }
  switch (stage) {
    case 'consultation':
      return const AdmCaseStatus('need_review', 'Need review by ADM');
    case 'meeting_parents':
      return const AdmCaseStatus('parent_meeting', 'Parent meeting');
    case 'home_visitation':
      return const AdmCaseStatus('home_visit', 'Home visitation');
    case 'certification':
      return eligibility == 'eligible'
          ? const AdmCaseStatus('ready_to_endorse', 'Ready to endorse')
          : const AdmCaseStatus('for_certification', 'For certification');
    case 'principal_approval':
      if (approvedBy.isNotEmpty) {
        return const AdmCaseStatus('endorsed', 'Endorsed');
      }
      return eligibility == 'eligible'
          ? const AdmCaseStatus('endorsed', 'Endorsed to Principal')
          : const AdmCaseStatus('needs_revision', 'Needs revision');
    case 'enrollment_monitoring':
      return const AdmCaseStatus('monitoring', 'Monitoring');
    case 'completion':
      return const AdmCaseStatus('completed', 'Completed');
    default:
      return const AdmCaseStatus('filed', 'Anecdotal filed');
  }
}

class AdmPage<T> {
  const AdmPage({
    required this.rows,
    required this.total,
    required this.page,
    required this.totalPages,
    this.stageCounts = const {},
    this.issued = 0,
    this.returned = 0,
  });
  final List<T> rows;
  final int total, page, totalPages;
  final Map<String, int> stageCounts;

  /// Device ledger counts (`/api/adm/devices`); 0 on the case lists.
  final int issued, returned;

  factory AdmPage.fromJson(Object? data, T Function(AdmJson) parse) {
    final j = admMap(data);
    return AdmPage(
      rows: admMaps(j['rows']).map(parse).toList(growable: false),
      total: admInt(j['total']),
      page: admInt(j['page']) < 1 ? 1 : admInt(j['page']),
      totalPages: admInt(j['totalPages']) < 1 ? 1 : admInt(j['totalPages']),
      stageCounts: admMap(j['stageCounts'])
          .map((k, v) => MapEntry(k, admInt(v))),
      issued: admInt(j['issued']),
      returned: admInt(j['returned']),
    );
  }
}

class AdmCaseRow {
  AdmCaseRow.fromJson(AdmJson j)
    : id = admText(j['id']),
      student = admText(j['student']),
      lrn = admText(j['lrn']),
      grade = admText(j['grade']),
      section = admText(j['sectionName'] ?? j['section']),
      stage = admText(j['stage']),
      eligibility = admText(j['eligibilityStatus']),
      approvedBy = admText(j['approvedBy']),
      approvalDate = admText(j['approvalDate']),
      returnReason = admText(j['returnReason']),
      referralStatus = admText(j['referralStatus']),
      preparedBy = admText(j['preparedBy']),
      datePrepared = admText(j['datePrepared']),
      consultReviewer = admText(j['consultReviewer']),
      endorsedAt = admText(j['endorsedAt']),
      lastActionType = admText(j['lastActionType']),
      lastActionAt = admText(j['lastActionAt']),
      forms = admMaps(j['forms']),
      devicesIssued = admInt(j['devicesIssued']),
      modulesSubmitted = admInt(j['modulesSubmitted']),
      modulesTotal = admInt(j['modulesTotal']),
      meeting = j['meeting'] is Map
          ? AdmMeeting.fromJson(admMap(j['meeting']))
          : null;
  final String id,
      student,
      lrn,
      grade,
      section,
      stage,
      eligibility,
      approvedBy,
      approvalDate,
      returnReason,
      referralStatus,
      preparedBy,
      datePrepared,
      consultReviewer,
      endorsedAt,
      lastActionType,
      lastActionAt;
  final List<AdmJson> forms;
  final int devicesIssued, modulesSubmitted, modulesTotal;
  final AdmMeeting? meeting;

  AdmCaseStatus get status => admCaseStatus(
    stage: stage,
    eligibility: eligibility,
    approvedBy: approvedBy,
    referralStatus: referralStatus,
  );

  bool get closed => referralStatus == 'dismissed' || referralStatus == 'resolved';

  /// Web `isBookableRow`: a closed case never books; an endorsed hand-off
  /// (`referral:<id>`) books until intake, a case file while at the parent
  /// meeting stage.
  bool get bookable =>
      !closed && (id.startsWith('referral:') || stage == 'meeting_parents');

  String get eligibilityLabel => switch (eligibility) {
    'eligible' => 'Eligible',
    'ineligible' => 'Ineligible',
    _ => 'For review',
  };

  String get meetingType => meeting == null
      ? '—'
      : (meeting!.venue == 'home' ? 'Home visit' : 'In school');

  String get latestUpdateLabel => lastActionType.isNotEmpty
      ? admActionLabel(lastActionType)
      : meeting != null
      ? (meeting!.attended ? 'Parent meeting attended' : 'Parent meeting booked')
      : endorsedAt.isNotEmpty
      ? 'Referred for ADM'
      : datePrepared.isNotEmpty
      ? 'Case filed'
      : '—';

  String? get latestUpdateAt => lastActionAt.isNotEmpty
      ? lastActionAt
      : meeting != null
      ? meeting!.datetime?.toIso8601String()
      : endorsedAt.isNotEmpty
      ? endorsedAt
      : datePrepared.isNotEmpty
      ? datePrepared
      : null;
}

class AdmMeeting {
  AdmMeeting.fromJson(AdmJson j)
    : id = admText(j['id']),
      datetime = DateTime.tryParse(
        admText(j['meetingDatetime'] ?? j['datetime']),
      ),
      venue = admText(j['venue']),
      attended = j['attended'] == true,
      minutes = admText(j['minutesOfMeeting']),
      logbook = admText(j['attendanceLogbookRef']),
      attendees = admMaps(j['attendees']),
      invitees = admMaps(j['invitees']),
      attachments = admMaps(j['attachments']);
  final String id, venue, minutes, logbook;
  final DateTime? datetime;
  final bool attended;
  final List<AdmJson> attendees, invitees, attachments;
  bool outcomeOpen(DateTime now) =>
      !attended &&
      datetime != null &&
      !datetime!.isAfter(now.add(const Duration(minutes: 15)));
}

class AdmCaseDetail {
  AdmCaseDetail.fromJson(AdmJson j)
    : id = admText(j['id']),
      profileId = admText(j['profileId']),
      referralId = admText(j['referralId']),
      student = admText(j['student']),
      lrn = admText(j['lrn']),
      grade = admText(j['grade']),
      stage = admText(j['stage']),
      eligibility = admText(j['eligibilityStatus']),
      approvedBy = admText(j['approvedBy']),
      approvalDate = admText(j['approvalDate']),
      preparedBy = admText(j['preparedBy']),
      referral = j['referral'] is Map ? admMap(j['referral']) : null,
      anecdotal = j['anecdotal'] is Map ? admMap(j['anecdotal']) : null,
      certification = admMap(j['certificationDetails']),
      forms = admMaps(j['forms']),
      sessions = admMaps(j['sessions']),
      meetings = admMaps(j['meetings']).map(AdmMeeting.fromJson).toList();
  final String id,
      profileId,
      referralId,
      student,
      lrn,
      grade,
      stage,
      eligibility,
      approvedBy,
      approvalDate,
      preparedBy;
  final AdmJson? referral, anecdotal;
  final AdmJson certification;
  final List<AdmJson> forms, sessions;
  final List<AdmMeeting> meetings;

  bool get hasAttendedMeeting => meetings.any((m) => m.attended);
  bool get closed => ['dismissed', 'resolved'].contains(referral?['status']);
  String get referralStatus => admText(referral?['status']);
  AdmCaseStatus get status => admCaseStatus(
    stage: stage,
    eligibility: eligibility,
    approvedBy: approvedBy,
    referralStatus: referralStatus,
  );
  bool get underReview =>
      referral?['status'] == 'pending' &&
      ['nurse', 'guidance_counselor'].contains(referral?['consultReviewer']);
  bool get preCertification =>
      approvedBy.isEmpty &&
      !closed &&
      !underReview &&
      ['anecdotal', 'consultation', 'meeting_parents'].contains(stage);
  bool get canBook => preCertification && meetings.every((m) => m.attended);
  bool get canCreateProfile =>
      profileId.isEmpty &&
      referralId.isNotEmpty &&
      preCertification &&
      hasAttendedMeeting;
  bool get canCertify =>
      profileId.isNotEmpty &&
      approvedBy.isEmpty &&
      !closed &&
      !underReview &&
      hasAttendedMeeting &&
      referral != null &&
      anecdotal != null &&
      [
        'anecdotal',
        'consultation',
        'meeting_parents',
        'home_visitation',
        'certification',
      ].contains(stage);
  bool get canEndorse =>
      profileId.isNotEmpty &&
      stage == 'certification' &&
      approvedBy.isEmpty &&
      !closed &&
      !underReview &&
      admText(certification['recommendation']).trim().isNotEmpty;
}

class AdmDevice {
  AdmDevice.fromJson(AdmJson j)
    : id = admText(j['id']),
      profileId = admText(j['admLearnerProfileId']),
      student = admText(j['student']),
      lrn = admText(j['lrn']),
      type = admText(j['deviceType']),
      serial = admText(j['deviceSerial']),
      issuedDate = admText(j['issuedDate']),
      returnedDate = admText(j['returnedDate']),
      notes = admText(j['conditionNotes']);
  final String id,
      profileId,
      student,
      lrn,
      type,
      serial,
      issuedDate,
      returnedDate,
      notes;
  bool get returned => returnedDate.isNotEmpty;
}

class AdmMonitoring {
  AdmMonitoring.fromJson(AdmJson j)
    : header = admMap(j['header']),
      progress = admMap(j['progress']),
      modules = admMaps(j['modules']),
      devices = admMaps(j['devices']),
      meetings = admMaps(j['meetings']),
      forms = admMaps(j['forms']),
      timeline = admMaps(j['timeline']);
  final AdmJson header, progress;
  final List<AdmJson> modules, devices, meetings, forms, timeline;
}

// Philippine time is explicit; never interpret the phone's timezone as school time.
DateTime admPhilippineNow() =>
    DateTime.now().toUtc().add(const Duration(hours: 8));
DateTime admSchoolTime(DateTime utc) =>
    utc.toUtc().add(const Duration(hours: 8));
DateTime admSchoolInput(DateTime date, int hour, int minute) => DateTime.utc(
  date.year,
  date.month,
  date.day,
  hour,
  minute,
).subtract(const Duration(hours: 8));
