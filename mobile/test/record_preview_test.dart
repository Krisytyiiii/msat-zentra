import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/anecdotal/anecdotal_data.dart';
import 'package:zentra_mobile/features/anecdotal/preview_action_bar.dart';
import 'package:zentra_mobile/features/anecdotal/record_preview_page.dart';
import 'package:zentra_mobile/shared/widgets.dart';

class _FailingApi extends ApiClient {
  @override
  Future<String?> accessToken() async => null;

  _FailingApi({this.failPdf = false}) {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          requests.add(options.path);
          if (failPdf && options.path.endsWith('/detail')) {
            handler.resolve(
              Response(
                requestOptions: options,
                data: <String, dynamic>{'canSign': false},
                statusCode: 200,
              ),
            );
          } else {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response(
                  requestOptions: options,
                  statusCode: failPdf ? 404 : 500,
                  data: {'message': 'INTERNAL_DIAGNOSTIC_DO_NOT_SHOW'},
                ),
              ),
            );
          }
        },
      ),
    );
  }

  final bool failPdf;
  final requests = <String>[];
}

const _record = MyAnecdotalRecord(
  id: 'preview-test',
  studentId: 'learner-1',
  studentName: 'Ana Reyes',
  lrn: '123456789012',
  section: 'Rizal',
  observationDatetime: '2026-11-10T08:00:00Z',
  category: 'behavioral',
  confidentialityLevel: 'restricted',
);

Future<void> _mountBar(
  WidgetTester tester, {
  bool canSign = true,
  bool signed = false,
  bool xlsxBusy = false,
  bool pdfBusy = false,
  VoidCallback? onSign,
  VoidCallback? onXlsx,
  VoidCallback? onPdf,
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(320, 700);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      theme: zWorkspaceTheme(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: Scaffold(
        bottomNavigationBar: PreviewActionBar(
          canSign: canSign,
          signed: signed,
          xlsxBusy: xlsxBusy,
          pdfBusy: pdfBusy,
          onSign: onSign ?? () {},
          onXlsx: onXlsx ?? () {},
          onPdf: onPdf ?? () {},
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('action bar exposes signing and both exports on a phone', (
    tester,
  ) async {
    var signs = 0;
    var spreadsheets = 0;
    var pdfs = 0;
    await _mountBar(
      tester,
      onSign: () => signs++,
      onXlsx: () => spreadsheets++,
      onPdf: () => pdfs++,
    );
    await tester.tap(find.text('Sign'));
    await tester.tap(find.text('.xlsx'));
    await tester.tap(find.text('.PDF'));
    expect([signs, spreadsheets, pdfs], [1, 1, 1]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('unauthorized readers only see export actions', (tester) async {
    await _mountBar(tester, canSign: false);
    expect(find.text('Sign'), findsNothing);
    expect(find.text('Signature'), findsNothing);
    expect(find.text('.xlsx'), findsOneWidget);
    expect(find.text('.PDF'), findsOneWidget);
  });

  testWidgets('signed report offers signature management', (tester) async {
    await _mountBar(tester, signed: true);
    expect(find.text('Signature'), findsOneWidget);
    expect(find.text('Sign'), findsNothing);
  });

  testWidgets('signed action bar fits 320px with enlarged text', (
    tester,
  ) async {
    await _mountBar(tester, signed: true, textScale: 1.5);
    expect(tester.takeException(), isNull);
  });

  for (final pdfBusy in [false, true]) {
    testWidgets(
      'busy ${pdfBusy ? 'PDF' : 'XLSX'} leaves other actions enabled',
      (tester) async {
        await _mountBar(tester, xlsxBusy: !pdfBusy, pdfBusy: pdfBusy);
        TextButton button(String label) => tester.widget<TextButton>(
          find.ancestor(
            of: find.text(label),
            matching: find.byType(TextButton),
          ),
        );
        expect(button('Sign').onPressed, isNotNull);
        expect(button('.PDF').onPressed, pdfBusy ? isNull : isNotNull);
        expect(button('.xlsx').onPressed, pdfBusy ? isNotNull : isNull);
        // Do not pumpAndSettle: the busy spinner intentionally animates.
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  for (final failPdf in [false, true]) {
    testWidgets('${failPdf ? 'PDF' : 'detail'} failure offers retry', (
      tester,
    ) async {
      final api = _FailingApi(failPdf: failPdf);
      addTearDown(() => api.dio.close(force: true));
      final dir = (await tester.runAsync(
        () => Directory('/tmp/opencode').createTemp('preview-test-'),
      ))!;
      addTearDown(() => tester.runAsync(() => dir.delete(recursive: true)));
      const channel = MethodChannel('plugins.flutter.io/path_provider');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (_) async => dir.path);
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );
      // Cache access uses real filesystem I/O, outside the fake clock.
      await tester.runAsync(() async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [apiClientProvider.overrideWithValue(api)],
            child: MaterialApp(
              theme: zWorkspaceTheme(),
              home: const RecordPreviewPage(record: _record),
            ),
          ),
        );
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await tester.pumpAndSettle();
      expect(find.byType(ErrorView), findsOneWidget);
      expect(find.text('INTERNAL_DIAGNOSTIC_DO_NOT_SHOW'), findsNothing);
      expect(find.byType(PreviewActionBar), findsNothing);
      final attempts = api.requests.length;
      await tester.runAsync(() async {
        await tester.tap(find.text('Try again'));
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await tester.pumpAndSettle();
      expect(api.requests.length, greaterThan(attempts));
      expect(tester.takeException(), isNull);
    });
  }
}
