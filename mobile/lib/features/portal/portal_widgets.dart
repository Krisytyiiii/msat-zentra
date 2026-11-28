import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design/status_palette.dart';
import '../../shared/identity_tile.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../adviser/schedule_timing.dart';

/// Shared learner-portal cards.
///
/// The student and parent workspaces read the same backend DTOs, so they render
/// the same widgets here instead of two drifting copies: a subject card for
/// Grades/Attendance/Schedule, the grade card, session rows, the "up next"
/// class block and the module card.

/// Subject card used by the learner's Class Schedule, Grades and Attendance
/// desks so the three lists read as one interface.
class PortalSubjectCard extends StatelessWidget {
  const PortalSubjectCard({
    super.key,
    required this.seed,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.footer,
    this.onTap,
  });

  final String seed;
  final String title;
  final String subtitle;
  final Widget trailing;
  final String footer;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final body = Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Row(
            children: [
              ZIdentityTile(name: title, seed: seed),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              trailing,
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(height: 1),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              footer,
              style: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
    return Material(
      color: theme.cardTheme.color,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: theme.colorScheme.outline.withValues(alpha: 0.72),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      elevation: 1,
      shadowColor: Colors.black.withValues(
        alpha: theme.brightness == Brightness.dark ? 0.4 : 0.06,
      ),
      child: onTap == null ? body : InkWell(onTap: onTap, child: body),
    );
  }
}

/// One subject's term grade on the Grades desk.
class PortalGradeCard extends StatelessWidget {
  final PortalGrade grade;
  final VoidCallback? onTap;
  const PortalGradeCard({super.key, required this.grade, this.onTap});

  @override
  Widget build(BuildContext context) {
    final finalGrade = grade.transmutedGrade;
    final passed = grade.isFinal && finalGrade != null && finalGrade >= 75;
    final failed = grade.isFinal && finalGrade != null && finalGrade < 75;
    final tone = !grade.isFinal
        ? StatusTone.amber
        : failed
            ? StatusTone.red
            : passed
                ? StatusTone.green
                : StatusTone.neutral;
    final title = grade.isFinal
        ? (finalGrade?.toStringAsFixed(0) ?? '—')
        : 'In progress';
    final bottom = grade.isFinal
        ? [
            'Final grade',
            if (grade.remarks != null && grade.remarks!.isNotEmpty) grade.remarks!,
          ].join(' · ')
        : 'Not yet final — assessment scores are still in progress';
    return PortalSubjectCard(
      seed: grade.subjectId,
      title: grade.subjectName,
      subtitle: grade.teacherName != null && grade.teacherName!.isNotEmpty
          ? grade.teacherName!
          : grade.subjectCode,
      trailing: ZStatusPill(text: title, tone: tone, label: 'Term grade'),
      footer: bottom,
      onTap: onTap,
    );
  }
}

class PortalSessionRow extends StatelessWidget {
  const PortalSessionRow({super.key, required this.session, required this.onTap});

  final PortalSession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = session.track == 'ADM'
        ? 'Parent conference'
        : session.sessionType.replaceAll('_', ' ');
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(
              session.track == 'ADM' ? Icons.family_restroom : Icons.support_agent,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${formatPortalDate(session.scheduledAt)} · ${session.venue.isEmpty ? 'Venue TBA' : session.venue}',
                    style: theme.textTheme.labelSmall,
                  ),
                ],
              ),
            ),
            Icon(
              LucideIcons.chevronRight,
              size: 18,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

/// Overview "Up next" class block.
class PortalUpNextClass extends StatelessWidget {
  const PortalUpNextClass({
    super.key,
    required this.slot,
    this.start,
    this.end,
    required this.live,
  });

  final PortalScheduleSlot slot;
  final int? start;
  final int? end;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final parts = start == null ? const <String>[] : clockLabel(start!).split(' ');
    return Row(
      children: [
        if (parts.isNotEmpty) ...[
          Container(
            constraints: const BoxConstraints(minWidth: 66, minHeight: 64),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: accent.withValues(alpha: 0.30)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  parts.first,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: accent,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  live ? 'Now' : (parts.length > 1 ? parts[1] : ''),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                slot.subjectName,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                [
                  if (slot.teacherName != null) slot.teacherName!,
                  'Period ${slot.period + 1}',
                  if (start != null && end != null)
                    '${clockLabel(start!)} – ${clockLabel(end!)}',
                ].join(' · '),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Module card shared by the student (with answer submission) and the parent
/// (read-only) desks. `onSubmit` is only wired for the student workspace.
class PortalModuleCard extends StatelessWidget {
  final PortalModule module;
  final VoidCallback? onSubmit;
  const PortalModuleCard({super.key, required this.module, this.onSubmit});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ZCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  module.moduleName,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              _status(theme, module.status),
            ],
          ),
          if (module.description != null) ...[
            const SizedBox(height: 4),
            Text(module.description!, style: theme.textTheme.bodySmall),
          ],
          const SizedBox(height: 4),
          Text(
            module.dueDate == null
                ? 'No due date'
                : 'Due ${formatPortalDate(module.dueDate)}',
            style: theme.textTheme.labelSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (module.moduleUrl != null)
                OutlinedButton.icon(
                  onPressed: () => _open(module.moduleUrl!),
                  icon: const Icon(Icons.open_in_new, size: 14),
                  label: const Text('Open module', style: TextStyle(fontSize: 12)),
                ),
              if (module.submitted)
                Text(
                  'Submitted ${formatPortalDate(module.submittedAt)}',
                  style: theme.textTheme.labelSmall,
                )
              else if (module.tracked)
                Text('Not yet submitted', style: theme.textTheme.labelSmall),
            ],
          ),
          if (onSubmit != null && module.tracked && module.moduleUrl != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              icon: const Icon(Icons.upload_outlined, size: 16),
              label: Text(module.submitted ? 'Update answer' : 'Submit answer'),
              onPressed: onSubmit,
            ),
          ],
        ],
      ),
    );
  }

  Widget _status(ThemeData theme, String status) {
    final color = switch (status) {
      'submitted' => Colors.green,
      'overdue' => theme.colorScheme.error,
      'pending' => Colors.orange,
      _ => theme.colorScheme.onSurfaceVariant,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status,
        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600),
      ),
    );
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
