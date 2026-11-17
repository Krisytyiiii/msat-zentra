import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

final bamaServiceProvider = Provider(
  (ref) => BamaService(ref.watch(apiClientProvider)),
);

/// Same REST contracts as web services/anecdotal/records.service.ts.
/// The historically named grade-flags endpoint supplies anecdotal options too.
class BamaService {
  const BamaService(this.api);
  final ApiClient api;

  Future<Map<String, dynamic>> fetchOptions() async {
    final response = await api.dio.get('/api/teacher/grade-flags/options');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> createRecord(
    Map<String, dynamic> payload,
  ) async {
    final response = await api.dio.post('/api/anecdotal', data: payload);
    return Map<String, dynamic>.from(response.data as Map);
  }
}
