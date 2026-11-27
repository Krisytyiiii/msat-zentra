import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';

import 'coordinator_data.dart';
import 'coordinator_forms.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';
import '../../design/desk_theme.dart';

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
      final router = GoRouter.maybeOf(context);
      final device = widget.device;
      if (router != null) {
        await router.push<void>(
          '/coordinator/devices/detail/${Uri.encodeComponent(device.id)}',
          extra: device,
        );
      } else {
        await Navigator.of(context, rootNavigator: true).push<void>(
          MaterialPageRoute(
            builder: (_) => CoordinatorDeviceDetailPage(
              deviceId: device.id,
              initial: device,
            ),
          ),
        );
      }
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
      color: zCard(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: zLine(context)),
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
                    backgroundColor: zWash(context, const Color(0xFFEFF6FF)),
                    foregroundColor: zMutedInk(context),
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
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: zInk(context),
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
              Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: zLine(context)),
              ),
              Row(
                children: [
                  Icon(
                    LucideIcons.calendar,
                    size: 13,
                    color: zMutedInk(context),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      d.returned
                          ? 'Returned ${admDate(d.returnedDate)}'
                          : admDate(d.issuedDate),
                      style: TextStyle(
                        fontSize: 12,
                        color: zMutedInk(context),
                      ),
                    ),
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
  const CoordinatorDeviceDetailPage({
    super.key,
    required this.deviceId,
    this.initial,
  });
  final String deviceId;
  final AdmDevice? initial;

  @override
  ConsumerState<CoordinatorDeviceDetailPage> createState() =>
      _DeviceDetailState();
}

class _DeviceDetailState extends ConsumerState<CoordinatorDeviceDetailPage> {
  bool _busy = false;

  void _close() {
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
      return;
    }
    GoRouter.maybeOf(context)?.go('/coordinator/devices');
  }

  Future<void> _returnDevice(AdmDevice device) async {
    if (_busy) return;
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
      _close();
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
    final theme = overviewScreenTheme(Theme.of(context));
    final initial = widget.initial;
    final resolved = initial == null
        ? ref.watch(coordinatorDeviceProvider(widget.deviceId))
        : null;
    final device = initial ?? resolved?.asData?.value;
    Widget body;
    if (device != null) {
      body = _content(device);
    } else if (resolved != null && resolved.hasError) {
      body = ErrorView(
        message: resolved.error!,
        onRetry: () =>
            ref.invalidate(coordinatorDeviceProvider(widget.deviceId)),
      );
    } else if (resolved != null && resolved.isLoading) {
      body = const Padding(
        padding: EdgeInsets.all(16),
        child: ZSkeletonList(count: 4),
      );
    } else {
      body = const Center(child: Text('This device is no longer available.'));
    }
    return Theme(
      data: theme,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          shape: Border(bottom: BorderSide(color: zLine(context))),
          centerTitle: true,
          leadingWidth: 64,
          leading: ZBackButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Back',
            padding: EdgeInsets.zero,
            onPressed: _close,
          ),
          title: const Text('Device Details'),
        ),
        body: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: body,
          ),
        ),
      ),
    );
  }

  BoxDecoration _card(double radius) => BoxDecoration(
    color: zCard(context),
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: zLine(context)),
  );

  Widget _content(AdmDevice d) {
    final name = d.student.isEmpty ? 'Device holder' : d.student;
    final specs = _DeviceSpecs.parse(d.type);
    final serial = d.serial.isEmpty ? '—' : d.serial;
    final notes = d.notes.trim();
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 32),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: _card(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: zWash(context, const Color(0xFFEAF2FF)),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: zWash(context, const Color(0xFFD4E4FF))),
                ),
                child: Icon(
                  LucideIcons.tablet,
                  size: 22,
                  color: zLift(context, Color(0xFF2563EB)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: zInk(context),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'LRN ${d.lrn.isEmpty ? '—' : d.lrn}',
                      style: TextStyle(
                        fontSize: 12,
                        color: zMutedInk(context),
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 8),
                    ZStatusPill(
                      text: d.returned ? 'Returned' : 'Issued',
                      tone: d.returned ? StatusTone.green : StatusTone.blue,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Transform.rotate(
                angle: 0.12,
                child: const Icon(
                  LucideIcons.tablet,
                  size: 40,
                  color: Color(0xFFCBD9EE),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Overview',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: zInk(context),
                ),
              ),
              SizedBox(height: 5),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: zLift(context, const Color(0xFF2563EB)),
                  borderRadius: BorderRadius.all(Radius.circular(2)),
                ),
                child: SizedBox(width: 34, height: 3),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _DeviceStatTile(
                  icon: LucideIcons.calendar,
                  label: 'Issued',
                  value: admDate(d.issuedDate),
                  foreground: zLift(context, const Color(0xFF2563EB)),
                  background: zWash(context, const Color(0xFFEAF2FF)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DeviceStatTile(
                  icon: LucideIcons.undo2,
                  label: 'Returned',
                  value: d.returned
                      ? admDate(d.returnedDate)
                      : 'Not returned yet',
                  foreground: d.returned
                      ? zLift(context, const Color(0xFF15803D))
                      : zLift(context, const Color(0xFFB45309)),
                  background: d.returned
                      ? zWash(context, const Color(0xFFF0FDF4))
                      : zWash(context, const Color(0xFFFFF6E5)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DeviceStatTile(
                  icon: LucideIcons.hash,
                  label: 'Serial Number',
                  value: serial,
                  foreground: zLift(context, const Color(0xFF7C6BD0)),
                  background: zWash(context, const Color(0xFFF3F0FF)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: _card(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _DeviceTitleIcon(
                    icon: LucideIcons.layers,
                    foreground: zLift(context, Color(0xFF2563EB)),
                    background: zWash(context, const Color(0xFFEAF2FF)),
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Device Information',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: zInk(context),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _DeviceInfoRow(label: 'Type', value: specs.type),
              const SizedBox(height: 8),
              _DeviceInfoRow(label: 'Display', value: specs.display),
              const SizedBox(height: 8),
              _DeviceInfoRow(label: 'Operating System', value: specs.os),
              const SizedBox(height: 8),
              _DeviceInfoRow(label: 'Storage', value: specs.storage),
            ],
          ),
        ),
        if (notes.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: _card(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _DeviceTitleIcon(
                      icon: LucideIcons.fileText,
                      foreground: zLift(context, Color(0xFFB45309)),
                      background: zWash(context, const Color(0xFFFFF6E5)),
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Condition Notes',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: zInk(context),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.only(left: 10),
                  decoration: const BoxDecoration(
                    border: Border(
                      left: BorderSide(color: Color(0xFFF5B544), width: 3),
                    ),
                  ),
                  child: Text(
                    notes,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: zMutedInk(context),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (!d.returned) ...[
          const SizedBox(height: 20),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: zLift(context, const Color(0xFF2563EB)),
              foregroundColor:
                  Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF06101F)
                  : Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            onPressed: _busy ? null : () => _returnDevice(d),
            child: Text(_busy ? 'Recording…' : 'Record return'),
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

class _DeviceStatTile extends StatelessWidget {
  const _DeviceStatTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.foreground,
    required this.background,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: zCard(context),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: zLine(context)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 15, color: foreground),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(fontSize: 11, color: zMutedInk(context)),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: zInk(context),
          ),
        ),
      ],
    ),
  );
}

class _DeviceInfoRow extends StatelessWidget {
  const _DeviceInfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(fontSize: 12, color: zMutedInk(context)),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Text(
          value,
          textAlign: TextAlign.right,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: zInk(context),
          ),
        ),
      ),
    ],
  );
}

class _DeviceTitleIcon extends StatelessWidget {
  const _DeviceTitleIcon({
    required this.icon,
    required this.foreground,
    required this.background,
  });

  final IconData icon;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) => Container(
    width: 28,
    height: 28,
    decoration: BoxDecoration(
      color: background,
      borderRadius: BorderRadius.circular(9),
    ),
    child: Icon(icon, size: 15, color: foreground),
  );
}

