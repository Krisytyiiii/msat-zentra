import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/session.dart';

class _LoginApi extends ApiClient {
  _LoginApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (request, handler) {
          requests.add(request);
          handler.resolve(
            Response(
              requestOptions: request,
              statusCode: 200,
              data: response,
              headers: Headers.fromMap({
                'set-cookie': [
                  '${AppConfig.refreshCookieName}=refresh; HttpOnly; Path=/api/auth',
                ],
              }),
            ),
          );
        },
      ),
    );
  }

  Map<String, dynamic> response = {'accessToken': 'access', 'role': 'student'};
  final requests = <RequestOptions>[];
  String? token, savedRefresh;
  int saves = 0;
  @override
  Future<String?> accessToken() async => token;
  @override
  Future<void> saveSession({required String access, String? refresh}) async {
    saves++;
    token = access;
    savedRefresh = refresh;
  }

  @override
  Future<void> logout() async => token = null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temp;
  setUpAll(() async {
    temp = await Directory('/tmp/opencode').createTemp('zentra-auth-');
    Hive.init(temp.path);
    await Hive.openBox(AppConfig.portalBox);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  setUp(() async {
    await Hive.box(AppConfig.portalBox).clear();
    await Hive.box(AppConfig.termScopeBox).clear();
  });
  tearDownAll(() async {
    await Hive.close();
    await temp.delete(recursive: true);
  });

  for (final role in [
    'student',
    'parent',
    'subject_teacher',
    'adviser',
    'adm_coordinator',
  ]) {
    test('$role is inferred from server response and persisted', () async {
      final api = _LoginApi()
        ..response = {'accessToken': 'access', 'role': role};
      final auth = AuthNotifier(api);
      addTearDown(auth.dispose);
      addTearDown(api.dio.close);
      await Future<void>.delayed(Duration.zero);
      await Hive.box(AppConfig.termScopeBox).put('termId', 'old-term');
      expect(
        await auth.login(email: 'user@zentra.test', password: 'secret'),
        isTrue,
      );
      expect(api.requests.single.data, {
        'email': 'user@zentra.test',
        'password': 'secret',
      });
      expect(auth.state.role, role);
      expect(auth.state.portal, mobilePortalForRole(role));
      expect(Hive.box(AppConfig.portalBox).get('role'), role);
      expect(
        Hive.box(AppConfig.portalBox).get('portal'),
        mobilePortalForRole(role),
      );
      expect(api.savedRefresh, 'refresh');
      expect(
        Hive.box(AppConfig.termScopeBox).get('termId'),
        role == 'student' || role == 'parent' ? isNull : 'old-term',
      );
    });
  }

  for (final role in [null, 'admin', 'nurse', 'unknown']) {
    test(
      'missing or unsupported role $role never persists a session',
      () async {
        final api = _LoginApi()
          ..response = {'accessToken': 'access', 'role': role};
        final auth = AuthNotifier(api);
        addTearDown(auth.dispose);
        addTearDown(api.dio.close);
        expect(
          await auth.login(email: 'user@zentra.test', password: 'secret'),
          isFalse,
        );
        expect(auth.state.loggedIn, isFalse);
        expect(auth.state.error, isNotEmpty);
        expect(api.saves, 0);
        expect(Hive.box(AppConfig.portalBox).isEmpty, isTrue);
      },
    );
  }

  test(
    'cold start derives student portal from role rather than stale staff cache',
    () async {
      await Hive.box(AppConfig.portalBox)
          .putAll({'role': 'student', 'portal': 'staff'});
      final api = _LoginApi()..token = 'existing';
      final auth = AuthNotifier(api);
      addTearDown(auth.dispose);
      addTearDown(api.dio.close);
      await Future<void>.delayed(Duration.zero);
      expect(auth.state.role, 'student');
      expect(auth.state.portal, 'student');
      expect(auth.state.loggedIn, isTrue);
    },
  );
}
