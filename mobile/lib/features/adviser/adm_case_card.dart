// Shared ADM case card + 8-stage pipeline order.
// Web parity: frontend/src/app/teacher/advisory/adm-cases/components/
// adm-cases-data.ts (ADM_STAGES) + AdmCaseRail.tsx ("Stage N of 8").
// Status-only, never clinical detail.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../shared/widgets.dart';
import '../../design/status_palette.dart';
import '../../design/desk_theme.dart';

const admStageOrder = {
  'anecdotal': 1,
  'consultation': 2,
  'meeting_parents': 3,
  'home_visitation': 4,
  'certification': 5,
  'principal_approval': 6,
  'enrollment_monitoring': 7,
  'completion': 8,
};

int admOrderOf(String stage) => admStageOrder[stage] ?? 2;

class AdmCaseCard extends StatelessWidget {
  final Map<String, dynamic> caseData;
  final VoidCallback? onTap;

  /// Optional badge for the top-right corner; defaults to Approved/Pending.
  final Widget? topRight;

  /// Set false to hide the top-right status badge entirely.
  final bool showStatusPill;

  /// Optional custom footer row replacing stage/eligibility/modules.
  final Widget? footer;

  /// Set false when [topRight] already carries the module count.
  final bool showModulesInline;

  const AdmCaseCard({
    super.key,
    required this.caseData,
    this.onTap,
    this.topRight,
    this.showStatusPill = true,
    this.footer,
    this.showModulesInline = true,
  });

  @override
  Widget build(BuildContext context) {
    final stage = caseData['stage']?.toString() ?? '';
    final stageLabel = caseData['stageLabel']?.toString() ?? stage;
    final eligibility = caseData['eligibilityStatus']?.toString() ?? 'pending';
    final modulesSub = caseData['modulesSubmitted']?.toString() ?? '0';
    final modulesTotal = caseData['modulesTotal']?.toString() ?? '0';
    final approved = caseData['approved'] == true;
    final name = caseData['studentName']?.toString() ?? '';
    final lrn = caseData['lrn']?.toString() ?? '';
    return Material(
      color: zCard(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: zLine(context)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Row(
                crossAxisAlignment: topRight == null
                    ? CrossAxisAlignment.center
                    : CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: zWash(context, const Color(0xFFEFF6FF)),
                    foregroundColor: zMutedInk(context),
                    child: Text(
                      _initials(name),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name.isEmpty ? 'ADM case' : name,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: zInk(context),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'LRN ${lrn.isEmpty ? '—' : lrn}',
                          style: TextStyle(
                            fontSize: 12,
                            color: zMutedInk(context),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (showStatusPill) ...[
                    const SizedBox(width: 8),
                    Flexible(
                      child: Align(
                        alignment: Alignment.topRight,
                        heightFactor: 1,
                        child:
                            topRight ??
                            ZStatusPill(
                              text: approved ? 'Approved' : 'Pending',
                              tone: approved
                                  ? StatusTone.green
                                  : StatusTone.amber,
                            ),
                      ),
                    ),
                  ],
                ],
              ),
              Padding(
                padding: EdgeInsets.symmetric(vertical: 10),
                child: Divider(height: 1, color: zLine(context)),
              ),
              footer ??
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children:
                          [
                                Text(
                                  stageLabel.isEmpty
                                      ? 'Stage ${admOrderOf(stage)} of 8'
                                      : stageLabel,
                                ),
                                Text('Eligibility: $eligibility'),
                                if (showModulesInline)
                                  Text('Modules $modulesSub/$modulesTotal'),
                              ]
                              .map(
                                (child) => DefaultTextStyle(
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: zMutedInk(context),
                                  ),
                                  child: child,
                                ),
                              )
                              .toList(),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

String _initials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((s) => s.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  return '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
      .toUpperCase();
}

/// The adviser ADM Cases counters strip: three centred figures over labels.
class AdmCaseCounters extends StatelessWidget {
  const AdmCaseCounters({super.key, required this.counts});
  final List<(String, int)> counts;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: zSoft(context),
      border: Border.all(color: zLine(context)),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        for (var i = 0; i < counts.length; i++) ...[
          if (i > 0)
            const SizedBox(height: 30, child: VerticalDivider(width: 16)),
          Expanded(
            child: Text.rich(
              TextSpan(
                text: '${counts[i].$2}',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: zInk(context),
                ),
                children: [
                  TextSpan(
                    text: '\n${counts[i].$1}',
                    style: TextStyle(
                      fontWeight: FontWeight.w400,
                      color: zMutedInk(context),
                    ),
                  ),
                ],
              ),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, height: 1.6),
            ),
          ),
        ],
      ],
    ),
  );
}

