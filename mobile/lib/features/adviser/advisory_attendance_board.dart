// Advisory attendance board — mobile twin of the web
// `AdvisoryAttendanceBoard.tsx`: the learner's overall present rate, the
// meetup window they were measured in, and one card per subject.

import 'package:flutter/material.dart';

import '../../design/status_palette.dart';
import '../../design/tokens.dart';
import '../../shared/widgets.dart';
import 'advisory_attendance_data.dart';

/// Web `attendanceRateClass`: >=90% green, >=75% amber, else red.
Color attendanceTextColor(BuildContext context, double? rate) {
  final theme = Theme.of(context);
  if (rate == null) return theme.colorScheme.onSurfaceVariant;
  final dark = theme.brightness == Brightness.dark;
  if (rate >= 0.9) return dark ? const Color(0xFF22C55E) : const Color(0xFF16A34A);
  if (rate >= 0.75) return dark ? const Color(0xFFF59E0B) : const Color(0xFFD97706);
  return dark ? const Color(0xFFEF4444) : const Color(0xFFDC2626);
}

/// Web `attendanceBarClass` / `attendanceDot`: the same 500-scale colours.
Color? attendanceBarColor(double? rate) {
  if (rate == null) return null;
  if (rate >= 0.9) return ZTokens.riskLow;
  if (rate >= 0.75) return ZTokens.riskModerate;
  return ZTokens.riskHigh;
}

StatusTone attendanceTone(double? rate) {
  if (rate == null) return StatusTone.neutral;
  if (rate >= 0.9) return StatusTone.green;
  if (rate >= 0.75) return StatusTone.amber;
  return StatusTone.red;
}

class AdvisoryAttendanceBoard extends StatelessWidget {
  const AdvisoryAttendanceBoard({
    super.key,
    required this.student,
    required this.subjects,
  });

  final AdvisoryAttendanceStudent student;
  final List<AdvisoryAttendanceSubject> subjects;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final overall = attendanceOverall(student.rates, subjects.length);
    final overallPct = attendancePercent(overall);
    final hasMarks = overall != null;
    final atRisk = overall != null && overall < 0.75;
    final totals = attendanceMeetupTotals(student);
    final muted = theme.colorScheme.onSurfaceVariant;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ZCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(ZTokens.radiusMd),
                      color: theme.colorScheme.surfaceContainerLow,
                    ),
                    child: Icon(
                      Icons.calendar_month_outlined,
                      size: 18,
                      color: muted,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Student attendance',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Present rate this term',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ZStatusPill(
                    text: overallPct == null
                        ? 'No marks yet'
                        : '$overallPct% overall',
                    tone: StatusTone.amber,
                  ),
                  ZStatusPill(
                    text:
                        '${subjects.length} subject${subjects.length == 1 ? '' : 's'}',
                    tone: StatusTone.amber,
                  ),
                  ZStatusPill(
                    text: '${totals.present} of ${totals.total} meetups',
                    tone: StatusTone.neutral,
                  ),
                  ZStatusPill(
                    text: !hasMarks
                        ? 'No data'
                        : atRisk
                        ? 'At risk'
                        : 'On track',
                    tone: !hasMarks
                        ? StatusTone.neutral
                        : atRisk
                        ? StatusTone.red
                        : StatusTone.green,
                  ),
                  ZStatusPill(
                    text: student.isTransferee
                        ? 'Transferee · counted since enlistment'
                        : 'Regular · counted from term start',
                    tone: student.isTransferee
                        ? StatusTone.amber
                        : StatusTone.neutral,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color:
                    attendanceBarColor(overall) ?? ZTokens.factorAcademic,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Present rate per subject',
                style: theme.textTheme.labelSmall?.copyWith(
                  letterSpacing: 0.5,
                  fontWeight: FontWeight.w700,
                  color: muted,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (subjects.isEmpty)
          const ZEmpty(
            compact: true,
            icon: Icons.menu_book_outlined,
            title: 'No subjects yet',
            subtitle: 'No subjects are linked to this section yet.',
          )
        else
          for (var i = 0; i < subjects.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _SubjectCard(student: student, subject: subjects[i]),
          ],
      ],
    );
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({required this.student, required this.subject});

  final AdvisoryAttendanceStudent student;
  final AdvisoryAttendanceSubject subject;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final rate = student.rates[subject.id];
    final pct = attendancePercent(rate);
    final meetups = student.meetups[subject.id] ?? 0;
    final attended = student.presentMeetups[subject.id] ?? 0;
    final bar = attendanceBarColor(rate);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.cardTheme.color,
        borderRadius: BorderRadius.circular(ZTokens.radiusXl),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Icon(
                  Icons.menu_book_outlined,
                  size: 18,
                  color: muted,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  subject.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ZStatusPill(
                text: subject.code.isEmpty ? 'Subject' : subject.code,
                tone: attendanceTone(rate),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Present rate',
            style: theme.textTheme.labelSmall?.copyWith(
              letterSpacing: 0.4,
              color: muted,
            ),
          ),
          const SizedBox(height: 2),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  rate == null ? 'No marks yet' : 'Overall for this subject',
                  style: theme.textTheme.bodySmall?.copyWith(color: muted),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                pct == null ? '—' : '$pct%',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: attendanceTextColor(context, rate),
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          if (rate != null) ...[
            const SizedBox(height: 8),
            Semantics(
              label: '${subject.name} present average',
              value: '${pct ?? 0}%',
              child: ExcludeSemantics(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(ZTokens.radiusPill),
                  child: LinearProgressIndicator(
                    value: rate.clamp(0, 1).toDouble(),
                    minHeight: 6,
                    color: bar,
                    backgroundColor: theme.colorScheme.surfaceContainerLow,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            meetups == 0
                ? 'No meetups elapsed yet'
                : '$attended of $meetups meetup${meetups == 1 ? '' : 's'} present',
            style: theme.textTheme.labelSmall?.copyWith(
              color: muted,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
