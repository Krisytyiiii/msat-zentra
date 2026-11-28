// GoRouter — Login -> Term -> Gate -> persistent staff workspace.
// Bottom/drawer destinations use go; records and editors use push.
// Menu: Advisory (adviser-only) + shared Workspace Class/Attendance (both
// roles, same web data). Gradebook detail is push-only under /workspace/classes.
// Deprecated /teacher/* + /adviser/attendance redirect to /workspace/*.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../design/shell.dart';
import '../design/portal_shell.dart';
import 'student/student_identity_page.dart';
import 'student/student_portal_pages.dart';
import 'student/student_subject_attendance_page.dart';
import 'student/student_subject_record_page.dart';
import 'parent/parent_portal_pages.dart';
import 'portal/portal_settings_page.dart';
import 'portal/portal_views.dart';
import '../shared/models.dart';
import 'adviser/academic_overview_page.dart';
import 'adviser/adm_cases_page.dart';
import 'adviser/interventions_page.dart';
import 'adviser/advisory_list_page.dart';
import 'adviser/advisory_attendance_detail_page.dart';
import 'adviser/advisory_attendance_page.dart';
import 'anecdotal/anecdotal_repo_page.dart';
import 'adviser/adviser_schedule_page.dart';
import 'adviser/student_detail_page.dart';
import 'auth/first_time_gate.dart';
import 'auth/login_page.dart';
import 'auth/term_select_page.dart';
import 'bama/bama_chat_page.dart';
import 'bama/bama_conversations.dart';
import 'bama/bama_history_page.dart';
import 'home/role_home.dart';
import 'home/overview_page.dart';
import 'referral/referral_page.dart';
import 'teacher/classes_page.dart';
import 'teacher/class_list_page.dart';
import 'teacher/gradebook_dashboard_page.dart';
import 'teacher/gradebook_page.dart';
import 'teacher/assessment_score_page.dart';
import 'teacher/assessments_page.dart';
import 'workspace/workspace_attendance_page.dart';
import 'workspace/attendance_record_page.dart';
import 'workspace/attendance_data.dart';
import '../core/session.dart'
    show authProvider, sessionRoleHint, mobilePortalForRole;
import 'coordinator/coordinator_shell.dart';
import 'coordinator/coordinator_pages.dart';
import 'coordinator/coordinator_case_page.dart';
import 'coordinator/coordinator_devices.dart';
import 'coordinator/coordinator_models.dart' show AdmDevice;
import 'coordinator/coordinator_meeting_form.dart';
import 'coordinator/coordinator_monitoring.dart';
import 'coordinator/coordinator_settings.dart';
import 'coordinator/coordinator_notifications.dart';

String? coordinatorRedirect(String? role, String location, bool hasTerm) {
  if (role == 'adm_coordinator') {
    if (location == '/coordinator') return '/coordinator/overview';
    return location.startsWith('/coordinator/')
        ? null
        : '/coordinator/overview';
  }
  if (location == '/coordinator' || location.startsWith('/coordinator/')) {
    return hasTerm ? '/gate' : '/term';
  }
  return null;
}

// Coordinator routes inherit the app Appearance setting; each desk scopes its
// own presentation theme from it.
Widget _coordinatorView(Widget child) => child;

/// The five coordinator desks (plus Settings) share one persistent shell, so
/// the header and floating pill navigation stay mounted exactly like the
/// adviser workspace while only the body changes. Case details and
/// notifications remain root-level full screens.
List<RouteBase> _coordinatorDeskRoute() => [
  ShellRoute(
    builder: (context, state, child) =>
        _coordinatorView(CoordinatorShell(path: state.uri.path, child: child)),
    routes: [
      GoRoute(
        path: '/coordinator/overview',
        pageBuilder: (_, state) => NoTransitionPage<void>(
          key: state.pageKey,
          child: const CoordinatorOverviewPage(),
        ),
      ),
      for (final desk in const [
        (path: 'referrals', desk: 'referrals'),
        (path: 'enrolled', desk: 'enrolled'),
        (path: 'files', desk: 'certifications'),
        (path: 'devices', desk: 'devices'),
      ])
        GoRoute(
          path: '/coordinator/${desk.path}',
          pageBuilder: (_, state) => NoTransitionPage<void>(
            key: state.pageKey,
            child: CoordinatorListPage(desk: desk.desk),
          ),
        ),
      GoRoute(
        path: '/coordinator/referrals/:caseId/meeting',
        pageBuilder: (_, state) => NoTransitionPage<void>(
          key: state.pageKey,
          child: CoordinatorMeetingPage(
            caseId: state.pathParameters['caseId']!,
            meetingId: state.uri.queryParameters['meetingId'],
          ),
        ),
      ),
      GoRoute(
        path: '/coordinator/settings',
        pageBuilder: (_, state) => NoTransitionPage<void>(
          key: state.pageKey,
          child: const CoordinatorSettingsPage(),
        ),
      ),
    ],
  ),
];

