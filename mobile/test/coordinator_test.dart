import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:zentra_mobile/core/api_client.dart';
import 'package:zentra_mobile/core/config.dart';
import 'package:zentra_mobile/core/notifications.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/app_router.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_case_page.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_data.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_forms.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_devices.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_meeting_form.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_models.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_monitoring.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_notifications.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_pages.dart';
import 'package:zentra_mobile/features/coordinator/coordinator_shell.dart';

AdmJson caseJson({bool profile = true, String stage = 'meeting_parents'}) => {
  'id': profile ? 'profile-1' : 'referral:ref-1',
  'kind': profile ? 'profile' : 'referral',
  'profileId': profile ? 'profile-1' : null,
  'referralId': 'ref-1',
  'student': 'Mira Learner',
  'lrn': '123456789012',
  'grade': 'Grade 8',
  'stage': stage,
  'eligibilityStatus': 'pending',
  'referral': {
    'id': 'ref-1',
    'status': 'in_progress',
    'reason': 'ADM support',
    'referredBy': 'Adviser',
    'referralFormReady': true,
  },
  'anecdotal': {'id': 'record-1', 'descriptionOfIncident': 'Observation'},
  'meetings': [meetingJson(attended: true)],
  'forms': [],
  'certificationDetails': {},
};
AdmJson meetingJson({bool attended = false}) => {
  'id': 'meeting-1',
  'meetingDatetime': DateTime.now()
      .subtract(const Duration(hours: 1))
      .toUtc()
      .toIso8601String(),
  'venue': 'school',
  'attended': attended,
  'minutesOfMeeting': attended ? 'Discussed learner support' : '',
  'attendanceLogbookRef': attended ? 'Log 1' : '',
  'invitees': [],
  'attendees': [],
  'attachments': [],
};
AdmJson listRow([String id = 'profile-1']) => {
  'id': id,
  'student': 'Mira Learner',
  'lrn': '123456789012',
  'grade': 'Grade 8',
  'stage': 'enrollment_monitoring',
  'approvedBy': 'Principal',
  'devicesIssued': 0,
  'modulesSubmitted': 1,
  'modulesTotal': 2,
};

