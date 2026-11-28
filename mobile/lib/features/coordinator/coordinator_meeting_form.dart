import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/desk_theme.dart';
import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/user_messages.dart';
import '../../shared/models.dart';
import '../../shared/skeletons.dart';
import '../../shared/widgets.dart'
    show
        ErrorView,
        LoadingView,
        ScopePillKind,
        ZBackButton,
        ZContentHeader,
        ZEmpty,
        ZScopePill,
        ZStatusPill;
import '../adviser/student_profile_components.dart';
import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

/// Dedicated, routed meeting screen (book or reschedule). It lives inside the
/// persistent coordinator shell like the adviser Grade Record, so the shell
/// hides its own header and keeps the floating desk navigation.
class CoordinatorMeetingPage extends ConsumerWidget {
  const CoordinatorMeetingPage({
    super.key,
    required this.caseId,
    this.meetingId,
  });
  final String caseId;
  final String? meetingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(coordinatorCaseProvider(caseId));
    final title = meetingId == null ? 'Book parent meeting' : 'Reschedule meeting';
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: detail.when(
        loading: () => _shell(
          context,
          title,
          const LoadingView(layout: SkeletonLayout.record),
        ),
        error: (error, _) => _shell(
          context,
          title,
          ErrorView(
            message: error,
            onRetry: () => ref.invalidate(coordinatorCaseProvider(caseId)),
          ),
        ),
        data: (data) {
          final meeting = meetingId == null
              ? null
              : data.meetings
                    .where((item) => item.id == meetingId)
                    .firstOrNull;
          if (meetingId != null && meeting == null) {
            return _shell(
              context,
              title,
              ErrorView(
                message: 'That meeting is no longer available.',
                onRetry: () =>
                    ref.invalidate(coordinatorCaseProvider(caseId)),
              ),
            );
          }
          return CoordinatorMeetingForm(
            detail: data,
            meeting: meeting,
            repository: ref.read(coordinatorRepositoryProvider),
          );
        },
      ),
    );
  }

  Widget _shell(BuildContext context, String title, Widget body) => Builder(
    builder: (context) => Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: _meetingAppBar(context, title),
      body: body,
    ),
  );
}

