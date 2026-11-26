import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/settings/settings_data.dart';
import 'package:zentra_mobile/features/settings/settings_page.dart';

class _Api extends ApiClient {
  _Api() {
    dio.interceptors.clear();
  }
}

void main() {
  testWidgets('settings golden', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 1400);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(_Api()),
          overviewProvider.overrideWith(
            (ref) async => <String, dynamic>{
              'isAdviser': true,
              'advisorySection': {'name': 'Grade 7 - Rizal'},
            },
          ),
          teacherProfileProvider.overrideWith(
            (ref) async => const TeacherProfile(fullName: 'Test Teacher'),
          ),
          adviserSectionsProvider.overrideWith((ref) async => []),
        ],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: const SettingsPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('tmp_settings.png'),
    );
  });
}
