import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zentra_mobile/features/workspace/attendance_actions.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/attendance_qr_logic.dart';
import 'package:zentra_mobile/features/workspace/attendance_scanner_page.dart';
import 'package:zentra_mobile/shared/models.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/features/workspace/attendance_sheet_page.dart';
import 'package:zentra_mobile/features/workspace/attendance_record_page.dart';

import 'attendance_test.dart' as fixture show AttendanceApi, TestTerm;

class FakeCamera extends MobileScannerPlatform {
  final captures = StreamController<BarcodeCapture?>.broadcast();
  int starts = 0, stops = 0;
  @override
  Stream<BarcodeCapture?> get barcodesStream => captures.stream;
  @override
  Stream<TorchState> get torchStateStream => const Stream.empty();
  @override
  Stream<double> get zoomScaleStateStream => const Stream.empty();
  @override
  Future<MobileScannerViewAttributes> start(StartOptions options) async {
    starts++;
    return const MobileScannerViewAttributes(
      cameraDirection: CameraFacing.back,
      currentTorchMode: TorchState.off,
      size: Size(640, 480),
    );
  }

  @override
  Widget buildCameraView() => const ColoredBox(color: Colors.black);
  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Future<void> pause() async {}
  @override
  Future<void> dispose() async {}
  @override
  Future<void> updateScanWindow(Rect? window) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await Hive.openBox(AppConfig.termScopeBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.cacheBox, bytes: Uint8List(0));
    await Hive.openBox(AppConfig.outboxBox, bytes: Uint8List(0));
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
  final start = DateTime.utc(2026, 11, 17, 7);
  final end = DateTime.utc(2026, 11, 17, 8);
  final roster = [
    AttendanceLearner({'studentId': 'one', 'name': 'Juan Cruz', 'lrn': '111'}),
    AttendanceLearner({'studentId': 'two', 'name': 'Ana Reyes', 'lrn': '222'}),
    AttendanceLearner({
      'studentId': 'three',
      'name': 'Mira Luna',
      'lrn': '333',
      'admExempt': true,
    }),
  ];
  String payload(String lrn, {String name = 'Student'}) => jsonEncode({
    'type': 'zentra.student',
    'version': 1,
    'name': name,
    'lrn': lrn,
  });

  test('Present below 20 minutes, Late at exactly 20 and beyond', () {
    expect(
      qrAttendanceStatus(
        start.add(const Duration(minutes: 19, seconds: 59)),
        start,
        end,
        automatic: true,
      ),
      'present',
    );
    expect(
      qrAttendanceStatus(
        start.add(const Duration(minutes: 20)),
        start,
        end,
        automatic: true,
      ),
      'late',
    );
    expect(
      qrAttendanceStatus(
        start.add(const Duration(minutes: 45)),
        start,
        end,
        automatic: true,
      ),
      'late',
    );
    expect(
      qrAttendanceStatus(
        start.add(const Duration(minutes: 45)),
        start,
        end,
        automatic: false,
      ),
      'present',
    );
  });
  test('no scans before start or at/after end', () {
    expect(
      () => qrAttendanceStatus(
        start.subtract(const Duration(seconds: 1)),
        start,
        end,
        automatic: true,
      ),
      throwsA(isA<ApiException>()),
    );
    expect(
      () => qrAttendanceStatus(end, start, end, automatic: true),
      throwsA(isA<ApiException>()),
    );
  });
  test(
    'LRN is authoritative, invalid/unknown/ambiguous/exempt QR rejected',
    () {
      expect(
        matchAttendanceQr(
          payload('111', name: 'Different display name'),
          roster,
        ).id,
        'one',
      );
      for (final raw in ['111', '{}', payload('999'), payload('333')]) {
        expect(
          () => matchAttendanceQr(raw, roster),
          throwsA(isA<ApiException>()),
        );
      }
      expect(
        () => matchAttendanceQr(payload('111'), [roster.first, roster.first]),
        throwsA(isA<ApiException>()),
      );
    },
  );
  test('absences only after end; existing and exempt marks preserved', () {
    expect(
      qrAbsentDrafts(now: start, end: end, learners: roster, existing: {}),
      isEmpty,
    );
    expect(
      qrAbsentDrafts(
        now: end,
        end: end,
        learners: roster,
        existing: {'one': 'excused'},
      ),
      {'two': 'absent'},
    );
    expect(
      qrAbsentDrafts(
        now: end,
        end: end,
        learners: roster,
        existing: {'one': 'present', 'two': 'late'},
      ),
      isEmpty,
    );
  });

