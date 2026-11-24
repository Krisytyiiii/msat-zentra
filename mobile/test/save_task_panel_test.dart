import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/core/save_tasks.dart';
import 'package:zentra_mobile/shared/save_task_panel.dart';

void main() {
  testWidgets('hidden navigation hides the pill without losing saves', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    Future<void> mount(bool enabled) => tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: SaveTaskHost(enabled: enabled, child: const SizedBox()),
        ),
      ),
    );
    await mount(true);
    container.read(saveTasksProvider).submit(
      title: 'Scores',
      subtitle: 'Class',
      action: () async => const SaveTaskResult(saved: 1),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('save-task-pill')), findsOneWidget);
    await mount(false);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('save-task-pill')), findsNothing);
    await mount(true);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('save-task-pill')), findsOneWidget);
  });

  testWidgets('save notice follows a task from running to complete', (
    tester,
  ) async {
    final run = Completer<SaveTaskResult>();
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: SaveTaskHost(child: SizedBox())),
        ),
      ),
    );
    final container = ProviderScope.containerOf(
      tester.element(find.byType(SaveTaskHost)),
    );
    container
        .read(saveTasksProvider)
        .submit(
          title: 'Attendance · Mathematics',
          subtitle: 'Rizal · Nov 22',
          action: () => run.future,
        );
    await tester.pump();
    expect(find.text('Saving 1 change…'), findsOneWidget);
    // Nothing is finished yet, so the dismiss action does nothing.
    expect(
      tester
          .widget<InkWell>(
            find.descendant(
              of: find.byKey(const ValueKey('save-task-dismiss')),
              matching: find.byType(InkWell),
            ),
          )
          .onTap,
      isNull,
    );

    run.complete(const SaveTaskResult(saved: 3, message: '3 marks saved'));
    await tester.pumpAndSettle();
    expect(find.text('1 save complete'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('save-task-expand')));
    await tester.pumpAndSettle();
    expect(find.text('3 marks saved'), findsOneWidget);
    expect(find.text('Attendance · Mathematics'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('save-task-dismiss')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('save-task-pill')), findsNothing);
  });

  testWidgets('failed saves keep a retry action', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: SaveTaskHost(child: SizedBox())),
        ),
      ),
    );
    final container = ProviderScope.containerOf(
      tester.element(find.byType(SaveTaskHost)),
    );
    var attempts = 0;
    container
        .read(saveTasksProvider)
        .submit(
          title: 'Scores · Quiz 1',
          subtitle: 'Rizal · 2 learners',
          action: () async {
            attempts++;
            if (attempts == 1) throw StateError('offline');
            return const SaveTaskResult(saved: 2);
          },
        );
    await tester.pumpAndSettle();
    expect(find.text('1 save failed'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('save-task-expand')));
    await tester.pumpAndSettle();
    final retry = find.text('Retry');
    expect(retry, findsOneWidget);
    await tester.tap(retry);
    await tester.pumpAndSettle();
    expect(find.text('1 save complete'), findsOneWidget);
  });

  testWidgets(
    'expanded history lists every status and scrolls beyond five saves',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Scaffold(body: SaveTaskHost(child: SizedBox())),
          ),
        ),
      );
      final tasks = ProviderScope.containerOf(
        tester.element(find.byType(SaveTaskHost)),
      ).read(saveTasksProvider);
      for (var i = 0; i < 7; i++) {
        final t = tasks.submit(
          title: 'Saved task $i',
          subtitle: 'Section A',
          action: () async => const SaveTaskResult(saved: 1),
        );
        await tester.pump();
        await t.finished;
      }
      final offline = tasks.submit(
        title: 'Offline attendance',
        subtitle: 'Section A',
        action: () async => const SaveTaskResult(queued: 2),
      );
      await tester.pump();
      await offline.finished;
      final failed = tasks.submit(
        title: 'Failed quiz',
        subtitle: 'Section A',
        action: () async => throw StateError('Failed'),
      );
      await tester.pump();
      await failed.finished;
      await tester.tap(find.byKey(const ValueKey('save-task-expand')));
      await tester.pumpAndSettle();
      expect(find.text('Save history'), findsOneWidget);
      expect(find.text('Section A · Not saved'), findsOneWidget);
      expect(find.text('Section A · Waiting to sync'), findsOneWidget);
      expect(find.text('Sync now'), findsOneWidget);
      final list = find.descendant(
        of: find.byKey(const ValueKey('save-task-list')),
        matching: find.byType(Scrollable),
      );
      await tester.scrollUntilVisible(
        find.text('Saved task 0'),
        180,
        scrollable: list,
      );
      expect(find.text('Saved task 0'), findsOneWidget);
      expect(tester.takeException(), isNull);
      tasks.dismissFinished();
      await tester.pumpAndSettle();
      expect(tasks.tasks, hasLength(2));
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text('Section A · Waiting to sync'), findsOneWidget);
    },
  );
}
