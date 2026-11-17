import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/session.dart';
import '../../shared/user_messages.dart';
import '../../shared/models.dart';
import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

class CoordinatorMeetingForm extends ConsumerStatefulWidget {
  const CoordinatorMeetingForm({
    super.key,
    required this.detail,
    required this.repository,
    this.meeting,
    this.outcome = false,
  });
  final AdmCaseDetail detail;
  final CoordinatorRepository repository;
  final AdmMeeting? meeting;
  final bool outcome;
  @override
  ConsumerState<CoordinatorMeetingForm> createState() => _MeetingFormState();
}

class _MeetingFormState extends ConsumerState<CoordinatorMeetingForm> {
  final _form = GlobalKey<FormState>();
  late final _minutes = TextEditingController(
    text: widget.meeting?.minutes ?? '',
  );
  late final _logbook = TextEditingController(
    text: widget.meeting?.logbook ?? '',
  );
  late DateTime _date = widget.meeting?.datetime != null
      ? admSchoolTime(widget.meeting!.datetime!)
      : admPhilippineNow().add(const Duration(hours: 1));
  late String _venue = widget.meeting?.venue ?? 'school';
  late bool _attended = widget.meeting?.attended ?? true;
  late final Set<String> _invitees = {
    for (final invitee in widget.meeting?.invitees ?? <AdmJson>[])
      admText(invitee['id']),
  };
  late final List<({TextEditingController name, String role})> _attendees = [
    for (final attendee in widget.meeting?.attendees ?? <AdmJson>[])
      (
        name: TextEditingController(text: admText(attendee['name'])),
        role: admText(attendee['role']),
      ),
  ];
  late final Future<List<AdmJson>> _staff = widget.outcome
      ? Future.value(<AdmJson>[])
      : widget.repository.staff(widget.detail);
  bool _busy = false, _allowPop = false, _dirty = false;
  String? _error;

  Future<void> _close() async {
    if (_busy) return;
    if (_dirty &&
        !await admConfirm(
          context,
          'Discard changes?',
          'Your unsaved meeting changes will be lost.',
        )) {
      return;
    }
    if (mounted) {
      setState(() => _allowPop = true);
      Navigator.pop(context);
    }
  }

