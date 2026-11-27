import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:share_plus/share_plus.dart';

import '../../design/overview_theme.dart';
import '../../design/theme.dart' show zLightTheme;
import '../../shared/models.dart';
import '../../shared/pdf_download.dart';
import '../../shared/widgets.dart';
import '../adviser/student_profile_components.dart';
import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_meeting_form.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';
import '../../design/desk_theme.dart';

class CoordinatorCasePage extends ConsumerStatefulWidget {
  const CoordinatorCasePage({super.key, required this.caseId});
  final String caseId;
  @override
  ConsumerState<CoordinatorCasePage> createState() => _CaseState();
}

class _CaseState extends ConsumerState<CoordinatorCasePage>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorCasePage> {
  bool _busy = false;
  @override
  Future<void> reload() async {
    final data = ref.read(coordinatorCaseProvider(widget.caseId)).asData?.value;
    if (data != null) {
      ref.invalidate(
        coordinatorHistoryProvider((
          profileId: data.profileId,
          referralId: data.referralId,
        )),
      );
    }
    await ref
        .refresh(coordinatorCaseProvider(widget.caseId).future)
        .then((_) {});
  }

  Future<void> _command(
    String title,
    String message,
    Future<void> Function(CoordinatorRepository) command,
  ) async {
    if (_busy) return;
    final repo = ref.read(coordinatorRepositoryProvider);
    setState(() => _busy = true);
    try {
      if (!await admConfirm(context, title, message)) return;
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      await command(repo);
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      invalidateCoordinator(ref);
      await refresh();
    } catch (e) {
      if (mounted) admError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _meeting(
    AdmCaseDetail d, {
    AdmMeeting? meeting,
    bool outcome = false,
  }) async {
    await admPush<bool>(
      context,
      CoordinatorMeetingForm(
        detail: d,
        meeting: meeting,
        outcome: outcome,
        repository: ref.read(coordinatorRepositoryProvider),
      ),
    );
    if (mounted) await refresh();
  }

  Future<void> _certify(AdmCaseDetail d) async {
    final repo = ref.read(coordinatorRepositoryProvider);
    await admPush<bool>(
      context,
      AdmEditPage(
        title: 'Certify and endorse',
        repository: repo,
        description:
            '${d.student}\nCreating the certification also sends the case to the Principal. Only the Principal can approve and sign it.',
        action: 'Create certification and endorse',
        fields: [
          AdmField(
            'ADM recommendation',
            initial: admText(d.certification['recommendation']),
            min: 10,
            max: 5000,
            lines: 6,
          ),
        ],
        onSave: (repo, values) async {
          final latest = await repo.caseFile(d.id);
          if (!latest.canCertify) {
            throw ApiException(
              'CASE_CHANGED',
              'Refresh this case before certifying.',
            );
          }
          await repo.certify(latest.profileId, values[0]);
        },
      ),
    );
    if (mounted) await refresh();
  }

  Future<void> _upload(AdmMeeting meeting) async {
    if (_busy) return;
    final repo = ref.read(coordinatorRepositoryProvider);
    setState(() => _busy = true);
    try {
      final images = await ImagePicker().pickMultiImage();
      if (images.isEmpty) return;
      if (images.length > 5 ||
          images.length + meeting.attachments.length > 10) {
        throw ApiException(
          'UPLOAD_INVALID',
          'Choose up to five images at a time, with at most ten per meeting.',
        );
      }
      final files = <({String name, String mime, List<int> bytes})>[];
      for (final image in images) {
        // File names are metadata; use MIME where the platform supplies it.
        final name = image.name.toLowerCase();
        final mime =
            image.mimeType ??
            (name.endsWith('.png')
                ? 'image/png'
                : name.endsWith('.webp')
                ? 'image/webp'
                : RegExp(r'\.jpe?g$').hasMatch(name)
                ? 'image/jpeg'
                : '');
        if (!['image/jpeg', 'image/png', 'image/webp'].contains(mime) ||
            await image.length() > 5 * 1024 * 1024) {
          throw ApiException(
            'UPLOAD_INVALID',
            'Use JPG, PNG or WEBP images, 5 MB each.',
          );
        }
        files.add((
          name: image.name,
          mime: mime,
          bytes: await image.readAsBytes(),
        ));
      }
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      await repo.upload(meeting.id, files);
      if (mounted) {
        invalidateCoordinator(ref);
        await refresh();
      }
    } catch (e) {
      if (mounted) admError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyLrn(String lrn) async {
    if (lrn.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: lrn));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('LRN copied.')));
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(coordinatorCaseProvider(widget.caseId));
    return Theme(
      data: overviewScreenTheme(zLightTheme()),
      child: PopScope(
        canPop: !_busy,
        child: Scaffold(
          backgroundColor: Colors.white,
          appBar: AppBar(
            backgroundColor: Colors.white,
            surfaceTintColor: Colors.transparent,
            scrolledUnderElevation: 0,
            shape: const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
            centerTitle: true,
            leadingWidth: 64,
            title: Text(data.asData?.value.student ?? 'ADM case'),
            leading: ZBackButton(
              tooltip: 'Back',
              icon: const Icon(LucideIcons.chevronLeft),
              padding: EdgeInsets.zero,
              onPressed: _busy
                  ? null
                  : () => admClose(context, '/coordinator/referrals'),
            ),
          ),
          body: AdmBody(
            onRefresh: refresh,
            children: [
              if (_busy) const LinearProgressIndicator(),
              AdmAsync(
                value: data,
                retry: refresh,
                builder: (d) => _content(d),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _content(AdmCaseDetail d) => LayoutBuilder(
    builder: (context, constraints) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _identity(d),
        ..._board(d, constraints.maxWidth),
        _eligibility(d),
        _sessions(d),
        _history(d),
      ],
    ),
  );

  List<Widget> _board(AdmCaseDetail d, double width) {
    final referral = _referralCard(d);
    final anecdotal = _anecdotalCard(d);
    final meetings = _meetings(d);
    final evidence = _evidence(d);
    final certify = _certification(d);
    if (width < 640) {
      return [referral, anecdotal, meetings, evidence, certify];
    }
    return [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: referral),
          const SizedBox(width: 12),
          Expanded(child: anecdotal),
        ],
      ),
      meetings,
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: evidence),
          const SizedBox(width: 12),
          Expanded(child: certify),
        ],
      ),
    ];
  }

