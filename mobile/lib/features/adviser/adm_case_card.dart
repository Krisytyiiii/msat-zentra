// Shared ADM case card + 8-stage pipeline order.
// Web parity: frontend/src/app/teacher/advisory/adm-cases/components/
// adm-cases-data.ts (ADM_STAGES) + AdmCaseRail.tsx ("Stage N of 8").
// Status-only, never clinical detail.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../shared/widgets.dart';
import '../../design/status_palette.dart';

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
  const AdmCaseCard({super.key, required this.caseData, this.onTap});

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
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: const Color(0xFFEFF6FF),
                    foregroundColor: const Color(0xFF52627C),
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
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'LRN ${lrn.isEmpty ? '—' : lrn}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF71809B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: ZStatusPill(
                      text: approved ? 'Approved' : 'Pending',
                      tone: approved ? StatusTone.green : StatusTone.amber,
                    ),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 10),
                child: Divider(height: 1, color: Color(0xFFE6ECF4)),
              ),
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
                            Text('Modules $modulesSub/$modulesTotal'),
                          ]
                          .map(
                            (child) => DefaultTextStyle(
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF52627C),
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
      color: const Color(0xFFF9F9FA),
      border: Border.all(color: const Color(0xFFE8E8ED)),
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
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1E293B),
                ),
                children: [
                  TextSpan(
                    text: '\n${counts[i].$1}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w400,
                      color: Color(0xFF71809B),
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

/// Blue pill dropdown used by the ADM Cases filter row.
class AdmCaseFilterPill extends StatelessWidget {
  const AdmCaseFilterPill({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.update,
    this.primary = false,
  });

  final String label;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> update;
  final bool primary;

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
              color: active ? blue.background : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active
                    ? blue.foreground.withValues(alpha: 0.25)
                    : const Color(0xFFE5E5EA),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label == 'Stage'
                        ? options[value] ?? _pretty(value)
                        : '$label: ${options[value] ?? _pretty(value)}',
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
        color: highlighted ? const Color(0xFFF3F9FF) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted
              ? const Color(0xFFBFDBFE)
              : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1E3A8A),
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
    return ColoredBox(
      color: Colors.white,
      child: DefaultTextStyle(
        style: const TextStyle(
          fontSize: 12,
          height: 1.45,
          color: Color(0xFF475569),
        ),
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
                    color: const Color(0xFF2563EB),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Text(
                    _initials(name),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
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
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
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
                    foregroundColor: const Color(0xFF64748B),
                    side: const BorderSide(color: Color(0xFFE5E8F0)),
                    minimumSize: const Size(42, 42),
                    shape: const CircleBorder(),
                  ),
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close, size: 20),
                ),
              ],
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Divider(height: 1, color: Color(0xFFF1F5F9)),
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
