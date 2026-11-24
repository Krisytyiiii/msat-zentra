import 'dart:convert';

import '../../shared/models.dart';
import 'attendance_data.dart';

String studentLrnFromQr(String raw) {
  try {
    final json = jsonDecode(raw);
    if (json is! Map ||
        json['type'] != 'zentra.student' ||
        json['version'] != 1 ||
        json['lrn'] is! String ||
        json['name'] is! String ||
        (json['name'] as String).trim().isEmpty) {
      throw const FormatException();
    }
    final lrn = (json['lrn'] as String).trim();
    if (lrn.isEmpty || lrn.length > 32) throw const FormatException();
    return lrn;
  } catch (_) {
    throw ApiException('INVALID_QR', 'Scan a Zentra student QR code.');
  }
}

AttendanceLearner matchAttendanceQr(
  String raw,
  List<AttendanceLearner> roster,
) {
  final lrn = studentLrnFromQr(raw);
  final matches = roster.where((learner) => learner.lrn.trim() == lrn).toList();
  if (matches.length != 1) {
    throw ApiException(
      'QR_NOT_IN_CLASS',
      'This LRN could not be uniquely matched to this class.',
    );
  }
  if (matches.single.exempt) {
    throw ApiException(
      'ADM_EXEMPT_LEARNER',
      'This student is exempt from seat-time attendance.',
    );
  }
  return matches.single;
}

/// [now] and [start] must use the same clock/time zone.
String qrAttendanceStatus(
  DateTime now,
  DateTime start,
  DateTime end, {
  required bool automatic,
  String manual = 'present',
  int lateAfterMinutes = 20,
}) {
  if (now.isBefore(start) || !now.isBefore(end)) {
    throw ApiException(
      'QR_OUTSIDE_PERIOD',
      'QR scanning is available only during this class period.',
    );
  }
  final threshold = Duration(minutes: lateAfterMinutes.clamp(0, 240));
  return automatic
      ? (now.difference(start) >= threshold ? 'late' : 'present')
      : manual;
}

/// Only genuinely unmarked, non-exempt learners become absent; never replace
/// a manual, saved, queued or scanned mark.
Map<String, String> qrAbsentDrafts({
  required DateTime now,
  required DateTime end,
  required List<AttendanceLearner> learners,
  required Map<String, String> existing,
}) => now.isBefore(end)
    ? {}
    : {
        for (final learner in learners)
          if (!learner.exempt && !existing.containsKey(learner.id))
            learner.id: 'absent',
      };