// Workspace/list and record destinations share chrome. Editing screens,
// other details, conversations and authentication stay on the root navigator.
const _staffShellPaths = {
  '/workspace/overview',
  '/workspace/schedule',
  '/workspace/classes',
  '/workspace/classes/:id',
  '/workspace/classes/:id/list',
  '/workspace/gradebook',
  '/workspace/attendance',
  '/workspace/attendance/records/:sectionId/:subjectId',
  '/teacher/more',
  '/adviser/advisory',
  '/adviser/advisory/attendance',
  '/adviser/academic',
  '/adviser/adm-cases',
  '/adviser/interventions',
  '/adviser/anecdotal',
  '/adviser/schedule',
  '/adviser/referrals',
  '/adviser/bama',
  '/adviser/bama/history',
};

List<RouteBase> persistentStaffRoutes(List<RouteBase> routes) {
  final staff = <RouteBase>[];
  final root = <RouteBase>[];
  for (final route in routes) {
    if (route is GoRoute && _staffShellPaths.contains(route.path)) {
      staff.add(
        GoRoute(
          path: route.path,
          pageBuilder: (context, state) => NoTransitionPage<void>(
            key: state.pageKey,
            child: route.builder!(context, state),
          ),
        ),
      );
    } else {
      root.add(route);
    }
  }
  return [
    ...root,
    ShellRoute(
      builder: (context, state, child) => StaffShellScope(
        child: ZentraShell(selectedPath: state.uri.path, child: child),
      ),
      routes: staff,
    ),
  ];
}

/// Learner portals render inside [PortalShell] (own header, drawer, floating
/// navigation) instead of the teacher shell.
List<RouteBase> _portalRoutes() => [
  ShellRoute(
    builder: (context, state, child) =>
        PortalShellChrome(location: state.uri.path, child: child),
    routes: [
      GoRoute(
        path: '/portal/notifications',
        builder: (context, _) => const PortalNotificationsPage(),
      ),
      GoRoute(
        path: '/student/home',
        redirect: (context, _) => '/student/overview',
      ),
      GoRoute(
        path: '/student/overview',
        builder: (context, _) => const StudentOverviewPage(),
      ),
      GoRoute(
        path: '/student/grades',
        builder: (context, _) => const StudentGradesPage(),
      ),
      GoRoute(
        path: '/student/attendance',
        builder: (context, _) => const StudentAttendancePage(),
      ),
      GoRoute(
        path: '/student/schedule',
        builder: (context, _) => const StudentSchedulePage(),
      ),
      GoRoute(
        path: '/student/modules',
        builder: (context, state) =>
            StudentModulesPage(kind: state.uri.queryParameters['kind']),
      ),
      GoRoute(
        path: '/student/sessions',
        builder: (context, state) => StudentSessionsPage(
          admOnly: state.uri.queryParameters['track'] == 'adm',
        ),
      ),
      GoRoute(
        path: '/parent/home',
        redirect: (context, _) => '/parent/overview',
      ),
      GoRoute(
        path: '/parent/overview',
        builder: (context, _) => const ParentOverviewPage(),
      ),
      GoRoute(
        path: '/parent/grades',
        builder: (context, _) => const ParentGradesPage(),
      ),
      GoRoute(
        path: '/parent/attendance',
        builder: (context, _) => const ParentAttendancePage(),
      ),
      GoRoute(
        path: '/parent/schedule',
        builder: (context, _) => const ParentSchedulePage(),
      ),
      GoRoute(
        path: '/parent/modules',
        builder: (context, _) => const ParentModulesPage(),
      ),
      GoRoute(
        path: '/parent/sessions',
        builder: (context, _) => const ParentSessionsPage(),
      ),
    ],
  ),
];

