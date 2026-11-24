import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/attendance_history_page.dart';
import 'package:zentra_mobile/features/workspace/attendance_mark_card.dart';

import 'attendance_test.dart' as fixture show AttendanceApi, TestTerm;
import 'attendance_qr_test.dart' show FakeCamera;

import 'dart:convert';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final name in [
      AppConfig.termScopeBox,
      AppConfig.cacheBox,
      AppConfig.outboxBox,
    ]) {
      await Hive.openBox(name, bytes: Uint8List(0));
    }
  });
  tearDownAll(() async => Hive.close());
  setUp(() async {
    await Hive.box(AppConfig.cacheBox).clear();
    await Hive.box(AppConfig.outboxBox).clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('dev.fluttercommunity.plus/connectivity'),
          (_) async => ['wifi'],
        );
  });

  Future<fixture.AttendanceApi> mount(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 1000);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = fixture.AttendanceApi()..marks['student'] = 'present';
    api.dio.interceptors.insert(
      0,
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/subject-days')) {
            api.requests.add(options);
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'sectionId': 'section',
                  'subjectId': 'subject',
                  'termId': 'term',
                  'termStart': '2026-11-01T00:00:00Z',
                  'termEnd': '2026-12-31T00:00:00Z',
                  'records': [
                    {
                      'date': '2026-11-17',
                      'key': 'student',
                      'status': api.marks['student'],
                    },
                    {
                      'date': '2026-11-10',
                      'key': 'student',
                      'status': 'present',
                    },
                  ],
                },
              ),
            );
          } else {
            handler.next(options);
          }
        },
      ),
    );
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        termProvider.overrideWith((_) => fixture.TestTerm()),
        attendanceClockProvider.overrideWithValue(
          () => DateTime.utc(2026, 11, 18, 2),
        ),
        overviewProvider.overrideWith((_) async => {}),
        overviewSecondaryProvider.overrideWith((_) async => {}),
      ],
    );
    addTearDown(container.dispose);
    addTearDown(() => api.dio.close(force: true));
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: AttendanceHistoryPage(
            pair: AttendancePair(
              'section',
              'Arts',
              'subject',
              'Mathematics',
              gradeLevel: 'G7',
            )..slots.addAll([(day: 2, period: 0), (day: 2, period: 1)]),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  testWidgets(
    'this week opens the selected date, saves changes and refreshes history',
    (tester) async {
      final api = await mount(tester);
      await tester.tap(
        find.byKey(const ValueKey('attendance-history-2026-11-17')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Nov 17, 2026'), findsOneWidget);
      expect(find.text('Edit Record'), findsOneWidget);
      expect(
        tester.widget<AppBar>(find.byType(AppBar).last).centerTitle,
        isTrue,
      );
      expect(find.text('Mathematics'), findsOneWidget);
      expect(find.text('View the learners in this class.'), findsOneWidget);
      expect(find.text('Term 1'), findsOneWidget);
      expect(find.text('Meetup 1'), findsNothing);
      final dateChip = find.byKey(const ValueKey('attendance-date-chip'));
      final search = find.byType(TextField);
      final subject = find.text('Mathematics');
      expect(tester.getCenter(dateChip).dy, tester.getCenter(subject).dy);
      expect(tester.getTopLeft(search).dx, tester.getTopLeft(subject).dx);
      expect(
        tester.getBottomRight(search).dx,
        tester.getBottomRight(dateChip).dx,
      );
      expect(
        tester.getTopLeft(search).dy,
        greaterThan(tester.getBottomRight(dateChip).dy),
      );
      expect(tester.getSize(dateChip).height, 40);
      expect(
        find.descendant(of: dateChip, matching: find.byType(InkWell)),
        findsNothing,
      );
      expect(
        find.descendant(of: dateChip, matching: find.byType(OutlinedButton)),
        findsNothing,
      );
      expect(
        find.descendant(of: dateChip, matching: find.byType(GestureDetector)),
        findsNothing,
      );
      final decoration = tester.widget<TextField>(search).decoration!;
      expect(decoration.filled, isTrue);
      expect(
        (decoration.border! as OutlineInputBorder).borderRadius,
        BorderRadius.circular(999),
      );
      await tester.enterText(search, 'Ana');
      await tester.pumpAndSettle();
      expect(find.text('111'), findsNothing);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(search).controller!.text, isEmpty);
      final mark = find.byKey(const ValueKey('attendance-student-late'));
      await tester.ensureVisible(mark);
      await tester.pumpAndSettle();
      expect(tester.widget<OutlinedButton>(mark).onPressed, isNotNull);
      await tester.tap(mark);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Review attendance'), findsOneWidget);
      final dialog = find.byType(Dialog);
      expect(
        find.descendant(of: dialog, matching: find.text('Mathematics')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: dialog, matching: find.text('G7')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: dialog, matching: find.text('Arts')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: dialog, matching: find.text('2026-11-17')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: dialog, matching: find.textContaining('Meetup')),
        findsNothing,
      );
      expect(find.text('Changed learners'), findsOneWidget);
      expect(find.text('1 changed learners'), findsOneWidget);
      expect(find.text('Status breakdown'), findsOneWidget);
      expect(find.text('1 Late'), findsOneWidget);
      expect(find.text('Keep editing'), findsOneWidget);
      expect(
        find.textContaining('Unmarked and ADM-exempt learners'),
        findsOneWidget,
      );
      await tester.tap(find.text('Save attendance'));
      await tester.pumpAndSettle();
      expect(api.marks['student'], 'late');
      final body =
          api.requests
                  .lastWhere((request) => request.path.endsWith('/bulk'))
                  .data
              as Map;
      expect(body['date'], '2026-11-17T00:00:00Z');
      expect(body['slot'], 1);
      final count = api.requests
          .where((request) => request.path.endsWith('/subject-days'))
          .length;
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Meeting History'), findsOneWidget);
      expect(
        api.requests
            .where((request) => request.path.endsWith('/subject-days'))
            .length,
        greaterThan(count),
      );
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  testWidgets('restored draft matching saved marks never blocks leaving', (
    tester,
  ) async {
    await Hive.box(AppConfig.cacheBox).put(
      'attendance.draft.teacher.year:term.section|subject.2026-11-17.1',
      {'student': 'present'},
    );
    final api = await mount(tester);
    await tester.tap(
      find.byKey(const ValueKey('attendance-history-2026-11-17')),
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'))
          .onPressed,
      isNull,
    );
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Draft storage failed'), findsNothing);
    expect(find.text('Meeting History'), findsOneWidget);
    expect(api.requests.where((request) => request.method == 'POST'), isEmpty);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('date is display only and keeps the saved draft', (tester) async {
    final api = await mount(tester);
    await tester.tap(
      find.byKey(const ValueKey('attendance-history-2026-11-17')),
    );
    await tester.pumpAndSettle();
    final mark = find.byKey(const ValueKey('attendance-student-late'));
    await tester.ensureVisible(mark);
    await tester.pumpAndSettle();
    await tester.tap(mark);
    await tester.pumpAndSettle();
    final key =
        'attendance.draft.teacher.year:term.section|subject.2026-11-17.1';
    expect(Hive.box(AppConfig.cacheBox).get(key), {'student': 'late'});
    expect(find.byTooltip('Previous day'), findsNothing);
    expect(find.byTooltip('Next day'), findsNothing);
    expect(find.text('Today'), findsNothing);
    expect(find.byType(PageView), findsNothing);
    await tester.tap(find.byKey(const ValueKey('attendance-date-chip')));
    await tester.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsNothing);
    expect(find.text('Nov 17, 2026'), findsOneWidget);
    expect(Hive.box(AppConfig.cacheBox).get(key), {'student': 'late'});
    expect(find.text('Save'), findsOneWidget);
    expect(api.requests.where((request) => request.method == 'POST'), isEmpty);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets(
    'category and save filters combine with record counts and surname sorting',
    (tester) async {
      final api = await mount(tester);
      await tester.tap(
        find.byKey(const ValueKey('attendance-history-2026-11-17')),
      );
      await tester.pumpAndSettle();
      expect(find.text('All Category'), findsOneWidget);
      expect(find.text('Save: All'), findsOneWidget);
      expect(find.text('Showing 3 records'), findsOneWidget);
      expect(
        tester
            .widgetList<AttendanceMarkCard>(find.byType(AttendanceMarkCard))
            .first
            .learner
            .id,
        'roster:r1',
      );
      await tester.ensureVisible(find.text('Name (A-Z)'));
      await tester.tap(find.text('Name (A-Z)'));
      await tester.pumpAndSettle();
      expect(find.text('Name (Z-A)'), findsOneWidget);
      expect(
        tester
            .widgetList<AttendanceMarkCard>(find.byType(AttendanceMarkCard))
            .first
            .learner
            .id,
        'student',
      );
      Future<void> choose(String tooltip, String label) async {
        await tester.ensureVisible(find.byTooltip(tooltip));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip(tooltip));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(PopupMenuItem<String>, label));
        await tester.pumpAndSettle();
      }

      await choose('Save status', 'Saved');
      expect(find.text('Showing 1 records'), findsOneWidget);
      expect(
        tester
            .widget<AttendanceMarkCard>(find.byType(AttendanceMarkCard))
            .learner
            .id,
        'student',
      );
      await choose('Category', 'Absent (A)');
      expect(find.text('Showing 0 records'), findsOneWidget);
      await choose('Save status', 'Unsaved');
      expect(find.text('Showing 1 records'), findsOneWidget);
      expect(
        tester
            .widget<AttendanceMarkCard>(find.byType(AttendanceMarkCard))
            .learner
            .id,
        'roster:r1',
      );
      await choose('Category', 'Present (P)');
      expect(find.text('Showing 0 records'), findsOneWidget);
      expect(
        api.requests.where((request) => request.method == 'POST'),
        isEmpty,
      );
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  testWidgets('previous week can be viewed but cannot be edited or submitted', (
    tester,
  ) async {
    final api = await mount(tester);
    expect(find.text('Previous week · Read-only'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey('attendance-history-2026-11-10')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Nov 10, 2026'), findsOneWidget);
    expect(find.text('Previous-week attendance is read-only.'), findsOneWidget);
    final mark = find.byKey(const ValueKey('attendance-student-late'));
    await tester.ensureVisible(mark);
    expect(tester.widget<OutlinedButton>(mark).onPressed, isNull);
    expect(
      tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, Icons.qr_code_scanner),
          )
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'))
          .onPressed,
      isNull,
    );
    expect(api.requests.where((request) => request.method == 'POST'), isEmpty);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets(
    'history QR replaces only scanned marks, has P/A/L/E and never fills absences',
    (tester) async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final previous = MobileScannerPlatform.instance;
      final camera = FakeCamera();
      MobileScannerPlatform.instance = camera;
      addTearDown(() async {
        MobileScannerPlatform.instance = previous;
        await camera.captures.close();
      });
      final api = await mount(tester);
      api.marks.addAll({'student': 'absent', 'roster:r1': 'late'});
      api.extraRoster = [
        {'studentId': 'student', 'name': 'Ana Reyes', 'lrn': '222'},
        {'studentId': 'roster:r1', 'name': 'Juan Cruz', 'lrn': '111'},
        {'studentId': 'unmarked', 'name': 'Ben Santos', 'lrn': '444'},
        {
          'studentId': 'adm',
          'name': 'Mira Luna',
          'lrn': '333',
          'admExempt': true,
        },
      ];
      await tester.tap(
        find.byKey(const ValueKey('attendance-history-2026-11-17')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Scan student QR'));
      await tester.pumpAndSettle();
      expect(find.text('Scan Attendance'), findsOneWidget);
      expect(find.text('Automatic marking'), findsNothing);
      for (final label in ['P', 'A', 'L', 'E']) {
        expect(find.text(label), findsOneWidget);
      }
      final capture = BarcodeCapture(
        barcodes: [
          Barcode(
            rawValue: jsonEncode({
              'type': 'zentra.student',
              'version': 1,
              'name': 'Ana Reyes',
              'lrn': '222',
            }),
          ),
        ],
      );
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      final key =
          'attendance.draft.teacher.year:term.section|subject.2026-11-17.1';
      expect(Hive.box(AppConfig.cacheBox).get(key), {'student': 'present'});
      await tester.pump(const Duration(seconds: 5));
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(Hive.box(AppConfig.cacheBox).get(key), {'student': 'present'});
      await tester.ensureVisible(find.text('E'));
      await tester.tap(find.text('E'));
      await tester.pumpAndSettle();
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(Hive.box(AppConfig.cacheBox).get(key), {'student': 'excused'});
      // Returning to the original saved status removes, rather than submits,
      // an unnecessary correction.
      await tester.tap(find.text('A'));
      await tester.pumpAndSettle();
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(Hive.box(AppConfig.cacheBox).get(key), isEmpty);
      await tester.tap(find.text('L'));
      await tester.pumpAndSettle();
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(Hive.box(AppConfig.cacheBox).get(key), {'student': 'late'});
      expect(
        api.requests.where((request) => request.method == 'POST'),
        isEmpty,
      );
      await tester.ensureVisible(find.text('Done · Review Attendance'));
      await tester.tap(find.text('Done · Review Attendance'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save attendance'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      final body =
          api.requests
                  .lastWhere((request) => request.path.endsWith('/bulk'))
                  .data
              as Map;
      expect(body['date'], '2026-11-17T00:00:00Z');
      expect(body['slot'], 1);
      expect(body['records'], [
        {'studentId': 'student', 'status': 'late'},
      ]);
      expect(api.marks, {'student': 'late', 'roster:r1': 'late'});
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
}
