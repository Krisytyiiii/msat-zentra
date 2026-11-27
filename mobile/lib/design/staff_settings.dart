// Shared staff Settings presentation.
//
// The teacher/adviser Settings desk and the ADM coordinator Settings desk render
// the same light shell, section cards and profile/password editors, so the two
// workspaces stay pixel-identical. Each desk supplies its own profile source
// and write endpoints; only the surrounding sections differ.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/api_client.dart';
import '../shared/spinner.dart';
import '../shared/user_messages.dart';
import '../shared/widgets.dart';
import 'brand.dart';
import 'settings_theme.dart';
import 'theme_picker.dart';
import 'desk_theme.dart';

/// A staff member's display identity, whatever desk supplied it.
class StaffIdentity {
  const StaffIdentity({required this.fullName, this.photoUrl});
  final String fullName;
  final String? photoUrl;
}

/// The scoped light Settings shell: white app bar with a Back control, page
/// heading and the shared white card stack.
class StaffSettingsScaffold extends StatelessWidget {
  const StaffSettingsScaffold({
    super.key,
    required this.children,
    required this.backFallback,
  });

  final List<Widget> children;

  /// Where Back goes when there is no route to pop (a deep link).
  final String backFallback;

  @override
  Widget build(BuildContext context) {
    final theme = settingsScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          centerTitle: true,
          shape: Border(bottom: BorderSide(color: zLine(context))),
          leading: ZBackButton(
            onPressed: () {
              final router = GoRouter.maybeOf(context);
              if (router != null) {
                if (router.canPop()) {
                  router.pop();
                } else {
                  router.go(backFallback);
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
              description: 'Your profile, appearance, and account security.',
            ),
            Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Divider(height: 1, color: zSoft(context)),
            ),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// One white Settings section: accent icon tile, title/subtitle and content.
class StaffSettingsSection extends StatelessWidget {
  const StaffSettingsSection({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  static IconData _icon(String title) => switch (title) {
    'Profile' => LucideIcons.user,
    'Account' => LucideIcons.user,
    'Adviser' => LucideIcons.graduationCap,
    'Master Teacher' => LucideIcons.badgeCheck,
    'Appearance' => LucideIcons.sun,
    'Password' => LucideIcons.lock,
    _ => LucideIcons.lock,
  };

  @override
  Widget build(BuildContext context) => ZCard(
    padding: const EdgeInsets.all(12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: zLift(context, const Color(0xFF2563EB)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(_icon(title), color: Colors.white, size: 16),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: zInk(context),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.45,
                      color: zMutedInk(context),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Divider(height: 1, color: zSoft(context)),
        ),
        child,
      ],
    ),
  );
}

/// Profile card: avatar + photo picker + display name editor.
class StaffProfileEditor extends ConsumerStatefulWidget {
  const StaffProfileEditor({
    super.key,
    required this.identity,
    required this.onSaveName,
    required this.onSavePhoto,
  });

  final StaffIdentity identity;
  final Future<void> Function(String fullName) onSaveName;
  final Future<void> Function(List<int> bytes, String mime) onSavePhoto;

  @override
  ConsumerState<StaffProfileEditor> createState() => _StaffProfileEditorState();
}

class _StaffProfileEditorState extends ConsumerState<StaffProfileEditor> {
  late final _name = TextEditingController(text: widget.identity.fullName);
  bool _photoBusy = false;

  @override
  void didUpdateWidget(StaffProfileEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.identity.fullName != widget.identity.fullName &&
        _name.text == oldWidget.identity.fullName) {
      _name.text = widget.identity.fullName;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 2 * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Photo must be 2MB or smaller.')),
        );
      }
      return;
    }
    final ext = file.path.split('.').last.toLowerCase();
    final mime = ext == 'png' ? 'image/png' : 'image/jpeg';
    setState(() => _photoBusy = true);
    try {
      await widget.onSavePhoto(bytes, mime);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Profile photo updated.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(userMessage(e, fallback: 'Could not update photo.')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  void _choosePhotoSource() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.camera),
              title: const Text('Take photo', style: TextStyle(fontSize: 13)),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text(
                'Choose from gallery',
                style: TextStyle(fontSize: 13),
              ),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhoto(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _saveName() async {
    final value = _name.text.trim();
    if (value.isEmpty || value.length > 100) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name must be 1–100 characters.')),
      );
      return;
    }
    try {
      await widget.onSaveName(value);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Profile updated.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              userMessage(e, fallback: 'Could not update profile.'),
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return StaffSettingsSection(
      title: 'Profile',
      subtitle: 'Your display name and photo.',
      child: Column(
        children: [
          Row(
            children: [
              TeacherAvatar(photoUrl: widget.identity.photoUrl, radius: 28),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  icon: _photoBusy
                      ? const ZSpinner(size: 14)
                      : const Icon(LucideIcons.camera, size: 16),
                  label: Text(_photoBusy ? 'Uploading…' : 'Change photo'),
                  onPressed: _photoBusy ? null : _choosePhotoSource,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Full name'),
            maxLength: 100,
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: _saveName,
              child: const Text('Save profile'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Password card: current/new/confirm fields against the shared auth endpoint.
class StaffPasswordEditor extends ConsumerStatefulWidget {
  const StaffPasswordEditor({super.key});

  @override
  ConsumerState<StaffPasswordEditor> createState() =>
      _StaffPasswordEditorState();
}

class _StaffPasswordEditorState extends ConsumerState<StaffPasswordEditor> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_next.text.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters.');
      return;
    }
    if (_next.text != _confirm.text) {
      setState(() => _error = 'New passwords do not match.');
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.dio.post(
        '/api/auth/change-password',
        data: {'currentPassword': _current.text, 'newPassword': _next.text},
      );
      _current.clear();
      _next.clear();
      _confirm.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Password updated. Use your new password next time you sign in.',
            ),
          ),
        );
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(
          () => _error = userMessage(
            e,
            fallback: 'We couldn’t update your password. Please try again.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return StaffSettingsSection(
      title: 'Password',
      subtitle: 'Choose a new password at least 8 characters long.',
      child: Column(
        children: [
          TextField(
            controller: _current,
            decoration: const InputDecoration(labelText: 'Current password'),
            obscureText: true,
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _next,
            decoration: const InputDecoration(labelText: 'New password'),
            obscureText: true,
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _confirm,
            decoration: const InputDecoration(
              labelText: 'Confirm new password',
            ),
            obscureText: true,
          ),
          if (_error != null) ...[
            const SizedBox(height: 4),
            Text(
              _error!,
              style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
            ),
          ],
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Change password'),
            ),
          ),
        ],
      ),
    );
  }
}

/// The shared fixed workspace appearance preview card.
class StaffAppearanceSection extends StatelessWidget {
  const StaffAppearanceSection({super.key});

  @override
  Widget build(BuildContext context) => const StaffSettingsSection(
    title: 'Appearance',
    subtitle: 'Choose how the app appears on your device.',
    child: WorkspaceThemePicker(),
  );
}
