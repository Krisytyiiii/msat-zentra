// Zentra mobile — background attendance save.
//
// Extracted from the sheet so the write no longer depends on the page being
// open: the app-wide save queue runs it, the user can move to another class,
// and the server acknowledgement (never the tap) decides "Saved".
// The server stays authoritative for ownership, roster, ADM and period gates;
// this runner only re-checks the term scope the sheet was prepared in.

import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/save_tasks.dart';
import '../../core/sync_outbox.dart';
import '../../shared/models.dart';
import 'attendance_data.dart';

class AttendanceSaveRequest {
  AttendanceSaveRequest({
    required this.pair,
    required this.sheet,
    required this.date,
    required this.draftKey,
    required this.records,
    required this.queueBehindExisting,
  });

  final AttendancePair pair;
  final AttendanceSheet sheet;

  /// ISO day the sheet was opened for.
  final String date;

  /// Hive draft key that must lose the rows once they are written.
  final String draftKey;

  /// Only learners that are still non-exempt and still differ from baseline.
  final Map<String, String> records;

  /// True when the outbox already holds a write for this sheet: the new values
  /// must queue behind it, never overtake it.
  final bool queueBehindExisting;
  int saved = 0, queued = 0;
}

Future<Box> _cacheBox() async => Hive.isBoxOpen(AppConfig.cacheBox)
    ? Hive.box(AppConfig.cacheBox)
    : Hive.openBox(AppConfig.cacheBox);

/// Removes written rows from the stored draft so a later open never restores
/// marks the server already has.
Future<void> _clearDraft(Box box, String key, Iterable<String> ids) async {
  final stored = box.get(key);
  if (stored is! Map) return;
  final values = Map<String, String>.from(stored);
  var changed = false;
  for (final id in ids) {
    changed = values.remove(id) != null || changed;
  }
  if (changed) await box.put(key, values);
}

Future<SaveTaskResult> runAttendanceSave({
  required ApiClient api,
  required Outbox outbox,
  required AttendanceSaveRequest request,
  required bool Function() termIsCurrent,
  Future<void> Function(String id, int count)? onQueued,
  void Function()? onProgress,
}) async {
  if (!termIsCurrent()) {
    throw ApiException(
      'SCOPE_CHANGED',
      'The selected term changed. Open the sheet again and save there.',
    );
  }
  final connectivity = await Connectivity().checkConnectivity();
  final offline = connectivity.contains(ConnectivityResult.none);
  // A pending write for this sheet keeps FIFO order online too.
  final queue = offline || request.queueBehindExisting;
  final box = await _cacheBox();
  final jobs = request.records.entries.toList();
  for (var start = 0; start < jobs.length; start += 300) {
    if (!termIsCurrent()) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The selected term changed. Open the sheet again and save there.',
      );
    }
    final batch = jobs.sublist(start, math.min(start + 300, jobs.length));
    final body = <String, dynamic>{
      'sectionId': request.pair.sectionId,
      'termId': request.sheet.termId,
      'date': '${request.date}T00:00:00Z',
      'subjectId': request.pair.subjectId,
      'slot': request.sheet.gate.slot,
      if (request.sheet.assignmentId?.isNotEmpty == true)
        'assignmentId': request.sheet.assignmentId,
      'records': [
        for (final row in batch) {'studentId': row.key, 'status': row.value},
      ],
    };
    if (queue) {
      final id = await outbox.enqueue(
        method: 'POST',
        path: '/api/attendance/bulk',
        body: body,
      );
      await onQueued?.call(id, batch.length);
      request.queued += batch.length;
    } else {
      try {
        final response = await api.dio.post('/api/attendance/bulk', data: body);
        if ((response.data as Map)['count'] != batch.length) {
          throw const FormatException('Incomplete attendance acknowledgement');
        }
      } on DioException catch (error) {
        throw api.toApiException(error);
      }
      request.saved += batch.length;
    }
    for (final row in batch) {
      request.records.remove(row.key);
    }
    onProgress?.call();
    await _clearDraft(box, request.draftKey, batch.map((row) => row.key));
  }
  return SaveTaskResult(
    saved: request.saved,
    queued: request.queued,
    message: request.queued > 0
        ? '${request.queued} queued · waiting for server confirmation'
        : '${request.saved} ${request.saved == 1 ? 'mark' : 'marks'} saved',
  );
}
