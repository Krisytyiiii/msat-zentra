import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/screen_search.dart';
import '../../shared/widgets.dart';
import 'coordinator_data.dart';
import 'coordinator_devices.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

class CoordinatorOverviewPage extends ConsumerStatefulWidget {
  const CoordinatorOverviewPage({super.key});
  @override
  ConsumerState<CoordinatorOverviewPage> createState() => _OverviewState();
}

class _OverviewState extends ConsumerState<CoordinatorOverviewPage>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorOverviewPage> {
  static const _meetingPreview = (
    desk: 'referrals',
    page: 1,
    q: '',
    filter: '',
  );
  @override
  Future<void> reload() async {
    await Future.wait([
      ref
          .refresh(coordinatorDashboardProvider.future)
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ref
          .refresh(coordinatorListProvider(_meetingPreview).future)
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(coordinatorProfileProvider);
    final meetings = ref.watch(coordinatorListProvider(_meetingPreview));
    return AdmBody(
      onRefresh: refresh,
      children: [
        Text(
          'Welcome, ${profile.asData?.value['fullName'] ?? 'ADM Coordinator'}',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const Text('Your ADM desk · school-managed scope'),
        AdmAsync(
          value: ref.watch(coordinatorDashboardProvider),
          retry: refresh,
          builder: (data) {
            final kpis = admMap(data['kpis']);
            final devices = admMap(data['deviceSummary']);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AdmSection(
                  'Needs attention',
                  children: [
                    _link(
                      'Awaiting principal signature',
                      admInt(kpis['pendingSignature']),
                      '/coordinator/certifications',
                    ),
                    _link(
                      'Cases needing revision',
                      admInt(data['needsRevision']),
                      '/coordinator/certifications',
                    ),
                  ],
                ),
                AdmSection(
                  'Upcoming meetings · recent cases',
                  children: [
                    AdmAsync(
                      value: meetings,
                      retry: () => ref.invalidate(
                        coordinatorListProvider(_meetingPreview),
                      ),
                      builder: (page) {
                        // Dashboard rows have no meetings. The queue exposes each
                        // case's latest slot, so label this bounded preview honestly.
                        final upcoming =
                            page.rows
                                .where(
                                  (r) =>
                                      r.meeting?.datetime != null &&
                                      !r.meeting!.attended &&
                                      r.meeting!.datetime!.isAfter(
                                        DateTime.now(),
                                      ),
                                )
                                .toList()
                              ..sort(
                                (a, b) => a.meeting!.datetime!.compareTo(
                                  b.meeting!.datetime!,
                                ),
                              );
                        return Column(
                          children: [
                            if (upcoming.isEmpty)
                              const ZEmpty(compact: true, icon: Icons.calendar_month_outlined,
                                title: 'No upcoming meetings',
                                subtitle: 'No upcoming meetings in the first 15 cases. Check ADM Cases for other meetings.'),
                            for (final row in upcoming.take(3))
                              ListTile(
                                title: Text(row.student),
                                subtitle: Text(
                                  admDate(
                                    row.meeting!.datetime!.toIso8601String(),
                                  ),
                                ),
                                onTap: () async {
                                  await context.push(
                                    '/coordinator/referrals/${Uri.encodeComponent(row.id)}',
                                  );
                                  if (mounted) await refresh();
                                },
                              ),
                          ],
                        );
                      },
                    ),
                  ],
                ),
                AdmSection(
                  'At a glance',
                  children: [
                    AdmValue(
                      'Total referred',
                      '${admInt(data['totalReferred'])}',
                    ),
                    AdmValue('ADM profiles', '${admInt(kpis['active'])}'),
                    AdmValue('Principal-signed', '${admInt(kpis['signed'])}'),
                    AdmValue(
                      'Devices issued / returned',
                      '${admInt(devices['issued'])} / ${admInt(devices['returned'])}',
                    ),
                    const Text(
                      'Server totals across the web desk’s record scope.',
                    ),
                  ],
                ),
                AdmSection(
                  'Quick actions',
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => context.go('/coordinator/referrals'),
                      icon: const Icon(Icons.folder_open),
                      label: const Text('Review ADM cases'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => context.go('/coordinator/devices'),
                      icon: const Icon(Icons.devices),
                      label: const Text('Manage devices'),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _link(String title, int count, String path) => ListTile(
    title: Text(title),
    trailing: Text('$count'),
    onTap: () => context.go(path),
  );
}

class CoordinatorListPage extends ConsumerStatefulWidget {
  const CoordinatorListPage({super.key, required this.desk});
  final String desk; // referrals | enrolled | certifications | devices
  @override
  ConsumerState<CoordinatorListPage> createState() => _ListState();
}

class _ListState extends ConsumerState<CoordinatorListPage>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorListPage> {
  int _page = 1;
  late String _filter = widget.desk == 'certifications'
      ? 'certification'
      : widget.desk == 'enrolled'
      ? 'enrollment_monitoring'
      : '';
  String _query = '', _rawQuery = '';
  Timer? _debounce;
  AdmListQuery get query =>
      (desk: widget.desk, page: _page, q: _query, filter: _filter);
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final value = ScreenSearchScope.maybeOf(context)?.query ?? '';
    if (value != _rawQuery) {
      _rawQuery = value;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 300), () {
        if (mounted) {
          setState(() {
            _query = value;
            _page = 1;
          });
        }
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Future<void> reload() async {
    if (widget.desk == 'devices') {
      await ref.refresh(coordinatorDevicesProvider(query).future).then((_) {});
    } else {
      await ref.refresh(coordinatorListProvider(query).future).then((_) {});
    }
  }

  Map<String, String> get filters => switch (widget.desk) {
    'devices' => {
      '': 'All devices',
      'issued': 'Issued',
      'returned': 'Returned',
    },
    'enrolled' => {
      'enrollment_monitoring': 'Enrollment monitoring',
      'completion': 'Completed',
    },
    'certifications' => {
      'certification': 'Preparation / revision',
      'principal_approval': 'Awaiting principal',
      'approved': 'Approved',
    },
    _ => {'': 'All stages', ...admStages},
  };
  Future<void> _open(AdmCaseRow row) async {
    final path = widget.desk == 'enrolled' ? 'enrolled' : 'referrals';
    await context.push('/coordinator/$path/${Uri.encodeComponent(row.id)}');
    if (mounted) await refresh();
  }

  void _reconcilePage(int pages) {
    if (_page <= pages) return;
    final requested = query;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && query == requested) setState(() => _page = pages);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDevices = widget.desk == 'devices';
    return AdmBody(
      onRefresh: refresh,
      children: [
        if (ScreenSearchScope.maybeOf(context) == null)
          TextField(
            decoration: const InputDecoration(
              labelText: 'Search learner or LRN',
            ),
            onChanged: (v) => setState(() {
              _query = v;
              _page = 1;
            }),
          ),
        if (filters.isNotEmpty)
          DropdownButtonFormField<String>(
            key: ValueKey('${widget.desk}:$_filter'),
            initialValue: _filter,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Filter'),
            items: [
              for (final entry in filters.entries)
                DropdownMenuItem(value: entry.key, child: Text(entry.value)),
            ],
            onChanged: (v) => setState(() {
              _filter = v ?? '';
              _page = 1;
            }),
          ),
        if (widget.desk == 'enrolled')
          const Text(
            'Principal-approved learners. Module monitoring is read-only.',
          ),
        if (widget.desk == 'certifications')
          const Text(
            'Open a record for its recommendation, evidence and case history. Returned cases appear under Preparation / revision.',
          ),
        if (isDevices)
          FilledButton.icon(
            onPressed: () async {
              await admPush<void>(context, const CoordinatorIssueDevicePage());
              if (mounted) await refresh();
            },
            icon: const Icon(Icons.add),
            label: const Text('Issue device'),
          ),
        if (isDevices)
          AdmAsync(
            value: ref.watch(coordinatorDevicesProvider(query)),
            retry: refresh,
            builder: (data) {
              _reconcilePage(data.totalPages);
              return Column(
                children: [
                  if (data.rows.isEmpty)
                    const ZEmpty(icon: Icons.devices_outlined, title: 'No matching devices.'),
                  for (final row in data.rows)
                    CoordinatorDeviceCard(key: ValueKey(row.id), device: row),
                  AdmPager(
                    page: _page,
                    pages: data.totalPages,
                    total: data.total,
                    onPage: (p) => setState(() => _page = p),
                  ),
                ],
              );
            },
          )
        else
          AdmAsync(
            value: ref.watch(coordinatorListProvider(query)),
            retry: refresh,
            builder: (data) {
              _reconcilePage(data.totalPages);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (data.rows.isEmpty)
                    const ZEmpty(icon: Icons.folder_shared_outlined, title: 'No matching ADM records.'),
                  for (final row in data.rows)
                    Card(
                      key: ValueKey(row.id),
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        title: Text(row.student),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${row.lrn} · ${row.grade}'),
                            if (row.section.isNotEmpty) Text(row.section),
                            if (row.returnReason.isNotEmpty)
                              Text('Principal returned: ${row.returnReason}'),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                if (row.stage.isNotEmpty)
                                  ZStatusPill(text: admLabel(row.stage)),
                                if (row.eligibility.isNotEmpty)
                                  ZStatusPill(text: admLabel(row.eligibility)),
                              ],
                            ),
                            if (widget.desk == 'enrolled')
                              Text(
                                '${row.modulesSubmitted}/${row.modulesTotal} modules submitted',
                              ),
                          ],
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _open(row),
                      ),
                    ),
                  AdmPager(
                    page: _page,
                    pages: data.totalPages,
                    total: data.total,
                    onPage: (p) => setState(() => _page = p),
                  ),
                ],
              );
            },
          ),
      ],
    );
  }
}
