import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/notifications.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/adviser_navigation.dart';
import 'package:zentra_mobile/design/shell.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/settings/settings_data.dart';

class _Api extends ApiClient {
  @override
  Future<String?> accessToken() async => null;
}

class _Auth extends AuthNotifier {
  _Auth(String role) : super(_Api()) {
    state = AuthState(role: role, loggedIn: true);
  }
}

const _shortcut = ValueKey('adviser-bama-shortcut');
const _paths = [
  '/workspace/overview',
  '/workspace/classes',
  '/workspace/gradebook',
  '/workspace/attendance',
  '/adviser/academic',
  '/adviser/bama',
  '/adviser/bama/conversation/thread',
];

Future<GoRouter> _mount(
  WidgetTester tester, {
  String role = 'adviser',
  String initial = '/workspace/overview',
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final router = GoRouter(
    initialLocation: initial,
    routes: [
      for (final path in _paths)
        GoRoute(
          path: path,
          builder: (context, state) => ZentraShell(
            selectedPath: state.uri.path,
            child: const Center(
              child: TextField(
                key: ValueKey('draft'),
                decoration: InputDecoration(labelText: 'Draft'),
              ),
            ),
          ),
        ),
      GoRoute(
        path: '/detail',
        builder: (context, state) => Scaffold(
          appBar: AppBar(title: const Text('Full-screen detail')),
          body: AdviserBamaAccess(
            child: Stack(
              children: [
                const Center(child: Text('Detail content')),
                Positioned(
                  bottom: 16,
                  right: 16,
                  child: FloatingActionButton(
                    key: const ValueKey('existing-add'),
                    heroTag: null,
                    onPressed: () {},
                    child: const Icon(Icons.add),
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: SafeArea(
            child: FilledButton(
              onPressed: () {},
              child: const Text('Save changes'),
            ),
          ),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_Api()),
        authProvider.overrideWith((ref) => _Auth(role)),
        overviewProvider.overrideWith(
          (ref) async => {'isAdviser': role == 'adviser'},
        ),
        teacherProfileProvider.overrideWith(
          (ref) async => const TeacherProfile(fullName: 'Adviser'),
        ),
        notificationsProvider.overrideWith((ref) => <ZNotification>[]),
      ],
      child: MaterialApp.router(
        theme: zWorkspaceTheme(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            disableAnimations: true,
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets(
    'four bottom destinations navigate and reflect the current route',
    (tester) async {
      final router = await _mount(tester);
      for (final entry in {
        'Class': '/workspace/classes',
        'Gradebook': '/workspace/gradebook',
        'Attendance': '/workspace/attendance',
        'Overview': '/workspace/overview',
      }.entries) {
        final target = find.byKey(ValueKey('adviser-nav-${entry.key}'));
        await tester.tap(target);
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.path, entry.value);
        final semantics = tester.widget<Semantics>(
          find.ancestor(of: target, matching: find.byType(Semantics)).first,
        );
        expect(semantics.properties.selected, isTrue);
        expect(find.byKey(_shortcut), findsOneWidget);
      }
      router.go('/adviser/academic');
      await tester.pumpAndSettle();
      final selected = find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.selected == true,
      );
      expect(selected, findsNothing);
      expect(find.byType(AdviserBottomNavigation), findsOneWidget);
    },
  );

  testWidgets('Bama pushes without a new flag and Back preserves the draft', (
    tester,
  ) async {
    final router = await _mount(tester);
    await tester.enterText(
      find.byKey(const ValueKey('draft')),
      'Unsaved draft',
    );
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_shortcut));
    await tester.pumpAndSettle();
    expect(
      tester.widget<ZentraShell>(find.byType(ZentraShell)).selectedPath,
      '/adviser/bama',
    );
    expect(find.byKey(_shortcut), findsNothing);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(
      router.routeInformationProvider.value.uri.path,
      '/workspace/overview',
    );
    expect(find.text('Unsaved draft'), findsOneWidget);
    expect(find.byKey(_shortcut), findsOneWidget);
  });

  testWidgets(
    'detail shortcut avoids add and save controls and preserves Back',
    (tester) async {
      final router = await _mount(tester, initial: '/detail');
      expect(find.byType(AdviserBottomNavigation), findsNothing);
      final bama = tester.getRect(find.byKey(_shortcut));
      final add = tester.getRect(find.byKey(const ValueKey('existing-add')));
      final save = tester.getRect(find.text('Save changes'));
      expect(bama.overlaps(add), isFalse);
      expect(bama.bottom, lessThan(add.top));
      expect(bama.bottom, lessThan(save.top));
      await tester.tap(find.byKey(_shortcut));
      await tester.pumpAndSettle();
      router.pop();
      await tester.pumpAndSettle();
      expect(find.text('Full-screen detail'), findsOneWidget);
      expect(find.byKey(_shortcut), findsOneWidget);
    },
  );

  testWidgets('shortcut hides for the keyboard and returns when dismissed', (
    tester,
  ) async {
    await _mount(tester);
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await tester.pumpAndSettle();
    expect(find.byKey(_shortcut), findsNothing);
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(find.byKey(_shortcut), findsOneWidget);
    addTearDown(tester.view.resetViewInsets);
  });

  testWidgets('Bama returns to an imperative attendance-style route', (
    tester,
  ) async {
    final router = await _mount(tester);
    final caller = tester.element(find.byType(ZentraShell));
    final detail = Navigator.of(caller).push<void>(
      MaterialPageRoute(
        builder: (context) => const Scaffold(
          body: AdviserBamaAccess(
            child: Center(child: Text('Attendance draft still here')),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_shortcut));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Back'), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('Attendance draft still here'), findsOneWidget);
    Navigator.of(tester.element(find.text('Attendance draft still here')))
        .pop();
    await detail;
    await tester.pumpAndSettle();
  });

  for (final role in [
    'subject_teacher',
    'adm_coordinator',
    'student',
    'parent',
  ]) {
    testWidgets('$role does not receive adviser navigation or Bama', (
      tester,
    ) async {
      final router = await _mount(tester, role: role);
      expect(find.byType(AdviserBottomNavigation), findsNothing);
      expect(find.byKey(_shortcut), findsNothing);
      router.go('/detail');
      await tester.pumpAndSettle();
      expect(find.byKey(_shortcut), findsNothing);
    });
  }

  for (final width in [320.0, 390.0, 768.0, 1024.0]) {
    testWidgets('navigation fits width $width with large text', (tester) async {
      await _mount(tester, width: width, scale: 2);
      final bar = tester.getRect(find.byType(AdviserBottomNavigation));
      final bama = tester.getRect(find.byKey(_shortcut));
      expect(bama.bottom, lessThan(bar.top));
      for (final label in ['Overview', 'Class', 'Gradebook', 'Attendance']) {
        expect(
          tester.getRect(find.byKey(ValueKey('adviser-nav-$label'))).height,
          greaterThanOrEqualTo(48),
        );
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Bama conversation never offers a duplicate shortcut', (
    tester,
  ) async {
    await _mount(tester, initial: '/adviser/bama/conversation/thread');
    expect(find.byKey(_shortcut), findsNothing);
  });
}
