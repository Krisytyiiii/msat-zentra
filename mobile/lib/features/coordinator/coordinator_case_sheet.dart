// Draggable ADM case record opened from the coordinator ADM Cases card.
// Web parity: frontend/src/app/coordinator/referrals/components/
// coordinator-referral-detail-overlay.tsx. The row itself is the source
// (`/api/adm/referrals/all` already carries prepared/endorsed/meeting/forms);
// Book/Reschedule hands off to the routed parent-meeting screen.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/desk_theme.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';
import '../../shared/identity_tile.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

/// Half-sheet record for one ADM case. Book/Reschedule closes the sheet and
/// hands the action back to the caller (the routed desk page).
Future<void> showCoordinatorCaseSheet(
  BuildContext context,
  AdmCaseRow row, {
  required VoidCallback onBook,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  backgroundColor: zCard(context),
  constraints: BoxConstraints(
    maxHeight: MediaQuery.sizeOf(context).height * 0.5,
  ),
  builder: (_) => SafeArea(
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.5,
      child: Theme(
        data: overviewScreenTheme(Theme.of(context)),
        child: CoordinatorCaseSheet(
          row: row,
          onBook: onBook,
        ),
      ),
    ),
  ),
);

class CoordinatorCaseSheet extends StatefulWidget {
  const CoordinatorCaseSheet({
    super.key,
    required this.row,
    required this.onBook,
  });
  final AdmCaseRow row;
  final VoidCallback onBook;

  @override
  State<CoordinatorCaseSheet> createState() => _CoordinatorCaseSheetState();
}

