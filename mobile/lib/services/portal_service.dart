// Student/parent portal queries (backend/src/modules/{student,parent}/portal.routes.ts).
// Non-staff roles may browse historical terms, so every term-scoped call sends
// an explicit `?termId=`; null means "whatever the server considers active".

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/session.dart';
import '../shared/models.dart';

final portalTermIdProvider = StateProvider.autoDispose<String?>((ref) {
  final box = Hive.box(AppConfig.portalBox);
  final id = box.get('termId');
  return id is String && id.isNotEmpty ? id : null;
});

/// Remembers the browsed term for this device (cleared on logout with the rest
/// of `zentra.portal`) so opening a full-screen detail and coming back keeps
/// the historical scope instead of snapping to the current term.
void selectPortalTerm(WidgetRef ref, String? termId) {
  final box = Hive.box(AppConfig.portalBox);
  if (termId == null) {
    box.delete('termId');
  } else {
    box.put('termId', termId);
  }
  ref.read(portalTermIdProvider.notifier).state = termId;
}

final portalModulePageProvider = StateProvider.autoDispose<int>((ref) => 1);

Map<String, dynamic> _termQuery(Ref ref) {
  final id = ref.watch(portalTermIdProvider);
  return id == null ? const {} : {'termId': id};
}

Future<Map<String, dynamic>> _get(Ref ref, String path, {Map<String, dynamic>? query}) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.dio.get(path, queryParameters: query);
    return Map<String, dynamic>.from(res.data as Map);
  } on DioException catch (e) {
    throw api.toApiException(e);
  }
}

// ---- Student -------------------------------------------------------------

final studentMeProvider = FutureProvider.autoDispose<PortalLearner>((ref) async {
  final data = await _get(ref, '/api/student/me', query: _termQuery(ref));
  return PortalLearner.fromJson(Map<String, dynamic>.from(data['learner'] as Map));
});

final studentTermsProvider = FutureProvider.autoDispose<List<PortalTerm>>((ref) async {
  final data = await _get(ref, '/api/student/terms');
  return [for (final t in (data['terms'] as List? ?? [])) PortalTerm.fromJson(Map<String, dynamic>.from(t as Map))];
});

final studentHomeProvider = FutureProvider.autoDispose<PortalHome>((ref) async {
  return PortalHome.fromJson(await _get(ref, '/api/student/home', query: _termQuery(ref)));
});

final studentGradesProvider = FutureProvider.autoDispose<PortalGrades>((ref) async {
  return PortalGrades.fromJson(await _get(ref, '/api/student/grades', query: _termQuery(ref)));
});

final studentAttendanceProvider = FutureProvider.autoDispose<PortalAttendance>((ref) async {
  return PortalAttendance.fromJson(await _get(ref, '/api/student/attendance', query: _termQuery(ref)));
});

final studentScheduleProvider = FutureProvider.autoDispose<PortalSchedule>((ref) async {
  return PortalSchedule.fromJson(await _get(ref, '/api/student/schedule', query: _termQuery(ref)));
});

final studentSessionsProvider = FutureProvider.autoDispose<List<PortalSession>>((ref) async {
  final data = await _get(ref, '/api/student/sessions');
  return [for (final s in (data['sessions'] as List? ?? [])) PortalSession.fromJson(Map<String, dynamic>.from(s as Map))];
});

final studentModulesProvider = FutureProvider.autoDispose<PortalModules>((ref) async {
  final page = ref.watch(portalModulePageProvider);
  return PortalModules.fromJson(
    await _get(ref, '/api/student/modules', query: {..._termQuery(ref), 'page': page, 'pageSize': 15}),
  );
});

// ---- Portal scope (term breadcrumbs + parent child picker) ---------------

/// The learner's terms, with the server's active term so the scope pills can
/// show the same term the data call resolved without duplicating date logic.
class PortalTermsResult {
  final List<PortalTerm> terms;
  final String? activeTermId;
  const PortalTermsResult({required this.terms, this.activeTermId});
}

final portalTermsResultProvider = FutureProvider.autoDispose<PortalTermsResult>((ref) async {
  final role = ref.watch(authProvider).role;
  final childId = role == 'parent' ? ref.watch(selectedChildProvider) : null;
  if (role == 'parent' && childId == null) {
    return const PortalTermsResult(terms: []);
  }
  final path = role == 'parent'
      ? '/api/parent/children/$childId/terms'
      : '/api/student/terms';
  final data = await _get(ref, path);
  return PortalTermsResult(
    terms: [
      for (final t in (data['terms'] as List? ?? []))
        PortalTerm.fromJson(Map<String, dynamic>.from(t as Map)),
    ],
    activeTermId: data['activeTermId']?.toString(),
  );
});

