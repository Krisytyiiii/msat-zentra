import 'package:dio/dio.dart';

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../core/notifications.dart' show ZNotification;
import '../../shared/models.dart';
import 'coordinator_models.dart';

typedef AdmListQuery = ({String desk, int page, String q, String filter});

// Keep commands alive across dialogs/routes, but recreate on every auth hand-off.
// A read-only command consumer must not lose its repository mid-confirmation.
final coordinatorRepositoryProvider = Provider<CoordinatorRepository>((ref) {
  final auth = ref.watch(authProvider);
  if (!auth.loggedIn || auth.role != 'adm_coordinator') {
    throw ApiException('FORBIDDEN', 'Sign in as an ADM coordinator.');
  }
  final repo = CoordinatorRepository(ref.watch(apiClientProvider));
  ref.onDispose(repo.dispose);
  return repo;
});

final coordinatorDashboardProvider = FutureProvider.autoDispose<AdmJson>(
  (ref) => ref.watch(coordinatorRepositoryProvider).dashboard(),
);
final coordinatorProfileProvider = FutureProvider.autoDispose<AdmJson>(
  (ref) => ref.watch(coordinatorRepositoryProvider).profile(),
);
final coordinatorInboxProvider =
    FutureProvider.autoDispose<List<ZNotification>>(
      (ref) => ref.watch(coordinatorRepositoryProvider).inbox(),
    );

/// The server-managed school scope shown on the desk header. Coordinator
/// requests never steer a term; this resolves the active school year and the
/// term whose dates contain today (Philippine time).
class CoordinatorScope {
  const CoordinatorScope({this.schoolYearName = '', this.termNumber});
  final String schoolYearName;
  final int? termNumber;
}

final coordinatorScopeProvider = FutureProvider.autoDispose<CoordinatorScope>((
  ref,
) async {
  final years = await ref.watch(schoolYearsProvider.future);
  final active =
      years.where((y) => y.isActive).firstOrNull ?? years.firstOrNull;
  if (active == null) return const CoordinatorScope();
  final now = admPhilippineNow();
  final day = DateTime(now.year, now.month, now.day);
  Term? current;
  for (final term in active.terms) {
    final start = term.startDate;
    final end = term.endDate;
    if (start == null || end == null) continue;
    if (!day.isBefore(DateTime(start.year, start.month, start.day)) &&
        !day.isAfter(DateTime(end.year, end.month, end.day))) {
      current = term;
      break;
    }
  }
  final term = current ?? active.terms.firstOrNull;
  return CoordinatorScope(
    schoolYearName: active.name,
    termNumber: term?.termNumber,
  );
});
final coordinatorListProvider = FutureProvider.autoDispose
    .family<AdmPage<AdmCaseRow>, AdmListQuery>(
      (ref, query) => ref.watch(coordinatorRepositoryProvider).cases(query),
    );
final coordinatorDevicesProvider = FutureProvider.autoDispose
    .family<AdmPage<AdmDevice>, AdmListQuery>(
      (ref, query) => ref.watch(coordinatorRepositoryProvider).devices(query),
    );
final coordinatorDeviceProvider = FutureProvider.autoDispose
    .family<AdmDevice?, String>(
      (ref, id) => ref.watch(coordinatorRepositoryProvider).device(id),
    );
final coordinatorCaseProvider = FutureProvider.autoDispose
    .family<AdmCaseDetail, String>(
      (ref, id) => ref.watch(coordinatorRepositoryProvider).caseFile(id),
    );
final coordinatorMonitoringProvider = FutureProvider.autoDispose
    .family<AdmMonitoring, String>(
      (ref, id) => ref.watch(coordinatorRepositoryProvider).monitoring(id),
    );
final coordinatorAnecdotalPdfProvider = FutureProvider.autoDispose
    .family<Uint8List, String>(
      (ref, id) => ref.watch(coordinatorRepositoryProvider).anecdotalPdf(id),
    );
final coordinatorHistoryProvider = FutureProvider.autoDispose
    .family<List<AdmJson>, ({String profileId, String referralId})>(
      (ref, ids) => ref
          .watch(coordinatorRepositoryProvider)
          .history(ids.profileId, ids.referralId),
    );

class CoordinatorRepository {
  CoordinatorRepository(this.api);
  final ApiClient api;
  final _cancel = CancelToken();
  bool _disposed = false;
  DateTime? _freshUntil;

  void dispose() {
    _disposed = true;
    _cancel.cancel('Coordinator session ended');
  }

