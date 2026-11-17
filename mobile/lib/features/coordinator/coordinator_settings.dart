import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../design/tokens.dart';
import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

class CoordinatorSettingsPage extends ConsumerStatefulWidget {
  const CoordinatorSettingsPage({super.key});
  @override
  ConsumerState<CoordinatorSettingsPage> createState() => _SettingsState();
}

class _SettingsState extends ConsumerState<CoordinatorSettingsPage> {
  bool _busy = false;
  Future<void> _photo() async {
    if (_busy) return;
    final repo = ref.read(coordinatorRepositoryProvider);
    setState(() => _busy = true);
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (file == null || !mounted) return;
      final name = file.name.toLowerCase();
      final mime =
          file.mimeType ??
          (name.endsWith('.png')
              ? 'image/png'
              : name.endsWith('.webp')
              ? 'image/webp'
              : name.endsWith('.gif')
              ? 'image/gif'
              : RegExp(r'\.jpe?g$').hasMatch(name)
              ? 'image/jpeg'
              : '');
      final bytes = await file.readAsBytes();
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      await repo.savePhoto(bytes, mime);
      if (mounted) {
        ref.invalidate(coordinatorProfileProvider);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Profile photo updated.')));
      }
    } catch (e) {
      if (mounted) admError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AdmBody(
    children: [
      AdmAsync(
        value: ref.watch(coordinatorProfileProvider),
        retry: () => ref.invalidate(coordinatorProfileProvider),
        builder: (profile) => AdmSection(
          'Account',
          children: [
            AdmValue('Name', admText(profile['fullName'])),
            const AdmValue('Role', 'ADM Coordinator'),
            OutlinedButton(
              onPressed: () {
                admPush<void>(
                  context,
                  AdmEditPage(
                    title: 'Edit profile',
                    repository: ref.read(coordinatorRepositoryProvider),
                    fields: [
                      AdmField(
                        'Full name',
                        initial: admText(profile['fullName']),
                        max: 100,
                      ),
                    ],
                    onSave: (repo, values) => repo.saveProfile(values[0]),
                  ),
                );
              },
              child: const Text('Edit name'),
            ),
            OutlinedButton.icon(
              onPressed: _busy ? null : _photo,
              icon: const Icon(Icons.add_a_photo_outlined),
              label: Text(_busy ? 'Updating photo…' : 'Update profile photo'),
            ),
          ],
        ),
      ),
      const AdmSection(
        'Workspace appearance',
        children: [
          Text(
            'Fixed dark mint/violet workspace. Web account colors are preserved and are not changed here.',
          ),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              Chip(
                avatar: CircleAvatar(backgroundColor: ZWorkspace.primary),
                label: Text('Mint'),
              ),
              Chip(
                avatar: CircleAvatar(backgroundColor: ZWorkspace.secondary),
                label: Text('Violet'),
              ),
            ],
          ),
        ],
      ),
      const AdmSection(
        'Scope',
        children: [
          Text(
            'The school’s active scope is resolved by the server. Coordinator case and device desks follow the web’s cross-term record scope.',
          ),
        ],
      ),
    ],
  );
}