PreferredSizeWidget _meetingAppBar(
  BuildContext context,
  String title, {
  VoidCallback? onBack,
}) => AppBar(
  backgroundColor: Theme.of(context).scaffoldBackgroundColor,
  surfaceTintColor: Colors.transparent,
  scrolledUnderElevation: 0,
  shape: Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outline)),
  centerTitle: true,
  leadingWidth: 64,
  leading: ZBackButton(
    icon: const Icon(Icons.chevron_left),
    tooltip: 'Back',
    padding: EdgeInsets.zero,
    onPressed: onBack ?? () => Navigator.maybePop(context),
  ),
  title: Text(title),
);

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

  Future<void> _copyLrn() async {
    if (widget.detail.lrn.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: widget.detail.lrn));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('LRN copied.')));
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (!auth.loggedIn || auth.role != 'adm_coordinator') {
      return const Scaffold(body: Center(child: Text('Please sign in again.')));
    }
    final title = widget.outcome
        ? 'Meeting outcome'
        : widget.meeting == null
        ? 'Book parent meeting'
        : 'Reschedule meeting';
    final scope = ref.watch(coordinatorScopeProvider).asData?.value;
    final detail = widget.detail;
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: Builder(
        builder: (context) => PopScope(
          canPop: _allowPop || (!_busy && !_dirty),
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) _close();
          },
          child: Scaffold(
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            appBar: _meetingAppBar(
              context,
              title,
              onBack: _busy ? null : _close,
            ),
            body: Column(
              children: [
                Expanded(
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: Form(
                  key: _form,
                  onChanged: () => setState(() => _dirty = true),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
                    children: [
                      ZContentHeader(
                        title: widget.outcome
                            ? 'Meeting outcome'
                            : 'Meeting details',
                        icon: LucideIcons.calendarClock,
                        description: widget.outcome
                            ? 'Record attendance, minutes and the logbook reference for this parent meeting.'
                            : widget.meeting == null
                            ? 'Set the parent meeting schedule, venue and staff invitees. Times use Philippine time.'
                            : 'Move the booked parent meeting to a new date, time or venue.',
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (scope != null && scope.schoolYearName.isNotEmpty)
                            ZScopePill(
                              text: scope.schoolYearName,
                              kind: ScopePillKind.schoolYear,
                              compact: true,
                            ),
                          if (scope?.termNumber != null)
                            ZScopePill(
                              text: 'Term ${scope!.termNumber}',
                              kind: ScopePillKind.term,
                              compact: true,
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      StudentIdentityCard(
                        name: detail.student.isEmpty
                            ? 'ADM case'
                            : detail.student,
                        lrn: detail.lrn,
                        subtitle: 'Parent meeting · ${admLabel(detail.stage)}',
                        onCopyLrn: _copyLrn,
                        meta: [
                          if (detail.grade.isNotEmpty)
                            ZScopePill(
                              text: detail.grade,
                              kind: ScopePillKind.grade,
                              compact: true,
                            ),
                          ZStatusPill(
                            text: detail.status.label,
                            tone: admCaseStatusTone(detail.status.key),
                          ),
                        ],
                      ),
                      if (widget.meeting != null) ...[
                        const SizedBox(height: 12),
                        _currentMeetingCard(context),
                      ],
                      if (!widget.outcome) ...[
                        const StudentSectionHeader(
                          icon: LucideIcons.calendarDays,
                          title: 'Schedule',
                        ),
                        StudentSectionCard(
                          padded: true,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              InkWell(
                                onTap: _busy ? null : _pickTime,
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 11,
                                  ),
                                  decoration: BoxDecoration(
                                    color: zSoft(context),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: zLine(context)),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(
                                        LucideIcons.calendarDays,
                                        size: 18,
                                        color: zMutedInk(context),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          '${DateFormat('MMM d, y · h:mm a').format(_date)} PHT',
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: zInk(context),
                                          ),
                                        ),
                                      ),
                                      Icon(
                                        Icons.chevron_right,
                                        size: 18,
                                        color: zMutedInk(context),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: zSoft(context),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: zLine(context)),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      LucideIcons.mapPin,
                                      size: 18,
                                      color: zMutedInk(context),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: DropdownButtonHideUnderline(
                                        child: DropdownButton<String>(
                                          value: _venue,
                                          isExpanded: true,
                                          isDense: true,
                                          borderRadius: BorderRadius.circular(12),
                                          dropdownColor: zCard(context),
                                          icon: Icon(
                                            LucideIcons.chevronDown,
                                            size: 16,
                                            color: zMutedInk(context),
                                          ),
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: zInk(context),
                                          ),
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
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const StudentSectionHeader(
                          icon: LucideIcons.users,
                          title: 'Staff invitees',
                        ),
                        StudentSectionCard(
                          padded: true,
                          child: FutureBuilder<List<AdmJson>>(
                            future: _staff,
                            builder: (context, snapshot) {
                              if (snapshot.hasError) {
                                return Text(
                                  'Staff could not be loaded. Reopen this screen to try again.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: zMutedInk(context),
                                  ),
                                );
                              }
                              if (!snapshot.hasData) {
                                return const ScreenSkeleton(
                                  layout: SkeletonLayout.notifications,
                                  label: 'Loading staff',
                                  section: true,
                                  count: 2,
                                );
                              }
                              return Material(
                                type: MaterialType.transparency,
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          'Invite up to 10 staff',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: zMutedInk(context),
                                          ),
                                        ),
                                      ),
                                      Text(
                                        '${_invitees.length}/10',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: zMutedInk(context),
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (snapshot.data!.isEmpty)
                                    const ZEmpty(
                                      compact: true,
                                      icon: Icons.people_outline,
                                      title: 'No available staff.',
                                    ),
                                  for (final person in snapshot.data!)
                                    CheckboxListTile(
                                      dense: true,
                                      contentPadding: EdgeInsets.zero,
                                      controlAffinity:
                                          ListTileControlAffinity.leading,
                                      title: Text(
                                        admText(person['fullName']),
                                        style: const TextStyle(fontSize: 13),
                                      ),
                                      subtitle: Text(
                                        admLabel(admText(person['role'])),
                                        style: const TextStyle(fontSize: 11),
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
                                ),
                              );
                            },
                          ),
                        ),
                        const StudentSectionHeader(
                          icon: LucideIcons.notebookPen,
                          title: 'Logbook',
                        ),
                        StudentSectionCard(
                          padded: true,
                          child: TextFormField(
                            controller: _logbook,
                            enabled: !_busy,
                            maxLength: 200,
                            decoration: const InputDecoration(
                              labelText: 'Attendance logbook reference',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) =>
                                widget.outcome &&
                                    _attended &&
                                    (v?.trim().isEmpty ?? true)
                                ? 'Enter the attendance logbook reference.'
                                : null,
                          ),
                        ),
                      ] else ...[
                        const StudentSectionHeader(
                          icon: LucideIcons.clipboardCheck,
                          title: 'Attendance',
                        ),
                        StudentSectionCard(
                          padded: true,
                          child: Material(
                            type: MaterialType.transparency,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                SwitchListTile(
                                contentPadding: EdgeInsets.zero,
                                title: const Text(
                                  'Parent / guardian attended',
                                  style: TextStyle(fontSize: 13),
                                ),
                                value: _attended,
                                onChanged: _busy
                                    ? null
                                    : (v) => setState(() {
                                        _attended = v;
                                        _dirty = true;
                                      }),
                              ),
                              if (!_attended)
                                Container(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: zWash(
                                      context,
                                      const Color(0xFFFFFAEF),
                                    ),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    'After recording the no-show, reschedule this meeting with Home visitation as the venue.',
                                    style: TextStyle(
                                      fontSize: 12,
                                      height: 1.4,
                                      color: zMutedInk(context),
                                    ),
                                  ),
                                ),
                              TextFormField(
                                controller: _minutes,
                                enabled: !_busy,
                                minLines: 4,
                                maxLines: 8,
                                maxLength: 5000,
                                decoration: const InputDecoration(
                                  labelText: 'Minutes / outcome notes',
                                  border: OutlineInputBorder(),
                                ),
                                validator: (v) =>
                                    _attended &&
                                        (v?.trim().isEmpty ?? true)
                                    ? 'Record the meeting minutes.'
                                    : null,
                              ),
                              for (var i = 0; i < _attendees.length; i++)
                                _attendeeRow(i),
                              if (_attendees.length < 20)
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => setState(() {
                                            _attendees.add((
                                              name: TextEditingController(),
                                              role: 'parent_guardian',
                                            ));
                                            _dirty = true;
                                          }),
                                    icon: const Icon(
                                      Icons.person_add_alt,
                                      size: 18,
                                    ),
                                    label: const Text('Add attendee'),
                                  ),
                                ),
                            ],
                            ),
                          ),
                        ),
                        const StudentSectionHeader(
                          icon: LucideIcons.notebookPen,
                          title: 'Logbook',
                        ),
                        StudentSectionCard(
                          padded: true,
                          child: TextFormField(
                            controller: _logbook,
                            enabled: !_busy,
                            maxLength: 200,
                            decoration: const InputDecoration(
                              labelText: 'Attendance logbook reference',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) =>
                                widget.outcome &&
                                    _attended &&
                                    (v?.trim().isEmpty ?? true)
                                ? 'Enter the attendance logbook reference.'
                                : null,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
                  ),
                  _footer(context),
                ],
              ),
            ),
          ),
        ),
    );
  }

  Widget _footer(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: zCard(context),
      border: Border(top: BorderSide(color: zLine(context))),
    ),
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
    child: SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: zWash(context, const Color(0xFFFFF5F5)),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: zWash(context, const Color(0xFFFBD5D5)),
                ),
              ),
              child: Text(
                _error!,
                style: TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: zDangerText(Theme.of(context)),
                ),
              ),
            ),
          ],
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(
              backgroundColor: zLift(context, const Color(0xFF2563EB)),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(46),
            ),
            child: Text(
              _busy
                  ? 'Saving…'
                  : widget.outcome
                  ? 'Record outcome'
                  : 'Save meeting',
            ),
          ),
        ],
      ),
    ),
  );

  Widget _currentMeetingCard(BuildContext context) {
    final meeting = widget.meeting!;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: zSoft(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: zLine(context)),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.calendarClock, size: 18, color: zMutedInk(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CURRENTLY BOOKED',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: zMutedInk(context),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${admDate(meeting.datetime?.toIso8601String() ?? '')} · ${meeting.venue == 'home' ? 'Home visitation' : 'In school'}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: zInk(context),
                  ),
                ),
              ],
            ),
          ),
        ],
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
    return Container(
      key: ValueKey(attendee.name),
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: zSoft(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: zLine(context)),
      ),
      child: Column(
          children: [
            TextFormField(
              controller: attendee.name,
              enabled: !_busy,
              maxLength: 100,
              decoration: const InputDecoration(
                labelText: 'Attendee name',
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v?.trim().isEmpty ?? true)
                  ? 'Enter a name or remove this attendee.'
                  : null,
            ),
            DropdownButtonFormField<String>(
              initialValue: roles.contains(attendee.role)
                  ? attendee.role
                  : 'other',
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Role',
                border: OutlineInputBorder(),
              ),
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
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
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
            ),
          ],
        ),
    );
  }
}
