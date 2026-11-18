import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/models.dart';

Map<String, dynamic> interventionMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};

class AdvisoryIntervention {
  AdvisoryIntervention(this.json);
  final Map<String, dynamic> json;
  String text(String key) => json[key]?.toString() ?? '';
  String get key => text('key');
  String get name => text('name');
  String get level => text('riskLevel');
  Map<String, dynamic>? get plan => json['intervention'] is Map
      ? interventionMap(json['intervention'])
      : null;
  Map<String, dynamic> get factors => interventionMap(json['factors']);
  DateTime? get detectedAt => DateTime.tryParse(text('detectedAt'));
}

class AdvisoryInterventions {
  AdvisoryInterventions(this.rows, this.sections, this.summary);
  final List<AdvisoryIntervention> rows;
  final List<Map<String, dynamic>> sections;
  final Map<String, dynamic> summary;
}

final advisoryInterventionsProvider =
    FutureProvider.autoDispose<AdvisoryInterventions>((ref) async {
      final auth = ref.watch(authProvider);
      final term = ref.watch(termProvider);
      if (!auth.loggedIn || auth.role != 'adviser') {
        throw ApiException(
          'FORBIDDEN',
          'Interventions are available to advisers only.',
        );
      }
      if (term == null) {
        throw ApiException('NO_TERM', 'Select a school year and term.');
      }
      final api = ref.watch(apiClientProvider);
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      try {
        Future<Map<String, dynamic>> page(int number) async => interventionMap(
          (await api.dio.get(
            '/api/teacher/advisory/interventions',
            queryParameters: {'page': number, 'pageSize': 16},
            options: Options(headers: {'x-zentra-fresh': '1'}),
            cancelToken: cancel,
          )).data,
        );
        final first = await page(1);
        if (first['data'] is! List) {
          throw const FormatException('Invalid intervention queue');
        }
        final pages = (first['totalPages'] as num?)?.toInt() ?? 1;
        final rows = <AdvisoryIntervention>[];
        void collect(Map<String, dynamic> response) {
          if (response['data'] is! List) {
            throw const FormatException('Invalid intervention queue');
          }
          for (final item in response['data'] as List) {
            rows.add(AdvisoryIntervention(interventionMap(item)));
          }
        }

        collect(first);
        for (var i = 2; i <= pages; i++) {
          collect(await page(i));
        }
        rows.sort((a, b) {
          final date = (b.detectedAt?.millisecondsSinceEpoch ?? -1).compareTo(
            a.detectedAt?.millisecondsSinceEpoch ?? -1,
          );
          if (date != 0) return date;
          const rank = {'High': 0, 'Moderate': 1, 'Low': 2};
          final level = (rank[a.level] ?? 9).compareTo(rank[b.level] ?? 9);
          if (level != 0) return level;
          final count = ((b.json['riskCount'] as num?) ?? 0).compareTo(
            (a.json['riskCount'] as num?) ?? 0,
          );
          return count != 0 ? count : a.name.compareTo(b.name);
        });
        return AdvisoryInterventions(rows, [
          for (final section in first['sections'] as List? ?? [])
            interventionMap(section),
        ], interventionMap(first['summary']));
      } on DioException catch (error) {
        throw api.toApiException(error);
      }
    });
