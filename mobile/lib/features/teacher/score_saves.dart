// Zentra mobile — background score save.
//
// The score editor hands its changed rows to the app-wide save queue and is
// free again. Only server acknowledgements count as saved; offline rows go to
// the existing outbox and stay visibly queued.

import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../../core/sync_outbox.dart';
import '../../shared/models.dart';
import '../teacher/gradebook_data.dart';

class ScoreSaveRequest {
  ScoreSaveRequest({
    required this.assessmentId,
    required this.jobs,
    required this.queuedIds,
  });

  final String assessmentId;

  /// `{studentId, rawScore}` rows validated by the editor.
  final List<Map<String, dynamic>> jobs;

  /// Learners that already have an outbox operation: they must stay queued so
  /// the per-cell FIFO order is preserved.
  final Set<String> queuedIds;
  final savedScores = <String, double>{};
  final queuedScores = <String, double>{};
}

class ScoreSaveOutcome {
  ScoreSaveOutcome({
    required this.savedScores,
    required this.queuedScores,
    required this.errors,
  });

  /// Learner id → acknowledged raw score.
  final Map<String, double> savedScores;

  /// Learner id → raw score parked in the outbox.
  final Map<String, double> queuedScores;

  /// Learner id → plain-words failure for that row.
  final Map<String, String> errors;

  int get saved => savedScores.length;
  int get queued => queuedScores.length;
}

Future<ScoreSaveOutcome> runScoreSave({
  required ApiClient api,
  required Outbox outbox,
  required GradebookService service,
  required ScoreSaveRequest request,
  required bool Function() termIsCurrent,
  Future<void> Function(String id, int count)? onQueued,
  void Function()? onProgress,
}) async {
  Future<void> requireScope() async {
    if (!termIsCurrent()) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The selected term changed. Return to the Grade Record before saving.',
      );
    }
  }

  await requireScope();
  final connectivity = await Connectivity().checkConnectivity();
  final offline = connectivity.contains(ConnectivityResult.none);
  final savedScores = request.savedScores;
  final queuedScores = request.queuedScores;
  final errors = <String, String>{};
  final online = <Map<String, dynamic>>[];
  for (final job in List<Map<String, dynamic>>.from(request.jobs)) {
    final id = job['studentId'] as String;
    // Existing per-cell queued operations retain FIFO ordering; the outbox
    // cannot safely interpret partial-success bulk responses.
    if (offline || request.queuedIds.contains(id)) {
      await requireScope();
      final operationId = await outbox.enqueue(
        method: 'POST',
        path:
            '/api/grades/assessments/${Uri.encodeComponent(request.assessmentId)}/score',
        body: job,
      );
      await onQueued?.call(operationId, 1);
      queuedScores[id] = (job['rawScore'] as num).toDouble();
      request.jobs.remove(job);
      onProgress?.call();
    } else {
      online.add(job);
    }
  }
  // The web bulk contract accepts at most 300 learners per request.
  for (var start = 0; start < online.length; start += 300) {
    await requireScope();
    final batch = online.sublist(start, math.min(start + 300, online.length));
    try {
      final response = await service.scores(request.assessmentId, batch);
      final results = response['results'];
      if (results is! List) {
        throw const FormatException('Missing score acknowledgements');
      }
      final byId = <String, Map>{
        for (final row in results)
          if (row is Map && row['studentId'] is String)
            row['studentId'] as String: row,
      };
      for (final job in batch) {
        final id = job['studentId'] as String;
        if (byId[id]?['ok'] == true) {
          savedScores[id] = (job['rawScore'] as num).toDouble();
          request.jobs.remove(job);
        } else {
          errors[id] = 'This score could not be saved. Check it and retry.';
        }
      }
      onProgress?.call();
    } on DioException catch (error) {
      throw api.toApiException(error);
    }
  }
  return ScoreSaveOutcome(
    savedScores: savedScores,
    queuedScores: queuedScores,
    errors: errors,
  );
}
