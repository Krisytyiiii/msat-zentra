import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import '../home/overview_data.dart';
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
  String _level = '', _factor = '', _outcome = '', _section = '';
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
      if (mounted) {
        setState(() {
          if (refreshed.rows.isEmpty) _page = 1;
        });
      }
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
    BuildContext context,
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> update, {
    bool primary = false,
  }) {
    final blue = statusColors(StatusTone.blue, Theme.of(context));
    final active = primary || value.isNotEmpty;
    final text = label == 'Risk level'
        ? options[value]!
        : '$label: ${options[value]}';
    return PopupMenuButton<String>(
      tooltip: label,
      initialValue: value,
      onSelected: (next) => setState(() {
        update(next);
        _page = 1;
      }),
      itemBuilder: (_) => [
        for (final option in options.entries)
          PopupMenuItem(value: option.key, child: Text(option.value)),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Center(
          widthFactor: 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: active ? blue.background : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active
                    ? blue.foreground.withValues(alpha: 0.25)
                    : const Color(0xFFE5E5EA),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    text,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: active ? blue.foreground : const Color(0xFF7185A4),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: active ? blue.foreground : const Color(0xFF7185A4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white);
    return Theme(
      data: theme,
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
  }

  Widget _content(BuildContext context) {
    final search = ScreenSearchScope.maybeOf(context);
    final query = (search?.query ?? '').trim().toLowerCase();
    if (query != _lastQuery) {
      _lastQuery = query;
      _page = 1;
    }
    final data = ref.watch(advisoryInterventionsProvider);
    final term = ref.watch(termProvider);
    final overview = ref.watch(overviewSummaryProvider).asData?.value;
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
                  '${row.name} ${row.key} ${row.plan?['id'] ?? ''} ${row.text('lrn')} ${row.text('section')}'
                      .toLowerCase()
                      .contains(query),
            )
            .toList();
        final pages = (rows.length / 15).ceil().clamp(1, 100000);
        final page = _page.clamp(1, pages);
        final visible = rows.skip((page - 1) * 15).take(15);
        final sectionName = _section.isNotEmpty
            ? board.sections
                  .where((s) => s['id'].toString() == _section)
                  .map((s) => s['name'].toString())
                  .firstOrNull
            : board.sections.length == 1
            ? board.sections.first['name']?.toString()
            : board.sections.isEmpty
            ? overview?.sectionName
            : 'All sections';
        final high = board.rows.where((row) => row.level == 'High').length;
        final moderate = board.rows
            .where((row) => row.level == 'Moderate')
            .length;
        final ongoing = board.rows
            .where((row) => row.plan?['outcomeStatus'] == 'ongoing')
            .length;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 120),
            children: [
              Text(
                'Interventions',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Read-only follow-up for your advisees, recorded by the guidance desk.',
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: const Color(0xFF81818F), height: 1.5),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (term != null) ...[
                    ZStatusPill(
                      text: term.schoolYearName,
                      tone: StatusTone.blue,
                    ),
                    ZStatusPill(
                      text: 'Term ${term.termNumber}',
                      tone: StatusTone.amber,
                    ),
                  ],
                  if (sectionName != null && sectionName.isNotEmpty)
                    ZStatusPill(text: sectionName, tone: StatusTone.violet),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9F9FA),
                  border: Border.all(color: const Color(0xFFE8E8ED)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '$high\nHigh',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
                          color: statusColors(
                            StatusTone.red,
                            Theme.of(context),
                          ).foreground,
                        ),
                      ),
                    ),
                    const SizedBox(
                      height: 30,
                      child: VerticalDivider(width: 16),
                    ),
                    Expanded(
                      child: Text(
                        '$moderate\nModerate',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
                          color: statusColors(
                            StatusTone.amber,
                            Theme.of(context),
                          ).foreground,
                        ),
                      ),
                    ),
                    const SizedBox(
                      height: 30,
                      child: VerticalDivider(width: 16),
                    ),
                    Expanded(
                      child: Text(
                        '$ongoing\nOngoing',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
                          color: statusColors(
                            StatusTone.blue,
                            Theme.of(context),
                          ).foreground,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Text(
                      'FILTER ADVISEES',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        color: Color(0xFF929FB5),
                      ),
                    ),
                  ),
                ],
              ),
              Wrap(
                spacing: 6,
                children: [
                  _filter(
                    context,
                    'Risk level',
                    _level,
                    {
                      '': 'All Risk Levels',
                      'High': 'High risk',
                      'Moderate': 'Moderate risk',
                      'Low': 'Low risk',
                    },
                    (v) => _level = v,
                    primary: true,
                  ),
                  _filter(context, 'Factor', _factor, {
                    '': 'All',
                    'academic': 'Academic',
                    'attendance': 'Attendance',
                    'behavioral': 'Behavior',
                  }, (v) => _factor = v),
                  _filter(context, 'Status', _outcome, {
                    '': 'All',
                    'ongoing': 'Ongoing',
                    'resolved': 'Resolved',
                    'unresolved': 'Unresolved',
                    'none': 'No plan yet',
                  }, (v) => _outcome = v),
                  if (board.sections.length > 1)
                    _filter(context, 'Section', _section, {
                      '': 'All',
                      for (final section in board.sections)
                        section['id'].toString(): section['name'].toString(),
                    }, (v) => _section = v),
                ],
              ),
              Text(
                'Showing ${rows.length} records',
                style: const TextStyle(fontSize: 12, color: Color(0xFF9999A6)),
              ),
              const SizedBox(height: 12),
              if (rows.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 20,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFE6ECF4)),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: board.rows.isEmpty
                              ? const Color(0xFFF0FDF4)
                              : const Color(0xFFF5F5F7),
                        ),
                        child: Icon(
                          board.rows.isEmpty
                              ? LucideIcons.badgeCheck
                              : LucideIcons.search,
                          size: 20,
                          color: board.rows.isEmpty
                              ? const Color(0xFF489D6A)
                              : const Color(0xFF9B9BA7),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        board.rows.isEmpty
                            ? 'No advisees needing intervention'
                            : 'No matching advisees',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          board.rows.isEmpty
                              ? 'All advisees are currently on track for this term with no active guidance desk flags.'
                              : 'Adjust your search or filters to see more records.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: Color(0xFF71809B),
                          ),
                        ),
                      ),
                    ],
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
              if (rows.isNotEmpty)
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