/// The ADM Cases figure strip: the six web board figures in two compact rows,
/// sourced from the desk's whole-cohort `stageCounts` (not the loaded rows).
class AdmCaseFigures extends StatelessWidget {
  const AdmCaseFigures({super.key, required this.figures});
  final List<
    ({String label, int value, bool attention, bool positive})
  >
  figures;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
    decoration: BoxDecoration(
      color: zSoft(context),
      border: Border.all(color: zLine(context)),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      children: [
        for (var row = 0; row < 2; row++) ...[
          if (row > 0) Divider(height: 14, color: zLine(context)),
          Row(
            children: [
              for (var column = 0; column < 3; column++) ...[
                if (column > 0)
                  SizedBox(
                    height: 28,
                    child: VerticalDivider(width: 12, color: zLine(context)),
                  ),
                Expanded(child: _figure(context, figures[row * 3 + column])),
              ],
            ],
          ),
        ],
      ],
    ),
  );

  Widget _figure(
    BuildContext context,
    ({String label, int value, bool attention, bool positive}) figure,
  ) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        '${figure.value}',
        style: TextStyle(
          fontSize: 17,
          height: 1.1,
          fontWeight: FontWeight.w700,
          color: figure.positive
              ? zLift(context, const Color(0xFF15803D))
              : figure.attention && figure.value > 0
              ? zLift(context, const Color(0xFFB45309))
              : zInk(context),
        ),
      ),
      const SizedBox(height: 2),
      Text(
        figure.label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 10.5, color: zMutedInk(context)),
      ),
    ],
  );
}

/// Blue pill dropdown used by the ADM Cases filter row.
class AdmCaseFilterPill extends StatelessWidget {
  const AdmCaseFilterPill({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.update,
    this.primary = false,
    this.fitContent = false,
  });

  final String label;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> update;
  final bool primary;

  /// Size to the current label instead of filling the available width.
  final bool fitContent;

  String _pretty(String value) => value
      .split('_')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');

  @override
  Widget build(BuildContext context) {
    final blue = statusColors(StatusTone.blue, Theme.of(context));
    final active = primary || value.isNotEmpty;
    final text = Text(
      label == 'Stage'
          ? options[value] ?? _pretty(value)
          : '$label: ${options[value] ?? _pretty(value)}',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: 12,
        color: active ? blue.foreground : zMutedInk(context),
      ),
    );
    return PopupMenuButton<String>(
      tooltip: label,
      initialValue: value,
      onSelected: update,
      itemBuilder: (_) => [
        for (final entry in options.entries)
          PopupMenuItem(value: entry.key, child: Text(entry.value)),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Center(
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
              mainAxisSize: fitContent ? MainAxisSize.min : MainAxisSize.max,
              children: [
                if (fitContent)
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 220),
                    child: text,
                  )
                else
                  Expanded(child: text),
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
}

class AdmCaseDetails extends StatelessWidget {
  const AdmCaseDetails({super.key, required this.caseData});
  final Map<String, dynamic> caseData;

  @override
  Widget build(BuildContext context) {
    final name = caseData['studentName']?.toString() ?? '';
    final approved = caseData['approved'] == true;
    final timeline = caseData['timeline'] as List? ?? [];
    Widget panel(
      String title,
      List<Widget> children, {
      bool highlighted = false,
    }) => Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: zLift(context, Color(0xFF1E3A8A)),
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
    return ColoredBox(
      color: zCard(context),
      child: DefaultTextStyle(
        style: TextStyle(fontSize: 12, height: 1.45, color: zMutedInk(context)),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: zLift(context, const Color(0xFF2563EB)),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Text(
                    _initials(name),
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
                        name.isEmpty ? 'ADM case' : name,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: zInk(context),
                        ),
                      ),
                      const SizedBox(height: 4),
                      ZStatusPill(
                        text: approved ? 'Approved' : 'Pending',
                        tone: approved ? StatusTone.green : StatusTone.amber,
                      ),
                      const SizedBox(height: 4),
                      Text('LRN ${caseData['lrn'] ?? '—'}'),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close ADM details',
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
            panel('ADM status', [
              Text(
                'Stage ${admOrderOf(caseData['stage']?.toString() ?? '')} of 8',
              ),
              Text(
                (caseData['stageLabel'] ?? caseData['stage'] ?? 'Not recorded')
                    .toString(),
              ),
              const SizedBox(height: 6),
              Text(
                'Eligibility: ${caseData['eligibilityStatus'] ?? 'Not recorded'}',
              ),
            ], highlighted: true),
            panel('Modules', [
              Text(
                'Submitted ${caseData['modulesSubmitted'] ?? 0} / ${caseData['modulesTotal'] ?? 0}',
              ),
            ]),
            panel('Timeline (${timeline.length})', [
              if (timeline.isEmpty)
                const ZEmpty(
                  compact: true,
                  icon: Icons.history,
                  title: 'No timeline entries yet.',
                )
              else
                for (final entry in timeline)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (entry as Map)['label']?.toString() ?? '',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text('${entry['date'] ?? entry['at'] ?? ''}'),
                        if (entry['detail']?.toString().isNotEmpty ?? false)
                          Text(entry['detail'].toString()),
                      ],
                    ),
                  ),
            ]),
          ],
        ),
      ),
    );
  }
}
