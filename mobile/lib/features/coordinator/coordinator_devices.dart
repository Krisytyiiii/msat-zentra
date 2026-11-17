import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

class CoordinatorDeviceCard extends ConsumerStatefulWidget {
  const CoordinatorDeviceCard({super.key, required this.device});
  final AdmDevice device;
  @override
  ConsumerState<CoordinatorDeviceCard> createState() => _DeviceState();
}

class _DeviceState extends ConsumerState<CoordinatorDeviceCard> {
  bool _busy = false;
  Future<void> _returnDevice() async {
    if (_busy) return;
    final device = widget.device;
    final repo = ref.read(coordinatorRepositoryProvider);
    setState(() => _busy = true);
    try {
      if (!await admConfirm(
        context,
        'Record device return?',
        '${device.student} · ${device.serial}\nThe device will be marked returned today.',
      )) {
        return;
      }
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      await repo.returnDevice(device.id);
      if (!mounted ||
          !identical(repo, ref.read(coordinatorRepositoryProvider))) {
        return;
      }
      invalidateCoordinator(ref);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Device return recorded.')));
    } catch (e) {
      if (mounted) admError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.device;
    return AdmSection(
      d.student,
      children: [
        Text(d.lrn),
        AdmValue(d.type, d.serial),
        AdmValue('Issued', admDate(d.issuedDate)),
        AdmValue(
          'Status',
          d.returned ? 'Returned · ${admDate(d.returnedDate)}' : 'Issued',
        ),
        if (d.notes.isNotEmpty) AdmValue('Condition notes', d.notes),
        if (!d.returned)
          OutlinedButton(
            onPressed: _busy ? null : _returnDevice,
            child: Text(_busy ? 'Recording…' : 'Record return'),
          ),
      ],
    );
  }
}

class CoordinatorIssueDevicePage extends ConsumerStatefulWidget {
  const CoordinatorIssueDevicePage({super.key});
  @override
  ConsumerState<CoordinatorIssueDevicePage> createState() => _IssueState();
}

class _IssueState extends ConsumerState<CoordinatorIssueDevicePage> {
  int _page = 1;
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final query = (desk: 'deviceCandidates', page: _page, q: _q, filter: '');
    return Scaffold(
      appBar: AppBar(title: const Text('Choose approved learner')),
      body: AdmBody(
        children: [
          const Text(
            'Only principal-approved learners without an issued device can be selected.',
          ),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Search learner or LRN',
            ),
            onChanged: (v) => setState(() {
              _q = v;
              _page = 1;
            }),
          ),
          AdmAsync(
            value: ref.watch(coordinatorListProvider(query)),
            retry: () => ref.invalidate(coordinatorListProvider(query)),
            builder: (data) => Column(
              children: [
                if (data.rows.isEmpty)
                  const Text('No approved learners found.'),
                for (final row in data.rows)
                  ListTile(
                    title: Text(row.student),
                    subtitle: Text(
                      '${row.lrn}\n${row.devicesIssued == 0 ? 'Available' : 'A device is already recorded'}',
                    ),
                    enabled:
                        row.devicesIssued == 0 && row.approvedBy.isNotEmpty,
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      final repo = ref.read(coordinatorRepositoryProvider);
                      final saved = await admPush<bool>(
                        context,
                        AdmEditPage(
                          title: 'Issue device',
                          description: '${row.student} · ${row.lrn}',
                          repository: repo,
                          fields: const [
                            AdmField('Device type', max: 120),
                            AdmField('Serial number', max: 120),
                            AdmField(
                              'Condition notes',
                              required: false,
                              lines: 3,
                            ),
                          ],
                          action: 'Issue device',
                          onSave: (repo, values) => repo.issueDevice(
                            row,
                            values[0],
                            values[1],
                            values[2],
                          ),
                        ),
                      );
                      if (saved == true && context.mounted) {
                        Navigator.pop(context);
                      }
                    },
                  ),
                AdmPager(
                  page: _page,
                  pages: data.totalPages,
                  total: data.total,
                  onPage: (p) => setState(() => _page = p),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