class CoordinatorApi extends ApiClient {
  CoordinatorApi() {
    dio.interceptors.clear();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (o, handler) async {
          requests.add(o);
          if (o.method != 'GET' && pending != null) await pending!.future;
          if ((failWrites && o.method != 'GET') || failReads) {
            handler.reject(
              DioException(
                requestOptions: o,
                type: DioExceptionType.badResponse,
                response: Response(
                  requestOptions: o,
                  statusCode: 503,
                  data: {
                    'error': {
                      'code': 'DATABASE_ERROR',
                      'message': 'secret internals',
                    },
                  },
                ),
              ),
            );
            return;
          }
          Object? data;
          if (o.path == '/api/adm/dashboard') {
            data = {
              'kpis': {'active': 21, 'signed': 9, 'pendingSignature': 3},
              'totalReferred': 24,
              'needsRevision': 2,
              'deviceSummary': {'issued': 4, 'returned': 1},
              'latestReferred': [],
            };
          } else if (o.path == '/api/adm/settings/profile') {
            data = {'fullName': 'Coordinator Name'};
          } else if (o.path == '/api/notifications/') {
            data = {'notifications': []};
          } else if (o.path == '/api/adm/staff') {
            data = {
              'staff': [
                {'id': 'staff-1', 'fullName': 'Nurse One', 'role': 'nurse'},
              ],
            };
          } else if (o.path == '/api/adm/history') {
            data = {
              'events': [
                {
                  'id': 'event-1',
                  'reason': 'Principal returned for revision: add detail',
                  'actor': 'Principal',
                  'at': '2026-11-17T00:00:00Z',
                },
              ],
            };
          } else if (o.path == '/api/adm/approvals' ||
              o.path == '/api/adm/referrals/all') {
            data = {
              'rows':
                  listRows ??
                  [
                    listRow(
                      o.queryParameters['page'] == 2
                          ? 'profile-2'
                          : 'profile-1',
                    ),
                  ],
              'total': 17,
              'page': o.queryParameters['page'] ?? 1,
              'totalPages': 2,
            };
          } else if (o.path == '/api/adm/devices' && o.method == 'GET') {
            data = {'rows': [], 'total': 0, 'page': 1, 'totalPages': 1};
          } else if (o.path.startsWith('/api/adm/case/')) {
            data = detail;
          } else if (o.path.startsWith('/api/adm/cases/')) {
            data =
                monitoringData ??
                {
                  'header': {
                    'studentName': 'Mira Learner',
                    'section': 'Arts',
                    'stageLabel': 'Enrollment monitoring',
                    'lrn': '123456789012',
                  },
                  'progress': {'total': 2, 'submitted': 1, 'overdueCount': 1},
                  'modules': [
                    {
                      'moduleName': 'Mathematics',
                      'status': 'overdue',
                      'source': 'section',
                    },
                  ],
                };
          } else if (o.path.endsWith('/certification')) {
            detail['stage'] = 'principal_approval';
            detail['certificationDetails'] = {
              'recommendation': (o.data as Map)['recommendation'],
            };
            data = detail;
          } else {
            data = {};
          }
          handler.resolve(
            Response(requestOptions: o, statusCode: 200, data: data),
          );
        },
      ),
    );
  }
  final requests = <RequestOptions>[];
  AdmJson detail = caseJson();
  bool failWrites = false, failReads = false;
  AdmJson? monitoringData;
  List<AdmJson>? listRows;
  Completer<void>? pending;
  Iterable<RequestOptions> get writes =>
      requests.where((o) => o.method != 'GET');
  @override
  Future<String?> accessToken() async => null;
}

