import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:share_plus/share_plus.dart';

import '../../shared/models.dart';
import '../../shared/widgets.dart';
import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_meeting_form.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

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

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(coordinatorCaseProvider(widget.caseId));
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          title: Text(data.asData?.value.student ?? 'ADM case'),
          leading: ZBackButton(
            tooltip: 'Back',
            icon: const Icon(Icons.arrow_back),
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
              builder: (d) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _summary(d),
                  _records(d),
                  _meetings(d),
                  _evidence(d),
                  _certification(d),
                  _history(d),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summary(AdmCaseDetail d) => AdmSection(
    'Case summary',
    children: [
      Text('${d.lrn} · ${d.grade}'),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          ZStatusPill(text: admLabel(d.stage)),
          ZStatusPill(text: admLabel(d.eligibility)),
        ],
      ),
      if (d.closed)
        const Text(
          'This referral is closed. Workflow actions are unavailable.',
        ),
      if (d.underReview)
        const Text(
          'Awaiting consultation endorsement. Meeting booking is not available yet.',
        ),
      if (d.canBook)
        FilledButton(
          onPressed: _busy ? null : () => _meeting(d),
          child: const Text('Book parent meeting'),
        ),
      if (d.canCreateProfile)
        FilledButton(
          onPressed: _busy
              ? null
              : () => _command(
                  'Create learner profile?',
                  'Continue ${d.student} toward certification. For roster-only learners, the server may provision a linked learner account.',
                  (repo) async {
                    final latest = await repo.caseFile(d.id);
                    if (!latest.canCreateProfile) {
                      throw ApiException(
                        'CASE_CHANGED',
                        'Refresh the case before creating a profile.',
                      );
                    }
                    await repo.createProfile(latest.referralId);
                  },
                ),
          child: const Text('Create learner profile'),
        ),
      if (d.approvedBy.isNotEmpty)
        AdmValue(
          'Principal approval',
          '${d.approvedBy} · ${admDate(d.approvalDate)}',
        ),
    ],
  );

  Widget _records(AdmCaseDetail d) {
    final r = d.referral;
    final a = d.anecdotal;
    return AdmSection(
      'Referral and anecdotal records',
      children: [
        if (r == null)
          const ZEmpty(compact: true, icon: Icons.send_outlined, title: 'No linked referral.')
        else ...[
          AdmValue('Referred by', admText(r['referredBy'])),
          AdmValue('Referral status', admLabel(admText(r['status']))),
          AdmValue('Reason', admText(r['reason'])),
          if (admText(r['notes']).isNotEmpty)
            AdmValue('Notes', admText(r['notes'])),
          if (admText(r['intakeNotes']).isNotEmpty)
            AdmValue('Intake notes', admText(r['intakeNotes'])),
          if (admText(r['resolutionSummary']).isNotEmpty)
            AdmValue('Resolution', admText(r['resolutionSummary'])),
          Text(
            r['referralFormReady'] == true
                ? 'GC Form 03: ready on the web desk.'
                : 'GC Form 03: not marked ready.',
          ),
        ],
        if (a == null)
          const ZEmpty(compact: true, icon: Icons.note_outlined, title: 'No linked anecdotal report.')
        else ...[
          AdmValue('Observed by', admText(a['observer'])),
          AdmValue('Observed', admDate(admText(a['observationDatetime']))),
          AdmValue('Category', admLabel(admText(a['category']))),
          AdmValue('Incident', admText(a['descriptionOfIncident'])),
          AdmValue('Location', admText(a['descriptionOfLocation'])),
          AdmValue('Recommendations', admText(a['recommendations'])),
          OutlinedButton.icon(
            onPressed: () {
              admPush<void>(
                context,
                CoordinatorAnecdotalDocument(id: admText(a['id'])),
              );
            },
            icon: const Icon(Icons.picture_as_pdf_outlined),
            label: const Text('Preview GCForm-01 PDF'),
          ),
        ],
        if (d.sessions.isNotEmpty)
          ExpansionTile(
            title: const Text('Consultation sessions'),
            children: [
              for (final s in d.sessions)
                ListTile(
                  title: Text(
                    '${admLabel(admText(s['sessionType']))} · ${admLabel(admText(s['status']))}',
                  ),
                  subtitle: Text(
                    '${admDate(admText(s['scheduledAt']))}\n${admText(s['sessionNotes'])}\n${admText(s['outcome'])}',
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Widget _meetings(AdmCaseDetail d) => AdmSection(
    'Parent meetings',
    children: [
      if (d.meetings.isEmpty) const ZEmpty(compact: true, icon: Icons.calendar_month_outlined,
        title: 'No parent meetings recorded.'),
      for (final m in d.meetings)
        ExpansionTile(
          title: Text(admDate(m.datetime?.toIso8601String() ?? '')),
          subtitle: Text(
            '${m.venue == 'home' ? 'Home visitation' : 'In school'} · ${m.attended ? 'Attended' : 'Attendance not confirmed'}',
          ),
          children: [
            AdmValue('Minutes', m.minutes),
            AdmValue('Logbook reference', m.logbook),
            for (final p in m.invitees)
              ListTile(
                title: Text(admText(p['fullName'])),
                subtitle: Text(admLabel(admText(p['role']))),
              ),
            for (final p in m.attendees)
              ListTile(
                title: Text(admText(p['name'])),
                subtitle: Text(admLabel(admText(p['role']))),
              ),
            if (d.preCertification && !m.attended)
              OutlinedButton(
                onPressed: _busy ? null : () => _meeting(d, meeting: m),
                child: const Text('Reschedule / arrange home visit'),
              ),
            if (d.preCertification && m.outcomeOpen(DateTime.now()))
              FilledButton(
                onPressed: _busy
                    ? null
                    : () => _meeting(d, meeting: m, outcome: true),
                child: const Text('Record attendance / outcome'),
              ),
            for (final file in m.attachments)
              ListTile(
                title: Text(admText(file['fileName'])),
                onTap: () => admOpenUrl(context, admText(file['fileUrl'])),
                trailing:
                    d.approvedBy.isEmpty &&
                        !d.closed &&
                        (m.attended ||
                            m.datetime?.isAfter(DateTime.now()) == false)
                    ? IconButton(
                        tooltip: 'Remove attachment',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: _busy
                            ? null
                            : () => _command(
                                'Remove attachment?',
                                admText(file['fileName']),
                                (repo) => repo.removeAttachment(
                                  m.id,
                                  admText(file['id']),
                                ),
                              ),
                      )
                    : null,
              ),
            if (d.approvedBy.isEmpty &&
                !d.closed &&
                (m.attended || m.datetime?.isAfter(DateTime.now()) == false) &&
                m.attachments.length < 10)
              TextButton.icon(
                onPressed: _busy ? null : () => _upload(m),
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: const Text('Add documentation photos (5 MB each)'),
              ),
          ],
        ),
      const Text(
        'For a no-show, record the outcome and reschedule the same meeting as a home visit.',
      ),
    ],
  );

  Widget _evidence(AdmCaseDetail d) {
    final engagement =
        d.hasAttendedMeeting ||
        d.forms.any(
          (f) => ['MINUTES_OF_MEETING', 'HV_FORM'].contains(f['formType']),
        );
    final certification = d.forms.any(
      (f) => f['formType'] == 'CERTIFICATION' && f['status'] == 'verified',
    );
    return AdmSection(
      'Evidence checklist',
      children: [
        for (final entry in {
          'Referral on file': d.referral != null,
          'Anecdotal report on file': d.anecdotal != null,
          'Parent engagement': engagement,
          'Certification verified': certification,
        }.entries)
          ListTile(
            leading: Icon(
              entry.value ? Icons.check_circle_outline : Icons.pending_outlined,
            ),
            title: Text(entry.key),
            subtitle: Text(entry.value ? 'On file' : 'Missing'),
          ),
        const Text(
          'This checklist is informational. The server decides eligibility and requires recorded meeting attendance before certification.',
        ),
        for (final form in d.forms)
          ExpansionTile(
            title: Text(admText(form['title'])),
            subtitle: Text(admLabel(admText(form['status']))),
            children: [
              AdmValue('Notes', admText(form['notes'])),
              AdmValue('Recorded', admDate(admText(form['uploadedAt']))),
            ],
          ),
      ],
    );
  }

  Widget _certification(AdmCaseDetail d) => AdmSection(
    'Certification',
    children: [
      AdmValue('Recommendation', admText(d.certification['recommendation'])),
      if (admText(d.certification['certifiedAt']).isNotEmpty)
        AdmValue('Certified', admDate(admText(d.certification['certifiedAt']))),
      if (d.stage == 'certification')
        const Text(
          'Review case history for any Principal return reason before revising.',
        ),
      if (d.canCertify)
        FilledButton(
          onPressed: _busy ? null : () => _certify(d),
          child: const Text('Certify and endorse to Principal'),
        ),
      if (d.canEndorse)
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
          child: const Text('Endorse existing recommendation'),
        ),
      if (!d.canCertify &&
          d.approvedBy.isEmpty &&
          d.stage != 'principal_approval')
        const Text(
          'Certification requires a learner profile, referral, anecdotal record and recorded parent meeting attendance.',
        ),
      if (d.stage == 'principal_approval')
        const Text('Awaiting the Principal’s review and signature.'),
    ],
  );

  Widget _history(AdmCaseDetail d) {
    final key = (profileId: d.profileId, referralId: d.referralId);
    return AdmSection(
      'Case history',
      children: [
        AdmAsync(
          value: ref.watch(coordinatorHistoryProvider(key)),
          retry: () => ref.invalidate(coordinatorHistoryProvider(key)),
          builder: (events) => Column(
            children: [
              if (events.isEmpty) const ZEmpty(compact: true, icon: Icons.history,
                title: 'No history entries.'),
              for (final event in events)
                ListTile(
                  title: Text(
                    admText(event['reason']).isEmpty
                        ? admLabel(admText(event['actionType']))
                        : admText(event['reason']),
                  ),
                  subtitle: Text(
                    '${admText(event['actor'])} · ${admDate(admText(event['at']))}',
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class CoordinatorAnecdotalDocument extends ConsumerWidget {
  const CoordinatorAnecdotalDocument({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final document = ref.watch(coordinatorAnecdotalPdfProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('GCForm-01 · read-only'),
        actions: [
          Builder(
            builder: (context) => IconButton(
              tooltip: 'Share PDF',
              icon: const Icon(Icons.ios_share),
              onPressed: document.asData == null
                  ? null
                  : () async {
                      try {
                        final box = context.findRenderObject() as RenderBox?;
                        await SharePlus.instance.share(
                          ShareParams(
                            files: [
                              XFile.fromData(
                                document.asData!.value,
                                mimeType: 'application/pdf',
                                name: 'GCForm-01.pdf',
                              ),
                            ],
                            fileNameOverrides: ['GCForm-01.pdf'],
                            sharePositionOrigin: box == null
                                ? null
                                : box.localToGlobal(Offset.zero) & box.size,
                          ),
                        );
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Could not share the PDF.'),
                            ),
                          );
                        }
                      }
                    },
            ),
          ),
        ],
      ),
      body: AdmAsync(
        value: document,
        retry: () => ref.invalidate(coordinatorAnecdotalPdfProvider(id)),
        builder: (bytes) => PdfViewer.data(
          bytes,
          sourceName: 'gcform01-$id',
          params: PdfViewerParams(
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            errorBannerBuilder: (_, error, stack, document) => const ErrorView(
              message: 'The document could not be displayed.',
            ),
          ),
        ),
      ),
    );
  }
}
