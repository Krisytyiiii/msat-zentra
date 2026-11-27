// Learner portal Settings: account details and password security.
//
// A root, full-screen desk (own Back header) like the adviser `/teacher/more`
// page: the drawer/profile never edits learner records, so this stays read-only
// for account data and only allows a password change.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../services/portal_service.dart';
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

    final rows = isStudent
        ? <({String label, String value})>[
            (label: 'Name', value: learner?.name ?? '—'),
            (label: 'LRN', value: learner?.lrn ?? '—'),
            (label: 'Grade level', value: learner?.gradeLevel ?? '—'),
            (label: 'Section', value: learner?.sectionName ?? '—'),
            (label: 'Adviser', value: learner?.adviserName ?? '—'),
          ]
        : <({String label, String value})>[
            (label: 'Name', value: parent?.name ?? '—'),
            (label: 'Email', value: parent?.email ?? '—'),
            (
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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            const ZContentHeader(
              title: 'Settings',
              icon: LucideIcons.settings,
              description: 'Your account details and sign-in security.',
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Divider(height: 1, color: theme.colorScheme.outline),
            ),
            StaffSettingsSection(
              title: 'Account',
              subtitle: isStudent
                  ? 'These details come from the school record. Ask the registrar to correct them.'
                  : 'Your guardian account and the learners linked to it.',
              child: Column(
                children: [
                  for (final row in rows)
                    _InfoRow(label: row.label, value: row.value),
                ],
              ),
            ),
            const StaffPasswordEditor(),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
