import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import 'interventions_data.dart';

String interventionLabel(Object? value) => (value?.toString() ?? '')
    .split('_')
    .map(
      (part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}',
    )
    .join(' ');

String interventionDate(Object? value, {bool time = false}) {
  final date = DateTime.tryParse(value?.toString() ?? '');
  if (date == null) return 'Not recorded';
  final ph = date.toUtc().add(const Duration(hours: 8));
  return DateFormat(time ? 'MMM d, y · h:mm a' : 'MMM d, y').format(ph);
}

class InterventionsPage extends ConsumerStatefulWidget {
  const InterventionsPage({super.key});
  @override
  ConsumerState<InterventionsPage> createState() => _InterventionsPageState();
}

class _InterventionsPageState extends ConsumerState<InterventionsPage>
    with WidgetsBindingObserver {
  Timer? _timer;
  String _level = '', _factor = '', _outcome = '', _section = '', _query = '';
  int _page = 1;
  String _lastQuery = '';
  bool _refreshing = false;
  bool get _visible =>
      mounted &&
      WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused &&
      (ModalRoute.of(context)?.isCurrent ?? true) &&
      TickerMode.valuesOf(context).enabled;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_visible) unawaited(_refresh());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _visible) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final refreshed = await ref.refresh(advisoryInterventionsProvider.future);
      if (mounted && refreshed.rows.isEmpty) setState(() => _page = 1);
    } catch (_) {
      // The provider exposes a retryable, user-safe error state.
    } finally {
      _refreshing = false;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Widget _filter(
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> update,
  ) => DropdownButtonFormField<String>(
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: [
      for (final option in options.entries)
        DropdownMenuItem(
          value: option.key,
          child: Text(option.value, overflow: TextOverflow.ellipsis),
        ),
    ],
    onChanged: (next) => setState(() {
      update(next ?? '');
      _page = 1;
    }),
  );

  @override
  Widget build(BuildContext context) {
    final search = ScreenSearchScope.maybeOf(context);
    final query = (search?.query ?? _query).trim().toLowerCase();
    if (query != _lastQuery) {
      _lastQuery = query;
      _page = 1;
    }
    final data = ref.watch(advisoryInterventionsProvider);
    return data.when(
      loading: () => const ZSkeletonList(),
      error: (error, _) => ErrorView(message: error, onRetry: _refresh),
      data: (board) {
        final rows = board.rows
            .where(
              (row) =>
                  (_section.isEmpty || row.text('sectionId') == _section) &&
                  (_level.isEmpty || row.level == _level) &&
                  (_factor.isEmpty || row.factors[_factor] == true) &&
                  (_outcome.isEmpty ||
                      (_outcome == 'none'
                          ? row.plan == null
                          : row.plan?['outcomeStatus'] == _outcome)) &&
                  '${row.name} ${row.text('lrn')} ${row.text('section')}'
                      .toLowerCase()
                      .contains(query),
            )
            .toList();
        final pages = (rows.length / 15).ceil().clamp(1, 100000);
        final page = _page.clamp(1, pages);
        final visible = rows.skip((page - 1) * 15).take(15);
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            children: [
              Text(
                'Interventions',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              const Text(
                'Read-only follow-up for your advisees, recorded by the guidance desk.',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final entry in board.summary.entries)
                    ZStatusPill(
                      text:
                          '${interventionLabel(entry.key == 'noPlan' ? 'no_plan' : entry.key)}: ${entry.value}',
                      tone: entry.key == 'high'
                          ? StatusTone.red
                          : entry.key == 'moderate'
                          ? StatusTone.amber
                          : StatusTone.neutral,
                    ),
                ],
              ),
              if (search == null) ...[
                const SizedBox(height: 12),
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Search name, LRN or section',
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ],
              const SizedBox(height: 12),
              _filter('Risk level', _level, {
                '': 'All at-risk',
                'High': 'High risk',
                'Moderate': 'Moderate risk',
              }, (v) => _level = v),
              const SizedBox(height: 8),
              _filter('Factor', _factor, {
                '': 'All factors',
                'academic': 'Academic',
                'attendance': 'Attendance',
                'behavioral': 'Behavioral',
              }, (v) => _factor = v),
              const SizedBox(height: 8),
              _filter('State', _outcome, {
                '': 'All states',
                'ongoing': 'Ongoing',
                'resolved': 'Resolved',
                'unresolved': 'Unresolved',
                'none': 'No plan yet',
              }, (v) => _outcome = v),
              if (board.sections.length > 1) ...[
                const SizedBox(height: 8),
                _filter('Section', _section, {
                  '': 'All sections',
                  for (final section in board.sections)
                    section['id'].toString(): section['name'].toString(),
                }, (v) => _section = v),
              ],
              const SizedBox(height: 16),
              if (rows.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    board.rows.isEmpty
                        ? 'No advisees needing intervention in this term.'
                        : 'No matching advisees. Adjust your filters.',
                  ),
                ),
              for (final row in visible)
                Card(
                  child: InkWell(
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      builder: (_) => SafeArea(
                        child: SizedBox(
                          height: MediaQuery.sizeOf(context).height * 0.85,
                          child: InterventionDetails(rowKey: row.key),
                        ),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row.name,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          const SizedBox(height: 8),
                          _identity(row),
                          const SizedBox(height: 8),
                          Text(
                            'Detected ${interventionDate(row.text('detectedAt'))}',
                          ),
                          Text(
                            row.plan == null
                                ? 'No plan yet'
                                : interventionLabel(
                                    row.plan?['recommendedAction'],
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    tooltip: 'Previous page',
                    onPressed: page > 1
                        ? () => setState(() => _page = page - 1)
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Expanded(
                    child: Text(
                      'Page $page of $pages · ${rows.length} learners',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: page < pages
                        ? () => setState(() => _page = page + 1)
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

Widget _identity(AdvisoryIntervention row) => Wrap(
  spacing: 6,
  runSpacing: 6,
  children: [
    ZStatusPill(text: row.text('lrn'), label: 'LRN'),
    ZStatusPill(
      text: row.text('section'),
      label: 'Section',
      tone: StatusTone.violet,
    ),
    ZStatusPill(
      text: row.text('gradeLevel'),
      label: 'Grade level',
      tone: StatusTone.blue,
    ),
    RiskBadge(level: row.level),
    for (final factor in row.factors.entries)
      if (factor.value == true)
        ZStatusPill(
          text: interventionLabel(factor.key),
          tone: factor.key == 'academic'
              ? StatusTone.amber
              : factor.key == 'attendance'
              ? StatusTone.sky
              : StatusTone.rose,
        ),
    ZStatusPill(
      text: row.plan == null
          ? 'No plan yet'
          : interventionLabel(row.plan?['outcomeStatus']),
      tone: row.plan == null
          ? StatusTone.neutral
          : statusTone(row.plan?['outcomeStatus']?.toString() ?? ''),
    ),
  ],
);

class InterventionDetails extends ConsumerWidget {
  const InterventionDetails({super.key, required this.rowKey});
  final String rowKey;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(advisoryInterventionsProvider);
    return board.when(
      loading: () => const LoadingView(),
      error: (e, _) => ErrorView(
        message: e,
        onRetry: () => ref.invalidate(advisoryInterventionsProvider),
      ),
      data: (data) {
        final row = data.rows.where((r) => r.key == rowKey).firstOrNull;
        if (row == null) {
          return const Center(
            child: Text(
              'This learner is no longer in the selected term’s queue.',
            ),
          );
        }
        final plan = row.plan;
        Widget fact(String label, Object? value) => Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(
            '$label\n${value == null || value.toString().isEmpty ? 'Not recorded' : value}',
          ),
        );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    row.name,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            _identity(row),
            fact('Detected', interventionDate(row.text('detectedAt'))),
            if (plan == null)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: Text(
                  'No plan yet. Guidance has not opened an intervention for this learner.',
                ),
              )
            else ...[
              fact(
                'Recommended action',
                interventionLabel(plan['recommendedAction']),
              ),
              fact('Assigned to', plan['assignee']),
              fact('Assigned', interventionDate(plan['assignedAt'])),
              fact('Approval', interventionLabel(plan['approvalStatus'])),
              fact('Priority', interventionLabel(plan['priority'])),
              fact('Intake notes', plan['intakeNotes']),
              fact('Outcome', interventionLabel(plan['outcomeStatus'])),
              fact('Outcome notes', plan['outcomeNotes']),
              const SizedBox(height: 20),
              Text('Sessions', style: Theme.of(context).textTheme.titleMedium),
              if ((plan['sessions'] as List? ?? []).isEmpty)
                const Text('No sessions recorded.'),
              for (final raw in plan['sessions'] as List? ?? [])
                Builder(
                  builder: (_) {
                    final session = interventionMap(raw);
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(interventionLabel(session['sessionType'])),
                            ZStatusPill(
                              text: interventionLabel(session['status']),
                              tone: statusTone(
                                session['status']?.toString() ?? '',
                              ),
                            ),
                            fact(
                              'Scheduled (Philippine time)',
                              interventionDate(
                                session['scheduledAt'],
                                time: true,
                              ),
                            ),
                            fact('Venue', session['venue']),
                            fact('Session notes', session['sessionNotes']),
                            fact('Outcome', session['outcome']),
                            if (session['cancelReason'] != null)
                              fact(
                                'Cancellation reason',
                                session['cancelReason'],
                              ),
                            if (session['completedAt'] != null)
                              fact(
                                'Completed',
                                interventionDate(
                                  session['completedAt'],
                                  time: true,
                                ),
                              ),
                            fact(
                              'Attachments',
                              session['attachmentsCount'] ?? 0,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
            ],
          ],
        );
      },
    );
  }
}
