import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/features/auth/login_background.dart';
import 'package:zentra_mobile/features/auth/login_page.dart';

class _NoSessionApi extends ApiClient {
  @override
  Future<String?> accessToken() async => null;
}

class _TestAuth extends AuthNotifier {
  _TestAuth() : super(_NoSessionApi());

  int calls = 0;
  String? submittedEmail;
  String? successfulRole;
  final pending = Completer<bool>();

  @override
  Future<bool> login({required String email, required String password}) async {
    calls++;
    submittedEmail = email;
    final result = await pending.future;
    state = result
        ? AuthState(
            loggedIn: true,
            role: successfulRole,
            portal: mobilePortalForRole(successfulRole),
          )
        : const AuthState(error: 'Check your credentials.');
    return result;
  }
}

Future<_TestAuth> _mount(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  double textScale = 1,
  double keyboard = 0,
  String? successfulRole,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final auth = _TestAuth();
  auth.successfulRole = successfulRole;
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => const LoginPage()),
      for (final path in [
        '/student/home',
        '/parent/home',
        '/coordinator/overview',
        '/term',
      ])
        GoRoute(
          path: path,
          builder: (_, _) => Scaffold(body: Text('Opened $path')),
        ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [authProvider.overrideWith((ref) => auth)],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: true,
            textScaler: TextScaler.linear(textScale),
            viewInsets: EdgeInsets.only(bottom: keyboard),
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pump();
  return auth;
}

void main() {
  testWidgets('eye toggle retains password and accessible label', (
    tester,
  ) async {
    await _mount(tester);
    final password = find.byKey(const Key('login-password'));
    await tester.enterText(password, 'My secret password');
    expect(
      tester.widget<TextFormField>(password).controller!.text,
      'My secret password',
    );
    expect(
      tester
          .widget<EditableText>(
            find.descendant(of: password, matching: find.byType(EditableText)),
          )
          .obscureText,
      isTrue,
    );
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(find.byTooltip('Hide password'), findsOneWidget);
    expect(
      tester
          .widget<EditableText>(
            find.descendant(of: password, matching: find.byType(EditableText)),
          )
          .obscureText,
      isFalse,
    );
    expect(
      tester.widget<TextFormField>(password).controller!.text,
      'My secret password',
    );
    await tester.tap(find.byTooltip('Hide password'));
    await tester.pump();
    expect(
      tester
          .widget<EditableText>(
            find.descendant(of: password, matching: find.byType(EditableText)),
          )
          .obscureText,
      isTrue,
    );
  });

  testWidgets('validates fields without calling auth', (tester) async {
    final auth = await _mount(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    expect(find.text('Enter your school email.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    expect(auth.calls, 0);
    await tester.enterText(find.byKey(const Key('login-email')), 'invalid');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(auth.calls, 0);
  });

  testWidgets('unified form has no role picker; palette retains credentials', (
    tester,
  ) async {
    await _mount(tester);
    await tester.enterText(
      find.byKey(const Key('login-email')),
      'name@msat.edu',
    );
    await tester.enterText(find.byKey(const Key('login-password')), 'secret');
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(find.text('Student'), findsNothing);
    expect(find.text('Parent'), findsNothing);
    expect(find.text('Staff'), findsNothing);
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.byTooltip('Hide password'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(find.byKey(const Key('login-password')))
          .controller!
          .text,
      'secret',
    );
    expect(
      tester
          .widget<TextFormField>(find.byKey(const Key('login-email')))
          .controller!
          .text,
      'name@msat.edu',
    );
    await tester.tap(find.byTooltip('Amber palette'));
    await tester.pump();
    expect(
      tester.widget<LoginBackground>(find.byType(LoginBackground)).amber,
      isTrue,
    );
    expect(find.text('Welcome back'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('submission blocks duplicates and shows server errors', (
    tester,
  ) async {
    final auth = await _mount(tester);
    await tester.enterText(
      find.byKey(const Key('login-email')),
      'parent@msat.edu',
    );
    await tester.enterText(find.byKey(const Key('login-password')), 'secret');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    expect(auth.calls, 1);
    expect(auth.submittedEmail, 'parent@msat.edu');
    expect(find.text('Signing in…'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    expect(
      tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
      isNull,
    );
    final field = tester.widget<TextField>(
      find.descendant(
        of: find.byKey(const Key('login-password')),
        matching: find.byType(TextField),
      ),
    );
    field.onSubmitted!('secret');
    expect(auth.calls, 1);
    auth.pending.complete(false);
    await tester.pump();
    expect(find.text('Check your credentials.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  for (final role in [
    'student',
    'parent',
    'adviser',
    'subject_teacher',
    'adm_coordinator',
  ]) {
    testWidgets('sign-in opens the verified $role destination', (tester) async {
      final auth = await _mount(tester, successfulRole: role);
      await tester.enterText(
        find.byKey(const Key('login-email')),
        '$role@zentra.test',
      );
      await tester.enterText(find.byKey(const Key('login-password')), 'secret');
      await tester.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();
      auth.pending.complete(true);
      await tester.pumpAndSettle();
      expect(
        find.text('Opened ${mobileLoginDestination(role)}'),
        findsOneWidget,
      );
    });
  }

  testWidgets('Google explains that mobile OAuth is unavailable', (
    tester,
  ) async {
    await _mount(tester);
    await tester.ensureVisible(find.text('Sign in with Google'));
    await tester.tap(find.text('Sign in with Google'));
    await tester.pump();
    expect(
      find.text(
        'Google sign-in is not available in the mobile app yet. Use your email and password.',
      ),
      findsOneWidget,
    );
  });

  for (final size in [
    const Size(320, 720),
    const Size(700, 900),
    const Size(1200, 900),
  ]) {
    testWidgets('login fits ${size.width} logical pixels', (tester) async {
      await _mount(
        tester,
        size: size,
        textScale: 1.3,
        keyboard: size.width < 600 ? 280 : 0,
      );
      expect(find.text('Welcome back'), findsOneWidget);
      expect(
        find.text('Your school workspace'),
        size.width >= 840 ? findsOneWidget : findsNothing,
      );
      await tester.ensureVisible(find.text('Sign in with Google'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('particle animation paints and reduced motion stops frames', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: LoginBackground(amber: false)),
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.takeException(), isNull);
    expect(tester.hasRunningAnimations, isTrue);
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: LoginBackground(amber: true),
        ),
      ),
    );
    await tester.pump();
    expect(tester.hasRunningAnimations, isFalse);
    expect(tester.takeException(), isNull);
  });
}
