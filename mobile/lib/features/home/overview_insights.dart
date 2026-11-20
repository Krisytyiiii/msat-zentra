import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';

int _count(Object? value) => value is num && value >= 0 ? value.toInt() : 0;

class AttendanceInsightDay {
  AttendanceInsightDay(Map<String, dynamic> json)
    : date = json['date']?.toString() ?? '',
      label = json['label']?.toString() ?? '',
      counts = {
        'Present': _count(json['present']),
        'Late': _count(json['late']),
        'Absent': _count(json['absent']),
        'Excused': _count(json['excused']),
      },
      rate = json['rate'] is num ? (json['rate'] as num).toDouble() : null;
  final String date, label;
  final Map<String, int> counts;
  final double? rate;
  int get marked => counts.values.fold(0, (a, b) => a + b);
}

class OverviewInsights {
  OverviewInsights.fromJson(Map<String, dynamic> json)
    : population = json['populationLabel']?.toString() ?? 'learners',
      risk = {
        for (final key in ['high', 'moderate', 'low', 'unassessed'])
          key: _count((json['riskMix'] as Map?)?[key]),
      },
      days = [
        for (final raw in json['series'] as List? ?? [])
          AttendanceInsightDay(Map<String, dynamic>.from(raw as Map)),
      ];
  final String population;
  final Map<String, int> risk;
  final List<AttendanceInsightDay> days;
}

final overviewInsightsProvider = FutureProvider.autoDispose<OverviewInsights>((
  ref,
) async {
  final auth = ref.watch(authProvider);
  final term = ref.watch(termProvider);
  if (!auth.loggedIn || term == null) {
    throw ApiException(
      'NO_SCOPE',
      'Sign in and select a term to view insights.',
    );
  }
  final api = ref.watch(apiClientProvider);
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  try {
    final response = await api.dio.get(
      '/api/teacher/overview/insights',
      queryParameters: {'days': 14},
      cancelToken: cancel,
    );
    if (response.data is! Map ||
        response.data['riskMix'] is! Map ||
        response.data['series'] is! List) {
      throw const FormatException('Invalid overview insights');
    }
    return OverviewInsights.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  } on DioException catch (error) {
    throw api.toApiException(error);
  }
});

const _riskTones = {
  'high': StatusTone.red,
  'moderate': StatusTone.amber,
  'low': StatusTone.green,
  'unassessed': StatusTone.neutral,
};
const _attendanceTones = {
  'Present': StatusTone.green,
  'Late': StatusTone.amber,
  'Absent': StatusTone.red,
  'Excused': StatusTone.blue,
};
String _label(String value) => '${value[0].toUpperCase()}${value.substring(1)}';

class OverviewRiskMix extends StatelessWidget {
  const OverviewRiskMix({super.key, required this.insights});
  final OverviewInsights insights;
  @override
  Widget build(BuildContext context) {
    final total = insights.risk.values.fold(0, (a, b) => a + b);
    if (total == 0) return const Text('No risk snapshots yet.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Current risk level of your ${insights.population}.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        Semantics(
          label: insights.risk.entries
              .map((e) => '${_label(e.key)}: ${e.value}')
              .join(', '),
          child: ExcludeSemantics(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: SizedBox(
                height: 8,
                child: Row(
                  children: [
                    for (final item in insights.risk.entries)
                      if (item.value > 0)
                        Expanded(
                          flex: item.value,
                          child: ColoredBox(
                            color: statusColors(
                              _riskTones[item.key]!,
                              Theme.of(context),
                            ).foreground,
                            child: const SizedBox.expand(),
                          ),
                        ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final item in insights.risk.entries)
              ZStatusPill(
                text:
                    '${_label(item.key)} ${item.value} · ${(item.value / total * 100).round()}%',
                tone: _riskTones[item.key]!,
              ),
          ],
        ),
      ],
    );
  }
}

class OverviewDailyAttendance extends StatelessWidget {
  const OverviewDailyAttendance({super.key, required this.insights});
  final OverviewInsights insights;
  @override
  Widget build(BuildContext context) {
    if (insights.days.isEmpty) {
      return const Text('No school days in range yet.');
    }
    final maximum = insights.days.fold(
      1,
      (n, day) => day.marked > n ? day.marked : n,
    );
    final totals = {
      for (final key in _attendanceTones.keys)
        key: insights.days.fold(0, (n, day) => n + day.counts[key]!),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Last ${insights.days.length} school days · swipe to see every day.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final day in insights.days)
                Semantics(
                  label:
                      '${day.date}: ${day.counts.entries.map((e) => '${e.key} ${e.value}').join(', ')}, ${day.rate == null ? 'no marks' : '${day.rate!.round()} percent'}',
                  child: Container(
                    width: 64,
                    margin: const EdgeInsets.only(right: 10),
                    padding: const EdgeInsets.symmetric(
                      vertical: 12,
                      horizontal: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          day.rate == null
                              ? 'No marks'
                              : '${day.rate!.round()}%',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 48,
                          child: Align(
                            alignment: Alignment.bottomCenter,
                            child: SizedBox(
                              width: 28,
                              height: day.marked == 0
                                  ? 2
                                  : 48 * day.marked / maximum,
                              child: day.marked == 0
                                  ? ColoredBox(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .outlineVariant,
                                    )
                                  : Column(
                                      children: [
                                        for (final entry in day.counts.entries)
                                          if (entry.value > 0)
                                            Expanded(
                                              flex: entry.value,
                                              child: ColoredBox(
                                                color: statusColors(
                                                  _attendanceTones[entry.key]!,
                                                  Theme.of(context),
                                                ).foreground,
                                                child: const SizedBox.expand(),
                                              ),
                                            ),
                                      ],
                                    ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          day.label,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in totals.entries)
              ZStatusPill(
                text: '${entry.key} ${entry.value}',
                tone: _attendanceTones[entry.key]!,
              ),
          ],
        ),
      ],
    );
  }
}
