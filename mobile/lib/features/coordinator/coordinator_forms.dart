import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../shared/user_messages.dart';
import 'coordinator_data.dart';
import 'coordinator_widgets.dart';
import '../../shared/back_button.dart';

void invalidateCoordinator(WidgetRef ref) {
  ref.invalidate(coordinatorDashboardProvider);
  ref.invalidate(coordinatorListProvider);
  ref.invalidate(coordinatorDevicesProvider);
  ref.invalidate(coordinatorCaseProvider);
  ref.invalidate(coordinatorMonitoringProvider);
  ref.invalidate(coordinatorHistoryProvider);
  ref.invalidate(coordinatorInboxProvider);
  ref.invalidate(coordinatorProfileProvider);
}

class AdmField {
  const AdmField(
    this.label, {
    this.initial = '',
    this.required = true,
    this.min = 1,
    this.max = 1000,
    this.lines = 1,
  });
  final String label, initial;
  final bool required;
  final int min, max, lines;
}

// Full-screen forms retain input on failed writes and block double submission.
class AdmEditPage extends ConsumerStatefulWidget {
  const AdmEditPage({
    super.key,
    required this.title,
    required this.fields,
    required this.repository,
    required this.onSave,
    this.description = '',
    this.action = 'Save',
  });
  final String title, description, action;
  final List<AdmField> fields;
  final CoordinatorRepository repository;
  final Future<void> Function(CoordinatorRepository, List<String>) onSave;
  @override
  ConsumerState<AdmEditPage> createState() => _AdmEditState();
}

class _AdmEditState extends ConsumerState<AdmEditPage> {
  final _form = GlobalKey<FormState>();
  late final _controllers = widget.fields
      .map((f) => TextEditingController(text: f.initial))
      .toList();
  bool _busy = false, _allowPop = false;
  String? _error;
  bool get dirty => [
    for (var i = 0; i < _controllers.length; i++)
      _controllers[i].text != widget.fields[i].initial,
  ].contains(true);
  Future<void> _close() async {
    if (_busy) return;
    if (dirty &&
        !await admConfirm(
          context,
          'Discard changes?',
          'Your unsaved changes will be lost.',
        )) {
      return;
    }
    if (mounted) {
      setState(() => _allowPop = true);
      Navigator.pop(context);
    }
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (!identical(
      widget.repository,
      ref.read(coordinatorRepositoryProvider),
    )) {
      setState(() => _error = 'Your session changed. Reopen this form.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onSave(
        widget.repository,
        _controllers.map((c) => c.text.trim()).toList(),
      );
      if (!mounted || ref.read(authProvider).role != 'adm_coordinator') return;
      if (!identical(
        widget.repository,
        ref.read(coordinatorRepositoryProvider),
      )) {
        return;
      }
      invalidateCoordinator(ref);
      setState(() => _allowPop = true);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = userMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (!auth.loggedIn || auth.role != 'adm_coordinator') {
      return const Scaffold(body: Center(child: Text('Please sign in again.')));
    }
    return PopScope(
      canPop: _allowPop || (!_busy && !dirty),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.title),
          leading: ZBackButton(
            tooltip: 'Back',
            onPressed: _busy ? null : _close,
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        body: AdmBody(
          children: [
            if (widget.description.isNotEmpty) Text(widget.description),
            Form(
              key: _form,
              child: Column(
                children: [
                  for (var i = 0; i < widget.fields.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: TextFormField(
                        controller: _controllers[i],
                        enabled: !_busy,
                        minLines: widget.fields[i].lines,
                        maxLines: widget.fields[i].lines,
                        maxLength: widget.fields[i].max,
                        decoration: InputDecoration(
                          labelText: widget.fields[i].label,
                        ),
                        onChanged: (_) => setState(() {}),
                        validator: (text) {
                          final value = text?.trim() ?? '';
                          final field = widget.fields[i];
                          if (field.required && value.isEmpty) {
                            return 'This field is required.';
                          }
                          if (value.isNotEmpty && value.length < field.min) {
                            return 'Enter at least ${field.min} characters.';
                          }
                          return null;
                        },
                      ),
                    ),
                ],
              ),
            ),
            if (_error != null)
              Semantics(
                liveRegion: true,
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : widget.action),
            ),
            const Text(
              'Online only. Success is shown only after the server confirms the action.',
            ),
          ],
        ),
      ),
    );
  }
}
