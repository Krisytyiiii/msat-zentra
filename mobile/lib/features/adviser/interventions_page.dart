import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/shell.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import '../home/overview_data.dart';
import 'interventions_data.dart';
import '../../design/desk_theme.dart';

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
  bool _descending = false;
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
      ref.invalidate(advisoryInterventionsProvider);
      await ref.read(advisoryInterventionsProvider.future);
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
              color: active ? blue.background : zCard(context),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active
                    ? blue.foreground.withValues(alpha: 0.25)
                    : zLine(context),
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
                      color: active ? blue.foreground : zMutedInk(context),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: active ? blue.foreground : zMutedInk(context),
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
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: ColoredBox(
        color: theme.scaffoldBackgroundColor,
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
    }
    final data = ref.watch(advisoryInterventionsProvider);
    final term = ref.watch(termProvider);
    final overview = ref.watch(overviewSummaryProvider).asData?.value;
    return data.when(
      loading: () => const ZSkeletonList(),
      error: (error, _) => ErrorView(message: error, onRetry: _refresh),
      data: (board) {
        final rows =
            board.rows
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
                .toList()
              ..sort(
                (a, b) => _descending
                    ? b.name.toLowerCase().compareTo(a.name.toLowerCase())
                    : a.name.toLowerCase().compareTo(b.name.toLowerCase()),
              );
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
              const ZContentHeader(
                title: 'Interventions',
                icon: LucideIcons.heartHandshake,
                description: 'Read-only follow-up for your advisees, recorded by the guidance desk.',
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
                      text:
                          [
                                if (board.sections.isNotEmpty)
                                  board.sections
                                      .where(
                                        (s) =>
                                            s['name']?.toString() ==
                                            sectionName,
                                      )
                                      .map((s) => s['gradeLevel']?.toString())
                                      .firstWhere(
                                        (g) => g != null && g.isNotEmpty,
                                        orElse: () => null,
                                      )
                                else
                                  null,
                                sectionName,
                              ]
                              .where(
                                (value) => value != null && value.isNotEmpty,
                              )
                              .join(' · '),
                      kind: ScopePillKind.grade,
                      label: 'Grade and section',
                      compact: true,
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: zSoft(context),
                  border: Border.all(color: zLine(context)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          text: '$high',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: zInk(context),
                          ),
                          children: [
                            TextSpan(
                              text: '\nHigh',
                              style: TextStyle(
                                fontWeight: FontWeight.w400,
                                color: zMutedInk(context),
                              ),
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(
                      height: 30,
                      child: VerticalDivider(width: 16),
                    ),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          text: '$moderate',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: zInk(context),
                          ),
                          children: [
                            TextSpan(
                              text: '\nModerate',
                              style: TextStyle(
                                fontWeight: FontWeight.w400,
                                color: zMutedInk(context),
                              ),
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(
                      height: 30,
                      child: VerticalDivider(width: 16),
                    ),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          text: '$ongoing',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: zInk(context),
                          ),
                          children: [
                            TextSpan(
                              text: '\nOngoing',
                              style: TextStyle(
                                fontWeight: FontWeight.w400,
                                color: zMutedInk(context),
                              ),
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
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
                  Expanded(
                    child: Text(
                      'FILTER ADVISEES',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        color: zMutedInk(context),
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
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Showing ${rows.length} records',
                      style: TextStyle(fontSize: 12, color: zMutedInk(context)),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => setState(() {
                      _descending = !_descending;
                    }),
                    icon: const Icon(LucideIcons.listFilter, size: 14),
                    label: Text(
                      _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                      style: const TextStyle(fontSize: 12),
                    ),
                    style: TextButton.styleFrom(
                      foregroundColor: zInk(context),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 0,
                      ),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (rows.isEmpty)
                ZEmpty(
                  icon: board.rows.isEmpty
                      ? LucideIcons.badgeCheck
                      : LucideIcons.search,
                  title: board.rows.isEmpty
                      ? 'No advisees needing intervention'
                      : 'No matching advisees',
                  subtitle: board.rows.isEmpty
                      ? 'All advisees are currently on track for this term with no active guidance desk flags.'
                      : 'Adjust your search or filters to see more records.',
                ),
              for (final row in rows)
                Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  elevation: 0,
                  color: zCard(context),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: zLine(context)),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () async {
                      final navigation = ref.read(
                        staffNavigationHiddenProvider.notifier,
                      );
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
                              child: InterventionDetails(rowKey: row.key),
                            ),
                          ),
                        );
                      } finally {
                        navigation.state = false;
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Builder(
                                builder: (_) {
                                  final words = row.name
                                      .trim()
                                      .split(RegExp(r'\s+'))
                                      .where((word) => word.isNotEmpty)
                                      .toList();
                                  final identity =
                                      row.text('studentId').isNotEmpty
                                      ? row.text('studentId')
                                      : row.key;
                                  return CircleAvatar(
                                    radius: 19,
                                    backgroundColor:
                                        [
                                          zSoft(context),
                                          zWash(
                                            context,
                                            const Color(0xFFEFF6FF),
                                          ),
                                          zWash(
                                            context,
                                            const Color(0xFFFFFBEB),
                                          ),
                                          zWash(
                                            context,
                                            const Color(0xFFFAF5FF),
                                          ),
                                          zWash(
                                            context,
                                            const Color(0xFFFFF1F2),
                                          ),
                                        ][identity.codeUnits.fold(
                                              0,
                                              (a, b) => a + b,
                                            ) %
                                            5],
                                    foregroundColor: zMutedInk(context),
                                    child: Text(
                                      words.isEmpty
                                          ? '?'
                                          : '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
                                                .toUpperCase(),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  );
                                },
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      row.name,
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        color: zInk(context),
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      'LRN ${row.text('lrn')}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .onSurfaceVariant,
                                            fontFeatures: const [
                                              FontFeature.tabularFigures(),
                                            ],
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              RiskBadge(level: row.level),
                            ],
                          ),
                          const SizedBox(height: 8),
                          _identity(row, showRisk: false, showMetadata: false),
                          Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Divider(height: 1, color: zLine(context)),
                          ),
                          Row(
                            children: [
                              Icon(
                                LucideIcons.calendar,
                                size: 13,
                                color: zMutedInk(context),
                              ),
                              const SizedBox(width: 5),
                              Expanded(
                                child: Text(
                                  interventionDate(row.text('detectedAt')),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: zMutedInk(context),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

Widget _identity(
  AdvisoryIntervention row, {
  bool showRisk = true,
  bool showMetadata = true,
}) => Wrap(
  spacing: 6,
  runSpacing: 6,
  children: [
    if (showMetadata) ...[
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
    ],
    if (showRisk) RiskBadge(level: row.level),
    if (showMetadata) const SizedBox(width: double.infinity, height: 0),
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
      loading: () => const LoadingView(layout: SkeletonLayout.profile),
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
        Widget panel(Widget child, {bool highlighted = false}) => Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: highlighted
                ? zWash(context, const Color(0xFFF3F9FF))
                : zCard(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: highlighted
                  ? zWash(context, const Color(0xFFBFDBFE))
                  : zLine(context),
            ),
          ),
          child: child,
        );
        Widget fact(String label, Object? value) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            '$label\n${value == null || value.toString().isEmpty ? 'Not recorded' : value}',
            style: TextStyle(
              fontSize: 12,
              height: 1.45,
              color: zMutedInk(context),
            ),
          ),
        );
        return ColoredBox(
          color: zCard(context),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: row.level == 'High'
                          ? const Color(0xFFFF5577)
                          : const Color(0xFFF59E0B),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Text(
                      row.name.trim().isEmpty
                          ? '?'
                          : row.name
                                .trim()
                                .split(RegExp(r'\s+'))
                                .take(2)
                                .map((part) => part.characters.first)
                                .join()
                                .toUpperCase(),
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: zCard(context),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row.name,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: zInk(context),
                          ),
                        ),
                        const SizedBox(height: 4),
                        RiskBadge(level: row.level),
                        const SizedBox(height: 4),
                        Text(
                          'LRN ${row.text('lrn')} · Sec. ${row.text('section')} · ${row.text('gradeLevel')}',
                          style: TextStyle(
                            fontSize: 12,
                            color: zMutedInk(context),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    style: IconButton.styleFrom(
                      foregroundColor: zMutedInk(context),
                      side: BorderSide(color: zLine(context)),
                      minimumSize: const Size(42, 42),
                      shape: const CircleBorder(),
                    ),
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, size: 20),
                  ),
                ],
              ),
              Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: zSoft(context)),
              ),
              _identity(row),
              const SizedBox(height: 12),
              panel(
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: zLift(context, const Color(0xFF2563EB)),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        LucideIcons.info,
                        color: zCard(context),
                        size: 16,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'RECOMMENDED ACTION',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: zLift(context, Color(0xFF1E3A8A)),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            plan == null
                                ? 'No plan yet. Guidance has not opened an intervention for this learner.'
                                : interventionLabel(plan['recommendedAction']),
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.45,
                              color: zInk(context),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Detected ${interventionDate(row.text('detectedAt'))}',
                            style: TextStyle(
                              fontSize: 12,
                              color: zLift(context, const Color(0xFF2563EB)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                highlighted: true,
              ),
              if (plan != null) ...[
                const SizedBox(height: 12),
                panel(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      fact('Assigned to', plan['assignee']),
                      Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: Divider(height: 1, color: zSoft(context)),
                      ),
                      Wrap(
                        spacing: 20,
                        runSpacing: 8,
                        children: [
                          fact(
                            'Assigned',
                            interventionDate(plan['assignedAt']),
                          ),
                          fact(
                            'Approval',
                            interventionLabel(plan['approvalStatus']),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'CASE PARAMETERS & NOTES',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: zMutedInk(context),
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 12),
                panel(
                  Wrap(
                    spacing: 20,
                    runSpacing: 8,
                    children: [
                      fact('Priority', interventionLabel(plan['priority'])),
                      fact('Outcome', interventionLabel(plan['outcomeStatus'])),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                panel(fact('Intake notes', plan['intakeNotes'])),
                const SizedBox(height: 12),
                panel(fact('Outcome notes', plan['outcomeNotes'])),
                const SizedBox(height: 14),
                Text(
                  'Sessions',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if ((plan['sessions'] as List? ?? []).isEmpty)
                  const ZEmpty(
                    compact: true,
                    icon: LucideIcons.calendarDays,
                    title: 'No sessions recorded.',
                  ),
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
          ),
        );
      },
    );
  }
}