  Future<Object?> _get(String path, [AdmJson? query]) async {
    if (_disposed) throw ApiException('SESSION_EXPIRED', 'Sign in again.');
    try {
      final response = await api.dio.get<Object?>(
        path,
        queryParameters: query,
        cancelToken: _cancel,
        options: Options(
          headers: {
            if (_freshUntil?.isAfter(DateTime.now()) == true)
              'x-zentra-fresh': '1',
          },
        ),
      );
      if (_disposed) {
        throw ApiException(
          'SESSION_CHANGED',
          'Your session changed. Reopen the workspace.',
        );
      }
      return response.data;
    } on DioException catch (e) {
      throw api.toApiException(e);
    }
  }

  Future<void> _write(String method, String path, Object body) async {
    if (_disposed) throw ApiException('SESSION_EXPIRED', 'Sign in again.');
    try {
      await api.dio.request<Object?>(
        path,
        data: body,
        cancelToken: _cancel,
        options: Options(method: method),
      );
      // Existing server cache invalidation can be fire-and-forget.
      _freshUntil = DateTime.now().add(const Duration(seconds: 10));
    } on DioException catch (e) {
      throw api.toApiException(e);
    }
  }

  Future<AdmJson> dashboard() async => admMap(await _get('/api/adm/dashboard'));
  Future<AdmJson> profile() async =>
      admMap(await _get('/api/adm/settings/profile'));
  Future<List<ZNotification>> inbox() async {
    final data = await _get('/api/notifications/');
    final rows = data is List
        ? admMaps(data)
        : admMaps(admMap(data)['notifications']);
    return rows.map(ZNotification.fromJson).toList();
  }

  Future<void> readNotification(String id) =>
      _write('POST', '/api/notifications/read/${Uri.encodeComponent(id)}', {});
  Future<void> readAllNotifications() =>
      _write('POST', '/api/notifications/read-all', {});
  Future<void> saveProfile(String name) =>
      _write('PATCH', '/api/adm/settings/profile', {'fullName': name.trim()});
  Future<void> savePhoto(List<int> bytes, String mime) {
    final data = 'data:$mime;base64,${base64Encode(bytes)}';
    if (![
          'image/png',
          'image/jpeg',
          'image/gif',
          'image/webp',
        ].contains(mime) ||
        bytes.isEmpty ||
        data.length > 2800000) {
      throw ApiException(
        'PHOTO_INVALID',
        'Choose a PNG, JPG, GIF or WEBP photo smaller than 2 MB.',
      );
    }
    return _write('POST', '/api/adm/settings/photo', {'photoUrl': data});
  }

  Future<AdmPage<AdmCaseRow>> cases(AdmListQuery query) async {
    final candidates = query.desk == 'deviceCandidates';
    final approved =
        candidates ||
        (query.desk == 'certifications' && query.filter == 'approved');
    return AdmPage.fromJson(
      await _get(approved ? '/api/adm/approvals' : '/api/adm/referrals/all', {
        // The coordinator lists render the full cohort; only the device
        // candidate picker still pages.
        if (candidates) 'page': query.page,
        if (candidates) 'pageSize': 15,
        if (!candidates) 'all': '1',
        if (query.q.trim().isNotEmpty) 'q': query.q.trim(),
        if (!approved && query.filter.isNotEmpty) 'stage': query.filter,
      }),
      AdmCaseRow.fromJson,
    );
  }

  Future<AdmPage<AdmDevice>> devices(AdmListQuery query) async =>
      AdmPage.fromJson(
        await _get('/api/adm/devices', {
          if (query.q.trim().isNotEmpty) 'q': query.q.trim(),
          if (query.filter.isNotEmpty) 'status': query.filter,
        }),
        AdmDevice.fromJson,
      );

  /// Deep-link lookup: the devices endpoint returns the full list when no
  /// paging params are sent.
  Future<AdmDevice?> device(String id) async {
    final page = AdmPage.fromJson(
      await _get('/api/adm/devices'),
      AdmDevice.fromJson,
    );
    return page.rows.where((device) => device.id == id).firstOrNull;
  }