  Widget _identity(AdmCaseDetail d) {
    final subtitle = d.preparedBy.isEmpty ? '' : 'Referred by ${d.preparedBy}';
    final dot = switch (d.eligibility) {
      'eligible' => zLift(context, const Color(0xFF1F8A48)),
      'ineligible' => zLift(context, const Color(0xFFDC2626)),
      _ => zLift(context, const Color(0xFFB45309)),
    };
    return StudentIdentityCard(
      name: d.student.isEmpty ? 'ADM case' : d.student,
      lrn: d.lrn,
      subtitle: subtitle,
      dotColor: dot,
      meta: [
        if (d.grade.isNotEmpty)
          ZScopePill(text: d.grade, kind: ScopePillKind.grade, compact: true),
        StudentTonePill(
          text: admLabel(d.stage),
          tone: d.closed
              ? StudentTone.neutral
              : d.approvedBy.isNotEmpty
              ? StudentTone.green
              : StudentTone.blue,
        ),
      ],
      onCopyLrn: () => _copyLrn(d.lrn),
    );
  }

  Widget _stepCard({
    required IconData icon,
    required Color color,
    required String title,
    required String description,
    required Widget child,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      StudentSectionHeader(icon: icon, color: color, title: title),
      StudentSectionCard(
        padded: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              description,
              style: TextStyle(
                fontSize: 11,
                height: 1.45,
                color: zMutedInk(context),
              ),
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    ],
  );

  Widget _referralCard(AdmCaseDetail d) {
    final referral = d.referral;
    final referralId = d.referralId.isNotEmpty
        ? d.referralId
        : referral == null
        ? ''
        : admText(referral['id']);
    return _stepCard(
      icon: LucideIcons.send,
      color: zLift(context, const Color(0xFF2563EB)),
      title: 'REFERRAL',
      description: 'Check who referred the learner and read the GC Form 03 referral form.',
      child: referral == null
          ? const _EmptyLine(text: 'No referral form on file.')
          : _FileTile(
              title: 'GCForm-03',
              meta: '${d.student} · ${d.lrn}',
              icon: LucideIcons.fileText,
              foreground: zLift(context, const Color(0xFFB45309)),
              background: zWash(context, const Color(0xFFFFFAEF)),
              border: zWash(context, const Color(0xFFF7E5B8)),
              onTap: referralId.isEmpty
                  ? null
                  : () => admPush<void>(
                      context,
                      CoordinatorAnecdotalDocument(
                        id: referralId,
                        title: 'GCForm-03',
                        fileName: 'GCForm-03.pdf',
                        referralForm: true,
                      ),
                    ),
            ),
    );
  }

  Widget _anecdotalCard(AdmCaseDetail d) {
    final anecdotal = d.anecdotal;
    final anecdotalId = anecdotal == null ? '' : admText(anecdotal['id']);
    return _stepCard(
      icon: LucideIcons.fileText,
      color: zLift(context, const Color(0xFFB45309)),
      title: 'ANECDOTAL',
      description: "Review the adviser's anecdotal report (GCForm-01) and its recommendations.",
      child: anecdotal == null
          ? const _EmptyLine(text: 'No anecdotal write-up on file.')
          : _FileTile(
              title: 'GCForm-01',
              meta: '${d.student} · ${d.lrn}',
              icon: LucideIcons.fileText,
              foreground: zLift(context, const Color(0xFF1F8A48)),
              background: zWash(context, const Color(0xFFF1FBF4)),
              border: zWash(context, const Color(0xFFCFF0DA)),
              onTap: anecdotalId.isEmpty
                  ? null
                  : () => admPush<void>(
                      context,
                      CoordinatorAnecdotalDocument(id: anecdotalId),
                    ),
            ),
    );
  }

  Widget _meetings(AdmCaseDetail d) => _stepCard(
    icon: LucideIcons.calendarCheck,
    color: zLift(context, const Color(0xFF1F8A48)),
    title: 'MEETINGS',
    description: 'Log the parent meeting outcome — attended (minutes + logbook) or no-show (rebook as home visit).',
    child: d.meetings.isEmpty
        ? const _EmptyLine(text: 'No parent meetings recorded.')
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < d.meetings.length; i++) ...[
                if (i > 0) const SizedBox(height: 8),
                _MeetingCard(
                  meeting: d.meetings[i],
                  approved: d.approvedBy.isNotEmpty,
                  closed: d.closed,
                  preCertification: d.preCertification,
                  busy: _busy,
                  nested: true,
                  onReschedule: () => _meeting(d, meeting: d.meetings[i]),
                  onOutcome: () =>
                      _meeting(d, meeting: d.meetings[i], outcome: true),
                  onUpload: () => _upload(d.meetings[i]),
                  onRemoveAttachment: (fileId, fileName) => _command(
                    'Remove attachment?',
                    fileName,
                    (repo) => repo.removeAttachment(d.meetings[i].id, fileId),
                  ),
                ),
              ],
            ],
          ),
  );

  Widget _evidence(AdmCaseDetail d) => _stepCard(
    icon: LucideIcons.shieldCheck,
    color: zLift(context, const Color(0xFF1F8A48)),
    title: 'EVIDENCE',
    description: 'Confirm every collected form in the evidence chain and open details per form.',
    child: d.forms.isEmpty
        ? const _EmptyLine(text: 'No forms recorded yet.')
        : LayoutBuilder(
            builder: (context, constraints) {
              final width = (constraints.maxWidth - 8) / 2;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final form in d.forms)
                    SizedBox(
                      width: width,
                      child: _EvidenceTile(
                        form: form,
                        label: _formLabel(form),
                        onTap: () => _showFormSheet(form),
                      ),
                    ),
                ],
              );
            },
          ),
  );

  Widget _certification(AdmCaseDetail d) {
    final recommendation = admText(d.certification['recommendation']).trim();
    final verified = d.forms.any(
      (f) => f['formType'] == 'CERTIFICATION' && f['status'] == 'verified',
    );
    final callout = verified
        ? 'Certification is verified on this case — see the Evidence chain for its details. Endorsing passes it to the Principal for signature.'
        : d.stage == 'principal_approval'
        ? 'Awaiting the Principal’s review and signature.'
        : d.stage == 'certification'
        ? 'Review case history for any Principal return reason before revising.'
        : !d.canCertify && d.approvedBy.isEmpty
        ? 'Certification requires a learner profile, referral, anecdotal record and recorded parent meeting attendance.'
        : 'Endorsing locks the recommendation and sends it to the Principal for signature.';
    return _stepCard(
      icon: LucideIcons.badgeCheck,
      color: zLift(context, const Color(0xFF2563EB)),
      title: 'CERTIFY',
      description: 'Write the ADM recommendation and create the certification.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'RECOMMENDATION & CERTIFICATION',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: zMutedInk(context),
            ),
          ),
          const SizedBox(height: 6),
          if (recommendation.isEmpty)
            Text(
              'No recommendation recorded yet.',
              style: TextStyle(fontSize: 12, color: zMutedInk(context)),
            )
          else
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: zSoft(context),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: zLine(context)),
              ),
              child: Text(
                recommendation,
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: zInk(context),
                ),
              ),
            ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: verified
                  ? zWash(context, const Color(0xFFF1FBF4))
                  : zWash(context, const Color(0xFFFFFAEF)),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: verified
                    ? zWash(context, const Color(0xFFCFF0DA))
                    : zWash(context, const Color(0xFFF7E5B8)),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  verified ? LucideIcons.checkCircle : LucideIcons.info,
                  size: 14,
                  color: verified
                      ? zLift(context, const Color(0xFF1F8A48))
                      : zLift(context, const Color(0xFFB45309)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    callout,
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.45,
                      color: verified
                          ? zLift(context, Color(0xFF1F8A48))
                          : zLift(context, Color(0xFFB45309)),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (d.canCertify) ...[
            SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : () => _certify(d),
              child: Text('Certify and endorse to Principal'),
            ),
          ],
          if (d.canEndorse) ...[
            SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => _command(
                      'Endorse to Principal?',
                      'Send the existing recommendation for Principal review and signature.',
                      (repo) async {
                        final latest = await repo.caseFile(d.id);
                        if (!latest.canEndorse) {
                          throw ApiException(
                            'CASE_CHANGED',
                            'Refresh the case before endorsing.',
                          );
                        }
                        await repo.endorse(latest.profileId);
                      },
                    ),
              child: Text('Endorse existing recommendation'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _eligibility(AdmCaseDetail d) {
    final engagement =
        d.hasAttendedMeeting ||
        d.forms.any(
          (f) => ['MINUTES_OF_MEETING', 'HV_FORM'].contains(f['formType']),
        );
    final certification = d.forms.any(
      (f) => f['formType'] == 'CERTIFICATION' && f['status'] == 'verified',
    );
    final items = [
      (
        label: 'Referral on file',
        hint: 'GC Form 03 filed',
        ok: d.referral != null,
      ),
      (
        label: 'Anecdotal report on file',
        hint: 'GCForm-01 filed',
        ok: d.anecdotal != null,
      ),
      (
        label: 'Parent engagement',
        hint: 'Meeting attended or home visit filed',
        ok: engagement,
      ),
      (
        label: 'ADM certification verified',
        hint: 'Recommendation recorded',
        ok: certification,
      ),
    ];
    final done = items.where((item) => item.ok).length;
    final tone = switch (d.eligibility) {
      'eligible' => StudentTone.green,
      'ineligible' => StudentTone.red,
      _ => StudentTone.amber,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StudentSectionHeader(
          icon: LucideIcons.clipboardCheck,
          title: 'ELIGIBILITY CHECKLIST',
        ),
        StudentSectionCard(
          padded: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '$done of ${items.length} complete',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: zMutedInk(context),
                      ),
                    ),
                  ),
                  StudentTonePill(text: admLabel(d.eligibility), tone: tone),
                ],
              ),
              for (final item in items) ...[
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Divider(height: 1, color: zLine(context)),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: item.ok
                            ? zWash(context, Color(0xFFF1FBF4))
                            : zSoft(context),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: item.ok
                              ? zWash(context, Color(0xFFCFF0DA))
                              : zLine(context),
                        ),
                      ),
                      child: Icon(
                        item.ok ? LucideIcons.check : LucideIcons.circleDashed,
                        size: 12,
                        color: item.ok
                            ? zLift(context, Color(0xFF1F8A48))
                            : zMutedInk(context),
                      ),
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.label,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: zInk(context),
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            item.hint,
                            style: TextStyle(
                              fontSize: 11,
                              color: zMutedInk(context),
                            ),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(width: 8),
                    StudentTonePill(
                      text: item.ok ? 'On file' : 'Missing',
                      tone: item.ok ? StudentTone.green : StudentTone.red,
                    ),
                  ],
                ),
              ],
              SizedBox(height: 12),
              Container(
                padding: EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: zSoft(context),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: zLine(context)),
                ),
                child: Text(
                  'Eligibility is derived from the checklist — it cannot be typed manually.',
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    color: zMutedInk(context),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _sessions(AdmCaseDetail d) {
    if (d.sessions.isEmpty) return SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StudentSectionHeader(
          icon: LucideIcons.calendarClock,
          color: zLift(context, Color(0xFF1F8A48)),
          title: 'CONSULTATION SESSIONS',
        ),
        for (var i = 0; i < d.sessions.length; i++) ...[
          if (i > 0) SizedBox(height: 8),
          _SessionCard(session: d.sessions[i]),
        ],
      ],
    );
  }

  String _formLabel(AdmJson form) {
    const labels = {
      'REFERRAL_FORM': 'Referral form',
      'ANECDOTAL_REPORT': 'Anecdotal report',
      'MINUTES_OF_MEETING': 'Minutes of meeting',
      'HV_FORM': 'Home visitation form',
      'CERTIFICATION': 'ADM certification',
      'PRINCIPAL_SIGNAGE': 'Principal signage',
    };
    final type = admText(form['formType']);
    return labels[type] ?? admLabel(type);
  }

  void _showFormSheet(AdmJson form) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final verified = admText(form['status']) == 'verified';
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _formLabel(form),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: zInk(context),
                          ),
                        ),
                      ),
                      SizedBox(width: 8),
                      StudentTonePill(
                        text: admLabel(admText(form['status'])),
                        tone: verified ? StudentTone.green : StudentTone.amber,
                      ),
                    ],
                  ),
                  SizedBox(height: 12),
                  _RecordGroup(
                    items: [
                      _RecordItem(
                        icon: LucideIcons.calendarDays,
                        label: 'Recorded',
                        value: admDate(admText(form['uploadedAt'])),
                      ),
                      _RecordItem(
                        icon: LucideIcons.stickyNote,
                        label: 'Notes',
                        value: admText(form['notes']),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _history(AdmCaseDetail d) {
    final key = (profileId: d.profileId, referralId: d.referralId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StudentSectionHeader(icon: LucideIcons.history, title: 'CASE HISTORY'),
        AdmAsync(
          value: ref.watch(coordinatorHistoryProvider(key)),
          retry: () => ref.invalidate(coordinatorHistoryProvider(key)),
          builder: (events) => events.isEmpty
              ? StudentSectionCard(
                  child: ZEmpty(
                    compact: true,
                    icon: Icons.history,
                    title: 'No history entries.',
                  ),
                )
              : StudentSectionCard(
                  padded: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var i = 0; i < events.length; i++) ...[
                        if (i > 0)
                          Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: Divider(height: 1, color: zLine(context)),
                          ),
                        _HistoryRow(event: events[i]),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _RecordItem {
  _RecordItem({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
}

/// Icon-led label/value rows with breathing room and dividers, so long
/// referral/anecdotal text reads as a record instead of a wall of letters.
class _RecordGroup extends StatelessWidget {
  const _RecordGroup({required this.items});
  final List<_RecordItem> items;

  @override
  Widget build(BuildContext context) {
    final visible = items
        .where((item) => item.value.trim().isNotEmpty)
        .toList(growable: false);
    if (visible.isEmpty) {
      return Text(
        'No record details available.',
        style: TextStyle(fontSize: 12, color: zMutedInk(context)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < visible.length; i++) ...[
          if (i > 0)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Divider(height: 1, color: zLine(context)),
            ),
          _RecordRow(item: visible[i]),
        ],
      ],
    );
  }
}

class _RecordRow extends StatelessWidget {
  const _RecordRow({required this.item});
  final _RecordItem item;

  @override
  Widget build(BuildContext context) {
    final fg = zLift(context, const Color(0xFF2563EB));
    final bg = zSoft(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: zLine(context)),
          ),
          child: Icon(item.icon, size: 14, color: fg),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.label,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                  color: zMutedInk(context),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                item.value,
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.45,
                  color: zInk(context),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session});
  final AdmJson session;

  StudentTone get _tone {
    final status = admText(session['status']).toLowerCase();
    if (status.contains('complete') || status.contains('done')) {
      return StudentTone.green;
    }
    if (status.contains('cancel') || status.contains('no_show')) {
      return StudentTone.red;
    }
    if (status.contains('schedul') || status.contains('pending')) {
      return StudentTone.amber;
    }
    return StudentTone.neutral;
  }

  @override
  Widget build(BuildContext context) {
    final notes = admText(session['sessionNotes']).trim();
    final outcome = admText(session['outcome']).trim();
    return StudentSectionCard(
      padded: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  admLabel(admText(session['sessionType'])),
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: zInk(context),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              StudentTonePill(
                text: admLabel(admText(session['status'])),
                tone: _tone,
              ),
            ],
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Icon(
                LucideIcons.calendarDays,
                size: 12,
                color: zMutedInk(context),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  admDate(admText(session['scheduledAt'])),
                  style: TextStyle(fontSize: 11, color: zMutedInk(context)),
                ),
              ),
            ],
          ),
          if (notes.isNotEmpty) ...[
            const SizedBox(height: 8),
            _SessionText(label: 'SESSION NOTES', value: notes),
          ],
          if (outcome.isNotEmpty) ...[
            const SizedBox(height: 8),
            _SessionText(label: 'OUTCOME', value: outcome),
          ],
        ],
      ),
    );
  }
}