class CoordinatorAuth extends AuthNotifier {
  CoordinatorAuth(super.api) {
    state = const AuthState(
      loggedIn: true,
      role: 'adm_coordinator',
      portal: 'staff',
    );
  }
  void change(String role) {
    state = AuthState(loggedIn: true, role: role, portal: 'staff');
  }
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> mount(
  WidgetTester tester,
  CoordinatorApi api,
  Widget page, {
  double width = 390,
  double scale = 1,
}) async {
  tester.view.physicalSize = Size(width, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(api.dio.close);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        authProvider.overrideWith((_) => CoordinatorAuth(api)),
        overviewProvider.overrideWith(
          (_) => throw StateError('Teacher provider called'),
        ),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        home: page,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
      ),
    ),
  );
  await settle(tester);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temp;
  setUpAll(() async {
    temp = await Directory.systemTemp.createTemp('zentra-coordinator-');
    Hive.init(temp.path);
    await Hive.openBox(AppConfig.portalBox);
    await Hive.openBox(AppConfig.termScopeBox);
  });
  tearDownAll(() async {
    await Hive.close();
    await temp.delete(recursive: true);
  });

  test('coordinator bypasses teacher term gate, other roles cannot enter', () {
    expect(
      coordinatorRedirect('adm_coordinator', '/term', false),
      '/coordinator/overview',
    );
    expect(
      coordinatorRedirect('adm_coordinator', '/gate', true),
      '/coordinator/overview',
    );
    expect(
      coordinatorRedirect('adm_coordinator', '/coordinator/referrals/a', false),
      isNull,
    );
    expect(
      coordinatorRedirect('subject_teacher', '/coordinator/devices', true),
      '/gate',
    );
    expect(
      coordinatorRedirect('adviser', '/coordinator/referrals/a', false),
      '/term',
    );
    final token =
        'a.${base64Url.encode(utf8.encode('{"role":"adm_coordinator"}'))}.b';
    expect(sessionRoleHint(null, token), 'adm_coordinator');
    expect(sessionRoleHint(null, 'invalid'), isNull);
  });

  test(
    'list and detail APIs preserve pagination, scope and encoded IDs',
    () async {
      final api = CoordinatorApi();
      addTearDown(api.dio.close);
      final repo = CoordinatorRepository(api);
      await repo.cases((
        desk: 'referrals',
        page: 2,
        q: ' Mira ',
        filter: 'meeting_parents',
      ));
      final request = api.requests.last;
      expect(request.path, '/api/adm/referrals/all');
      expect(request.queryParameters, {
        'page': 2,
        'pageSize': 15,
        'q': 'Mira',
        'stage': 'meeting_parents',
      });
      await repo.cases((
        desk: 'enrolled',
        page: 1,
        q: '',
        filter: 'enrollment_monitoring',
      ));
      expect(api.requests.last.path, '/api/adm/referrals/all');
      expect(
        api.requests.last.queryParameters['stage'],
        'enrollment_monitoring',
      );
      await repo.cases((desk: 'deviceCandidates', page: 1, q: '', filter: ''));
      expect(api.requests.last.path, '/api/adm/approvals');
      await repo.monitoring('name/with space');
      expect(api.requests.last.path, '/api/adm/cases/name%2Fwith%20space');
      await repo.caseFile('referral:ref-1');
      expect(api.requests.last.path, '/api/adm/case/referral%3Aref-1');
      expect(
        api.requests.any((r) => r.queryParameters.containsKey('termId')),
        isFalse,
      );
    },
  );

  test('meeting contracts use correct IDs and outcome path', () async {
    final api = CoordinatorApi();
    addTearDown(api.dio.close);
    final repo = CoordinatorRepository(api);
    await repo.book(AdmCaseDetail.fromJson(caseJson(profile: false)), {
      'venue': 'school',
    });
    expect(api.requests.last.path, '/api/adm/referral/ref-1/meetings');
    await repo.book(AdmCaseDetail.fromJson(caseJson()), {'venue': 'home'});
    expect(api.requests.last.path, '/api/adm/profile-1/meetings');
    await repo.outcome('meeting/one', {'attended': false});
    expect(api.requests.last.path, '/api/adm/meetings/meeting%2Fone');
    expect(api.requests.last.method, 'PATCH');
    await repo.reschedule('meeting-1', {'venue': 'home'});
    expect(api.requests.last.path, '/api/adm/meetings/meeting-1/reschedule');
    expect(api.requests.last.data, {'venue': 'home'});
  });

  test('eligibility gates do not allow premature profile/certification', () {
    final ready = AdmCaseDetail.fromJson(caseJson());
    expect(ready.canCertify, isTrue);
    final referral = AdmCaseDetail.fromJson(caseJson(profile: false));
    expect(referral.canCreateProfile, isTrue);
    expect(referral.canCertify, isFalse);
    final noMeeting = caseJson()..['meetings'] = [];
    expect(AdmCaseDetail.fromJson(noMeeting).canCertify, isFalse);
    final underReview = caseJson();
    underReview['referral'] = {'status': 'pending', 'consultReviewer': 'nurse'};
    expect(AdmCaseDetail.fromJson(underReview).canCertify, isFalse);
    expect(
      AdmCaseDetail.fromJson(caseJson(stage: 'principal_approval')).canCertify,
      isFalse,
    );
  });

  test('school input converts PHT to UTC independently of device timezone', () {
    expect(
      admSchoolInput(DateTime(2026, 11, 18), 9, 30),
      DateTime.utc(2026, 11, 18, 1, 30),
    );
    expect(admSchoolTime(DateTime.utc(2026, 11, 18, 1)).hour, 9);
  });

  test('coordinator requests omit cached teacher scope headers', () async {
    FlutterSecureStorage.setMockInitialValues({});
    await Hive.box(AppConfig.portalBox).put('role', 'adm_coordinator');
    await Hive.box(AppConfig.termScopeBox).put('termId', 'old-teacher-term');
    await Hive.box(AppConfig.termScopeBox)
        .put('schoolYearId', 'old-teacher-year');
    final api = ApiClient();
    addTearDown(api.dio.close);
    RequestOptions? sent;
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (o, handler) {
          sent = o;
          handler.resolve(
            Response(requestOptions: o, statusCode: 200, data: {}),
          );
        },
      ),
    );
    await api.dio.get('/api/adm/dashboard');
    expect(sent!.headers.containsKey('x-term-id'), isFalse);
    expect(sent!.headers.containsKey('x-school-year-id'), isFalse);
    await Hive.box(AppConfig.portalBox).put('role', 'adviser');
    await api.dio.get('/api/teacher/overview');
    expect(sent!.headers['x-term-id'], 'old-teacher-term');
    await Hive.box(AppConfig.portalBox).clear();
    await Hive.box(AppConfig.termScopeBox).clear();
  });

  test(
    'a late session restore cannot resurrect a logged-out coordinator',
    () async {
      final api = _DeferredRestoreApi();
      addTearDown(api.dio.close);
      final auth = AuthNotifier(api);
      addTearDown(auth.dispose);
      await auth.logout();
      api.token.complete(
        'a.${base64Url.encode(utf8.encode('{"role":"adm_coordinator"}'))}.b',
      );
      await Future<void>.delayed(Duration.zero);
      expect(auth.state.loggedIn, isFalse);
      expect(auth.state.role, isNull);
    },
  );

  test(
    'uploads enforce size/type/count; canceled repository cannot write',
    () async {
      final api = CoordinatorApi();
      addTearDown(api.dio.close);
      final repo = CoordinatorRepository(api);
      expect(
        () => repo.upload('m', [
          (name: 'bad.pdf', mime: 'application/pdf', bytes: [1]),
        ]),
        throwsA(isA<Exception>()),
      );
      expect(api.writes, isEmpty);
      await repo.upload('m/1', [
        (name: 'photo.png', mime: 'image/png', bytes: [1, 2]),
      ]);
      expect(api.requests.last.path, '/api/adm/meetings/m%2F1/attachments');
      expect(api.requests.last.data, isA<FormData>());
      await repo.caseFile('profile-1');
      expect(api.requests.last.headers['x-zentra-fresh'], '1');
      repo.dispose();
      await expectLater(
        repo.returnDevice('device-1'),
        throwsA(isA<Exception>()),
      );
      expect(api.writes.length, 1);
    },
  );

  test(
    'device issuance rechecks approvals and never uses student ID',
    () async {
      final api = CoordinatorApi();
      addTearDown(api.dio.close);
      final repo = CoordinatorRepository(api);
      await repo.issueDevice(
        AdmCaseRow.fromJson(listRow()),
        'Tablet',
        ' SN-1 ',
        'Good',
      );
      expect(api.writes.single.path, '/api/adm/devices/issue');
      expect(api.writes.single.data, {
        'admLearnerProfileId': 'profile-1',
        'deviceType': 'Tablet',
        'deviceSerial': 'SN-1',
        'conditionNotes': 'Good',
      });
      await expectLater(
        repo.issueDevice(
          AdmCaseRow.fromJson(listRow('other')),
          'Tablet',
          'SN-2',
          '',
        ),
        throwsA(isA<Exception>()),
      );
      expect(api.writes.length, 1);
    },
  );

  test('completion rechecks monitoring and never edits modules', () async {
    final api = CoordinatorApi();
    addTearDown(api.dio.close);
    final repo = CoordinatorRepository(api);
    await expectLater(
      repo.completeCase('profile-1'),
      throwsA(isA<Exception>()),
    );
    expect(api.writes, isEmpty);
    api.monitoringData = {
      'header': {
        'profileId': 'profile-1',
        'stage': 'enrollment_monitoring',
        'approvedAt': '2026-11-18T00:00:00Z',
      },
      'modules': [
        {'source': 'case', 'submitted': true},
      ],
    };
    await repo.completeCase('profile-1');
    expect(api.writes.single.path, '/api/adm/profile-1/stage');
    expect(api.writes.single.data, {'stage': 'completion'});
    expect(api.writes.any((r) => r.path.contains('/modules')), isFalse);
  });

  test('photo updates preserve web colors and validate payload size', () async {
    final api = CoordinatorApi();
    addTearDown(api.dio.close);
    final repo = CoordinatorRepository(api);
    await repo.savePhoto([1, 2, 3], 'image/png');
    expect(api.writes.single.path, '/api/adm/settings/photo');
    expect((api.writes.single.data as Map).keys, ['photoUrl']);
    expect(() => repo.savePhoto([], 'image/png'), throwsA(isA<Exception>()));
    expect(api.writes.length, 1);
  });

  test('notifications never interpret meeting or device IDs as case IDs', () {
    ZNotification n(String table, String id) => ZNotification(
      id: 'n',
      type: '',
      sourceTable: table,
      sourceId: id,
      message: '',
      isRead: false,
      createdAt: '',
    );
    expect(
      coordinatorNotificationTarget(n('referrals', 'r/1')),
      '/coordinator/referrals/referral%3Ar%2F1',
    );
    expect(
      coordinatorNotificationTarget(n('adm_devices', 'd')),
      '/coordinator/devices',
    );
    expect(
      coordinatorNotificationTarget(n('adm_parent_meetings', 'm')),
      '/coordinator/referrals',
    );
  });

  testWidgets('overview shows real totals without teacher providers', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await mount(tester, api, const Scaffold(body: CoordinatorOverviewPage()));
    expect(find.text('Welcome, Coordinator Name'), findsOneWidget);
    expect(find.text('24'), findsOneWidget);
    expect(find.text('21'), findsOneWidget);
    expect(api.requests.any((r) => r.path.contains('/teacher/')), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('meeting preview reads queue slots rather than dashboard rows', (
    tester,
  ) async {
    final api = CoordinatorApi();
    final row = listRow();
    row['meeting'] = meetingJson()
      ..['meetingDatetime'] = DateTime.now()
          .add(const Duration(hours: 3))
          .toUtc()
          .toIso8601String();
    api.listRows = [row];
    await mount(tester, api, const Scaffold(body: CoordinatorOverviewPage()));
    expect(find.text('Mira Learner'), findsOneWidget);
    expect(api.requests.any((r) => r.path == '/api/adm/referrals/all'), isTrue);
  });

  testWidgets('case certification submits once and endorses atomically', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await mount(tester, api, const CoordinatorCasePage(caseId: 'profile-1'));
    final action = find.text('Certify and endorse to Principal');
    await tester.ensureVisible(action);
    await tester.tap(action);
    await settle(tester);
    await tester.enterText(
      find.byType(TextFormField),
      'Needs flexible learning support.',
    );
    api.pending = Completer<void>();
    final save = find.text('Create certification and endorse');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await settle(tester);
    expect(find.text('Saving…'), findsOneWidget);
    expect(api.writes.length, 1);
    api.pending!.complete();
    await settle(tester);
    expect(api.writes.single.path, '/api/adm/profile-1/certification');
    expect(api.writes.where((r) => r.path.endsWith('/stage')), isEmpty);
    expect(api.detail['stage'], 'principal_approval');
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed certification preserves text and shows safe error', (
    tester,
  ) async {
    final api = CoordinatorApi()..failWrites = true;
    final repo = CoordinatorRepository(api);
    // This form's repository must be the same instance as the scoped provider.
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          authProvider.overrideWith((_) => CoordinatorAuth(api)),
          coordinatorRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: AdmEditPage(
            title: 'Certify',
            repository: repo,
            fields: const [AdmField('Recommendation', min: 10, lines: 4)],
            onSave: (r, v) => r.certify('profile-1', v[0]),
          ),
        ),
      ),
    );
    await tester.enterText(
      find.byType(TextFormField),
      'Keep my recommendation.',
    );
    await tester.tap(find.text('Save'));
    await settle(tester);
    expect(find.text('Keep my recommendation.'), findsOneWidget);
    expect(find.textContaining('secret internals'), findsNothing);
    expect(api.writes.length, 1);
    await tester.pumpWidget(const SizedBox.shrink());
    api.dio.close();
  });

  testWidgets('case list paginates 15 rows and resets on search/filter', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await mount(
      tester,
      api,
      const Scaffold(body: CoordinatorListPage(desk: 'referrals')),
    );
    await tester.tap(find.byTooltip('Next page'));
    await settle(tester);
    expect(api.requests.last.queryParameters['page'], 2);
    expect(api.requests.last.queryParameters['pageSize'], 15);
    await tester.enterText(find.byType(TextField).first, 'Mira');
    await settle(tester);
    expect(api.requests.last.queryParameters['page'], 1);
    expect(api.requests.last.queryParameters['q'], 'Mira');
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await settle(tester);
    await tester.tap(find.text('Parent meeting').last);
    await settle(tester);
    expect(api.requests.last.queryParameters['stage'], 'meeting_parents');
    expect(tester.takeException(), isNull);
  });

  testWidgets('device return confirmation posts only once', (tester) async {
    final api = CoordinatorApi();
    final device = AdmDevice.fromJson({
      'id': 'device/1',
      'student': 'Mira Learner',
      'deviceSerial': 'SN-1',
      'deviceType': 'Tablet',
      'issuedDate': '2026-11-17',
    });
    await mount(
      tester,
      api,
      Scaffold(body: CoordinatorDeviceCard(device: device)),
    );
    await tester.tap(find.text('Record return'));
    await settle(tester);
    expect(api.writes, isEmpty);
    api.pending = Completer<void>();
    await tester.tap(find.text('Confirm'));
    await settle(tester);
    expect(api.writes.length, 1);
    expect(api.writes.single.path, '/api/adm/devices/device%2F1/return');
    api.pending!.complete();
    await settle(tester);
    expect(find.text('Device return recorded.'), findsOneWidget);
  });

  testWidgets('polling stops while another route covers the desk', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await mount(tester, api, const Scaffold(body: CoordinatorOverviewPage()));
    final context = tester.element(find.byType(CoordinatorOverviewPage));
    int dashboardGets() =>
        api.requests.where((r) => r.path == '/api/adm/dashboard').length;
    final initial = dashboardGets();
    await tester.pump(const Duration(seconds: 20));
    await settle(tester);
    expect(dashboardGets(), initial + 1);
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Covered')),
        ),
      ),
    );
    await settle(tester);
    final before = dashboardGets();
    await tester.pump(const Duration(seconds: 40));
    await settle(tester);
    expect(dashboardGets(), before);
    Navigator.of(context).pop();
    await settle(tester);
  });

  testWidgets('no-show records outcome without inventing a home visit', (
    tester,
  ) async {
    final api = CoordinatorApi();
    final repo = CoordinatorRepository(api);
    final detail = AdmCaseDetail.fromJson(caseJson());
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith((_) => CoordinatorAuth(api)),
          coordinatorRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          theme: zWorkspaceTheme(),
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => CoordinatorMeetingForm(
                      detail: detail,
                      repository: repo,
                      meeting: AdmMeeting.fromJson(meetingJson()),
                      outcome: true,
                    ),
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await settle(tester);
    expect(
      tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
      isFalse,
    );
    await tester.ensureVisible(find.text('Record outcome'));
    await tester.tap(find.text('Record outcome'));
    await settle(tester);
    expect(api.writes.single.path, '/api/adm/meetings/meeting-1');
    expect((api.writes.single.data as Map)['attended'], false);
    expect(api.writes.any((r) => r.path.endsWith('/reschedule')), isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    api.dio.close();
  });

  for (final width in [360.0, 760.0, 1100.0]) {
    testWidgets('read-only monitoring fits $width and large text', (
      tester,
    ) async {
      final api = CoordinatorApi();
      await mount(
        tester,
        api,
        const CoordinatorMonitoringPage(caseId: 'profile-1'),
        width: width,
        scale: 1.6,
      );
      expect(find.text('1 / 2 submitted'), findsOneWidget);
      expect(find.text('Monitoring · read-only'), findsOneWidget);
      expect(find.text('Save'), findsNothing);
      expect(api.writes, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('shell reuses the adviser chrome with five desk destinations', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await mount(
      tester,
      api,
      const CoordinatorShell(
        path: '/coordinator/overview',
        child: CoordinatorOverviewPage(),
      ),
    );
    expect(find.byKey(const ValueKey('coordinator-nav-bar')), findsOneWidget);
    for (final destination in coordinatorDestinations) {
      expect(find.text(destination.label), findsWidgets);
    }
    // Settings moved into the account panel, not the bottom bar.
    expect(find.text('Settings'), findsNothing);
    await tester.tap(find.byTooltip('Menu'));
    await settle(tester);
    expect(find.text('ADM workspace'), findsOneWidget);
    expect(find.text('Settings'), findsNothing);
    expect(api.requests.any((r) => r.path.contains('/teacher/')), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('account panel hosts settings, appearance and logout', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await mount(
      tester,
      api,
      const CoordinatorShell(
        path: '/coordinator/overview',
        child: CoordinatorOverviewPage(),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('profile-avatar')));
    await settle(tester);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('ADM Coordinator'), findsWidgets);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Logout'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('account change clears coordinator cached data', (tester) async {
    final api = CoordinatorApi();
    await mount(
      tester,
      api,
      const CoordinatorShell(
        path: '/coordinator/overview',
        child: CoordinatorOverviewPage(),
      ),
    );
    final context = tester.element(find.byType(CoordinatorShell));
    final container = ProviderScope.containerOf(context);
    (container.read(authProvider.notifier) as CoordinatorAuth).change(
      'subject_teacher',
    );
    await settle(tester);
    expect(find.textContaining('Welcome,'), findsNothing);
    expect(find.text('ADM coordinator access required.'), findsOneWidget);
  });

  testWidgets('production router opens coordinator without a selected term', (
    tester,
  ) async {
    final api = CoordinatorApi();
    await tester.runAsync(() => Hive.box(AppConfig.termScopeBox).clear());
    await tester.runAsync(
      () => Hive.box(AppConfig.portalBox).put('role', 'adm_coordinator'),
    );
    // Keep accessToken injectable while exercising the real route tree.
    final tokenApi = _RestoredCoordinatorApi();
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(tokenApi),
        authProvider.overrideWith((_) => CoordinatorAuth(tokenApi)),
      ],
    );
    final router = container.read(routerProvider);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await settle(tester);
    expect(
      router.routeInformationProvider.value.uri.path,
      '/coordinator/overview',
    );
    expect(tokenApi.requests.any((r) => r.path.contains('/teacher/')), isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    container.dispose();
    tokenApi.dio.close();
    api.dio.close();
    await tester.runAsync(() => Hive.box(AppConfig.portalBox).clear());
  });
}

class _RestoredCoordinatorApi extends CoordinatorApi {
  @override
  Future<String?> accessToken() async => 'test-token';
}

class _DeferredRestoreApi extends CoordinatorApi {
  final token = Completer<String?>();
  @override
  Future<String?> accessToken() => token.future;
  @override
  Future<void> logout() async {}
}
