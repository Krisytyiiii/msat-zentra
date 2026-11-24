import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

import 'api_client.dart';
import 'save_history.dart';
import 'session.dart';
import 'sync_outbox.dart';
import '../shared/user_messages.dart';

enum SaveTaskStatus { running, done, failed, queued }

class SaveTaskResult {
  const SaveTaskResult({
    this.saved = 0,
    this.queued = 0,
    this.failed = 0,
    this.message,
  });
  final int saved, queued, failed;
  final String? message;
}

class SaveTask {
  SaveTask({
    required this.id,
    required this.title,
    required this.subtitle,
    this.action,
    this.onSettled,
    this.route,
    Map<String, dynamic>? recovery,
  }) : recovery = recovery ?? {};

  final String id, title, subtitle;
  final String? route;
  final Map<String, dynamic> recovery;
  final Future<SaveTaskResult> Function()? action;
  final void Function(SaveTask)? onSettled;
  SaveTaskStatus status = SaveTaskStatus.running;
  String? error, message, owner;
  int saved = 0, queued = 0, generation = 0;
  int syncedSaved = 0;
  bool trackedOffline = false;
  bool interrupted = false;
  DateTime updatedAt = DateTime.now();
  final Map<String, int> operations = {};
  Completer<void> _finished = Completer<void>();
  Future<void> get finished => _finished.future;
  bool get running => status == SaveTaskStatus.running;
  bool get failed => status == SaveTaskStatus.failed;
  bool get settled => !running;
  bool get canRetry => failed && action != null && !interrupted;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'subtitle': subtitle,
    'route': route,
    'status': status.name,
    'error': error,
    'message': message,
    'saved': saved,
    'queued': queued,
    'updatedAt': updatedAt.toIso8601String(),
    'operations': Map<String, int>.from(operations),
    'recovery': jsonDecode(jsonEncode(recovery)),
    'syncedSaved': syncedSaved,
    'trackedOffline': trackedOffline,
    'interrupted': interrupted,
  };

  factory SaveTask.restore(Map row, String owner) {
    final task = SaveTask(
      id: row['id'] as String,
      title: row['title'] as String,
      subtitle: row['subtitle'] as String,
      route: row['route'] as String?,
      recovery: Map<String, dynamic>.from(row['recovery'] as Map? ?? {}),
    );
    task
      ..owner = owner
      ..status = SaveTaskStatus.values.firstWhere(
        (s) => s.name == row['status'],
        orElse: () => SaveTaskStatus.failed,
      )
      ..saved = row['saved'] as int? ?? 0
      ..queued = row['queued'] as int? ?? 0
      ..syncedSaved = row['syncedSaved'] as int? ?? 0
      ..trackedOffline = row['trackedOffline'] == true
      ..interrupted = row['interrupted'] == true
      ..error = row['error'] as String?
      ..message = row['message'] as String?
      ..updatedAt =
          DateTime.tryParse(row['updatedAt'] as String? ?? '') ??
          DateTime.now();
    task.operations.addAll(
      Map<String, int>.from(row['operations'] as Map? ?? {}),
    );
    if (task.running) {
      task
        ..status = SaveTaskStatus.failed
        ..interrupted = true
        ..error = 'Interrupted when the app closed. Review the server records before saving again.';
    }
    task._finished.complete();
    return task;
  }
}

final saveHistoryOwnerProvider = FutureProvider<String?>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.loggedIn) return null;
  return saveHistoryOwner(await ref.read(apiClientProvider).accessToken());
});

