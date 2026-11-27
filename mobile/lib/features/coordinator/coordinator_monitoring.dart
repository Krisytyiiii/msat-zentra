import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/theme.dart' show zLightTheme;
import '../../shared/widgets.dart';
import '../adviser/student_profile_components.dart';

import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';
import '../../design/desk_theme.dart';

class CoordinatorMonitoringPage extends ConsumerStatefulWidget {
  const CoordinatorMonitoringPage({super.key, required this.caseId});
  final String caseId;
  @override
  ConsumerState<CoordinatorMonitoringPage> createState() => _MonitoringState();
}

class _MonitoringState extends ConsumerState<CoordinatorMonitoringPage>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorMonitoringPage> {
  bool _busy = false;

  Future<void> _complete(AdmMonitoring data) async {
    if (_busy) return;
    final repo = ref.read(coordinatorRepositoryProvider);
    setState(() => _busy = true);
    try {
      if (!await admConfirm(
        context,
        'Complete ADM case?',
        'Confirm that ${admText(data.header['studentName'])} has completed the ADM program. The server will recheck module requirements.',
      )) {
        return;
      }
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      await repo.completeCase(admText(data.header['profileId']));
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

  Future<void> _copyLrn(String lrn) async {
    await Clipboard.setData(ClipboardData(text: lrn));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('LRN copied.')));
  }

