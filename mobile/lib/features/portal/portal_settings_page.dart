// Learner portal Settings: account details and password security.
//
// A root, full-screen desk (own Back header) like the adviser `/teacher/more`
// page: the drawer/profile never edits learner records, so this stays read-only
// for account data and only allows a password change.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../services/portal_service.dart';
import '../../shared/identity_tile.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../design/settings_theme.dart';
import '../../design/staff_settings.dart';

class PortalSettingsPage extends ConsumerWidget {
  const PortalSettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = settingsScreenTheme(Theme.of(context));
    final portal = ref.watch(authProvider).portal == 'parent'
        ? 'parent'
        : 'student';
    final isStudent = portal == 'student';
    final learner = isStudent
        ? ref.watch(studentMeProvider).asData?.value
        : null;
    final parent = !isStudent
        ? ref.watch(parentMeProvider).asData?.value
        : null;
    final children = !isStudent
        ? ref.watch(parentChildrenProvider).asData?.value ??
              const <PortalChild>[]
        : const <PortalChild>[];

    final displayName = isStudent
        ? learner?.name ?? 'Learner'
        : parent?.name ?? 'Guardian';
    final identityKey = isStudent
        ? (learner?.lrn.isNotEmpty == true
              ? learner!.lrn
              : learner?.studentId)
        : parent?.email;
    final identityLine = isStudent
        ? [
            'Learner',
            if (learner?.gradeLevel.isNotEmpty == true) learner!.gradeLevel,
            if (learner?.sectionName != null) learner!.sectionName!,
          ].join(' · ')
        : [
            'Guardian',
            children.isEmpty
                ? null
                : '${children.length} linked learner${children.length == 1 ? '' : 's'}',
          ].whereType<String>().join(' · ');

    final rows = isStudent
        ? <_InfoData>[
            _InfoData(
              icon: Icons.person_outline,
              label: 'Name',
              value: learner?.name ?? '—',
            ),
            _InfoData(
              icon: Icons.badge_outlined,
              label: 'LRN',
              value: learner?.lrn ?? '—',
              copyValue: learner?.lrn,
            ),
            _InfoData(
              icon: Icons.school_outlined,
              label: 'Grade level',
              value: learner?.gradeLevel ?? '—',
            ),
            _InfoData(
              icon: Icons.groups_outlined,
              label: 'Section',
              value: learner?.sectionName ?? '—',
            ),
            _InfoData(
              icon: Icons.support_agent_outlined,
              label: 'Adviser',
              value: learner?.adviserName ?? '—',
            ),
          ]
        : <_InfoData>[
            _InfoData(
              icon: Icons.person_outline,
              label: 'Name',
              value: parent?.name ?? '—',
            ),
            _InfoData(
              icon: Icons.mail_outline,
              label: 'Email',
              value: parent?.email ?? '—',
            ),
            _InfoData(
              icon: Icons.link,
              label: 'Linked learners',
              value: children.isEmpty
                  ? 'None'
                  : children.map((c) => c.name).join(', '),
            ),
          ];

    return Theme(
      data: theme,
      child: Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        appBar: AppBar(
          centerTitle: true,
          backgroundColor: theme.scaffoldBackgroundColor,
          shape: Border(
            bottom: BorderSide(color: theme.colorScheme.outline),
          ),
          leading: ZBackButton(
            onPressed: () {
              final router = GoRouter.maybeOf(context);
              if (router != null) {
                if (router.canPop()) {
                  router.pop();
                } else {
                  router.go('/$portal/overview');
                }
              } else {
                Navigator.of(context).maybePop();
              }
            },
          ),
          title: const Text('Settings'),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            ZCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  ZIdentityTile(
                    name: displayName,
                    seed: identityKey,
                    size: 48,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          identityLine,
                          style: TextStyle(
                            fontSize: 12,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            StaffSettingsSection(
              title: 'Account',
              subtitle: isStudent
                  ? 'These details come from the school record. Ask the registrar to correct them.'
                  : 'Your guardian account and the learners linked to it.',
              child: Column(
                children: [
                  for (final (index, row) in rows.indexed) ...[
                    if (index > 0)
                      Divider(height: 1, color: theme.colorScheme.outline),
                    _InfoRow(data: row),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            const StaffPasswordEditor(),
          ],
        ),
      ),
    );
  }
}

class _InfoData {
  const _InfoData({
    required this.icon,
    required this.label,
    required this.value,
    this.copyValue,
  });

  final IconData icon;
  final String label;
  final String value;

  /// When set, the row offers a copy action (LRN).
  final String? copyValue;
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.data});

  final _InfoData data;

  Future<void> _copy(BuildContext context) async {
    final value = data.copyValue;
    if (value == null || value.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: value));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('${data.label} copied.')),
      );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(data.icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          SizedBox(
            width: 104,
            child: Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                data.label,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 12,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          Expanded(
            child: Text(
              data.value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (data.copyValue != null && data.copyValue!.isNotEmpty)
            IconButton(
              tooltip: 'Copy ${data.label}',
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              onPressed: () => _copy(context),
              icon: Icon(
                LucideIcons.copy,
                size: 15,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
        ],
      ),
    );
  }
}