class _SessionText extends StatelessWidget {
  const _SessionText({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
          color: zMutedInk(context),
        ),
      ),
      const SizedBox(height: 2),
      Text(
        value,
        style: TextStyle(fontSize: 12, height: 1.45, color: zInk(context)),
      ),
    ],
  );
}

class _MeetingCard extends StatelessWidget {
  const _MeetingCard({
    required this.meeting,
    required this.approved,
    required this.closed,
    required this.preCertification,
    required this.busy,
    required this.onReschedule,
    required this.onOutcome,
    required this.onUpload,
    required this.onRemoveAttachment,
    this.nested = false,
  });

  final AdmMeeting meeting;
  final bool approved, closed, preCertification, busy, nested;
  final VoidCallback onReschedule, onOutcome, onUpload;
  final void Function(String fileId, String fileName) onRemoveAttachment;

  @override
  Widget build(BuildContext context) {
    final past = meeting.datetime?.isAfter(DateTime.now()) == false;
    final canEdit = !approved && !closed && (meeting.attended || past);
    final invitees = [for (final p in meeting.invitees) admText(p['fullName'])]
        .where((name) => name.isNotEmpty)
        .join(', ');
    final attendees = [for (final p in meeting.attendees) admText(p['name'])]
        .where((name) => name.isNotEmpty)
        .join(', ');
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                admDate(meeting.datetime?.toIso8601String() ?? ''),
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: zInk(context),
                ),
              ),
            ),
            const SizedBox(width: 8),
            StudentTonePill(
              text: meeting.attended ? 'Attended' : 'Not confirmed',
              tone: meeting.attended ? StudentTone.green : StudentTone.amber,
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Icon(
              meeting.venue == 'home' ? LucideIcons.house : LucideIcons.mapPin,
              size: 12,
              color: zMutedInk(context),
            ),
            const SizedBox(width: 4),
            Text(
              meeting.venue == 'home' ? 'Home visitation' : 'In school',
              style: TextStyle(fontSize: 11, color: zMutedInk(context)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _RecordGroup(
          items: [
            _RecordItem(
              icon: LucideIcons.clock,
              label: 'Minutes',
              value: meeting.minutes,
            ),
            _RecordItem(
              icon: LucideIcons.hash,
              label: 'Logbook reference',
              value: meeting.logbook,
            ),
            _RecordItem(
              icon: LucideIcons.users,
              label: 'Invitees',
              value: invitees,
            ),
            _RecordItem(
              icon: LucideIcons.userCheck,
              label: 'Attendees',
              value: attendees,
            ),
          ],
        ),
        if (meeting.attachments.isNotEmpty) ...[
          const SizedBox(height: 12),
          for (final file in meeting.attachments)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: zSoft(context),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: zLine(context)),
                    ),
                    child: Icon(
                      LucideIcons.paperclip,
                      size: 13,
                      color: zLift(context, Color(0xFF2563EB)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InkWell(
                      onTap: () =>
                          admOpenUrl(context, admText(file['fileUrl'])),
                      child: Text(
                        admText(file['fileName']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: zLift(context, Color(0xFF2563EB)),
                        ),
                      ),
                    ),
                  ),
                  if (canEdit)
                    IconButton(
                      tooltip: 'Remove attachment',
                      visualDensity: VisualDensity.compact,
                      iconSize: 16,
                      color: zLift(context, const Color(0xFFDC2626)),
                      icon: const Icon(LucideIcons.trash2),
                      onPressed: busy
                          ? null
                          : () => onRemoveAttachment(
                              admText(file['id']),
                              admText(file['fileName']),
                            ),
                    ),
                ],
              ),
            ),
        ],
        if (canEdit && meeting.attachments.length < 10)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: busy ? null : onUpload,
              icon: const Icon(LucideIcons.camera, size: 16),
              label: const Text('Add documentation photos (5 MB each)'),
            ),
          ),
        if (preCertification && !meeting.attended) ...[
          const SizedBox(height: 4),
          OutlinedButton(
            onPressed: busy ? null : onReschedule,
            child: const Text('Reschedule / arrange home visit'),
          ),
        ],
        if (preCertification && meeting.outcomeOpen(DateTime.now())) ...[
          const SizedBox(height: 8),
          FilledButton(
            onPressed: busy ? null : onOutcome,
            child: const Text('Record attendance / outcome'),
          ),
        ],
      ],
    );
    if (!nested) {
      return StudentSectionCard(padded: true, child: body);
    }
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: zSoft(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: zLine(context)),
      ),
      child: body,
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.event});
  final AdmJson event;

  @override
  Widget build(BuildContext context) {
    final reason = admText(event['reason']);
    final title = reason.isEmpty
        ? admLabel(admText(event['actionType']))
        : reason;
    final meta = [
      admText(event['actor']),
      admDate(admText(event['at'])),
    ].where((part) => part.isNotEmpty && part != '—').join(' · ');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: zSoft(context),
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: zLine(context)),
          ),
          child: Icon(
            LucideIcons.clock,
            size: 14,
            color: zLift(context, Color(0xFF2563EB)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                  color: zInk(context),
                ),
              ),
              if (meta.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  meta,
                  style: TextStyle(fontSize: 11, color: zMutedInk(context)),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Full-width document action tile: PDF tile, title/subtitle and an open cue.
class CoordinatorAnecdotalDocument extends ConsumerStatefulWidget {
  const CoordinatorAnecdotalDocument({
    super.key,
    required this.id,
    this.title = 'GCForm-01',
    this.fileName = 'GCForm-01.pdf',
    this.referralForm = false,
  });
  final String id;
  final String title, fileName;
  final bool referralForm;

  @override
  ConsumerState<CoordinatorAnecdotalDocument> createState() =>
      _AnecdotalDocumentState();
}

class _AnecdotalDocumentState
    extends ConsumerState<CoordinatorAnecdotalDocument> {
  final _pdfController = PdfViewerController();
  final _zoom = ValueNotifier<double>(1);
  bool _viewerReady = false;
  late final PdfViewerParams _params = PdfViewerParams(
    backgroundColor: Colors.white,
    margin: 12,
    pageDropShadow: const BoxShadow(
      color: Color(0x47000000),
      blurRadius: 18,
      offset: Offset(0, 6),
    ),
    onViewerReady: (document, controller) {
      if (!mounted) return;
      setState(() => _viewerReady = true);
      _syncZoom();
    },
    errorBannerBuilder: (_, error, stack, document) =>
        const ErrorView(message: 'The document could not be displayed.'),
  );

  @override
  void initState() {
    super.initState();
    _pdfController.addListener(_syncZoom);
  }

  void _syncZoom() {
    if (mounted && _pdfController.isReady) {
      _zoom.value = _pdfController.currentZoom;
    }
  }

  @override
  void dispose() {
    _pdfController.removeListener(_syncZoom);
    _zoom.dispose();
    super.dispose();
  }

  Future<void> _share(BuildContext context, Uint8List bytes) async {
    try {
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              bytes,
              mimeType: 'application/pdf',
              name: widget.fileName,
            ),
          ],
          fileNameOverrides: [widget.fileName],
          sharePositionOrigin: box == null
              ? null
              : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not share the PDF.')),
        );
      }
    }
  }

  Future<void> _download(BuildContext context, Uint8List bytes) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final saved = await savePdfToDevice(
        fileName: widget.fileName,
        bytes: bytes,
      );
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            saved == null ? 'Download cancelled.' : '${widget.fileName} saved.',
          ),
        ),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not save the PDF.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final anecdotal = coordinatorAnecdotalPdfProvider(widget.id);
    final gcForm03 = coordinatorGcForm03Provider(widget.id);
    final document = widget.referralForm
        ? ref.watch(gcForm03)
        : ref.watch(anecdotal);
    final bytes = document.asData?.value;
    return Theme(
      data: overviewScreenTheme(zLightTheme()),
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          shape: const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
          centerTitle: true,
          leadingWidth: 64,
          leading: ZBackButton(
            icon: const Icon(LucideIcons.chevronLeft),
            tooltip: 'Back',
            padding: EdgeInsets.zero,
            onPressed: () => admClose(context, '/coordinator/files'),
          ),
          title: Text(widget.title),
          actions: [
            PopupMenuButton<String>(
              tooltip: 'Document actions',
              enabled: bytes != null,
              icon: const Icon(LucideIcons.moreVertical),
              onSelected: (value) {
                if (bytes == null) return;
                if (value == 'share') _share(context, bytes);
                if (value == 'download') _download(context, bytes);
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'share',
                  child: Row(
                    children: [
                      Icon(LucideIcons.share2, size: 16, color: zInk(context)),
                      SizedBox(width: 10),
                      Text('Share'),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: 'download',
                  child: Row(
                    children: [
                      Icon(
                        LucideIcons.download,
                        size: 16,
                        color: zInk(context),
                      ),
                      SizedBox(width: 10),
                      Text('Download'),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(width: 4),
          ],
        ),
        body: AdmAsync(
          value: document,
          retry: () =>
              ref.invalidate(widget.referralForm ? gcForm03 : anecdotal),
          builder: (bytes) => Stack(
            children: [
              Positioned.fill(
                child: PdfViewer.data(
                  bytes,
                  sourceName: widget.referralForm
                      ? 'gcform03-${widget.id}'
                      : 'gcform01-${widget.id}',
                  controller: _pdfController,
                  params: _params,
                ),
              ),
              if (_viewerReady)
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: SafeArea(
                    top: false,
                    child: Row(
                      children: [
                        const Spacer(),
                        Material(
                          elevation: 4,
                          borderRadius: BorderRadius.circular(8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Zoom out',
                                color: zInk(context),
                                onPressed: () => _pdfController.zoomDown(),
                                icon: const Icon(Icons.remove),
                              ),
                              ValueListenableBuilder<double>(
                                valueListenable: _zoom,
                                builder: (_, zoom, _) => Text(
                                  '${(zoom * 100).round()}%',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: zInk(context),
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Zoom in',
                                color: zInk(context),
                                onPressed: () => _pdfController.zoomUp(),
                                icon: const Icon(Icons.add),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(fontSize: 12, height: 1.4, color: zMutedInk(context)),
  );
}

/// Folder-style file tile: icon, file name, learner meta and an optional cue.
class _FileTile extends StatelessWidget {
  const _FileTile({
    required this.title,
    required this.meta,
    required this.icon,
    required this.foreground,
    required this.background,
    required this.border,
    this.onTap,
  });

  final String title, meta;
  final IconData icon;
  final Color foreground, background, border;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: zSoft(context),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: BorderSide(color: zLine(context)),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: border),
              ),
              child: Icon(icon, size: 17, color: foreground),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: zInk(context),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: zMutedInk(context),
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(LucideIcons.chevronRight, size: 16, color: zMutedInk(context)),
          ],
        ),
      ),
    ),
  );
}

/// One tile of the evidence chain: form name and verified/pending state.
class _EvidenceTile extends StatelessWidget {
  const _EvidenceTile({
    required this.form,
    required this.label,
    required this.onTap,
  });

  final AdmJson form;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final verified = admText(form['status']) == 'verified';
    return Material(
      color: zSoft(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: zLine(context)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                verified ? LucideIcons.checkCircle : LucideIcons.circleDashed,
                size: 16,
                color: verified
                    ? zLift(context, const Color(0xFF1F8A48))
                    : zLift(context, const Color(0xFFB45309)),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                  color: zInk(context),
                ),
              ),
              const SizedBox(height: 8),
              StudentTonePill(
                text: admLabel(admText(form['status'])),
                tone: verified ? StudentTone.green : StudentTone.amber,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
