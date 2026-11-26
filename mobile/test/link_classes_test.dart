import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/overview_theme.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/auth/link_classes_card.dart';
import 'package:zentra_mobile/shared/models.dart';

class _Term extends TermNotifier {
  _Term() {
    state = Term(
      id: 'term',
      schoolYearId: 'year',
      schoolYearName: '2026–2027',
      termNumber: 2,
    );
  }
}

Future<void> mount(
  WidgetTester tester, {
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [termProvider.overrideWith((_) => _Term())],
      child: MaterialApp(
        theme: overviewScreenTheme(zWorkspaceTheme()),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const Scaffold(body: TeacherLinkPlaceholder()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    await Hive.openBox(AppConfig.termScopeBox, bytes: Uint8List(0));
  });

  tearDownAll(Hive.close);

  testWidgets('link placeholder shows only the centered form card', (
    tester,
  ) async {
    await mount(tester);
    expect(find.text('Link your classes'), findsNothing);
    expect(find.text('2026–2027'), findsNothing);
    expect(find.text('Enter your link code'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Link classes'), findsOneWidget);
    final card = find.byType(LinkClassesCard);
    expect(card, findsOneWidget);
    final center = tester.getCenter(card);
    expect(center.dx, closeTo(195, 1));
    expect(center.dy, closeTo(450, 1));
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 390.0, 700.0, 1200.0]) {
    testWidgets('link placeholder fits $width with large text', (tester) async {
      await mount(tester, width: width, scale: 2);
      expect(find.text('Enter your link code'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
