import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/tokens.dart';
import '../../design/desk_theme.dart';

enum StudentTone { neutral, red, green, amber, blue }

class StudentTonePill extends StatelessWidget {
  const StudentTonePill({super.key, required this.text, required this.tone});
  final String text;
  final StudentTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = switch (tone) {
      StudentTone.red => (
        zWash(context, const Color(0xFFFFF5F5)),
        zLift(context, const Color(0xFFDC2626)),
        zWash(context, const Color(0xFFFBD5D5)),
      ),
      StudentTone.green => (
        zWash(context, const Color(0xFFF1FBF4)),
        zLift(context, const Color(0xFF1F8A48)),
        zWash(context, const Color(0xFFCFF0DA)),
      ),
      StudentTone.amber => (
        zWash(context, const Color(0xFFFFFAEF)),
        zLift(context, const Color(0xFFB45309)),
        zWash(context, const Color(0xFFF7E5B8)),
      ),
      StudentTone.blue => (
        zWash(context, const Color(0xFFEFF5FF)),
        zLift(context, const Color(0xFF2563EB)),
        zWash(context, const Color(0xFFD6E4FF)),
      ),
      StudentTone.neutral => (
        zSoft(context),
        zMutedInk(context),
        zLine(context),
      ),
    };
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 9, vertical: 4),
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
    this.color,
  });
  final IconData icon;
  final String title;
  final Color? color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 22, bottom: 10),
    child: Row(
      children: [
        Icon(
          icon,
          size: 16,
          color: color ?? zLift(context, const Color(0xFF2563EB)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: zInk(context),
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
      StudentTone.red => (
        zWash(context, const Color(0xFFFFF5F5)),
        zWash(context, const Color(0xFFFBD5D5)),
      ),
      StudentTone.amber => (
        zWash(context, const Color(0xFFFFFAEF)),
        zWash(context, const Color(0xFFF7E5B8)),
      ),
      StudentTone.green => (
        zWash(context, const Color(0xFFF1FBF4)),
        zWash(context, const Color(0xFFCFF0DA)),
      ),
      _ => (zCard(context), zLine(context)),
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
      StudentTone.red => (
        zWash(context, const Color(0xFFFFF5F5)),
        zWash(context, const Color(0xFFFBD5D5)),
        zLift(context, const Color(0xFFDC2626)),
      ),
      StudentTone.green => (
        zWash(context, const Color(0xFFF1FBF4)),
        zWash(context, const Color(0xFFCFF0DA)),
        zLift(context, const Color(0xFF1F8A48)),
      ),
      _ => (zSoft(context), zLine(context), zInk(context)),
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
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: zMutedInk(context),
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
    this.meta = const [],
  });
  final String name;
  final String lrn;
  final String subtitle;
  final VoidCallback onCopyLrn;
  final Widget? badge;
  final Color? dotColor;

  /// Extra pills rendered under the name, e.g. grade + case status.
  final List<Widget> meta;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: zCard(context),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: zLine(context)),
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
                          color: zInk(context),
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Text(
                          studentInitials(name),
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: zCard(context),
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
                              border: Border.all(
                                color: zCard(context),
                                width: 2,
                              ),
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
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: zInk(context),
                            ),
                          ),
                        ),
                        if (subtitle.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              color: zMutedInk(context),
                            ),
                          ),
                        ],
                        if (meta.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: meta,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: zLine(context)),
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
                        color: zSoft(context),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: zLine(context)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              'LRN ${lrn.isEmpty ? '—' : lrn}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 11,
                                color: zMutedInk(context),
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Icon(
                            LucideIcons.copy,
                            size: 12,
                            color: zMutedInk(context),
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