  @override
  Future<void> reload() async => ref
      .refresh(coordinatorMonitoringProvider(widget.caseId).future)
      .then((_) {});

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(coordinatorMonitoringProvider(widget.caseId));
    final theme = overviewScreenTheme(zLightTheme());
    return Theme(
      data: theme,
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
            onPressed: () => admClose(context, '/coordinator/enrolled'),
          ),
          title: const Text('Student Profile'),
        ),
        body: data.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(16),
            child: ZSkeletonList(count: 4),
          ),
          error: (e, _) => ErrorView(message: e, onRetry: refresh),
          data: (m) => RefreshIndicator(
            onRefresh: refresh,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 900),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [_loaded(m)],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _loaded(AdmMonitoring m) {
    final name = admText(m.header['studentName']);
    final lrn = admText(m.header['lrn']);
    final section = admText(m.header['section']);
    final stageLabel = admText(m.header['stageLabel']);
    final approvedAt = admText(m.header['approvedAt']);
    final completed = m.header['stage'] == 'completion';
    final total = admInt(m.progress['total']);
    final submitted = admInt(m.progress['submitted']);
    final overdue = admInt(m.progress['overdueCount']);
    final remaining = (total - submitted).clamp(0, total);
    final nextDue = admText(m.progress['nextDueAt']);
    final canComplete =
        m.header['stage'] == 'enrollment_monitoring' &&
        total > 0 &&
        submitted == total;
    final subtitle = [
      if (section.isNotEmpty) section,
      if (stageLabel.isNotEmpty) stageLabel,
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StudentIdentityCard(
          name: name.isEmpty ? 'Enrolled learner' : name,
          lrn: lrn,
          subtitle: subtitle,
          dotColor: completed
              ? zLift(context, const Color(0xFF1F8A48))
              : zLift(context, const Color(0xFF2563EB)),
          badge: StudentTonePill(
            text: completed ? 'Completed' : 'In progress',
            tone: completed ? StudentTone.green : StudentTone.blue,
          ),
          onCopyLrn: () => _copyLrn(lrn),
        ),
        StudentSectionHeader(
          icon: LucideIcons.activity,
          color: zLift(context, const Color(0xFF2563EB)),
          title: 'MODULE PROGRESS',
        ),
        StudentSectionCard(
          padded: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: StudentMetricTile(
                      label: 'SUBMITTED',
                      value: '$submitted / $total',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: StudentMetricTile(
                      label: 'OVERDUE',
                      value: '$overdue',
                      tone: overdue > 0 ? StudentTone.red : StudentTone.neutral,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: StudentMetricTile(
                      label: 'REMAINING',
                      value: '$remaining',
                      tone: remaining > 0
                          ? StudentTone.amber
                          : StudentTone.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: total == 0 ? 0 : (submitted / total).clamp(0, 1),
                  minHeight: 6,
                  color: zLift(context, const Color(0xFF2563EB)),
                  backgroundColor: zLift(
                    context,
                    const Color(0xFF2563EB),
                  ).withValues(alpha: 0.14),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                total == 0
                    ? 'No modules released yet.'
                    : remaining == 0
                    ? 'All $total modules submitted · On track'
                    : '$remaining of $total modules still due${nextDue.isEmpty ? '' : ' · Next due ${admDate(nextDue)}'}',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: remaining == 0
                      ? zLift(context, const Color(0xFF1F8A48))
                      : zMutedInk(context),
                ),
              ),
              if (approvedAt.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  'Principal approval ${admDate(approvedAt)}',
                  style: TextStyle(fontSize: 11, color: zMutedInk(context)),
                ),
              ],
              if (canComplete) ...[
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: zLift(context, const Color(0xFF2563EB)),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: _busy ? null : () => _complete(m),
                  child: Text(_busy ? 'Completing…' : 'Complete case'),
                ),
              ],
            ],
          ),
        ),
        StudentSectionHeader(
          icon: LucideIcons.bookOpen,
          color: zLift(context, const Color(0xFFB45309)),
          title: 'MODULES (${m.modules.length})',
        ),
        if (m.modules.isEmpty)
          const StudentSectionCard(
            child: ZEmpty(
              compact: true,
              icon: Icons.book_outlined,
              title: 'No modules released yet.',
            ),
          )
        else
          StudentSectionCard(
            padded: true,
            child: Column(
              children: [
                for (var i = 0; i < m.modules.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  _ModuleRow(module: m.modules[i]),
                ],
              ],
            ),
          ),
        StudentSectionHeader(
          icon: LucideIcons.tablet,
          color: zLift(context, const Color(0xFF1F8A48)),
          title: 'DEVICES (${m.devices.length})',
        ),
        if (m.devices.isEmpty)
          const StudentSectionCard(
            child: ZEmpty(
              compact: true,
              icon: Icons.devices_outlined,
              title: 'No devices recorded.',
            ),
          )
        else
          StudentSectionCard(
            padded: true,
            child: Column(
              children: [
                for (var i = 0; i < m.devices.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  _DeviceRow(device: m.devices[i]),
                ],
              ],
            ),
          ),
        StudentSectionHeader(
          icon: LucideIcons.history,
          color: zLift(context, const Color(0xFF2563EB)),
          title: 'CASE TIMELINE (${m.timeline.length})',
        ),
        if (m.timeline.isEmpty)
          const StudentSectionCard(
            child: ZEmpty(
              compact: true,
              icon: Icons.history,
              title: 'No timeline entries.',
            ),
          )
        else
          StudentSectionCard(
            padded: true,
            child: Column(
              children: [
                for (var i = 0; i < m.timeline.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  _TimelineRow(event: m.timeline[i]),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _ModuleRow extends StatelessWidget {
  const _ModuleRow({required this.module});
  final AdmJson module;

  StudentTone get _tone {
    final status = admText(module['status']).toLowerCase();
    if (status.contains('submit') ||
        status.contains('complete') ||
        status.contains('graded')) {
      return StudentTone.green;
    }
    if (status.contains('overdue')) return StudentTone.red;
    if (status.contains('late')) return StudentTone.amber;
    return StudentTone.neutral;
  }

  @override
  Widget build(BuildContext context) {
    final due = admText(module['dueDate']);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: zSoft(context),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: zLine(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 7,
                height: 7,
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: switch (_tone) {
                    StudentTone.green => zLift(
                      context,
                      const Color(0xFF1F8A48),
                    ),
                    StudentTone.red => zLift(context, const Color(0xFFDC2626)),
                    StudentTone.amber => zLift(
                      context,
                      const Color(0xFFB45309),
                    ),
                    _ => zLift(context, const Color(0xFF2563EB)),
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  admText(module['moduleName']),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: zInk(context),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              StudentTonePill(
                text: admLabel(admText(module['status'])),
                tone: _tone,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 15),
            child: Text(
              '${module['source'] == 'section' ? 'Section module' : 'Case module'}${due.isEmpty ? '' : ' · Due ${admDate(due)}'}',
              style: TextStyle(fontSize: 11, color: zMutedInk(context)),
            ),
          ),
          if (admText(module['remarks']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 15, top: 4),
              child: Text(
                admText(module['remarks']),
                style: TextStyle(
                  fontSize: 11,
                  height: 1.35,
                  color: zInk(context),
                ),
              ),
            ),
          if (module['submissionKind'] == 'physical')
            Padding(
              padding: EdgeInsets.only(left: 15, top: 4),
              child: Text(
                'Submitted in person',
                style: TextStyle(fontSize: 11, color: zMutedInk(context)),
              ),
            ),
          for (final entry in {
            'Learning material': module['submissionUrl'],
            'Learner submission': module['studentSubmissionUrl'],
            'Submission file': module['fileUrl'],
          }.entries)
            if (admText(entry.value).isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => admOpenUrl(context, admText(entry.value)),
                  style: TextButton.styleFrom(
                    foregroundColor: zLift(context, const Color(0xFF2563EB)),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    padding: const EdgeInsets.only(left: 15, top: 4),
                    textStyle: const TextStyle(fontSize: 11),
                  ),
                  child: Text(entry.key),
                ),
              ),
        ],
      ),
    );
  }
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({required this.device});
  final AdmJson device;

  @override
  Widget build(BuildContext context) {
    final returned = admText(device['returnedDate']).isNotEmpty;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: zSoft(context),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: zLine(context)),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.tablet, size: 16, color: zMutedInk(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${admText(device['deviceType'])} · ${admText(device['deviceSerial'])}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: zInk(context),
                  ),
                ),
                if (returned)
                  Text(
                    'Returned ${admDate(admText(device['returnedDate']))}',
                    style: TextStyle(fontSize: 11, color: zMutedInk(context)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          StudentTonePill(
            text: returned ? 'Returned' : 'Issued',
            tone: returned ? StudentTone.green : StudentTone.blue,
          ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.event});
  final AdmJson event;

  @override
  Widget build(BuildContext context) {
    final at = admText(event['at'] ?? event['date']);
    final detail = admText(event['detail']);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: zSoft(context),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: zLine(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            admText(event['label']),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: zInk(context),
            ),
          ),
          if (detail.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              detail,
              style: TextStyle(
                fontSize: 11,
                height: 1.35,
                color: zInk(context),
              ),
            ),
          ],
          if (at.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              admDate(at),
              style: TextStyle(fontSize: 11, color: zMutedInk(context)),
            ),
          ],
        ],
      ),
    );
  }
}
