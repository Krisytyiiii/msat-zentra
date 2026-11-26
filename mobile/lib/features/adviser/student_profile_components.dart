// Presentation blocks shared by the advisory learner profile and the ADM
// enrolled-learner detail, so both read as the same light "student profile"
// desk: identity card, section headers, white section cards and metric tiles.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/tokens.dart';

const studentInk = Color(0xFF0F172A);
const studentBody = Color(0xFF334155);
const studentMuted = Color(0xFF71809B);
const studentFaint = Color(0xFF94A3B8);
const studentLine = Color(0xFFE6ECF4);
const studentSoft = Color(0xFFF6F8FB);
const studentBlue = Color(0xFF2563EB);
const studentRed = Color(0xFFDC2626);
const studentRedSoft = Color(0xFFFFF5F5);
const studentRedLine = Color(0xFFFBD5D5);
const studentGreen = Color(0xFF1F8A48);
const studentGreenSoft = Color(0xFFF1FBF4);
const studentGreenLine = Color(0xFFCFF0DA);
const studentAmber = Color(0xFFB45309);
const studentAmberSoft = Color(0xFFFFFAEF);
const studentAmberLine = Color(0xFFF7E5B8);

enum StudentTone { neutral, red, green, amber, blue }

class StudentTonePill extends StatelessWidget {
  const StudentTonePill({super.key, required this.text, required this.tone});
  final String text;
  final StudentTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = switch (tone) {
      StudentTone.red => (studentRedSoft, studentRed, studentRedLine),
      StudentTone.green => (studentGreenSoft, studentGreen, studentGreenLine),
      StudentTone.amber => (studentAmberSoft, studentAmber, studentAmberLine),
      StudentTone.blue => (
        const Color(0xFFEFF5FF),
        studentBlue,
        const Color(0xFFD6E4FF),
      ),
      StudentTone.neutral => (studentSoft, studentMuted, studentLine),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(ZTokens.radiusPill),
        border: Border.all(color: border),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

class StudentSectionHeader extends StatelessWidget {
  const StudentSectionHeader({
    super.key,
    required this.icon,
    required this.title,
    this.color = studentBlue,
  });
  final IconData icon;
  final String title;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 22, bottom: 10),
    child: Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: studentBody,
            ),
          ),
        ),
      ],
    ),
  );
}

class StudentSectionCard extends StatelessWidget {
  const StudentSectionCard({
    super.key,
    required this.child,
    this.tone = StudentTone.neutral,
    this.padded = false,
  });
  final Widget child;
  final StudentTone tone;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final (bg, border) = switch (tone) {
      StudentTone.red => (studentRedSoft, studentRedLine),
      StudentTone.amber => (studentAmberSoft, studentAmberLine),
      StudentTone.green => (studentGreenSoft, studentGreenLine),
      _ => (Colors.white, studentLine),
    };
    return Container(
      padding: EdgeInsets.all(padded ? 12 : 0),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: child,
    );
  }
}

class StudentMetricTile extends StatelessWidget {
  const StudentMetricTile({
    super.key,
    required this.label,
    required this.value,
    this.tone = StudentTone.neutral,
  });
  final String label;
  final String value;
  final StudentTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, border, color) = switch (tone) {
      StudentTone.red => (studentRedSoft, studentRedLine, studentRed),
      StudentTone.green => (studentGreenSoft, studentGreenLine, studentGreen),
      _ => (studentSoft, studentLine, studentInk),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: studentMuted,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

String studentInitials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  final first = parts.first.characters.first;
  final last = parts.length > 1 ? parts.last.characters.first : '';
  return '$first$last'.toUpperCase();
}

/// White identity card: avatar initials, name/subtitle, optional top-right
/// badge, then a tappable LRN chip.
class StudentIdentityCard extends StatelessWidget {
  const StudentIdentityCard({
    super.key,
    required this.name,
    required this.lrn,
    required this.subtitle,
    required this.onCopyLrn,
    this.badge,
    this.dotColor,
  });
  final String name;
  final String lrn;
  final String subtitle;
  final VoidCallback onCopyLrn;
  final Widget? badge;
  final Color? dotColor;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: studentLine),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: studentInk,
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Text(
                          studentInitials(name),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (dotColor != null)
                        Positioned(
                          left: -2,
                          top: -2,
                          child: Container(
                            width: 12,
                            height: 12,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: dotColor,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: EdgeInsets.only(
                            right: badge != null
                                ? MediaQuery.textScalerOf(context).scale(65) +
                                      20
                                : 0,
                          ),
                          child: Text(
                            name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: studentInk,
                            ),
                          ),
                        ),
                        if (subtitle.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: studentMuted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: studentLine),
              ),
              Center(
                child: Semantics(
                  button: true,
                  label: 'Copy LRN',
                  child: InkWell(
                    onTap: onCopyLrn,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: studentSoft,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: studentLine),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              'LRN ${lrn.isEmpty ? '—' : lrn}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                color: studentMuted,
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(
                            LucideIcons.copy,
                            size: 12,
                            color: studentFaint,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (badge != null)
          Positioned(
            top: 10,
            right: 10,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(ZTokens.radiusPill),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x140F172A),
                    blurRadius: 4,
                    offset: Offset(0, 1),
                  ),
                ],
              ),
              child: badge,
            ),
          ),
      ],
    );
  }
}