/// Term currently shown: the one picked from the drawer, else the server's
/// active term, else the newest term the learner has.
final portalScopeProvider = Provider.autoDispose<AsyncValue<PortalTerm?>>((ref) {
  final wanted = ref.watch(portalTermIdProvider);
  return ref.watch(portalTermsResultProvider).whenData((result) {
    final target = wanted ?? result.activeTermId;
    for (final term in result.terms) {
      if (term.id == target) return term;
    }
    return result.terms.isEmpty ? null : result.terms.first;
  });
});

/// Convenience for the page headers (`term.schoolYearName`, `term.termNumber`).
PortalTerm? portalScopeTerm(WidgetRef ref) =>
    ref.watch(portalScopeProvider).asData?.value;

// ---- Parent --------------------------------------------------------------

final parentChildrenProvider = FutureProvider.autoDispose<List<PortalChild>>((ref) async {
  final data = await _get(ref, '/api/parent/children');
  return [for (final c in (data['children'] as List? ?? [])) PortalChild.fromJson(Map<String, dynamic>.from(c as Map))];
});

/// Last child the parent picked, remembered per device. Cleared on logout with
/// the rest of `zentra.portal`.
final _storedChildIdProvider = StateProvider<String?>((ref) {
  final box = Hive.box(AppConfig.portalBox);
  final id = box.get('childId');
  return id is String && id.isNotEmpty ? id : null;
});

/// Effective child: the remembered one when it is still linked, otherwise the
/// first approved child. Never null while the parent has a linked learner, so
/// a first login lands on a dashboard without an extra tap.
final selectedChildProvider = Provider.autoDispose<String?>((ref) {
  final stored = ref.watch(_storedChildIdProvider);
  final children =
      ref.watch(parentChildrenProvider).asData?.value ?? const <PortalChild>[];
  if (children.isEmpty) return stored;
  if (stored != null && children.any((c) => c.studentId == stored)) {
    return stored;
  }
  return children.first.studentId;
});

void selectPortalChild(WidgetRef ref, String childId) {
  Hive.box(AppConfig.portalBox).put('childId', childId);
  ref.read(_storedChildIdProvider.notifier).state = childId;
}

final parentHomeProvider = FutureProvider.autoDispose.family<PortalHome, String>((ref, childId) async {
  return PortalHome.fromJson(await _get(ref, '/api/parent/children/$childId/home', query: _termQuery(ref)));
});

final parentGradesProvider = FutureProvider.autoDispose.family<PortalGrades, String>((ref, childId) async {
  return PortalGrades.fromJson(await _get(ref, '/api/parent/children/$childId/grades', query: _termQuery(ref)));
});

final parentAttendanceProvider = FutureProvider.autoDispose.family<PortalAttendance, String>((ref, childId) async {
  return PortalAttendance.fromJson(await _get(ref, '/api/parent/children/$childId/attendance', query: _termQuery(ref)));
});

final parentScheduleProvider = FutureProvider.autoDispose.family<PortalSchedule, String>((ref, childId) async {
  return PortalSchedule.fromJson(await _get(ref, '/api/parent/children/$childId/schedule', query: _termQuery(ref)));
});

final parentSessionsProvider = FutureProvider.autoDispose.family<List<PortalSession>, String>((ref, childId) async {
  final data = await _get(ref, '/api/parent/children/$childId/sessions');
  return [for (final s in (data['sessions'] as List? ?? [])) PortalSession.fromJson(Map<String, dynamic>.from(s as Map))];
});

final parentModulesProvider = FutureProvider.autoDispose.family<PortalModules, String>((ref, childId) async {
  final page = ref.watch(portalModulePageProvider);
  return PortalModules.fromJson(
    await _get(ref, '/api/parent/children/$childId/modules',
        query: {..._termQuery(ref), 'page': page, 'pageSize': 15}),
  );
});

final parentTermsProvider = FutureProvider.autoDispose.family<List<PortalTerm>, String>((ref, childId) async {
  final data = await _get(ref, '/api/parent/children/$childId/terms');
  return [for (final t in (data['terms'] as List? ?? [])) PortalTerm.fromJson(Map<String, dynamic>.from(t as Map))];
});