final routerProvider = Provider<GoRouter>((ref) {
  final authChanges = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, _) => authChanges.value++);
  final router = GoRouter(
    refreshListenable: authChanges,
    initialLocation: '/login',
    redirect: (context, state) async {
      final box = Hive.box(AppConfig.termScopeBox);
      final hasTerm = box.get('termId') != null;
      final container = ProviderScope.containerOf(context);
      final token = await container.read(apiClientProvider).accessToken();
      final loc = state.matchedLocation;
      if (token == null && loc != '/login') return '/login';
      if (token != null) {
        final role =
            container.read(authProvider).role ??
            sessionRoleHint(
              Hive.box(AppConfig.portalBox).get('role') as String?,
              token,
            );
        final coordinator = coordinatorRedirect(role, loc, hasTerm);
        if (coordinator != null) return coordinator;
        if (role == 'adm_coordinator') return null;
        final portal =
            mobilePortalForRole(role) ??
            container.read(authProvider).portal ??
            Hive.box(AppConfig.portalBox).get('portal') as String? ??
            'staff';
        if (portal == 'student' || portal == 'parent') {
          if (loc.startsWith('/portal/') || loc.startsWith('/$portal/'))
            return null;
          return '/$portal/overview';
        }
        if (loc.startsWith('/student') ||
            loc.startsWith('/parent') ||
            loc.startsWith('/portal/')) {
          return hasTerm ? '/gate' : '/term';
        }
      }
      if (token != null && loc == '/login') return hasTerm ? '/gate' : '/term';
      if (token != null && !hasTerm && loc != '/term') return '/term';
      // Role gate for adviser routes (cached role set by overviewProvider).
      final role = container.read(authProvider).role;
      if (loc.startsWith('/adviser/') && role == 'subject_teacher')
        return '/workspace/classes';
      // Root redirects to defaults.
      if (loc == '/adviser') return '/workspace/overview';
      if (loc == '/teacher') return '/workspace/overview';
      return null;
    },
    routes: [
      // Learner identity is a full-screen detail with its own header (like the
      // staff record screens), so it stays outside the portal chrome.
      GoRoute(
        path: '/portal/settings',
        builder: (context, _) => const PortalSettingsPage(),
      ),
      GoRoute(
        path: '/student/profile',
        builder: (context, _) => const StudentIdentityPage(),
      ),
      GoRoute(
        path: '/student/profile/qr',
        builder: (context, _) => const StudentIdentityPage(qr: true),
      ),
      GoRoute(
        path: '/student/grades/:subjectId',
        builder: (context, state) => StudentSubjectRecordPage(
          subjectId: state.pathParameters['subjectId'] ?? '',
          subjectName: state.extra is String ? state.extra as String : null,
        ),
      ),
      GoRoute(
        path: '/student/attendance/:subjectId',
        builder: (context, state) => StudentSubjectAttendancePage(
          subjectId: state.pathParameters['subjectId'] ?? '',
          subjectName: state.extra is String ? state.extra as String : null,
        ),
      ),
      GoRoute(
        path: '/parent/children/:studentId/grades/:subjectId',
        builder: (context, state) => StudentSubjectRecordPage(
          childId: state.pathParameters['studentId'] ?? '',
          subjectId: state.pathParameters['subjectId'] ?? '',
          subjectName: state.extra is String ? state.extra as String : null,
        ),
      ),
      GoRoute(
        path: '/parent/children/:studentId/attendance/:subjectId',
        builder: (context, state) => StudentSubjectAttendancePage(
          childId: state.pathParameters['studentId'] ?? '',
          subjectId: state.pathParameters['subjectId'] ?? '',
          subjectName: state.extra is String ? state.extra as String : null,
        ),
      ),
      ...persistentStaffRoutes([
      GoRoute(path: '/login', builder: (context, _) => const LoginPage()),
      GoRoute(
        path: '/coordinator',
        redirect: (_, _) => '/coordinator/overview',
      ),
      ..._coordinatorDeskRoute(),
      GoRoute(
        path: '/coordinator/referrals/:id',
        builder: (_, state) => _coordinatorView(
          CoordinatorCasePage(
            key: ValueKey(state.pathParameters['id']),
            caseId: state.pathParameters['id']!,
          ),
        ),
      ),
      GoRoute(
        path: '/coordinator/files/:id',
        builder: (_, state) => _coordinatorView(
          CoordinatorCasePage(
            key: ValueKey(state.pathParameters['id']),
            caseId: state.pathParameters['id']!,
            title: 'Student Files',
          ),
        ),
      ),
      GoRoute(
        path: '/coordinator/enrolled/:id',
        builder: (_, state) => _coordinatorView(
          CoordinatorMonitoringPage(
            key: ValueKey(state.pathParameters['id']),
            caseId: state.pathParameters['id']!,
          ),
        ),
      ),
      GoRoute(
        path: '/coordinator/devices/issue',
        builder: (_, _) => _coordinatorView(const CoordinatorIssueDevicePage()),
      ),
      GoRoute(
        path: '/coordinator/devices/detail/:id',
        builder: (_, state) {
          final extra = state.extra;
          return _coordinatorView(
            CoordinatorDeviceDetailPage(
              deviceId: Uri.decodeComponent(state.pathParameters['id'] ?? ''),
              initial: extra is AdmDevice ? extra : null,
            ),
          );
        },
      ),
      GoRoute(
        path: '/coordinator/notifications',
        builder: (_, _) =>
            _coordinatorView(const CoordinatorNotificationsPage()),
      ),
      GoRoute(path: '/term', builder: (context, _) => const TermSelectPage()),
      GoRoute(path: '/gate', builder: (context, _) => const FirstTimeGate()),
      // Adviser section (drawer replace-targets)
      GoRoute(
        path: '/adviser/interventions',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.interventions,
          child: InterventionsPage(),
        ),
      ),
      GoRoute(
        path: '/adviser/advisory',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.advisory,
          child: AdvisoryListPage(),
        ),
      ),
      GoRoute(
        path: '/adviser/advisory/attendance',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.advisoryAttendance,
          child: AdvisoryAttendancePage(),
        ),
      ),
      GoRoute(
        path: '/adviser/advisory/attendance/:studentId',
        builder: (context, state) {
          final extra = state.extra;
          final selection = extra is AdvisoryAttendanceSelection ? extra : null;
          // Pushed from the list with the loaded snapshot; a deep link falls
          // back to `?section=` and reloads the matrix itself.
          return AdvisoryAttendanceDetailPage(
            studentId: Uri.decodeComponent(
              state.pathParameters['studentId'] ?? '',
            ),
            sectionId: state.uri.queryParameters['section'],
            student: selection?.student,
            subjects: selection?.subjects,
          );
        },
      ),
      GoRoute(
        path: '/adviser/academic',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.academic,
          child: AcademicOverviewPage(),
        ),
      ),
      GoRoute(
        path: '/adviser/adm-cases',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.admCases,
          child: AdmCasesPage(),
        ),
      ),
      GoRoute(
        path: '/adviser/anecdotal',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.anecdotal,
          child: AnecdotalRepoPage(),
        ),
      ),
      GoRoute(
        path: '/adviser/schedule',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.schedule,
          child: AdviserSchedulePage(),
        ),
      ),
      GoRoute(
        path: '/adviser/bama',
        builder: (context, state) => AdviserShell(
          selected: AdviserRoute.bama,
          child: BamaChatPage(
            freshEntry: state.uri.queryParameters['new'] == '1',
          ),
        ),
      ),
      GoRoute(
        path: '/adviser/referrals',
        builder: (context, _) => const AdviserShell(
          selected: AdviserRoute.referrals,
          child: ReferralPage(),
        ),
      ),
      GoRoute(
        path: '/adviser/bama/conversation/:conversationId',
        builder: (context, state) => BamaChatPage(
          key: ValueKey(state.pathParameters['conversationId']),
          conversationId: state.pathParameters['conversationId']!,
          newConversation: state.uri.queryParameters['new'] == '1',
        ),
      ),
      GoRoute(
        path: '/adviser/bama/history',
        builder: (context, state) {
          // Legacy grade-flag deep links must not reopen unsupported chats.
          const type = 'anecdotal';
          final extra = state.extra;
          List<BamaConversation> convos = const [];
          Future<void> Function(String) onResume = (_) async {};
          ValueChanged<BamaConversation> onDelete = (_) {};
          if (extra is Map) {
            if (extra['conversations'] is List)
              convos = (extra['conversations'] as List)
                  .whereType<BamaConversation>()
                  .toList();
            if (extra['onResume'] is Future<void> Function(String))
              onResume = extra['onResume'] as Future<void> Function(String);
            if (extra['onDelete'] is ValueChanged<BamaConversation>)
              onDelete = extra['onDelete'] as ValueChanged<BamaConversation>;
          }
          return AdviserShell(
            selected: AdviserRoute.bama,
            child: BamaHistoryPage(
              type: type,
              conversations: convos,
              onResume: onResume,
              onDelete: onDelete,
            ),
          );
        },
      ),
      GoRoute(
        path: '/adviser/students/:id',
        builder: (context, state) {
          final extra = state.extra;
          // Pushed from AdvisoryListPage with the full object; fallback to
          // deep-link stub (detail fetches live data itself). Detail screens
          // sit outside the shell: one header, the learner's name.
          if (extra is AdvisoryStudent)
            return StudentDetailPage(student: extra);
          final id = state.pathParameters['id'] ?? '';
          return StudentDetailPage(
            student: AdvisoryStudent(
              studentId: Uri.decodeComponent(id),
              name: 'Student',
              lrn: '—',
              hasAccount: true,
            ),
          );
        },
      ),
      // Shared Workspace (both roles, same web data)
      GoRoute(
        path: '/workspace/overview',
        builder: (context, _) => const WorkspaceShell(
          selected: WorkspaceRoute.overview,
          child: OverviewPage(),
        ),
      ),
      GoRoute(
        path: '/workspace/schedule',
        builder: (context, _) => const WorkspaceShell(
          selected: WorkspaceRoute.schedule,
          child: AdviserSchedulePage(advisory: false),
        ),
      ),
      GoRoute(
        path: '/workspace/classes',
        builder: (context, _) => const WorkspaceShell(
          selected: WorkspaceRoute.classes,
          child: ClassesPage(),
        ),
      ),
      GoRoute(
        path: '/workspace/gradebook',
        builder: (context, _) => const WorkspaceShell(
          selected: WorkspaceRoute.gradebook,
          child: GradebookDashboardPage(),
        ),
      ),
      GoRoute(
        path: '/workspace/classes/:id/assessments',
        builder: (context, state) => AssessmentsPage(
          classId: state.pathParameters['id']!,
          audience: state.uri.queryParameters['audience'] == 'adm'
              ? 'adm'
              : 'regular',
        ),
      ),
      GoRoute(
        path: '/workspace/classes/:id/assessments/:assessmentId',
        builder: (context, state) => AssessmentScorePage(
          classId: state.pathParameters['id']!,
          assessmentId: state.pathParameters['assessmentId']!,
          reviewSaveId: state.uri.queryParameters['reviewSave'],
        ),
      ),
      GoRoute(
        path: '/workspace/classes/:id/list',
        builder: (context, state) => ClassListPage(
          key: ValueKey(state.pathParameters['id']),
          classId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/workspace/classes/:id',
        builder: (context, state) {
          final id = Uri.decodeComponent(state.pathParameters['id'] ?? '');
          final title = state.uri.queryParameters['title'] ?? 'Gradebook';
          // Record keeps its own header inside the persistent staff shell.
          return GradebookPage(classId: id, title: title);
        },
      ),
      GoRoute(
        path: '/workspace/attendance',
        builder: (context, _) => const WorkspaceShell(
          selected: WorkspaceRoute.attendance,
          child: WorkspaceAttendancePage(),
        ),
      ),
      GoRoute(
        path: '/workspace/attendance/records/:sectionId/:subjectId',
        builder: (context, state) {
          final sectionId = state.pathParameters['sectionId']!;
          final subjectId = state.pathParameters['subjectId']!;
          final pair = state.extra;
          if (pair is AttendancePair &&
              pair.sectionId == sectionId &&
              pair.subjectId == subjectId) {
            return AttendanceRecordPage(
              key: ValueKey('$sectionId|$subjectId'),
              pair: pair,
            );
          }
          return AttendanceRecordRoute(
            sectionId: sectionId,
            subjectId: subjectId,
          );
        },
      ),
      GoRoute(
        path: '/teacher/more',
        builder: (context, _) => const WorkspaceShell(
          selected: WorkspaceRoute.more,
          child: TeacherMorePage(),
        ),
      ),
      // Deprecated aliases (one release): old installs may hold these paths.
      GoRoute(
        path: '/workspace/gradebook/:id',
        redirect: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          final title = state.uri.queryParameters['title'];
          return '/workspace/classes/$id${title == null ? '' : '?title=${Uri.encodeComponent(title)}'}';
        },
      ),
      GoRoute(
        path: '/adviser/attendance',
        redirect: (context, _) => '/workspace/attendance',
      ),
      GoRoute(
        path: '/teacher/classes',
        redirect: (context, _) => '/workspace/classes',
      ),
      GoRoute(
        path: '/teacher/attendance',
        redirect: (context, _) => '/workspace/attendance',
      ),
      GoRoute(
        path: '/teacher/gradebook/:id',
        redirect: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          final title = state.uri.queryParameters['title'];
          return '/workspace/classes/$id${title == null ? '' : '?title=${Uri.encodeComponent(title)}'}';
        },
      ),
    ]),
      ..._portalRoutes(),
    ],
    errorBuilder: (context, _) =>
        const Scaffold(body: Center(child: Text('Page not found'))),
  );
  ref.onDispose(() {
    router.dispose();
    authChanges.dispose();
  });
  return router;
});