  Future<AdmCaseDetail> caseFile(String id) async => AdmCaseDetail.fromJson(
    admMap(await _get('/api/adm/case/${Uri.encodeComponent(id)}')),
  );
  Future<AdmMonitoring> monitoring(String id) async => AdmMonitoring.fromJson(
    admMap(await _get('/api/adm/cases/${Uri.encodeComponent(id)}')),
  );
  Future<Uint8List> anecdotalPdf(String id) async {
    if (_disposed) throw ApiException('SESSION_EXPIRED', 'Sign in again.');
    try {
      final res = await api.dio.get<List<int>>(
        '/api/anecdotal/${Uri.encodeComponent(id)}/pdf',
        cancelToken: _cancel,
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(res.data ?? []);
    } on DioException catch (e) {
      throw api.toApiException(e);
    }
  }

  Future<List<AdmJson>> history(String profileId, String referralId) async =>
      admMaps(
        admMap(
          await _get('/api/adm/history', {
            if (profileId.isNotEmpty) 'profileId': profileId,
            if (referralId.isNotEmpty) 'referralId': referralId,
          }),
        )['events'],
      );
  Future<List<AdmJson>> staff(AdmCaseDetail detail) async => admMaps(
    admMap(
      await _get('/api/adm/staff', {
        if (detail.profileId.isNotEmpty)
          'profileId': detail.profileId
        else
          'referralId': detail.referralId,
      }),
    )['staff'],
  );

  Future<void> createProfile(String referralId) =>
      _write('POST', '/api/adm/profiles', {'referralId': referralId});
  Future<void> certify(String profileId, String recommendation) => _write(
    'POST',
    '/api/adm/${Uri.encodeComponent(profileId)}/certification',
    {'recommendation': recommendation.trim()},
  );
  Future<void> endorse(String profileId) => _write(
    'PATCH',
    '/api/adm/${Uri.encodeComponent(profileId)}/stage',
    {'stage': 'principal_approval'},
  );
  Future<void> completeCase(String profileId) async {
    final latest = await monitoring(profileId);
    if (latest.header['stage'] != 'enrollment_monitoring' ||
        admText(latest.header['approvedAt']).isEmpty ||
        latest.modules.isEmpty ||
        latest.modules.any((m) => m['submitted'] != true)) {
      throw ApiException(
        'ADM_MODULES_INCOMPLETE',
        'Refresh the case and confirm that all released modules are submitted.',
      );
    }
    await _write('PATCH', '/api/adm/${Uri.encodeComponent(profileId)}/stage', {
      'stage': 'completion',
    });
  }

  Future<void> book(AdmCaseDetail detail, AdmJson body) => _write(
    'POST',
    detail.profileId.isNotEmpty
        ? '/api/adm/${Uri.encodeComponent(detail.profileId)}/meetings'
        : '/api/adm/referral/${Uri.encodeComponent(detail.referralId)}/meetings',
    body,
  );
  Future<void> reschedule(String meetingId, AdmJson body) => _write(
    'PATCH',
    '/api/adm/meetings/${Uri.encodeComponent(meetingId)}/reschedule',
    body,
  );
  Future<void> outcome(String meetingId, AdmJson body) => _write(
    'PATCH',
    '/api/adm/meetings/${Uri.encodeComponent(meetingId)}',
    body,
  );
  Future<void> upload(
    String meetingId,
    List<({String name, String mime, List<int> bytes})> files,
  ) {
    if (files.isEmpty ||
        files.length > 5 ||
        files.any(
          (f) =>
              f.bytes.length > 5 * 1024 * 1024 ||
              !['image/jpeg', 'image/png', 'image/webp'].contains(f.mime),
        )) {
      throw ApiException(
        'UPLOAD_INVALID',
        'Choose up to five JPG, PNG or WEBP images, 5 MB each.',
      );
    }
    return _write(
      'POST',
      '/api/adm/meetings/${Uri.encodeComponent(meetingId)}/attachments',
      FormData.fromMap({
        'files': [
          for (final file in files)
            MultipartFile.fromBytes(
              file.bytes,
              filename: file.name,
              contentType: DioMediaType.parse(file.mime),
            ),
        ],
      }),
    );
  }

  Future<void> removeAttachment(String meetingId, String attachmentId) =>
      _write(
        'DELETE',
        '/api/adm/meetings/${Uri.encodeComponent(meetingId)}/attachments/'
            '${Uri.encodeComponent(attachmentId)}',
        {},
      );

  Future<void> issueDevice(
    AdmCaseRow learner,
    String type,
    String serial,
    String notes,
  ) async {
    // Recheck the authoritative approvals list rather than trusting a stale picker.
    final page = await cases((
      desk: 'deviceCandidates',
      page: 1,
      q: learner.lrn,
      filter: '',
    ));
    if (!page.rows.any(
      (r) =>
          r.id == learner.id && r.approvedBy.isNotEmpty && r.devicesIssued == 0,
    )) {
      throw ApiException(
        'DEVICE_NOT_ELIGIBLE',
        'Refresh the approved learner list before issuing a device.',
      );
    }
    await _write('POST', '/api/adm/devices/issue', {
      'admLearnerProfileId': learner.id,
      'deviceType': type.trim(),
      'deviceSerial': serial.trim(),
      'conditionNotes': notes.trim(),
    });
  }

  Future<void> returnDevice(String id) =>
      _write('POST', '/api/adm/devices/${Uri.encodeComponent(id)}/return', {});
}
