import 'package:flutter/material.dart';

import '../../design/status_palette.dart';
import 'attendance_data.dart';
import '../../design/desk_theme.dart';

class AttendanceRecordCard extends StatelessWidget {
  const AttendanceRecordCard({
    super.key,
    required this.learner,
    required this.index,
    this.summary,
  });

  final AttendanceLearner learner;
  final int index;
  final ({int present, int late, int absent, double rate})? summary;

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
    final data = summary;
    final colors = statusColors(
      learner.exempt || data == null
          ? StatusTone.neutral
          : data.rate <= 0.8
          ? StatusTone.red
          : StatusTone.green,
      Theme.of(context),
      badge: true,
    );
    return Container(
      margin: EdgeInsets.only(bottom: 12),
      padding: EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: zCard(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: zLine(context)),
        boxShadow: [
          BoxShadow(
            color: Color(0x09000000),
            blurRadius: 10,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 19,
                backgroundColor: index.isEven
                    ? zWash(context, Color(0xFFEDE9FF))
                    : zWash(context, Color(0xFFDCFCE7)),
                foregroundColor: index.isEven
                    ? zLift(context, Color(0xFF6435E9))
                    : zLift(context, Color(0xFF438466)),
                child: Text(
                  initials,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              SizedBox(width: 12),
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
                    SizedBox(height: 3),
                    Text(
                      'LRN ${learner.lrn}',
                      style: TextStyle(fontSize: 12, color: zMutedInk(context)),
                    ),
                  ],
                ),
              ),
              SizedBox(width: 6),
              Container(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  learner.exempt
                      ? 'ADM exempt'
                      : data == null
                      ? 'No attendance'
                      : data.rate <= 0.8
                      ? 'At risk'
                      : 'On track',
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.foreground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Divider(height: 1, color: zLine(context)),
          ),
          _row(context, 'Present', data?.present.toString() ?? '—'),
          _row(context, 'Late', data?.late.toString() ?? '—'),
          _row(context, 'Absent', data?.absent.toString() ?? '—'),
          Divider(height: 8, color: zLine(context)),
          _row(
            context,
            'Attendance Rate',
            data == null ? '—' : '${(data.rate * 100).toStringAsFixed(1)}%',
            total: true,
          ),
        ],
      ),
    );
  }

  Widget _row(
    BuildContext context,
    String label,
    String value, {
    bool total = false,
  }) => Padding(
    padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              height: 1.5,
              fontWeight: total ? FontWeight.w600 : FontWeight.w400,
              color: total ? zInk(context) : zMutedInk(context),
            ),
          ),
        ),
        SizedBox(width: 12),
        Text(
          value,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: zMutedInk(context),
          ),
        ),
      ],
    ),
  );
}
