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

const _paths = [
  '/workspace/overview',
  '/workspace/classes',
  '/workspace/gradebook',
  '/workspace/attendance',
  '/adviser/academic',
  '/adviser/schedule',
  '/adviser/bama',
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
            child: const Center(child: Text('Desk content')),
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
          (ref) async => const TeacherProfile(fullName: 'Teacher'),
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
        final semantics = tester.widgetList<Semantics>(
          find.ancestor(of: target, matching: find.byType(Semantics)),
        );
        expect(
          semantics.any((widget) => widget.properties.selected == true),
          isTrue,
        );
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

  testWidgets('Bama is no longer a bottom destination', (tester) async {
    await _mount(tester);
    expect(find.byKey(const ValueKey('adviser-nav-Bama')), findsNothing);
    expect(find.byTooltip('Chat with Bama'), findsNothing);
  });

  testWidgets('subject teachers share the four-desk bar', (tester) async {
    await _mount(tester, role: 'subject_teacher');
    expect(find.byType(AdviserBottomNavigation), findsOneWidget);
    for (final label in ['Overview', 'Class', 'Gradebook', 'Attendance']) {
      expect(find.byKey(ValueKey('adviser-nav-$label')), findsOneWidget);
    }
  });

  for (final role in ['adm_coordinator', 'student', 'parent']) {
    testWidgets('$role does not receive the teacher bar', (tester) async {
      await _mount(tester, role: role);
      expect(find.byType(AdviserBottomNavigation), findsNothing);
    });
  }

  for (final width in [320.0, 390.0, 768.0, 1024.0]) {
    testWidgets('navigation fits width $width with large text', (tester) async {
      await _mount(tester, width: width, scale: 2);
      final bar = tester.getRect(find.byType(AdviserBottomNavigation));
      for (final label in ['Overview', 'Class', 'Gradebook', 'Attendance']) {
        expect(
          tester.getRect(find.byKey(ValueKey('adviser-nav-$label'))).height,
          greaterThanOrEqualTo(48),
        );
        expect(bar.contains(tester.getCenter(find.text(label))), isTrue);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