/// App-owned tasks. History survives restarts; network requests do not.
class SaveTasks extends ChangeNotifier {
  SaveTasks(this._ref) {
    _ready = _switchOwner(_ref.read(saveHistoryOwnerProvider).valueOrNull);
    _ref.listen(saveHistoryOwnerProvider, (_, next) {
      _ready = _switchOwner(next.valueOrNull);
    });
  }
  final Ref _ref;
  final List<SaveTask> _tasks = [];
  String? _owner;
  int _generation = 0;
  bool _expanded = false, _disposed = false, _initialized = false;
  bool syncing = false;
  String? syncError;
  Box? _box;
  StreamSubscription<BoxEvent>? _watch;
  Future<void> _ready = Future.value();
  Future<void> _writes = Future.value();
  List<SaveTask> get tasks => List.unmodifiable(_tasks);
  bool get expanded => _expanded;
  bool get hasTasks => _tasks.isNotEmpty;
  bool get busy => _tasks.any((t) => t.running);
  int get runningCount => _tasks.where((t) => t.running).length;
  int get doneCount =>
      _tasks.where((t) => t.status == SaveTaskStatus.done).length;
  int get queuedCount => _tasks.where((t) => t.queued > 0).length;
  int get failedCount => _tasks.where((t) => t.failed).length;
  int get settledCount => doneCount;
  Future<void> get ready => _ready;
  Future<void> get persisted => _writes;

