import 'package:flutter/material.dart';

import '../../design/status_palette.dart';
import 'attendance_data.dart';
import '../../design/desk_theme.dart';

/// Marking-only card; saved, queued and implied marks remain distinct.
class AttendanceMarkCard extends StatelessWidget {
  const AttendanceMarkCard({
    super.key,
    required this.learner,
    required this.index,
    required this.value,
    required this.recordState,
    required this.enabled,
    required this.onSelect,
  });

  final AttendanceLearner learner;
  final int index;
  final String? value;
  final String recordState;
  final bool enabled;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final words = learner.name
        .split(RegExp(r'[\s,]+'))
        .where((word) => word.isNotEmpty)
        .toList();
    final initials = words.isEmpty
        ? '?'
        : '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
              .toUpperCase();
    final badge = statusColors(
      recordState == 'Unsaved' || recordState == 'Queued'
          ? StatusTone.amber
          : StatusTone.neutral,
      Theme.of(context),
      badge: true,
    );
    final avatarColors = [
      (Color(0xFFF0EDFF), Color(0xFF5440D8)),
      (Color(0xFFECFDF3), zLift(context, Color(0xFF438466))),
      (zWash(context, const Color(0xFFEFF6FF)), Color(0xFF3563AC)),
    ][index % 3];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: zCard(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: zLine(context)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x09000000),
            blurRadius: 4,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: avatarColors.$1,
                foregroundColor: avatarColors.$2,
                child: Text(
                  initials,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      learner.name,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: zInk(context),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      learner.lrn,
                      style: TextStyle(fontSize: 12, color: zMutedInk(context)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Container(
                constraints: const BoxConstraints(maxWidth: 110),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: badge.background,
                  border: Border.all(color: zLine(context)),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  recordState == 'Absent · not recorded'
                      ? 'Unrecorded'
                      : recordState,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: badge.foreground,
                  ),
                ),
              ),
            ],
          ),
          if (!learner.exempt) ...[
            Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Divider(height: 1, color: zLine(context)),
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth < 210 ? 2 : 4;
                final width =
                    (constraints.maxWidth - (columns - 1) * 6) / columns;
                return Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final entry in attendanceLabels.entries)
                      SizedBox(
                        width: width,
                        child: _button(context, entry.key, entry.value),
                      ),
                  ],
                );
              },
            ),
          ],
          if (learner.exempt)
            Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Signed ADM · seat-time attendance is not recorded.',
                style: TextStyle(fontSize: 12, color: zMutedInk(context)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _button(BuildContext context, String status, String label) {
    final selected = value == status;
    final selectedColor = switch (status) {
      'absent' => const Color(0xFFEF5E68),
      'late' => const Color(0xFFB7791F),
      'excused' => const Color(0xFF6386EF),
      _ => const Color(0xFF4C9C45),
    };
    final colors = statusColors(switch (status) {
      'absent' => StatusTone.red,
      'late' => StatusTone.amber,
      'excused' => StatusTone.blue,
      _ => StatusTone.green,
    }, Theme.of(context));
    return Semantics(
      label: '${learner.name}, $label',
      selected: selected,
      child: Tooltip(
        message: label,
        child: OutlinedButton(
          key: ValueKey('attendance-${learner.id}-$status'),
          onPressed: enabled ? () => onSelect(status) : null,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 36),
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            tapTargetSize: MaterialTapTargetSize.padded,
            elevation: selected ? 1 : 0,
            shadowColor: colors.foreground.withValues(alpha: 0.16),
            backgroundColor: selected ? selectedColor : zCard(context),
            disabledBackgroundColor: selected ? selectedColor : zCard(context),
            foregroundColor: selected ? Colors.white : zInk(context),
            disabledForegroundColor: selected
                ? Colors.white
                : zMutedInk(context),
            side: BorderSide(
              width: selected ? 1.5 : 1,
              color: selected ? selectedColor : zLine(context),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(6),
            ),
            textStyle: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
          child: Text(label.characters.first, textAlign: TextAlign.center),
        ),
      ),
    );
  }
}
