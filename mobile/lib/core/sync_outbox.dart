// Offline writes stay FIFO and keep their account and original term scope.
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import 'api_client.dart';
import 'config.dart';
import 'save_history.dart';
import '../shared/user_messages.dart';
import '../shared/models.dart';

final outboxProvider = Provider<Outbox>(
  (ref) => Outbox(ref.watch(apiClientProvider)),
);

class Outbox {
  final ApiClient api;
  Outbox(this.api);
  Future<int>? _flight;
  Box get _box => Hive.box(AppConfig.outboxBox);

  Future<String> enqueue({
    required String method,
    required String path,
    required Map<String, dynamic> body,
  }) async {
    final id = const Uuid().v4();
    final owner = saveHistoryOwner(await api.accessToken());
    final expected = Zone.current[#saveTaskOwner] as String?;
    if (expected != null && owner != expected) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The account changed. Review your changes before saving.',
      );
    }
    final scope = Hive.isBoxOpen(AppConfig.termScopeBox)
        ? Hive.box(AppConfig.termScopeBox)
        : null;
    final expectedScope = Zone.current[#saveTaskScope];
    if (expectedScope != null &&
        '${scope?.get('schoolYearId')}:${scope?.get('termId')}' != expectedScope) {
      throw ApiException(
        'SCOPE_CHANGED',
        'The selected term changed. Review your changes before saving.',
      );
    }
    await _box.add({
      'opId': id,
      'owner': owner,
      'method': method,
      'path': path,
      'body': body,
      'at': DateTime.now().toIso8601String(),
      'termId': scope?.get('termId'),
      'schoolYearId': scope?.get('schoolYearId'),
    });
    return id;
  }

  List<Map<String, dynamic>> get pending => [
    for (final v in _box.values) Map<String, dynamic>.from(v as Map),
  ];
  int get pendingCount => _box.length;

  /// Concurrent sync taps share one FIFO run.
  Future<int> flush() =>
      _flight ??= _flush().whenComplete(() => _flight = null);

  Future<int> _flush() async {
    final owner = saveHistoryOwner(await api.accessToken());
    // Legacy operations with no provable owner must never replay into a
    // different account. Keep them for manual review, not automatic submission.
    if (owner == null) return 0;
    final history = await openSaveHistory();
    var done = 0;
    for (final key in _box.keys.toList()) {
      final value = _box.get(key);
      if (value is! Map) continue;
      final op = Map<String, dynamic>.from(value);
      if (op['owner'] != owner) continue;
      if (saveHistoryOwner(await api.accessToken()) != owner) break;
      final id = op['opId'] as String;
      final receiptKey = saveReceiptKey(owner, id);
      final receipt = history.get(receiptKey);
      if (receipt is Map && receipt['status'] == 'saved') {
        await _box.delete(key);
        continue;
      }
      try {
        final method = (op['method'] as String).toUpperCase();
        final path = op['path'] as String;
        final body = Map<String, dynamic>.from(op['body'] as Map)
          ..['opId'] = id;
        final response = await api.dio.request(
          path,
          data: body,
          options: Options(
            method: method,
            headers: {
              if (op['termId'] != null) 'x-term-id': op['termId'],
              if (op['schoolYearId'] != null)
                'x-school-year-id': op['schoolYearId'],
            },
            extra: {'outboxScope': true, 'saveOwner': owner},
          ),
        );
        if (path == '/api/attendance/bulk' &&
            (response.data is! Map ||
                response.data['count'] != (body['records'] as List).length)) {
          throw const FormatException('Incomplete attendance acknowledgement');
        }
        // Write the explicit receipt before deleting the operation. If closing
        // interrupts cleanup, the next sync won't resend an acknowledged row.
        await history.put(receiptKey, {'status': 'saved'});
        await _box.delete(key);
        done++;
      } catch (error) {
        await history.put(receiptKey, {
          'status': 'failed',
          'error': userMessage(error),
        });
        break;
      }
    }
    return done;
  }
}
