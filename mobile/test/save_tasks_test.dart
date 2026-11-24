import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/save_history.dart';
import 'package:zentra_mobile/core/save_tasks.dart';
import 'package:zentra_mobile/core/sync_outbox.dart';
import 'package:zentra_mobile/shared/models.dart';

final account = StateProvider<String?>((_) => 'alice');

String token(String user) =>
    'header.${base64Url.encode(utf8.encode(jsonEncode({'sub': user})))}.signature';

class SyncApi extends ApiClient {
  String user = 'alice';
  bool fail = false, partial = false;
  final requests = <RequestOptions>[];
  Completer<void>? hold;

  SyncApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          requests.add(options);
          if (hold != null) await hold!.future;
          if (fail) {
            handler.reject(DioException(requestOptions: options));
          } else {
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'count': partial ? 0 : 1},
              ),
            );
          }
        },
      ),
    );
  }

  @override
  Future<String?> accessToken() async => token(user);
}

Future<ProviderContainer> container({SyncApi? api}) async {
  final c = ProviderContainer(
    overrides: [
      saveHistoryOwnerProvider.overrideWith((ref) async => ref.watch(account)),
      if (api != null) apiClientProvider.overrideWithValue(api),
    ],
  );
  await c.read(saveHistoryOwnerProvider.future);
  await c.read(saveTasksProvider).ready;
  return c;
}

