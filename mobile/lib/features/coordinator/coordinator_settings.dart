// ADM coordinator Settings.
//
// Renders the adviser desk's shared Settings presentation (light shell, section
// cards, profile and password editors) against the coordinator's own profile
// endpoints. Teacher-only cards (Adviser claim, Master Teacher, Grade flags) do
// not apply here.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/settings_theme.dart';
import '../../design/staff_settings.dart';
import '../../shared/widgets.dart';
import 'coordinator_data.dart';

class CoordinatorSettingsPage extends ConsumerWidget {
  const CoordinatorSettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(coordinatorProfileProvider);
    return Theme(
      // Build the white Settings desk from the light palette so its cards,
      // fields and buttons hover like the adviser Settings screen.
      data: settingsScreenTheme(Theme.of(context)),
      child: StaffSettingsScaffold(
        backFallback: '/coordinator/overview',
        children: [
          profile.when(
            loading: () => const ZSkeletonList(count: 2),
            error: (e, _) => ErrorView(
              message: e,
              onRetry: () => ref.invalidate(coordinatorProfileProvider),
            ),
            data: (p) => Column(
              children: [
                StaffProfileEditor(
                  identity: StaffIdentity(
                    fullName: p['fullName']?.toString() ?? 'ADM Coordinator',
                    photoUrl: p['photoUrl']?.toString(),
                  ),
                  onSaveName: (value) async {
                    await ref
                        .read(coordinatorRepositoryProvider)
                        .saveProfile(value);
                    ref.invalidate(coordinatorProfileProvider);
                  },
                  onSavePhoto: (bytes, mime) async {
                    await ref
                        .read(coordinatorRepositoryProvider)
                        .savePhoto(bytes, mime);
                    ref.invalidate(coordinatorProfileProvider);
                  },
                ),
                const SizedBox(height: 8),
                const StaffAppearanceSection(),
                const SizedBox(height: 8),
                const StaffPasswordEditor(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
