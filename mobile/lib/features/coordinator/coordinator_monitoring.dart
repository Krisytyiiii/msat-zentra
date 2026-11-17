import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    final title = admText(data.asData?.value.header['studentName']);
    return Scaffold(
      appBar: AppBar(
        title: Text(title.isEmpty ? 'Enrolled learner' : title),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
          onPressed: () => admClose(context, '/coordinator/enrolled'),
        ),
      ),
      body: AdmBody(
        onRefresh: refresh,
        children: [
          AdmAsync(
            value: data,
            retry: refresh,
            builder: (m) {
              final total = admInt(m.progress['total']);
              final submitted = admInt(m.progress['submitted']);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AdmSection(
                    'Monitoring · read-only',
                    children: [
                      Text(
                        '${admText(m.header['lrn'])} · ${admText(m.header['section'])}',
                      ),
                      AdmValue('Stage', admText(m.header['stageLabel'])),
                      AdmValue(
                        'Principal approval',
                        admDate(admText(m.header['approvedAt'])),
                      ),
                      const Text(
                        'Modules and submissions are managed by the adviser.',
                      ),
                      if (m.header['stage'] == 'enrollment_monitoring' &&
                          total > 0 &&
                          submitted == total)
                        FilledButton(
                          onPressed: _busy ? null : () => _complete(m),
                          child: Text(_busy ? 'Completing…' : 'Complete case'),
                        ),
                    ],
                  ),
                  AdmSection(
                    'Module progress',
                    children: [
                      Text('$submitted / $total submitted'),
                      LinearProgressIndicator(
                        value: total == 0 ? 0 : (submitted / total).clamp(0, 1),
                      ),
                      AdmValue(
                        'Overdue',
                        '${admInt(m.progress['overdueCount'])}',
                      ),
                      AdmValue(
                        'Next due',
                        admDate(admText(m.progress['nextDueAt'])),
                      ),
                    ],
                  ),
                  AdmSection(
                    'Modules',
                    children: [
                      if (m.modules.isEmpty)
                        const Text('No modules released yet.'),
                      for (final module in m.modules)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  admText(module['moduleName']),
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                                Text(
                                  '${admLabel(admText(module['status']))} · ${module['source'] == 'section' ? 'Section module' : 'Case module'}',
                                ),
                                Text(
                                  'Due: ${admDate(admText(module['dueDate']))}',
                                ),
                                if (admText(module['remarks']).isNotEmpty)
                                  Text(admText(module['remarks'])),
                                if (module['submissionKind'] == 'physical')
                                  const Text('Submitted in person'),
                                for (final entry in {
                                  'Learning material': module['submissionUrl'],
                                  'Learner submission':
                                      module['studentSubmissionUrl'],
                                  'Submission file': module['fileUrl'],
                                }.entries)
                                  if (admText(entry.value).isNotEmpty)
                                    TextButton(
                                      onPressed: () => admOpenUrl(
                                        context,
                                        admText(entry.value),
                                      ),
                                      child: Text(entry.key),
                                    ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                  AdmSection(
                    'Devices',
                    children: [
                      if (m.devices.isEmpty) const Text('No devices recorded.'),
                      for (final d in m.devices)
                        AdmValue(
                          '${admText(d['deviceType'])} · ${admText(d['deviceSerial'])}',
                          admText(d['returnedDate']).isEmpty
                              ? 'Issued'
                              : 'Returned ${admDate(admText(d['returnedDate']))}',
                        ),
                    ],
                  ),
                  AdmSection(
                    'Case timeline',
                    children: [
                      if (m.timeline.isEmpty)
                        const Text('No timeline entries.'),
                      for (final event in m.timeline)
                        ListTile(
                          title: Text(admText(event['label'])),
                          subtitle: Text(
                            '${admText(event['detail'])}\n${admDate(admText(event['at'] ?? event['date']))}',
                          ),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
