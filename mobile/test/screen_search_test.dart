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
  testWidgets('Overview uses the Class header without recoloring its body', (
    tester,
  ) async {
    await mountShell(
      tester,
      child: const _Probe(),
      selectedPath: '/workspace/classes',
    );
    final classHeight = tester.getSize(find.byType(AppBar)).height;
    final classHeader = Theme.of(tester.element(find.byType(AppBar)));
    final classSearch = tester
        .widget<TextField>(find.byKey(const ValueKey('screen-search-field')))
        .decoration!;
    await mountShell(tester, child: const _Probe());
    final overviewHeader = Theme.of(tester.element(find.byType(AppBar)));
    final overviewSearch = tester
        .widget<TextField>(find.byKey(const ValueKey('screen-search-field')))
        .decoration!;
    expect(tester.getSize(find.byType(AppBar)).height, classHeight);
    expect(overviewHeader.colorScheme, classHeader.colorScheme);
    expect(overviewSearch.fillColor, classSearch.fillColor);
    expect(
      Theme.of(tester.element(find.text('probe:'))).scaffoldBackgroundColor,
      classHeader.scaffoldBackgroundColor,
    );
    expect(
      Theme.of(tester.element(find.text('probe:'))).brightness,
      Brightness.light,
    );
    expect(tester.takeException(), isNull);
  });
  testWidgets('settings keeps the light header without bottom navigation', (
    tester,
  ) async {
    await mountShell(
      tester,
      child: const _Probe(),
      selectedPath: '/teacher/more',
    );
    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold).first);
    expect(scaffold.bottomNavigationBar, isNull);
    expect(scaffold.extendBody, isFalse);
    expect(find.byKey(const ValueKey('adviser-nav-Bama')), findsNothing);
    expect(find.byKey(const ValueKey('screen-search-field')), findsOneWidget);
    final theme = Theme.of(tester.element(find.byType(Scaffold).first));
    expect(theme.brightness, Brightness.light);
    expect(tester.takeException(), isNull);
  });

  group('spec resolver', () {
    test('names each screen and picks its search behaviour', () {
      expect(screenSearchSpecFor('/adviser/advisory').title, 'Advisory list');
      expect(
        screenSearchSpecFor('/adviser/advisory').mode,
        ScreenSearchMode.filter,
      );
      expect(
        screenSearchSpecFor('/adviser/advisory/attendance').title,
        'Advisory attendance',
      );
      expect(
        screenSearchSpecFor('/adviser/advisory/attendance').mode,
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
        'Anecdotal logs',
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
      // Detail screens (`/adviser/students/:id`, `/workspace/classes/:id`)
      // render their own full-screen header, so the shell never titles them.
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
        containsAll([
          'Advisory list',
          'Advisory attendance',
          'Academic',
          'Referrals',
          'Attendance',
        ]),
      );
      expect(adviser, isNot(contains('My schedule')));

      final teacher = screenSearchCatalog(isAdviser: false)
          .map((d) => d.label)
          .toList();
      expect(teacher, contains('My schedule'));
      expect(teacher, isNot(contains('Advisory list')));
      expect(teacher, isNot(contains('Advisory attendance')));
      expect(teacher, isNot(contains('Referrals')));
    });
  });

  testWidgets('header is menu + search field + profile only', (tester) async {
    await mountShell(
      tester,
      child: const SizedBox.shrink(),
      selectedPath: '/adviser/academic',
      width: 1024,
    );
    expect(find.byTooltip('Menu'), findsOneWidget);
    expect(find.byKey(const ValueKey('screen-search-field')), findsOneWidget);
    expect(find.byKey(const ValueKey('profile-avatar')), findsOneWidget);
    // The screen title and the old bell/compact search icons are gone.
    expect(find.text('Academic'), findsNothing);
    expect(find.text('Zentra'), findsNothing);
    expect(find.byTooltip('Notifications'), findsNothing);
    expect(find.byKey(const ValueKey('screen-search-open')), findsNothing);
  });

  testWidgets('header search always filters the desk', (tester) async {
    await mountShell(
      tester,
      child: const _Probe(),
      spec: const ScreenSearchSpec.filter('Academic', 'Search name or LRN'),
    );
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

  testWidgets('wide header keeps the search field in the middle lane', (
    tester,
  ) async {
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
    expect(
      tester.getRect(find.byKey(const ValueKey('profile-avatar'))).left,
      greaterThanOrEqualTo(tester.getRect(field).right),
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
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('screen-search-results')),
        matching: find.text('Attendance'),
      ),
      findsNothing,
    );
    expect(find.byKey(const ValueKey('screen-search-results')), findsOneWidget);

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
    // Only the header field remains; the desk's inline search is hidden.
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
    expect(find.byKey(const ValueKey('screen-search-field')), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('screen-search-field')),
      'juan',
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('profile avatar opens the full-screen account panel', (
    tester,
  ) async {
    await mountShell(tester, child: const _Probe());
    await tester.tap(find.byKey(const ValueKey('profile-avatar')));
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
    expect(find.byKey(const ValueKey('profile-close')), findsOneWidget);
    expect(find.text('Notification'), findsOneWidget);
    expect(find.byKey(const ValueKey('profile-see-all')), findsOneWidget);
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Logout'), findsOneWidget);
    // The panel replaces the shell instead of floating over it.
    expect(find.byKey(const ValueKey('screen-search-field')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('profile-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('screen-search-field')), findsOneWidget);
  });
}
