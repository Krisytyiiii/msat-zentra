// ADM Cases — advisory list of the teacher's ADM cases.
// GET /api/adm/my-cases (school-year scoped, status-only). Same fetch as web
// advisory/adm-cases (fetchMyAdmCases) + per-student filter in detail.
// Tapping a case opens a read-only, half-height ADM details sheet.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/shell.dart';
import '../../shared/widgets.dart';
import '../home/overview_data.dart';
import 'adm_case_card.dart';

final admCasesProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.dio.get('/api/adm/my-cases');
    final data = res.data;
    final List list = data is List
        ? data
        : (data is Map && data['cases'] is List ? data['cases'] as List : []);
    final cases = [for (final c in list) Map<String, dynamic>.from(c as Map)];
    cases.sort(
      (a, b) =>
          admOrderOf(a['stage']?.toString() ?? '')
              .compareTo(admOrderOf(b['stage']?.toString() ?? '')),
    );
    return cases;
  } on DioException catch (e) {
    throw api.toApiException(e);
  }
});

class AdmCasesPage extends ConsumerStatefulWidget {
  const AdmCasesPage({super.key});
  @override
  ConsumerState<AdmCasesPage> createState() => _AdmCasesState();
}

class _AdmCasesState extends ConsumerState<AdmCasesPage> {
  String _query = '', _stage = '', _eligibility = '', _approval = '';
  bool _descending = false;
  bool _detailsOpen = false;