  Future<void> _pickTime() async {
    final now = admPhilippineNow();
    final initial = _date.isBefore(now) ? now : _date;
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 3, 12, 31),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: initial.hour, minute: initial.minute),
    );
    if (time == null || !mounted) return;
    setState(() {
      _date = DateTime.utc(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
      _dirty = true;
    });
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    final repo = widget.repository;
    if (!identical(repo, ref.read(coordinatorRepositoryProvider))) {
      setState(() => _error = 'Your session changed. Reopen this form.');
      return;
    }
    final when = admSchoolInput(_date, _date.hour, _date.minute);
    if (!widget.outcome && !when.isAfter(DateTime.now())) {
      setState(
        () => _error = 'Pick a future date and time in Philippine time.',
      );
      return;
    }
    if (widget.outcome && widget.meeting?.outcomeOpen(DateTime.now()) != true) {
      setState(
        () => _error = 'Attendance opens 15 minutes before the meeting.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // Re-read workflow gates before submitting an action from a long-open form.
      final latest = await repo.caseFile(widget.detail.id);
      if (latest.closed ||
          latest.underReview ||
          latest.approvedBy.isNotEmpty ||
          (!widget.outcome && !latest.preCertification)) {
        throw ApiException(
          'CASE_CHANGED',
          'This case can no longer be edited. Refresh and review its current stage.',
        );
      }
      if (widget.outcome) {
        await repo.outcome(widget.meeting!.id, {
          'attended': _attended,
          'minutesOfMeeting': _minutes.text.trim(),
          'attendanceLogbookRef': _logbook.text.trim(),
          'attendees': [
            for (final attendee in _attendees)
              {'name': attendee.name.text.trim(), 'role': attendee.role},
          ],
        });
      } else {
        await _staff; // Failed staff lookup must not erase existing invitees.
        final body = {
          'meetingDatetime': when.toIso8601String(),
          'venue': _venue,
          'attendanceLogbookRef': _logbook.text.trim(),
          'inviteeIds': _invitees.toList(),
        };
        if (widget.meeting == null) {
          await repo.book(latest, body);
        } else {
          await repo.reschedule(widget.meeting!.id, body);
        }
      }
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
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
    _minutes.dispose();
    _logbook.dispose();
    for (final attendee in _attendees) {
      attendee.name.dispose();
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
      canPop: _allowPop || (!_busy && !_dirty),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            widget.outcome
                ? 'Meeting outcome'
                : widget.meeting == null
                ? 'Book parent meeting'
                : 'Reschedule meeting',
          ),
          leading: IconButton(
            tooltip: 'Back',
            onPressed: _busy ? null : _close,
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        body: AdmBody(
          children: [
            Text(
              widget.detail.student,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Form(
              key: _form,
              onChanged: () => setState(() => _dirty = true),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!widget.outcome) ...[
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _pickTime,
                      icon: const Icon(Icons.calendar_month),
                      label: Text(
                        '${DateFormat('MMM d, y · h:mm a').format(_date)} PHT',
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _venue,
                      decoration: const InputDecoration(labelText: 'Venue'),
                      items: const [
                        DropdownMenuItem(
                          value: 'school',
                          child: Text('In school'),
                        ),
                        DropdownMenuItem(
                          value: 'home',
                          child: Text('Home visitation'),
                        ),
                      ],
                      onChanged: _busy
                          ? null
                          : (v) => setState(() {
                              _venue = v!;
                              _dirty = true;
                            }),
                    ),
                    const SizedBox(height: 12),
                    FutureBuilder<List<AdmJson>>(
                      future: _staff,
                      builder: (context, snapshot) {
                        if (snapshot.hasError) {
                          return const Text(
                            'Staff could not be loaded. Reopen this form to try again.',
                          );
                        }
                        if (!snapshot.hasData) {
                          return const LinearProgressIndicator();
                        }
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text('Invite staff (up to 10)'),
                            if (snapshot.data!.isEmpty)
                              const Text('No available staff.'),
                            for (final person in snapshot.data!)
                              CheckboxListTile(
                                title: Text(admText(person['fullName'])),
                                subtitle: Text(
                                  admLabel(admText(person['role'])),
                                ),
                                value: _invitees.contains(
                                  admText(person['id']),
                                ),
                                onChanged: _busy
                                    ? null
                                    : (checked) => setState(() {
                                        final id = admText(person['id']);
                                        if (checked == true &&
                                            _invitees.length < 10) {
                                          _invitees.add(id);
                                        } else if (checked != true) {
                                          _invitees.remove(id);
                                        }
                                        _dirty = true;
                                      }),
                              ),
                          ],
                        );
                      },
                    ),
                  ] else ...[
                    SwitchListTile(
                      title: const Text('Parent / guardian attended'),
                      value: _attended,
                      onChanged: _busy
                          ? null
                          : (v) => setState(() {
                              _attended = v;
                              _dirty = true;
                            }),
                    ),
                    if (!_attended)
                      const Text(
                        'After recording the no-show, reschedule this meeting with Home visitation as the venue.',
                      ),
                    TextFormField(
                      controller: _minutes,
                      enabled: !_busy,
                      minLines: 4,
                      maxLines: 8,
                      maxLength: 5000,
                      decoration: const InputDecoration(
                        labelText: 'Minutes / outcome notes',
                      ),
                      validator: (v) => _attended && (v?.trim().isEmpty ?? true)
                          ? 'Record the meeting minutes.'
                          : null,
                    ),
                    for (var i = 0; i < _attendees.length; i++) _attendeeRow(i),
                    if (_attendees.length < 20)
                      TextButton.icon(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                _attendees.add((
                                  name: TextEditingController(),
                                  role: 'parent_guardian',
                                ));
                                _dirty = true;
                              }),
                        icon: const Icon(Icons.person_add_alt),
                        label: const Text('Add attendee'),
                      ),
                  ],
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _logbook,
                    enabled: !_busy,
                    maxLength: 200,
                    decoration: const InputDecoration(
                      labelText: 'Attendance logbook reference',
                    ),
                    validator: (v) =>
                        widget.outcome &&
                            _attended &&
                            (v?.trim().isEmpty ?? true)
                        ? 'Enter the attendance logbook reference.'
                        : null,
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
              child: Text(
                _busy
                    ? 'Saving…'
                    : widget.outcome
                    ? 'Record outcome'
                    : 'Save meeting',
              ),
            ),
            const Text('Online only. Meeting times use Philippine time.'),
          ],
        ),
      ),
    );
  }

  Widget _attendeeRow(int index) {
    const roles = [
      'parent_guardian',
      'teacher',
      'student',
      'guidance_counselor',
      'nurse',
      'principal',
      'lrpc',
      'other',
    ];
    final attendee = _attendees[index];
    return Card(
      key: ValueKey(attendee.name),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            TextFormField(
              controller: attendee.name,
              enabled: !_busy,
              maxLength: 100,
              decoration: const InputDecoration(labelText: 'Attendee name'),
              validator: (v) => (v?.trim().isEmpty ?? true)
                  ? 'Enter a name or remove this attendee.'
                  : null,
            ),
            DropdownButtonFormField<String>(
              initialValue: roles.contains(attendee.role)
                  ? attendee.role
                  : 'other',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Role'),
              items: [
                for (final role in roles)
                  DropdownMenuItem(value: role, child: Text(admLabel(role))),
              ],
              onChanged: _busy
                  ? null
                  : (v) => setState(() {
                      _attendees[index] = (name: attendee.name, role: v!);
                      _dirty = true;
                    }),
            ),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                      // Dispose after the old text field has left the tree.
                      final removed = _attendees.removeAt(index);
                      WidgetsBinding.instance.addPostFrameCallback(
                        (_) => removed.name.dispose(),
                      );
                      _dirty = true;
                    }),
              child: const Text('Remove attendee'),
            ),
          ],
        ),
      ),
    );
  }
}
