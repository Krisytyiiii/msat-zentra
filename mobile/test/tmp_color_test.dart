import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/features/workspace/attendance_data.dart';
import 'package:zentra_mobile/features/workspace/attendance_history_page.dart';

import 'attendance_test.dart' as fixture;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final name in [AppConfig.termScopeBox, AppConfig.cacheBox, AppConfig.outboxBox]) {
      await Hive.openBox(name, bytes: Uint8List(0));
    }
  });
  testWidgets('colors', (tester) async {
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1;
    final api = fixture.AttendanceApi();
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(api),
      termProvider.overrideWith((_) => fixture.TestTerm()),
      attendanceClockProvider.overrideWithValue(() => DateTime.utc(2026, 11, 18, 2)),
      overviewProvider.overrideWith((_) async => {}),
      overviewSecondaryProvider.overrideWith((_) async => {}),
    ]);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        home: AttendanceHistoryPage(
          pair: AttendancePair('section', 'Arts', 'subject', 'Math', gradeLevel: 'G7'),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 300));
    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    final ctx = tester.element(find.byType(Scaffold));
    print('theme scaffold=${Theme.of(ctx).scaffoldBackgroundColor}');
    print('scaffold bg prop=${scaffold.backgroundColor}');
    final rect = tester.getRect(find.byType(AppBar));
    final painted = tester.widgetList<Material>(find.byType(Material)).map((m) => m.color).toList();
    print('materials $painted appbar=$rect');
    await tester.pumpAndSettle();
  });
}