  Future<void> _openDetails(
    BuildContext context,
    Map<String, dynamic> caseData,
  ) async {
    if (_detailsOpen) return;
    _detailsOpen = true;
    final navigation = ref.read(staffNavigationHiddenProvider.notifier);
    navigation.state = true;
    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.5,
        ),
        builder: (_) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.5,
            child: Consumer(
              builder: (context, ref, _) {
                final latest = ref.watch(admCasesProvider);
                return latest.when(
                  loading: () =>
                      const LoadingView(layout: SkeletonLayout.profile),
                  error: (error, _) => ErrorView(
                    message: error,
                    onRetry: () => ref.invalidate(admCasesProvider),
                  ),
                  data: (cases) {
                    final current = cases
                        .where((row) => row['id'] == caseData['id'])
                        .firstOrNull;
                    if (current == null) {
                      return const ZEmpty(
                        icon: Icons.folder_outlined,
                        title: 'ADM case unavailable',
                      );
                    }
                    return AdmCaseDetails(caseData: current);
                  },
                );
              },
            ),
          ),
        ),
      );
    } finally {
      navigation.state = false;
      _detailsOpen = false;
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white),
    child: ColoredBox(
      color: Colors.white,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Builder(builder: _content),
        ),
      ),
    ),
  );

  Widget _content(BuildContext context) {
    final cases = ref.watch(admCasesProvider);
    final term = ref.watch(termProvider);
    final summary = ref.watch(overviewSummaryProvider).asData?.value;
    final sectionName = summary?.sectionName;
    final sectionGradeLevel = summary?.sectionGradeLevel;
    final search = ScreenSearchScope.maybeOf(context);
    final query = (search?.query ?? _query).trim().toLowerCase();
    return cases.when(
      loading: () =>
          const Padding(padding: EdgeInsets.all(16), child: ZSkeletonList()),
      error: (e, _) => ErrorView(
        message: e,
        onRetry: () => ref.invalidate(admCasesProvider),
      ),
      data: (list) {
        final shown =
            list.where((c) {
              if (_stage.isNotEmpty && c['stage'] != _stage) return false;
              if (_eligibility.isNotEmpty &&
                  c['eligibilityStatus'] != _eligibility) {
                return false;
              }
              if (_approval == 'approved' && c['approved'] != true) {
                return false;
              }
              if (_approval == 'pending' && c['approved'] == true) return false;
              return '${c['studentName'] ?? ''} ${c['lrn'] ?? ''}'
                  .toLowerCase()
                  .contains(query);
            }).toList()..sort((a, b) {
              final first = (a['studentName'] ?? '').toString().toLowerCase();
              final second = (b['studentName'] ?? '').toString().toLowerCase();
              return _descending
                  ? second.compareTo(first)
                  : first.compareTo(second);
            });
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(admCasesProvider),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 120),
            children: [
              const ZContentHeader(
                title: 'ADM Cases',
                icon: Icons.folder_shared_outlined,
                description: 'Monitor ADM cases for your advisees across the selected school year.',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (term != null) ...[
                    ZScopePill(
                      text: term.schoolYearName,
                      kind: ScopePillKind.schoolYear,
                      compact: true,
                    ),
                    ZScopePill(
                      text: 'Term ${term.termNumber}',
                      kind: ScopePillKind.term,
                      compact: true,
                    ),
                  ],
                  if (sectionName != null && sectionName.isNotEmpty)
                    ZScopePill(
                      text: [
                        if (sectionGradeLevel != null)
                          sectionGradeLevel.replaceFirst(
                            RegExp(r'^Grade\s*', caseSensitive: false),
                            'G',
                          ),
                        sectionName,
                      ].where((value) => value.isNotEmpty).join(' · '),
                      kind: ScopePillKind.grade,
                      label: 'Grade and section',
                      compact: true,
                    ),
                ],
              ),
              const SizedBox(height: 16),
              _counters(list),
              const SizedBox(height: 14),
              if (search == null) ...[
                ZSearchField(
                  hint: 'Filter by name or LRN',
                  onChanged: (value) => setState(() => _query = value),
                ),
                const SizedBox(height: 12),
              ],
              const Text(
                'FILTER ADM CASES',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  color: Color(0xFF929FB5),
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: AdmCaseFilterPill(
                      label: 'Stage',
                      value: _stage,
                      options: {
                        '': 'All stages',
                        for (final stage in admStageOrder.keys)
                          stage: _label(stage),
                      },
                      update: (v) => setState(() => _stage = v),
                      primary: true,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: AdmCaseFilterPill(
                      label: 'Eligibility',
                      value: _eligibility,
                      options: {
                        '': 'All',
                        for (final value
                            in list
                                .map((c) => c['eligibilityStatus']?.toString())
                                .whereType<String>()
                                .where((v) => v.isNotEmpty)
                                .toSet())
                          value: _label(value),
                      },
                      update: (v) => setState(() => _eligibility = v),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: AdmCaseFilterPill(
                      label: 'Approval',
                      value: _approval,
                      options: const {
                        '': 'All',
                        'pending': 'Pending',
                        'approved': 'Approved',
                      },
                      update: (v) => setState(() => _approval = v),
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Showing ${shown.length} records',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF9999A6),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => setState(() => _descending = !_descending),
                    icon: const Icon(LucideIcons.listFilter, size: 14),
                    label: Text(
                      _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                      style: const TextStyle(fontSize: 12),
                    ),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFF334155),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                  ),
                ],
              ),
              if (shown.isEmpty)
                ZEmpty(
                  icon: list.isEmpty
                      ? Icons.folder_shared_outlined
                      : Icons.search,
                  title: list.isEmpty ? 'No ADM cases' : 'No ADM cases match',
                  subtitle: list.isEmpty
                      ? 'Referred students under ADM monitoring appear here with their stage.'
                      : 'Try a different search or filter.',
                ),
              for (final c in shown) ...[
                AdmCaseCard(caseData: c, onTap: () => _openDetails(context, c)),
                const SizedBox(height: 8),
              ],
            ],
          ),
        );
      },
    );
  }

  String _label(String value) => value
      .split('_')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');

  Widget _counters(List<Map<String, dynamic>> list) {
    final counts = [
      (
        'Pending',
        list
            .where((c) => c['approved'] != true && c['stage'] != 'completion')
            .length,
      ),
      ('Approved', list.where((c) => c['approved'] == true).length),
      ('Completed', list.where((c) => c['stage'] == 'completion').length),
    ];
    return AdmCaseCounters(counts: counts);
  }
}