  testWidgets('floating Add exposes Manual and QR choices', (tester) async {
    bool? selected;
    var expanded = false;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) => Scaffold(
            floatingActionButton: AttendanceActions(
              expanded: expanded,
              onToggle: () => setState(() => expanded = !expanded),
              onSelect: (value) => setState(() {
                selected = value;
                expanded = false;
              }),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Add attendance'));
    await tester.pumpAndSettle();
    expect(find.text('Manual'), findsOneWidget);
    expect(find.text('QR'), findsOneWidget);
    await tester.tap(find.text('Manual'));
    await tester.pumpAndSettle();
    expect(selected, false);
    await tester.tap(find.byTooltip('Add attendance'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('QR'));
    await tester.pumpAndSettle();
    expect(selected, true);
  });

  testWidgets(
    'Attendance Record dial stays anchored and dismisses on outside tap, Back and Escape',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 900);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = fixture.AttendanceApi();
      api.dio.interceptors.insert(
        0,
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.path.endsWith('/section-subject-matrix') ||
                options.path.endsWith('/subject-days')) {
              handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'sectionId': 'section',
                    'subjectId': 'subject',
                    'termId': 'term',
                    'subjects': [],
                    'students': [],
                    'records': [],
                    'termStart': '2026-11-01T00:00:00Z',
                    'termEnd': '2026-12-31T00:00:00Z',
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
        ],
      );
      addTearDown(container.dispose);
      addTearDown(() => api.dio.close(force: true));
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: AttendanceRecordPage(
              pair: AttendancePair('section', 'Arts', 'subject', 'Mathematics'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final button = find.byTooltip('Add attendance');
      final position = tester.getTopLeft(button);
      final state = tester.state(find.byType(AttendanceActions));
      await tester.tap(button);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 75));
      expect(
        tester.getTopLeft(find.byTooltip('Close attendance actions')),
        position,
      );
      final rotation = tester.widget<RotationTransition>(
        find.byKey(const ValueKey('attendance-dial-rotation')),
      );
      expect(rotation.turns.value, greaterThan(0));
      expect(rotation.turns.value, lessThan(0.125));
      await tester.pumpAndSettle();
      expect(tester.state(find.byType(AttendanceActions)), same(state));
      await tester.tapAt(const Offset(20, 200));
      await tester.pumpAndSettle();
      expect(find.text('Manual'), findsNothing);
      await tester.tap(find.byTooltip('Add attendance'));
      await tester.pumpAndSettle();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Attendance Record'), findsOneWidget);
      expect(find.text('Manual'), findsNothing);
      await tester.tap(find.byTooltip('Add attendance'));
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.text('Manual'), findsNothing);
      expect(tester.getTopLeft(find.byTooltip('Add attendance')), position);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'camera detects QR, throttles duplicate frames and supports manual mode',
    (tester) async {
      final previous = MobileScannerPlatform.instance;
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 1100);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final camera = FakeCamera();
      MobileScannerPlatform.instance = camera;
      addTearDown(() async {
        MobileScannerPlatform.instance = previous;
        await camera.captures.close();
      });
      final calls = <bool>[];
      await tester.pumpWidget(
        MaterialApp(
          home: AttendanceScannerPage(
            title: 'Math · Arts',
            onScan: (raw, automatic, manual) async {
              calls.add(automatic);
              return 'Juan Cruz · Present (draft)';
            },
            onAutomaticTick: () async => null,
          ),
        ),
      );
      await tester.pumpAndSettle();
      final capture = BarcodeCapture(
        barcodes: [Barcode(rawValue: payload('111'))],
      );
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(find.text('Juan Cruz · Present (draft)'), findsOneWidget);
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(calls, [true]);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(find.byType(ChoiceChip), findsNWidgets(2));
      camera.captures.add(
        BarcodeCapture(barcodes: [Barcode(rawValue: payload('222'))]),
      );
      await tester.pumpAndSettle();
      expect(calls, [true, false]);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'history mode allows live automatic scans without automatic absences',
    (tester) async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 1200);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final previous = MobileScannerPlatform.instance;
      final camera = FakeCamera();
      MobileScannerPlatform.instance = camera;
      addTearDown(() async {
        MobileScannerPlatform.instance = previous;
        await camera.captures.close();
      });
      var ticks = 0;
      final modes = <bool>[];
      await tester.pumpWidget(
        MaterialApp(
          home: AttendanceScannerPage(
            title: 'Today · Mathematics',
            historyEdit: true,
            allowAutomatic: true,
            onScan: (raw, automatic, manual) async {
              modes.add(automatic);
              return 'Updated only this student';
            },
            onAutomaticTick: () async {
              ticks++;
              return null;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      final capture = BarcodeCapture(
        barcodes: [Barcode(rawValue: payload('111'))],
      );
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      camera.captures.add(capture);
      await tester.pumpAndSettle();
      expect(modes, [true]);
      expect(ticks, 0);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'QR fills persistent drafts, completes absences and saves through existing review',
    (tester) async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 1200);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final previous = MobileScannerPlatform.instance;
      final camera = FakeCamera();
      MobileScannerPlatform.instance = camera;
      addTearDown(() async {
        MobileScannerPlatform.instance = previous;
        await camera.captures.close();
      });
      final api = fixture.AttendanceApi()
        ..extraRoster = [
          {'studentId': 'one', 'name': 'Juan Cruz', 'lrn': '111'},
          {'studentId': 'two', 'name': 'Ana Reyes', 'lrn': '222'},
          {'studentId': 'unmarked', 'name': 'Ben Santos', 'lrn': '444'},
          {
            'studentId': 'adm',
            'name': 'Mira Luna',
            'lrn': '333',
            'admExempt': true,
          },
        ];
      var now = DateTime.utc(2026, 11, 17, 0, 19, 59);
      final access = (await tester.runAsync(
        () => AttendanceService(api).access(),
      ))!;
      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          termProvider.overrideWith((_) => fixture.TestTerm()),
          attendanceClockProvider.overrideWithValue(() => now),
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
            home: AttendanceSheetPage(
              pair: access.pairs.first,
              access: access,
              openQr: true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Scan Attendance'), findsOneWidget);
      camera.captures.add(
        BarcodeCapture(barcodes: [Barcode(rawValue: payload('111'))]),
      );
      await tester.pumpAndSettle();
      now = DateTime.utc(2026, 11, 17, 0, 20);
      camera.captures.add(
        BarcodeCapture(barcodes: [Barcode(rawValue: payload('222'))]),
      );
      await tester.pumpAndSettle();
      final key =
          'attendance.draft.teacher.year:term.section|subject.2026-11-17.2';
      expect(Hive.box(AppConfig.cacheBox).get(key), {
        'one': 'present',
        'two': 'late',
      });
      camera.captures.add(
        BarcodeCapture(barcodes: [Barcode(rawValue: payload('333'))]),
      );
      await tester.pumpAndSettle();
      expect(
        (Hive.box(AppConfig.cacheBox).get(key) as Map).containsKey('adm'),
        isFalse,
      );
      expect(
        api.requests.where((request) => request.method == 'POST'),
        isEmpty,
      );
      now = DateTime.utc(2026, 11, 17, 1); // PH 9:00, period ended.
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(Hive.box(AppConfig.cacheBox).get(key), {
        'one': 'present',
        'two': 'late',
        'unmarked': 'absent',
      });
      await tester.ensureVisible(find.text('Done · review attendance'));
      await tester.tap(find.text('Done · review attendance'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save attendance'));
      await tester.pumpAndSettle();
      expect(api.marks, {
        'one': 'present',
        'two': 'late',
        'unmarked': 'absent',
      });
      expect(Hive.box(AppConfig.cacheBox).get(key), isEmpty);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
}