  Future<void> _switchOwner(String? owner) async {
    if (_initialized && _owner == owner) return;
    _initialized = true;
    final generation = ++_generation;
    _owner = owner;
    _tasks.clear();
    _expanded = false;
    _notify();
    await _watch?.cancel();
    if (_disposed || generation != _generation) return;
    if (owner == null) return;
    final box = await openSaveHistory();
    if (_disposed || generation != _generation) return;
    _box = box;
    final prefix = '${Uri.encodeComponent(owner)}.task.';
    for (final key in box.keys.where((k) => k.toString().startsWith(prefix))) {
      final row = box.get(key);
      if (row is! Map) continue;
      try {
        final task = SaveTask.restore(row, owner)..generation = generation;
        _tasks.add(task);
      } catch (_) {
        // A damaged history entry must not hide the rest of the account's work.
      }
    }
    _tasks.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    _reconcile();
    _watch = box.watch().listen((event) {
      if (generation != _generation || _disposed) return;
      if (event.key.toString().startsWith(
        '${Uri.encodeComponent(owner)}.receipt.',
      )) {
        _reconcile();
        _notify();
      }
    });
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _persist(SaveTask task) {
    final box = _box;
    final owner = task.owner;
    if (box == null || owner == null) return;
    final data = task.toJson();
    // Serialize snapshot writes, including those that were already scheduled
    // when an account switched. They always write to their original owner.
    _writes = _writes
        .catchError((_) {})
        .then((_) => box.put(saveHistoryKey(owner, task.id), data));
  }

  void _reconcile() {
    for (final task in _tasks.where(
      (t) => !t.running && t.trackedOffline && t.owner != null,
    )) {
      var pending = 0;
      String? syncError;
      final completed = <String>[];
      for (final entry in task.operations.entries) {
        final receipt = _box?.get(saveReceiptKey(task.owner!, entry.key));
        if (receipt is Map && receipt['status'] == 'saved') {
          task.saved += entry.value;
          task.syncedSaved += entry.value;
          completed.add(entry.key);
        } else {
          pending += entry.value;
          if (receipt is Map && receipt['status'] == 'failed') {
            syncError = receipt['error'] as String?;
          }
        }
      }
      for (final id in completed) {
        task.operations.remove(id);
      }
      task.queued = pending;
      if (!task.failed) {
        task.status = pending > 0 ? SaveTaskStatus.queued : SaveTaskStatus.done;
        task.message = pending > 0
            ? '$pending waiting to sync${syncError == null ? '' : ' · $syncError'}'
            : '${task.saved} saved';
      }
      _persist(task);
    }
  }

  bool termIsCurrent(String expected) {
    final generation = Zone.current[#saveTaskGeneration] as int?;
    if (generation != null && generation != _generation) return false;
    final term = _ref.read(termProvider);
    return term != null && '${term.schoolYearId}:${term.id}' == expected;
  }

  SaveTask submit({
    required String title,
    required String subtitle,
    required Future<SaveTaskResult> Function() action,
    String? route,
    Map<String, dynamic>? recovery,
    void Function(SaveTask)? onSettled,
  }) {
    final task = SaveTask(
      id: const Uuid().v4(),
      title: title,
      subtitle: subtitle,
      action: action,
      route: route,
      recovery: recovery,
      onSettled: onSettled,
    )..generation = _generation;
    _tasks.insert(0, task);
    _persist(task);
    _notify();
    unawaited(_run(task));
    return task;
  }

  /// Records the durable outbox operation IDs, not inferred from a disappearing
  /// queue entry. Only an explicit server-acknowledged receipt means Saved.
  Future<void> trackQueued(SaveTask task, String id, int count) async {
    task.trackedOffline = true;
    task.operations[id] = count;
    _persist(task);
    await _writes;
  }

  void checkpoint(SaveTask task) => _persist(task);

  Future<void> _run(SaveTask task) async {
    await _ready;
    if (_disposed || task.generation != _generation) {
      task._finished.complete();
      return;
    }
    task
      ..owner = _owner
      ..status = SaveTaskStatus.running
      ..error = null
      ..message = null
      ..updatedAt = DateTime.now();
    try {
      _persist(task);
      await _writes;
      _notify();
      final scope = task.recovery['scope'];
      final result = await runZoned(
        task.action!,
        zoneValues: {
          #saveTaskGeneration: task.generation,
          #saveTaskOwner: task.owner,
          if (scope is String) #saveTaskScope: scope,
        },
      );
      task
        ..saved = result.saved + task.syncedSaved
        ..queued = result.queued
        ..message = result.message
        ..status = result.failed > 0
            ? SaveTaskStatus.failed
            : result.queued > 0
            ? SaveTaskStatus.queued
            : SaveTaskStatus.done;
      if (result.failed > 0) {
        task.error = 'Some changes were not saved. Review or retry.';
      }
    } catch (error) {
      task
        ..status = SaveTaskStatus.failed
        ..error = userMessage(error);
    }
    task.updatedAt = DateTime.now();
    _persist(task);
    if (!_disposed && task.generation == _generation) _reconcile();
    if (!task._finished.isCompleted) task._finished.complete();
    if (!_disposed && task.generation == _generation) {
      task.onSettled?.call(task);
    }
    _notify();
  }

  void retry(String id) {
    final task = _tasks.where((t) => t.id == id).firstOrNull;
    if (task == null || !task.canRetry) return;
    task
      ..status = SaveTaskStatus.running
      .._finished = Completer<void>();
    unawaited(_run(task));
    _notify();
  }

  void toggleExpanded() {
    _expanded = !_expanded;
    _notify();
  }

  Future<void> syncPending() async {
    if (syncing) return;
    syncing = true;
    syncError = null;
    _notify();
    try {
      await _ref.read(outboxProvider).flush();
      _reconcile();
    } catch (error) {
      syncError = userMessage(error);
    } finally {
      syncing = false;
      _notify();
    }
  }

  /// Dismiss only acknowledged work, never failed edits or offline operations.
  void dismiss(String id) {
    final task = _tasks.where((t) => t.id == id).firstOrNull;
    if (task == null || task.status != SaveTaskStatus.done || task.queued > 0) {
      return;
    }
    _tasks.remove(task);
    if (task.owner != null && _box != null) {
      _writes = _writes
          .catchError((_) {})
          .then((_) => _box!.delete(saveHistoryKey(task.owner!, task.id)));
    }
    if (_tasks.isEmpty) _expanded = false;
    _notify();
  }

  void dismissFinished() {
    for (final task in List<SaveTask>.from(_tasks)) {
      dismiss(task.id);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _watch?.cancel();
    super.dispose();
  }
}

final saveTasksProvider = ChangeNotifierProvider<SaveTasks>(
  (ref) => SaveTasks(ref),
);
