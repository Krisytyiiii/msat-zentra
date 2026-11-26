import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../design/theme.dart' show zLightTheme;
import '../../shared/widgets.dart';

import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

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
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Back',
            padding: EdgeInsets.zero,
            onPressed: () => admClose(context, '/coordinator/enrolled'),
          ),
          title: const Text('Enrolled Learner'),
        ),
        body: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: data.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
              error: (e, _) => ErrorView(message: e, onRetry: refresh),
              data: (m) => RefreshIndicator(
                onRefresh: refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
                  children: [_content(m)],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _content(AdmMonitoring m) {
    final name = admText(m.header['studentName']);
    final lrn = admText(m.header['lrn']);
    final section = admText(m.header['section']);
    final stageLabel = admText(m.header['stageLabel']);
    final approvedAt = admText(m.header['approvedAt']);
    final total = admInt(m.progress['total']);
    final submitted = admInt(m.progress['submitted']);
    final overdue = admInt(m.progress['overdueCount']);
    final nextDue = admText(m.progress['nextDueAt']);
    final canComplete =
        m.header['stage'] == 'enrollment_monitoring' &&
        total > 0 &&
        submitted == total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ZContentHeader(
          title: name.isEmpty ? 'Enrolled learner' : name,
          icon: LucideIcons.school,
          description: 'Monitoring · read-only',
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (lrn.isNotEmpty)
              ZPill(
                label: 'LRN',
                tone: StatusTone.neutral,
                badge: true,
                child: Text(lrn),
              ),
            if (section.isNotEmpty)
              ZPill(
                label: 'Section',
                tone: StatusTone.blue,
                badge: true,
                child: Text(section),
              ),
            if (stageLabel.isNotEmpty)
              ZPill(
                label: 'Stage',
                tone: StatusTone.blue,
                badge: true,
                child: Text(stageLabel),
              ),
            if (approvedAt.isNotEmpty)
              ZPill(
                label: 'Principal approval',
                tone: StatusTone.green,
                badge: true,
                child: Text(admDate(approvedAt)),
              ),
          ],
        ),
        _SectionCard(
          title: 'Module progress',
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$submitted / $total submitted',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ),
                if (overdue > 0)
                  ZStatusPill(text: '$overdue overdue', tone: StatusTone.red),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: total == 0 ? 0 : (submitted / total).clamp(0, 1),
                minHeight: 8,
                backgroundColor: const Color(0xFFF1F5F9),
                color: const Color(0xFF2563EB),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                if (nextDue.isNotEmpty)
                  _Meta(
                    icon: LucideIcons.calendar,
                    text: 'Next due ${admDate(nextDue)}',
                  ),
                const _Meta(
                  icon: LucideIcons.bookOpen,
                  text: 'Adviser-managed submissions',
                ),
              ],
            ),
            if (canComplete) ...[
              const SizedBox(height: 12),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: _busy ? null : () => _complete(m),
                child: Text(_busy ? 'Completing…' : 'Complete case'),
              ),
            ],
          ],
        ),
        _SectionCard(
          title: 'Modules (${m.modules.length})',
          children: [
            if (m.modules.isEmpty)
              const ZEmpty(
                compact: true,
                icon: Icons.book_outlined,
                title: 'No modules released yet.',
              ),
            for (final module in m.modules) _ModuleCard(module: module),
          ],
        ),
        _SectionCard(
          title: 'Devices (${m.devices.length})',
          children: [
            if (m.devices.isEmpty)
              const ZEmpty(
                compact: true,
                icon: Icons.devices_outlined,
                title: 'No devices recorded.',
              ),
            for (final d in m.devices)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${admText(d['deviceType'])} · ${admText(d['deviceSerial'])}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF172033),
                        ),
                      ),
                    ),
                    ZStatusPill(
                      text: admText(d['returnedDate']).isEmpty
                          ? 'Issued'
                          : 'Returned',
                      tone: admText(d['returnedDate']).isEmpty
                          ? StatusTone.blue
                          : StatusTone.green,
                    ),
                  ],
                ),
              ),
          ],
        ),
        _SectionCard(
          title: 'Case timeline (${m.timeline.length})',
          children: [
            if (m.timeline.isEmpty)
              const ZEmpty(
                compact: true,
                icon: Icons.history,
                title: 'No timeline entries.',
              ),
            for (final event in m.timeline)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  admText(event['label']),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  '${admText(event['detail'])}${admText(event['detail']).isEmpty ? '' : ' · '}${admDate(admText(event['at'] ?? event['date']))}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: const Color(0xFFE2E8F0)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        ...children,
      ],
    ),
  );
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 14, color: const Color(0xFF8B9BBA)),
      const SizedBox(width: 5),
      Flexible(
        child: Text(
          text,
          style: const TextStyle(fontSize: 12, color: Color(0xFF8B9BBA)),
        ),
      ),
    ],
  );
}

class _ModuleCard extends StatelessWidget {
  const _ModuleCard({required this.module});
  final AdmJson module;

  StatusTone get _tone {
    final status = admText(module['status']).toLowerCase();
    if (status.contains('submit') ||
        status.contains('complete') ||
        status.contains('graded')) {
      return StatusTone.green;
    }
    if (status.contains('overdue')) return StatusTone.red;
    if (status.contains('late')) return StatusTone.amber;
    return StatusTone.neutral;
  }

  @override
  Widget build(BuildContext context) {
    final due = admText(module['dueDate']);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE6ECF4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  admText(module['moduleName']),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF172033),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ZStatusPill(
                text: admLabel(admText(module['status'])),
                tone: _tone,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${module['source'] == 'section' ? 'Section module' : 'Case module'}${due.isEmpty ? '' : ' · Due ${admDate(due)}'}',
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          ),
          if (admText(module['remarks']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                admText(module['remarks']),
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
            ),
          if (module['submissionKind'] == 'physical')
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text(
                'Submitted in person',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
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
                  child: Text(entry.key),
                ),
              ),
        ],
      ),
    );
  }
}
