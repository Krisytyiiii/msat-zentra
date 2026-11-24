import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/adm_cases_page.dart';
import 'package:zentra_mobile/features/home/overview_data.dart';
import 'package:zentra_mobile/shared/widgets.dart';

/// Returns an empty ADM case list, like an adviser with nothing under
/// monitoring.
class EmptyAdmApi extends ApiClient {
  EmptyAdmApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(
            Response(
              requestOptions: options,
              data: <Object>[],
              statusCode: 200,
            ),
          );
        },
      ),
    );
  }
}

Future<void> mount(
  WidgetTester tester,
  Widget child, {
  double width = 390,
  double height = 900,
  double textScale = 1,
  List<Override> overrides = const [],
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: Scaffold(body: child),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    Hive.init((await Directory.systemTemp.createTemp('empty-state')).path);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() => Hive.close());
  group('ZEmpty', () {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      testWidgets('reference palette stays readable in $brightness', (tester) async {
        await tester.pumpWidget(MaterialApp(
          theme: ThemeData(brightness: brightness),
          home: const Scaffold(body: Center(child: ZEmpty(
            icon: Icons.calendar_month_outlined,
            title: 'No classes', subtitle: 'No scheduled classes on Saturday.',
          ))),
        ));
        final card = tester.widgetList<Container>(find.descendant(
          of: find.byType(ZEmpty), matching: find.byType(Container)))
            .firstWhere((c) => c.decoration is BoxDecoration &&
              (c.decoration! as BoxDecoration).border != null);
        final decoration = card.decoration! as BoxDecoration;
        expect(decoration.color, Colors.white);
        expect(decoration.borderRadius, BorderRadius.circular(16));
        expect((decoration.border! as Border).top.color, const Color(0xFFDFE7F5));
        final icon = tester.widget<Icon>(find.byIcon(Icons.calendar_month_outlined));
        expect(icon.color, const Color(0xFF4263F0));
        expect(tester.widget<Text>(find.text('No classes')).style!.color, const Color(0xFF192034));
        expect(tester.widget<Text>(find.text('No scheduled classes on Saturday.')).style!.color,
          const Color(0xFF71809B));
        expect(tester.takeException(), isNull);
      });
    }
    testWidgets('renders copy and keeps its action tappable', (tester) async {
      var taps = 0;
      await mount(
        tester,
        Center(
          child: ZEmpty(
            icon: Icons.folder_outlined,
            title: 'No files stored yet',
            subtitle: 'File your first record with Bama.',
            actionLabel: 'Chat with Bama',
            onAction: () => taps++,
          ),
        ),
      );

      expect(find.text('No files stored yet'), findsOneWidget);
      expect(find.text('File your first record with Bama.'), findsOneWidget);
      expect(find.byIcon(Icons.folder_outlined), findsOneWidget);
      await tester.tap(find.text('Chat with Bama'));
      expect(taps, 1);
      expect(tester.takeException(), isNull);
    });

    testWidgets('compact variant is smaller for in-section use', (
      tester,
    ) async {
      await mount(
        tester,
        const Center(
          child: ZEmpty(
            compact: true,
            icon: Icons.note_outlined,
            title: 'No anecdotal records this term',
          ),
        ),
      );
      final compact = tester
          .widget<Icon>(find.byIcon(Icons.note_outlined))
          .size;

      await mount(
        tester,
        const Center(
          child: ZEmpty(
            icon: Icons.note_outlined,
            title: 'No anecdotal records this term',
          ),
        ),
      );
      final regular = tester
          .widget<Icon>(find.byIcon(Icons.note_outlined))
          .size;

      expect(compact, lessThan(regular!));
      expect(tester.takeException(), isNull);
    });
  });

  group('ZEmptyPage', () {
    testWidgets('centres the panel instead of hugging the top', (tester) async {
      await mount(
        tester,
        const ZEmptyPage(
          icon: Icons.folder_shared_outlined,
          title: 'No ADM cases',
          subtitle: 'Referred students under ADM monitoring appear here.',
        ),
      );

      // 900px body: a centred panel sits around the middle, not near the top.
      final center = tester.getCenter(find.text('No ADM cases'));
      expect(center.dy, closeTo(450, 60));
      expect(center.dy, greaterThan(300));
    });

    testWidgets('fits a narrow phone with large text', (tester) async {
      await mount(
        tester,
        const ZEmptyPage(
          icon: Icons.folder_shared_outlined,
          title: 'No ADM cases',
          subtitle: 'Referred students under ADM monitoring appear here with their stage.',
        ),
        width: 320,
        textScale: 2,
      );

      expect(tester.takeException(), isNull);
      expect(find.text('No ADM cases'), findsOneWidget);
      expect(find.byType(ZEmpty), findsOneWidget);
    });

    testWidgets('pulling down refreshes an empty desk', (tester) async {
      var refreshes = 0;
      await mount(
        tester,
        ZEmptyPage(
          icon: Icons.class_outlined,
          title: 'No classes this term',
          subtitle: 'Link your timetable code or ask the Master Teacher.',
          onRefresh: () async => refreshes++,
        ),
      );

      await tester.fling(
        find.byType(SingleChildScrollView),
        const Offset(0, 320),
        1200,
      );
      await tester.pumpAndSettle();
      expect(refreshes, 1);
    });
  });

  testWidgets('ADM cases retains its header above the empty state', (
    tester,
  ) async {
    final api = EmptyAdmApi();
    addTearDown(() => api.dio.close(force: true));
    await mount(
      tester,
      const AdmCasesPage(),
      overrides: [
        apiClientProvider.overrideWithValue(api),
        overviewSummaryProvider.overrideWith(
          (ref) => const AsyncData(
            OverviewSummary(teacherName: 'Teacher', isAdviser: true),
          ),
        ),
      ],
    );

    expect(find.text('No ADM cases'), findsOneWidget);
    expect(
      find.text(
        'Referred students under ADM monitoring appear here with their stage.',
      ),
      findsOneWidget,
    );
    expect(find.text('ADM Cases'), findsOneWidget);
    expect(find.text('FILTER ADM CASES'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
