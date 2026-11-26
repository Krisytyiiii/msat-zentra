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

class CoordinatorDeviceCard extends ConsumerStatefulWidget {
  const CoordinatorDeviceCard({super.key, required this.device});
  final AdmDevice device;
  @override
  ConsumerState<CoordinatorDeviceCard> createState() => _DeviceState();
}

class _DeviceState extends ConsumerState<CoordinatorDeviceCard> {
  bool _detailsOpen = false;

  Future<void> _openDetails() async {
    if (_detailsOpen) return;
    _detailsOpen = true;
    try {
      await admPush<void>(
        context,
        CoordinatorDeviceDetailPage(device: widget.device),
      );
    } finally {
      _detailsOpen = false;
      if (mounted) ref.invalidate(coordinatorDevicesProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.device;
    final name = d.student.isEmpty ? 'Device holder' : d.student;
    return Card(
      key: ValueKey('device-card-${d.id}'),
      margin: const EdgeInsets.only(bottom: 4),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: _openDetails,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: const Color(0xFFEFF6FF),
                    foregroundColor: const Color(0xFF52627C),
                    child: Text(
                      _initials(name),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF172033),
                          ),
                        ),
                        Text(
                          'LRN ${d.lrn.isEmpty ? '—' : d.lrn}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: ZStatusPill(
                        text: d.returned ? 'Returned' : 'Issued',
                        tone: d.returned ? StatusTone.green : StatusTone.blue,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (d.type.isNotEmpty)
                    ZStatusPill(text: d.type, tone: StatusTone.blue),
                  if (d.serial.isNotEmpty)
                    ZStatusPill(
                      text: 'Serial ${d.serial}',
                      tone: StatusTone.neutral,
                    ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: Color(0xFFF0F3F8)),
              ),
              Row(
                children: [
                  const Icon(
                    LucideIcons.calendar,
                    size: 13,
                    color: Color(0xFF8B9BBA),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      d.returned
                          ? 'Returned ${admDate(d.returnedDate)}'
                          : 'Issued ${admDate(d.issuedDate)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF8B9BBA),
                      ),
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: Color(0xFF8B9BBA),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _initials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((s) => s.isNotEmpty)
      .toList();
  if (words.isEmpty) return '?';
  return '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
      .toUpperCase();
}

class CoordinatorDeviceDetailPage extends ConsumerStatefulWidget {
  const CoordinatorDeviceDetailPage({super.key, required this.device});
  final AdmDevice device;

  @override
  ConsumerState<CoordinatorDeviceDetailPage> createState() =>
      _DeviceDetailState();
}

class _DeviceDetailState extends ConsumerState<CoordinatorDeviceDetailPage> {
  bool _busy = false;

  Future<void> _returnDevice() async {
    if (_busy) return;
    final device = widget.device;
    final repo = ref.read(coordinatorRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);
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
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger.showSnackBar(
        const SnackBar(content: Text('Device return recorded.')),
      );
    } catch (e) {
      if (mounted) admError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(zLightTheme());
    final d = widget.device;
    final name = d.student.isEmpty ? 'Device holder' : d.student;
    Widget panel(
      String title,
      List<Widget> children, {
      bool highlighted = false,
    }) => Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: highlighted ? const Color(0xFFF3F9FF) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted
              ? const Color(0xFFBFDBFE)
              : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: highlighted
                  ? const Color(0xFF1E3A8A)
                  : const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          ...children.map(
            (child) => Material(type: MaterialType.transparency, child: child),
          ),
        ],
      ),
    );
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
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          title: const Text('Device Details'),
        ),
        body: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
              children: [
                ZContentHeader(
                  title: name,
                  icon: LucideIcons.tablet,
                  description:
                      'LRN ${d.lrn.isEmpty ? '—' : d.lrn} · ${d.returned ? 'Returned' : 'Issued'}',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ZStatusPill(
                      text: d.returned ? 'Returned' : 'Issued',
                      tone: d.returned ? StatusTone.green : StatusTone.blue,
                    ),
                    if (d.type.isNotEmpty)
                      ZStatusPill(text: d.type, tone: StatusTone.blue),
                    if (d.serial.isNotEmpty)
                      ZStatusPill(
                        text: 'Serial ${d.serial}',
                        tone: StatusTone.neutral,
                      ),
                  ],
                ),
                panel('Device', [
                  Text('Type: ${d.type.isEmpty ? '—' : d.type}'),
                  Text('Serial number: ${d.serial.isEmpty ? '—' : d.serial}'),
                ], highlighted: true),
                panel('Issued', [Text(admDate(d.issuedDate))]),
                panel('Returned', [
                  Text(
                    d.returned ? admDate(d.returnedDate) : 'Not returned yet',
                  ),
                ]),
                if (d.notes.isNotEmpty)
                  panel('Condition notes', [Text(d.notes)]),
                if (!d.returned) ...[
                  const SizedBox(height: 24),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: _busy ? null : _returnDevice,
                    child: Text(_busy ? 'Recording…' : 'Record return'),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
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
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _close() => admClose(context, '/coordinator/devices');

  Future<void> _pick(AdmCaseRow row) async {
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
          AdmField('Condition notes', required: false, lines: 3),
        ],
        action: 'Issue device',
        onSave: (repo, values) =>
            repo.issueDevice(row, values[0], values[1], values[2]),
      ),
    );
    if (saved == true && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(zLightTheme());
    final query = (desk: 'deviceCandidates', page: _page, q: _q, filter: '');
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
            onPressed: _close,
          ),
          title: const Text('Issue Device'),
        ),
        body: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 32),
              children: [
                const ZContentHeader(
                  title: 'Choose approved learner',
                  icon: LucideIcons.tablet,
                  description: 'Only principal-approved learners without an issued device can be selected.',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ZPill(
                      label: 'Scope',
                      tone: StatusTone.neutral,
                      badge: true,
                      child: const Text('School-managed scope'),
                    ),
                    ZPill(
                      label: 'Records',
                      tone: StatusTone.blue,
                      badge: true,
                      child: const Text('Cross-term records'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 40,
                  child: TextField(
                    controller: _search,
                    textAlignVertical: TextAlignVertical.center,
                    textInputAction: TextInputAction.search,
                    style: const TextStyle(fontSize: 12),
                    decoration: InputDecoration(
                      hintText: 'Search learner or LRN',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              icon: const Icon(Icons.close, size: 16),
                              onPressed: () => setState(() {
                                _search.clear();
                                _q = '';
                                _page = 1;
                              }),
                            ),
                      suffixIconConstraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      isDense: true,
                      filled: true,
                      fillColor: theme.colorScheme.surfaceContainerLow,
                      contentPadding: const EdgeInsets.symmetric(
                        vertical: 8,
                        horizontal: 16,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(999),
                        borderSide: BorderSide(
                          color: theme.colorScheme.outlineVariant,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(999),
                        borderSide: BorderSide(
                          color: theme.colorScheme.outlineVariant,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(999),
                        borderSide: BorderSide(
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ),
                    onChanged: (text) => setState(() {
                      _q = text.trim();
                      _page = 1;
                    }),
                  ),
                ),
                const SizedBox(height: 12),
                AdmAsync(
                  value: ref.watch(coordinatorListProvider(query)),
                  retry: () => ref.invalidate(coordinatorListProvider(query)),
                  builder: (data) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Showing ${data.total} ${data.total == 1 ? 'learner' : 'learners'}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF9999A6),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (data.rows.isEmpty)
                        const ZEmpty(
                          icon: LucideIcons.users,
                          title: 'No approved learners found',
                          subtitle: 'Approved learners without an issued device appear here.',
                        ),
                      for (final row in data.rows)
                        _LearnerCandidateCard(
                          key: ValueKey('device-candidate-${row.id}'),
                          row: row,
                          onTap:
                              row.devicesIssued == 0 &&
                                  row.approvedBy.isNotEmpty
                              ? () => _pick(row)
                              : null,
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
          ),
        ),
      ),
    );
  }
}

class _LearnerCandidateCard extends StatelessWidget {
  const _LearnerCandidateCard({
    super.key,
    required this.row,
    required this.onTap,
  });

  final AdmCaseRow row;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final name = row.student.isEmpty ? 'Learner' : row.student;
    final available = onTap != null;
    return Card(
      margin: const EdgeInsets.only(bottom: 4),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: const Color(0xFFEFF6FF),
                    foregroundColor: const Color(0xFF52627C),
                    child: Text(
                      _initials(name),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF172033),
                          ),
                        ),
                        Text(
                          'LRN ${row.lrn.isEmpty ? '—' : row.lrn}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: ZStatusPill(
                        text: available ? 'Available' : 'Device issued',
                        tone: available ? StatusTone.blue : StatusTone.neutral,
                      ),
                    ),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: Color(0xFFF0F3F8)),
              ),
              Row(
                children: [
                  Icon(
                    LucideIcons.tablet,
                    size: 13,
                    color: available
                        ? const Color(0xFF8B9BBA)
                        : const Color(0xFFB6C1D4),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      available
                          ? 'Ready to issue a device'
                          : 'A device is already recorded',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF8B9BBA),
                      ),
                    ),
                  ),
                  if (available)
                    const Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: Color(0xFF8B9BBA),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
