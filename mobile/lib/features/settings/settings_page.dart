// Teacher Settings — web parity with frontend/src/app/teacher/settings.
// Sections: Profile (photo + name), Adviser claim/release, Master Teacher,
// Fixed login-inspired mobile appearance; saved web preferences are untouched.
// Served at the existing /teacher/more path (drawer + avatar point there).
// Presentation comes from design/staff_settings.dart, shared with the ADM
// coordinator desk.

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../design/staff_settings.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'settings_data.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});
  @override
  ConsumerState<SettingsPage> createState() => _State();
}

class _State extends ConsumerState<SettingsPage> {
  bool _pickingSection = false;
  String? _selectedSection;
  bool _mtBusy = false;

  Future<void> _toggleMaster(
    bool next, {
    required bool takenByOther,
    String? holderName,
  }) async {
    if (next && takenByOther) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            holderName != null
                ? 'Master Teacher is currently designated by $holderName.'
                : 'Master Teacher is currently designated.',
          ),
        ),
      );
      return;
    }
    setState(() => _mtBusy = true);
    try {
      await setMasterTeacher(ref, next);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              next ? 'Master Teacher enabled.' : 'Master Teacher disabled.',
            ),
          ),
        );
      }
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(settingsError(e, 'Could not update status.'))),
        );
      }
    } finally {
      if (mounted) setState(() => _mtBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(teacherProfileProvider);
    return StaffSettingsScaffold(
      backFallback: '/workspace/overview',
      children: [
        profile.when(
          loading: () => const ZSkeletonList(count: 2),
          error: (e, _) => ErrorView(
            message: e,
            onRetry: () => ref.invalidate(teacherProfileProvider),
          ),
          data: (p) => Column(
            children: [
              StaffProfileEditor(
                identity: StaffIdentity(
                  fullName: p.fullName,
                  photoUrl: p.photoUrl,
                ),
                onSaveName: (value) =>
                    patchTeacherProfile(ref, {'fullName': value}),
                onSavePhoto: (bytes, mime) => uploadTeacherPhoto(
                  ref,
                  'data:$mime;base64,${base64Encode(bytes)}',
                ),
              ),
              const SizedBox(height: 8),
              _AdviserCard(
                picking: _pickingSection,
                selected: _selectedSection,
                onPicking: (v) => setState(() {
                  _pickingSection = v;
                  if (!v) _selectedSection = null;
                }),
                onSelect: (id) => setState(() => _selectedSection = id),
              ),
              const SizedBox(height: 8),
              _MasterTeacherCard(
                busy: _mtBusy,
                onToggle: (next, {required takenByOther, holderName}) =>
                    _toggleMaster(
                      next,
                      takenByOther: takenByOther,
                      holderName: holderName,
                    ),
              ),
              const SizedBox(height: 8),
              const StaffAppearanceSection(),
              const SizedBox(height: 8),
              const StaffPasswordEditor(),
            ],
          ),
        ),
        const SizedBox(height: 8),
        const ZCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Grade flags',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 4),
              Text(
                'Raise and resolve flags inside each class workspace. Overdue flags escalate to the Principal.',
                style: TextStyle(fontSize: 13),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AdviserCard extends ConsumerWidget {
  final bool picking;
  final String? selected;
  final ValueChanged<bool> onPicking;
  final ValueChanged<String> onSelect;
  const _AdviserCard({
    required this.picking,
    required this.selected,
    required this.onPicking,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final overview = ref.watch(overviewProvider);
    final sections = ref.watch(adviserSectionsProvider);
    final isAdviser = overview.maybeWhen(
      data: (d) => d['isAdviser'] == true,
      orElse: () => false,
    );
    final advisoryName = overview.maybeWhen(
      data: (d) => d['advisorySection']?['name']?.toString(),
      orElse: () => null,
    );
    return StaffSettingsSection(
      title: 'Adviser',
      subtitle: 'Pick your section from the master teacher\u2019s schedule.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isAdviser && advisoryName != null
                ? 'Adviser of $advisoryName'
                : 'Not an adviser',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          if (!isAdviser)
            Text(
              'Only Overview, Workspace and Settings show until you claim a section.',
              style: theme.textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          sections.when(
            loading: () => const SkeletonBox(height: 32),
            error: (e, _) => Text(
              userMessage(e),
              style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
            ),
            data: (list) {
              final mine = list.where((s) => s.advisedByMe).toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (mine.isNotEmpty)
                    for (final s in mine)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                s.name,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: () async {
                                try {
                                  await releaseAdvisorySection(ref, s.id);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Advisory released.'),
                                      ),
                                    );
                                  }
                                } on DioException catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          settingsError(
                                            e,
                                            'Could not release.',
                                          ),
                                        ),
                                      ),
                                    );
                                  }
                                }
                              },
                              child: const Text(
                                'Release',
                                style: TextStyle(fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),
                  if (picking) ...[
                    for (final s in list)
                      Builder(
                        builder: (_) {
                          final selectable = s.claimable || s.advisedByMe;
                          final isSel = selected == s.id;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                alignment: Alignment.centerLeft,
                                side: BorderSide(
                                  color: isSel
                                      ? theme.colorScheme.primary
                                      : theme.colorScheme.outline,
                                  width: isSel ? 2 : 1,
                                ),
                              ),
                              onPressed: selectable
                                  ? () => onSelect(s.id)
                                  : null,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    s.name,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    'Grade ${s.gradeNumber}${s.adviserLabel.isNotEmpty ? ' · Listed as "${s.adviserLabel}"' : ''} · ${!selectable ? (s.holderName != null ? 'Advised by ${s.holderName}' : 'Already claimed') : (isSel ? 'Selected' : 'Select this section')}',
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => onPicking(false),
                            child: const Text('Close'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: FilledButton(
                            onPressed: selected == null
                                ? null
                                : () async {
                                    try {
                                      await claimAdvisorySection(
                                        ref,
                                        selected!,
                                      );
                                      onPicking(false);
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: Text('Advisory saved.'),
                                          ),
                                        );
                                      }
                                    } on DioException catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(
                                              SnackBar(
                                                content: Text(
                                                  settingsError(
                                                    e,
                                                    'Could not save.',
                                                  ),
                                                ),
                                              ),
                                            );
                                      }
                                    }
                                  },
                            child: const Text('Save section'),
                          ),
                        ),
                      ],
                    ),
                  ] else
                    OutlinedButton(
                      onPressed: () => onPicking(true),
                      child: Text(
                        isAdviser ? 'Change section' : 'I\u2019m an adviser',
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MasterTeacherCard extends ConsumerWidget {
  final bool busy;
  final void Function(bool, {required bool takenByOther, String? holderName})
  onToggle;
  const _MasterTeacherCard({required this.busy, required this.onToggle});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(overviewProvider);
    return overview.maybeWhen(
      data: (d) {
        final isMaster = d['isMasterTeacher'] == true;
        final eligible = d['masterTeacherEligible'] == true;
        final taken = d['masterTeacherTaken'] == true;
        final holder = d['masterTeacherHolderName']?.toString();
        final takenByOther = !isMaster && taken;
        if (!eligible && !isMaster) return const SizedBox.shrink();
        return Column(
          children: [
            StaffSettingsSection(
              title: 'Master Teacher',
              subtitle: 'Self-declared designation for grades 7–10 classes.',
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Master Teacher status',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          isMaster
                              ? 'Currently designated — only one designation at a time.'
                              : takenByOther
                              ? (holder != null
                                    ? 'Currently designated by $holder — unavailable until released.'
                                    : 'Currently designated — unavailable until released.')
                              : 'Not designated',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  if (!takenByOther)
                    Switch(
                      value: isMaster,
                      onChanged: busy
                          ? null
                          : (v) => onToggle(
                              v,
                              takenByOther: takenByOther,
                              holderName: holder,
                            ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