Future<void> save(SaveTasks tasks, {String title = 'Scores'}) async {
  final t = tasks.submit(
    title: title,
    subtitle: 'Section A',
    action: () async => const SaveTaskResult(saved: 1),
  );
  await t.finished;
  await tasks.persisted;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final name in [
      AppConfig.saveHistoryBox,
      AppConfig.outboxBox,
      AppConfig.termScopeBox,
    ]) {
      await Hive.openBox(name, bytes: Uint8List(0));
    }
  });
  setUp(() async {
    await Hive.box(AppConfig.saveHistoryBox).clear();
    await Hive.box(AppConfig.outboxBox).clear();
    await Hive.box(AppConfig.termScopeBox).clear();
  });
  tearDownAll(Hive.close);

  test('all entries survive restart, not just the latest five', () async {
    final first = await container();
    final tasks = first.read(saveTasksProvider);
    for (var i = 0; i < 8; i++) {
      await save(tasks, title: 'Save $i');
    }
    first.dispose();
    final second = await container();
    addTearDown(second.dispose);
    expect(second.read(saveTasksProvider).tasks, hasLength(8));
    expect(second.read(saveTasksProvider).doneCount, 8);
  });

  test('closing mid-request restores Needs review without replay', () async {
    final first = await container();
    final tasks = first.read(saveTasksProvider);
    final held = Completer<SaveTaskResult>();
    final task = tasks.submit(
      title: 'Scores',
      subtitle: 'Section A',
      route: '/workspace/classes/class/assessments/quiz',
      recovery: {
        'scores': [
          {'studentId': 'r1', 'rawScore': 5},
        ],
      },
      action: () => held.future,
    );
    await Future<void>.delayed(Duration.zero);
    await tasks.persisted;
    final second = await container();
    addTearDown(second.dispose);
    final restored = second.read(saveTasksProvider).tasks.single;
    expect(restored.interrupted, isTrue);
    expect(restored.canRetry, isFalse);
    expect(restored.recovery['scores'], hasLength(1));
    first.dispose();
    held.complete(const SaveTaskResult(saved: 1));
    await task.finished;
  });

  test(
    'dismiss clears only Saved, keeping failed edits and offline work',
    () async {
      final c = await container();
      addTearDown(c.dispose);
      final tasks = c.read(saveTasksProvider);
      await save(tasks);
      final offline = tasks.submit(
        title: 'Attendance',
        subtitle: 'Section A',
        action: () async => const SaveTaskResult(saved: 1, queued: 2),
      );
      await offline.finished;
      final failed = tasks.submit(
        title: 'Quiz',
        subtitle: 'Section A',
        action: () async => throw StateError('failed'),
      );
      await failed.finished;
      tasks.dismissFinished();
      expect(tasks.tasks, hasLength(2));
      expect(offline.status, SaveTaskStatus.queued);
      expect(tasks.doneCount, 0);
      expect(tasks.queuedCount, 1);
      expect(tasks.failedCount, 1);
      await tasks.persisted;
    },
  );

  test(
    'receipt, not removal from outbox, changes Waiting to sync to Saved',
    () async {
      final c = await container();
      addTearDown(c.dispose);
      final tasks = c.read(saveTasksProvider);
      late SaveTask task;
      task = tasks.submit(
        title: 'Attendance',
        subtitle: 'Section A',
        action: () async {
          await tasks.trackQueued(task, 'op1', 3);
          return const SaveTaskResult(queued: 3);
        },
      );
      await task.finished;
      expect(task.status, SaveTaskStatus.queued);
      final box = Hive.box(AppConfig.saveHistoryBox);
      await box.put(saveReceiptKey('alice', 'op1'), {
        'status': 'failed',
        'error': 'Offline',
      });
      await Future<void>.delayed(Duration.zero);
      expect(task.status, SaveTaskStatus.queued);
      await box.put(saveReceiptKey('alice', 'op1'), {'status': 'saved'});
      await Future<void>.delayed(Duration.zero);
      expect(task.status, SaveTaskStatus.done);
      expect(task.saved, 3);
      expect(task.queued, 0);
      await tasks.persisted;
      c.dispose();
      final next = await container();
      expect(next.read(saveTasksProvider).tasks.single.saved, 3);
      next.dispose();
    },
  );

  test(
    'history is partitioned by account and stale completion cannot leak',
    () async {
      final c = await container();
      addTearDown(c.dispose);
      final tasks = c.read(saveTasksProvider);
      await save(tasks);
      final held = Completer<SaveTaskResult>();
      final running = tasks.submit(
        title: 'Alice save',
        subtitle: 'Section A',
        action: () => held.future,
      );
      await Future<void>.delayed(Duration.zero);
      c.read(account.notifier).state = 'bob';
      await c.read(saveHistoryOwnerProvider.future);
      await tasks.ready;
      expect(tasks.tasks, isEmpty);
      held.complete(const SaveTaskResult(saved: 1));
      await running.finished;
      expect(tasks.tasks, isEmpty);
      await tasks.persisted;
    },
  );

  test('retry is guarded against double taps', () async {
    final c = await container();
    addTearDown(c.dispose);
    final tasks = c.read(saveTasksProvider);
    var attempts = 0;
    final held = Completer<SaveTaskResult>();
    final t = tasks.submit(
      title: 'Save',
      subtitle: 'Section A',
      action: () async {
        if (++attempts == 1) throw StateError('failed');
        return held.future;
      },
    );
    await t.finished;
    tasks.retry(t.id);
    tasks.retry(t.id);
    await Future<void>.delayed(Duration.zero);
    expect(attempts, 2);
    held.complete(const SaveTaskResult(saved: 1));
    await t.finished;
    await tasks.persisted;
  });

  test(
    'outbox sync preserves account, term, FIFO and explicit acknowledgement',
    () async {
      final api = SyncApi();
      addTearDown(() => api.dio.close(force: true));
      final outbox = Outbox(api);
      final scope = Hive.box(AppConfig.termScopeBox);
      await scope.putAll({'termId': 'term1', 'schoolYearId': 'year1'});
      final id = await outbox.enqueue(
        method: 'POST',
        path: '/api/attendance/bulk',
        body: {
          'records': [
            {'studentId': 'r1', 'status': 'present'},
          ],
        },
      );
      await scope.put('termId', 'term2');
      api.user = 'bob';
      expect(await outbox.flush(), 0);
      expect(api.requests, isEmpty);
      api.user = 'alice';
      api.partial = true;
      expect(await outbox.flush(), 0);
      expect(outbox.pendingCount, 1);
      expect(api.requests.single.headers['x-term-id'], 'term1');
      expect(
        Hive.box(AppConfig.saveHistoryBox)
            .get(saveReceiptKey('alice', id))['status'],
        'failed',
      );
      api.partial = false;
      api.hold = Completer<void>();
      final sync = outbox.flush();
      final duplicate = outbox.flush();
      api.hold!.complete();
      expect(await sync, 1);
      expect(await duplicate, 1);
      expect(api.requests, hasLength(2));
      expect(outbox.pendingCount, 0);
      expect(
        Hive.box(AppConfig.saveHistoryBox)
            .get(saveReceiptKey('alice', id))['status'],
        'saved',
      );
    },
  );

  test(
    'FIFO failure retains later operations and legacy unowned entries',
    () async {
      final api = SyncApi()..fail = true;
      addTearDown(() => api.dio.close(force: true));
      final outbox = Outbox(api);
      await outbox.enqueue(
        method: 'POST',
        path: '/api/grades/assessments/q/score',
        body: {},
      );
      await outbox.enqueue(
        method: 'POST',
        path: '/api/grades/assessments/q/score',
        body: {},
      );
      await Hive.box(AppConfig.outboxBox).add({
        'opId': 'legacy',
        'method': 'POST',
        'path': '/api/anecdotal',
        'body': {},
      });
      expect(await outbox.flush(), 0);
      expect(api.requests, hasLength(1));
      expect(outbox.pendingCount, 3);
    },
  );

  test(
    'account change cannot enqueue an old task under the new owner',
    () async {
      final api = SyncApi()..user = 'bob';
      addTearDown(() => api.dio.close(force: true));
      final outbox = Outbox(api);
      await expectLater(
        runZoned(
          () => outbox.enqueue(
            method: 'POST',
            path: '/api/attendance/bulk',
            body: {},
          ),
          zoneValues: {#saveTaskOwner: 'alice'},
        ),
        throwsA(isA<ApiException>()),
      );
      expect(outbox.pendingCount, 0);
    },
  );
}