/// The registry stores display/OS/storage inside the free-text device type
/// (e.g. `Learning tablet · 10.1" Android 14, 64GB`). Pull them out when the
/// value follows that shape and show `—` when it doesn't, never invent data.
class _DeviceSpecs {
  const _DeviceSpecs({
    required this.type,
    required this.display,
    required this.os,
    required this.storage,
  });

  final String type;
  final String display;
  final String os;
  final String storage;

  static final _displayPattern = RegExp(
    r'(\d+(?:\.\d+)?)\s*(?:"|″|”|inch(?:es)?|in\b)',
    caseSensitive: false,
  );
  static final _osPattern = RegExp(
    r'(android|ios|ipados|windows|chromeos|harmonyos)\s*\d+(?:\.\d+)*',
    caseSensitive: false,
  );
  static final _storagePattern = RegExp(
    r'^\d+\s*(?:gb|tb)$',
    caseSensitive: false,
  );

  factory _DeviceSpecs.parse(String raw) {
    final value = raw.trim();
    final parts = value.split('·');
    final type = parts.first.trim();
    var display = '—';
    var os = '—';
    var storage = '—';
    for (final part in parts.skip(1)) {
      for (final segment in part.split(',')) {
        final text = segment.trim();
        if (text.isEmpty) continue;
        if (display == '—') {
          final match = _displayPattern.firstMatch(text);
          if (match != null) display = '${match.group(1)}"';
        }
        if (os == '—') {
          final match = _osPattern.firstMatch(text);
          if (match != null) os = match.group(0)!.trim();
        }
        if (storage == '—' && _storagePattern.hasMatch(text)) storage = text;
      }
    }
    return _DeviceSpecs(
      type: type.isEmpty ? '—' : type,
      display: display,
      os: os,
      storage: storage,
    );
  }
}

class CoordinatorIssueDevicePage extends ConsumerStatefulWidget {
  const CoordinatorIssueDevicePage({super.key});
  @override
  ConsumerState<CoordinatorIssueDevicePage> createState() => _IssueState();
}

class _IssueState extends ConsumerState<CoordinatorIssueDevicePage> {
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
    final theme = overviewScreenTheme(Theme.of(context));
    final scope = ref.watch(coordinatorScopeProvider).asData?.value;
    final query = (desk: 'deviceCandidates', page: 1, q: _q, filter: '');
    return Theme(
      data: theme,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          shape: Border(bottom: BorderSide(color: zLine(context))),
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
                        style: TextStyle(
                          fontSize: 12,
                          color: zMutedInk(context),
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
      color: zCard(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: zLine(context)),
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
                    backgroundColor: zWash(context, const Color(0xFFEFF6FF)),
                    foregroundColor: zMutedInk(context),
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
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: zInk(context),
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
              Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: zLine(context)),
              ),
              Row(
                children: [
                  Icon(
                    LucideIcons.tablet,
                    size: 13,
                    color: available
                        ? zMutedInk(context)
                        : const Color(0xFFB6C1D4),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      available
                          ? 'Ready to issue a device'
                          : 'A device is already recorded',
                      style: TextStyle(
                        fontSize: 12,
                        color: zMutedInk(context),
                      ),
                    ),
                  ),
                  if (available)
                    Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: zMutedInk(context),
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