class _CoordinatorCaseSheetState extends State<CoordinatorCaseSheet> {
  @override
  Widget build(BuildContext context) {
    final row = widget.row;
    return ColoredBox(
      color: zCard(context),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        children: [
          _identity(row),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Divider(height: 1, color: zSoft(context)),
          ),
          Text(
            'ADM details',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: zInk(context),
            ),
          ),
          const SizedBox(height: 8),
          _chips(row),
          const SizedBox(height: 14),
          _facts(row),
          const SizedBox(height: 12),
          _meeting(row),
          const SizedBox(height: 10),
          _latest(row),
          if (row.forms.isNotEmpty) ...[
            const SizedBox(height: 10),
            _forms(row),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            key: const ValueKey('coordinator-case-book'),
            onPressed: !row.bookable
                ? null
                : () {
                    Navigator.pop(context);
                    widget.onBook();
                  },
            icon: Icon(
              row.meeting == null
                  ? LucideIcons.calendarPlus
                  : LucideIcons.calendarClock,
              size: 16,
            ),
            label: Text(
              row.meeting == null ? 'Book meeting' : 'Reschedule meeting',
            ),
            style: FilledButton.styleFrom(
              backgroundColor: zLift(context, const Color(0xFF2563EB)),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(46),
            ),
          ),
        ],
      ),
    );
  }


  Widget _identity(AdmCaseRow row) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ZIdentityTile(
        name: row.student,
        seed: row.lrn.isEmpty ? row.student : row.lrn,
        size: 46,
        fontSize: 15,
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              row.student.isEmpty ? 'ADM case' : row.student,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: zInk(context),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'LRN ${row.lrn.isEmpty ? '—' : row.lrn}',
              style: TextStyle(fontSize: 12, color: zMutedInk(context)),
            ),
            const SizedBox(height: 4),
            ZStatusPill(
              text: row.status.label,
              tone: admCaseStatusTone(row.status.key),
            ),
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
        icon: const Icon(LucideIcons.x, size: 20),
      ),
    ],
  );

  Widget _chips(AdmCaseRow row) => Wrap(
    spacing: 6,
    runSpacing: 6,
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      ZScopePill(
        text: row.grade.isEmpty ? '—' : row.grade,
        kind: ScopePillKind.grade,
        compact: true,
      ),
      _chip(admLabel(row.stage), StatusTone.neutral),
      _chip(
        row.eligibilityLabel,
        switch (row.eligibility) {
          'eligible' => StatusTone.green,
          'ineligible' => StatusTone.red,
          _ => StatusTone.neutral,
        },
      ),
    ],
  );

  Widget _chip(String text, StatusTone tone) => ZStatusPill(text: text, tone: tone);

  Widget _facts(AdmCaseRow row) {
    final rows = <List<(String, String, String?)>>[
      [
        (
          'Prepared by',
          row.preparedBy.isEmpty ? '—' : row.preparedBy,
          row.datePrepared.isEmpty ? null : admDate(row.datePrepared),
        ),
        ('Consult reviewer', row.consultReviewer.isEmpty ? 'Not assigned' : row.consultReviewer, null),
      ],
      [
        ('Endorsed', row.endorsedAt.isEmpty ? 'Not yet endorsed' : admDate(row.endorsedAt), null),
        (
          'Principal approval',
          row.approvedBy.isEmpty ? 'Pending' : row.approvedBy,
          row.approvalDate.isEmpty ? null : admDate(row.approvalDate),
        ),
      ],
      [
        ('Section', row.section.isEmpty ? '—' : row.section, null),
        (
          'Modules',
          '${row.modulesSubmitted} / ${row.modulesTotal} submitted',
          null,
        ),
      ],
    ];
    return Container(
      decoration: BoxDecoration(
        color: zCard(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: zLine(context)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: zLine(context)),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: _fact(rows[i][0])),
                  VerticalDivider(width: 1, color: zLine(context)),
                  Expanded(child: _fact(rows[i][1])),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _fact((String, String, String?) fact) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          fact.$1.toUpperCase(),
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: zMutedInk(context),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          fact.$2,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: zInk(context),
          ),
        ),
        if (fact.$3 != null) ...[
          const SizedBox(height: 2),
          Text(
            fact.$3!,
            style: TextStyle(fontSize: 11, color: zMutedInk(context)),
          ),
        ],
      ],
    ),
  );

  Widget _meeting(AdmCaseRow row) {
    final meeting = row.meeting;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: zCard(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: zLine(context)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: zSoft(context),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              meeting == null ? LucideIcons.calendarPlus : LucideIcons.calendarClock,
              size: 15,
              color: zMutedInk(context),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PARENT MEETING',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: zMutedInk(context),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  meeting == null
                      ? 'No parent meeting booked for this case yet.'
                      : '${admDate(meeting.datetime?.toIso8601String() ?? '')} · ${row.meetingType}',
                  style: TextStyle(fontSize: 13, color: zInk(context)),
                ),
                if (meeting != null) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      ZStatusPill(
                        text: meeting.attended ? 'Attended' : 'Booked',
                        tone: meeting.attended
                            ? StatusTone.green
                            : StatusTone.blue,
                      ),
                      Text(
                        '${meeting.invitees.length} invitee'
                        '${meeting.invitees.length == 1 ? '' : 's'}',
                        style: TextStyle(
                          fontSize: 11,
                          color: zMutedInk(context),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _latest(AdmCaseRow row) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: zSoft(context),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: zLine(context)),
    ),
    child: Row(
      children: [
        Text(
          'LATEST UPDATE',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: zMutedInk(context),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            row.latestUpdateLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: zInk(context),
            ),
          ),
        ),
        if (_elapsed(row.latestUpdateAt) case final elapsed?)
          Text(
            elapsed,
            style: TextStyle(fontSize: 11, color: zMutedInk(context)),
          ),
      ],
    ),
  );

  Widget _forms(AdmCaseRow row) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: zCard(context),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: zLine(context)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'CASE FORMS',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: zMutedInk(context),
          ),
        ),
        const SizedBox(height: 6),
        for (final form in row.forms)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Icon(LucideIcons.fileText, size: 13, color: zMutedInk(context)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    admText(form['title']),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: zInk(context)),
                  ),
                ),
                ZStatusPill(
                  text: admText(form['status']),
                  tone: StatusTone.neutral,
                ),
              ],
            ),
          ),
      ],
    ),
  );

  String? _elapsed(String? value) {
    if (value == null || value.isEmpty) return null;
    final at = DateTime.tryParse(value);
    if (at == null) return null;
    final diff = DateTime.now().difference(at.toLocal());
    if (diff.isNegative) return null;
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
