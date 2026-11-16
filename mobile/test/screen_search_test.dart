import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/notifications.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/screen_search.dart';
import 'package:zentra_mobile/design/shell.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/adviser/academic_overview_page.dart';
import 'package:zentra_mobile/features/adviser/advisory_list_data.dart';
import 'package:zentra_mobile/features/settings/settings_data.dart';
import 'package:zentra_mobile/shared/models.dart';

class _Api extends ApiClient {
  _Api() {
    dio.interceptors.clear();
  }
}

AdvisoryStudent learner(String id, String name, String lrn, double avg) =>
    AdvisoryStudent(
      studentId: id,
      name: name,
      lrn: lrn,
      hasAccount: false,
      academicGrade: avg,
      riskLevel: 'Low',
    );

class _Probe extends StatelessWidget {
  const _Probe();
  @override
  Widget build(BuildContext context) {
    final query = ScreenSearchScope.maybeOf(context)?.query ?? '';
    return Center(child: Text('probe:$query'));
  }
}

Future<void> mountShell(
  WidgetTester tester, {
  required Widget child,
  ScreenSearchSpec? spec,
  String selectedPath = '/workspace/overview',
  bool isAdviser = true,
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_Api()),
        overviewProvider.overrideWith(
          (ref) async => <String, dynamic>{'isAdviser': isAdviser},
        ),
        teacherProfileProvider.overrideWith(
          (ref) async => const TeacherProfile(fullName: 'Test Teacher'),
        ),
        notificationsProvider.overrideWith((ref) => <ZNotification>[]),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: ZentraShell(spec: spec, selectedPath: selectedPath, child: child),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('spec resolver', () {
    test('names each screen and picks its search behaviour', () {
      expect(screenSearchSpecFor('/adviser/advisory').title, 'Advisory list');
      expect(
        screenSearchSpecFor('/adviser/advisory').mode,
        ScreenSearchMode.filter,
      );
      expect(
        screenSearchSpecFor('/adviser/academic').mode,
        ScreenSearchMode.filter,
      );
      expect(
        screenSearchSpecFor('/adviser/anecdotal').hint,
        'Search name, LRN, or section',
      );
      expect(
        screenSearchSpecFor('/adviser/referrals').mode,
        ScreenSearchMode.filter,
      );
      expect(
        screenSearchSpecFor(
          '/adviser/bama/history',
          Uri.parse('/adviser/bama/history?type=grade-flag'),
        ).title,
        'Grade flag logs',
      );
      expect(
        screenSearchSpecFor(
          '/adviser/bama/history',
          Uri.parse('/adviser/bama/history?type=anecdotal'),
        ).title,
        'Anecdotal logs',
      );
      expect(
        screenSearchSpecFor('/workspace/overview').mode,
        ScreenSearchMode.pages,
      );
      expect(
        screenSearchSpecFor('/adviser/students/roster%3A1').title,
        'Student details',
      );
      expect(screenSearchSpecFor('/workspace/classes/c-1').title, 'Gradebook');
      expect(screenSearchSpecFor('/teacher/more').title, 'Settings');
    });
  });

  group('catalog', () {
    test('is role filtered and follows drawer order', () {
      final adviser = screenSearchCatalog(isAdviser: true)
          .map((d) => d.label)
          .toList();
      expect(adviser.first, 'Overview');
      expect(
        adviser,
        containsAll(['Advisory list', 'Academic', 'Referrals', 'Attendance']),
      );
      expect(adviser, isNot(contains('My schedule')));

      final teacher = screenSearchCatalog(isAdviser: false)
          .map((d) => d.label)
          .toList();
      expect(teacher, contains('My schedule'));
      expect(teacher, isNot(contains('Advisory list')));
      expect(teacher, isNot(contains('Referrals')));
    });
  });

  testWidgets('header replaces branding with the screen title', (tester) async {
    await mountShell(
      tester,
      child: const SizedBox.shrink(),
      selectedPath: '/adviser/academic',
      width: 1024,
    );
    expect(find.text('Academic'), findsOneWidget);
    expect(find.text('Zentra'), findsNothing);
  });

  testWidgets('compact header expands search on tap and filters the desk', (
    tester,
  ) async {
    await mountShell(
      tester,
      child: const _Probe(),
      spec: const ScreenSearchSpec.filter('Academic', 'Search name or LRN'),
    );
    expect(find.text('Academic'), findsOneWidget);
    expect(find.byKey(const ValueKey('screen-search-field')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('screen-search-open')));
    await tester.pumpAndSettle();
    final field = find.byKey(const ValueKey('screen-search-field'));
    expect(field, findsOneWidget);

    await tester.enterText(field, 'maria');
    await tester.pumpAndSettle();
    expect(find.text('probe:maria'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('screen-search-clear')));
    await tester.pumpAndSettle();
    expect(find.text('probe:'), findsOneWidget);
    expect(field, findsOneWidget);
  });

  testWidgets('wide header keeps the field beside the title', (tester) async {
    await mountShell(
      tester,
      child: const _Probe(),
      spec: const ScreenSearchSpec.filter(
        'Advisory list',
        'Search name or LRN',
      ),
      width: 1024,
    );
    final field = find.byKey(const ValueKey('screen-search-field'));
    expect(field, findsOneWidget);
    expect(find.byKey(const ValueKey('screen-search-open')), findsNothing);
    expect(
      tester.getRect(find.text('Advisory list')).right,
      lessThan(tester.getRect(field).left),
    );

    await tester.enterText(field, 'juan');
    await tester.pumpAndSettle();
    expect(find.text('probe:juan'), findsOneWidget);
  });

  testWidgets('page mode finds destinations instead of filtering content', (
    tester,
  ) async {
    await mountShell(
      tester,
      child: const _Probe(),
      spec: const ScreenSearchSpec.pages('Overview'),
      width: 1024,
    );
    expect(find.text('probe:'), findsOneWidget);
    expect(find.text('PAGES'), findsNothing);

    final field = find.byKey(const ValueKey('screen-search-field'));
    await tester.enterText(field, 'acad');
    await tester.pumpAndSettle();
    expect(find.text('PAGES'), findsOneWidget);
    expect(find.text('Academic'), findsOneWidget);
    expect(find.text('Attendance'), findsNothing);
    expect(
      find.byKey(const ValueKey('screen-search-results')),
      findsOneWidget,
    );

    await tester.enterText(field, 'zzz');
    await tester.pumpAndSettle();
    expect(find.text('No pages match'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('screen-search-clear')));
    await tester.pumpAndSettle();
    expect(find.text('probe:'), findsOneWidget);
  });

  testWidgets('academic desk drops its inline field and uses header search', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(_Api()),
          overviewProvider.overrideWith(
            (ref) async => <String, dynamic>{'isAdviser': true},
          ),
          teacherProfileProvider.overrideWith(
            (ref) async => const TeacherProfile(fullName: 'Test Teacher'),
          ),
          notificationsProvider.overrideWith((ref) => <ZNotification>[]),
          advisoryProvider.overrideWith(
            (ref) async => AdvisoryRoster(
              students: [
                learner('roster:1', 'Maria Santos', '111111111111', 88),
                learner('roster:2', 'Juan Cruz', '222222222222', 79),
              ],
              sections: const [],
            ),
          ),
        ],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: const ZentraShell(
            selectedPath: '/adviser/academic',
            child: AcademicOverviewPage(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Maria Santos'), findsOneWidget);
    expect(find.text('Juan Cruz'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.byKey(const ValueKey('screen-search-open')));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('screen-search-field')),
      'juan',
    );
    await tester.pumpAndSettle();
    expect(find.text('Juan Cruz'), findsOneWidget);
    expect(find.text('Maria Santos'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('header and search fit a narrow phone with larger text', (
    tester,
  ) async {
    await mountShell(
      tester,
      child: const _Probe(),
      spec: const ScreenSearchSpec.filter(
        'Anecdotal',
        'Search name, LRN, or section',
      ),
      width: 320,
      scale: 2,
    );
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const ValueKey('screen-search-open')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('screen-search-field')), findsOneWidget);
  });
}
