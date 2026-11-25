import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'attendance_data.dart';
import '../../shared/widgets.dart';

/// One learner as presented on the scanner. Marks stay server/draft owned.
class AttendanceScanEntry {
  const AttendanceScanEntry({
    required this.id,
    required this.name,
    required this.lrn,
  });
  final String id, name, lrn;
}

/// Read-only roster + timing scope handed to the scanner by the sheet.
class AttendanceScanSnapshot {
  const AttendanceScanSnapshot({
    required this.learners,
    required this.marks,
    this.schoolYear,
    this.term,
    this.grade,
    this.section,
    this.date,
    this.start,
    this.late,
    this.absent,
    this.lateAfterMinutes = 20,
  });
  final List<AttendanceScanEntry> learners;
  final Map<String, String> marks;
  final String? schoolYear, term, grade, section, date, start, late, absent;
  final int lateAfterMinutes;
}

/// Presentation for [AttendanceScannerPage]. Camera/lifecycle stay in the page.
class AttendanceScanView extends StatefulWidget {
  const AttendanceScanView({
    super.key,
    required this.title,
    required this.historyEdit,
    required this.automatic,
    required this.manual,
    required this.message,
    required this.error,
    required this.busy,
    required this.camera,
    required this.onDone,
    this.onSave,
    required this.onManualChanged,
    this.onTorch,
    this.torchOn = false,
    this.snapshot,
    this.scanTimes = const {},
    this.onLateAfterChanged,
  });

  final String title;
  final bool historyEdit, automatic, error, busy, torchOn;
  final String manual, message;
  final Widget camera;
  final AttendanceScanSnapshot? snapshot;
  final Map<String, DateTime> scanTimes;
  final VoidCallback onDone;
  final VoidCallback? onSave;
  final VoidCallback? onTorch;
  final ValueChanged<String> onManualChanged;
  final ValueChanged<int>? onLateAfterChanged;

  @override
  State<AttendanceScanView> createState() => _AttendanceScanViewState();
}

class _AttendanceScanViewState extends State<AttendanceScanView> {
  final _search = TextEditingController();
  String _filter = 'scanned';
  String _sort = 'time';
  String _query = '';
  bool _rulesOpen = false;

  @override
  void initState() {
    super.initState();
    // History corrections stay on the manual P/A/L/E controls.
    _rulesOpen = widget.historyEdit;
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  String _status(AttendanceScanEntry learner) =>
      widget.snapshot?.marks[learner.id] ?? '';

  int _count(String status) {
    final learners = widget.snapshot?.learners ?? const <AttendanceScanEntry>[];
    if (status == 'scanned') {
      return learners.where((l) => _status(l).isNotEmpty).length;
    }
    return learners.where((l) => _status(l) == status).length;
  }

  void _selectFilter(String status) {
    setState(() => _filter = _filter == status ? 'scanned' : status);
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = widget.snapshot;
    final learners = [...?snapshot?.learners];
    final query = _query.trim().toLowerCase();
    final filtered = learners.where((l) {
      final status = _status(l);
      if (_filter == 'scanned' ? status.isEmpty : status != _filter) {
        return false;
      }
      return l.name.toLowerCase().contains(query) ||
          l.lrn.toLowerCase().contains(query);
    }).toList()..sort(_compare);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        shape: const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
        centerTitle: true,
        leading: ZBackButton(
          tooltip: 'Back',
          icon: const Icon(Icons.chevron_left),
          onPressed: widget.busy ? null : widget.onDone,
        ),
        title: const Text('Scan Attendance'),
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFEDF0F6))),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(52),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              onPressed: widget.busy ? null : widget.onSave ?? widget.onDone,
              child: const Text('Save'),
            ),
          ),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 24),
            children: [
              ZContentHeader(
                title: widget.title,
                icon: LucideIcons.graduationCap,
                titleTrailing: snapshot?.date?.isNotEmpty == true
                    ? Tooltip(
                        message: 'Date',
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF3F4F6),
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                LucideIcons.calendarDays,
                                size: 14,
                                color: Color(0xFF6B7280),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                snapshot!.date!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF6B7280),
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : null,
                description: widget.historyEdit
                    ? 'Correct a learner’s mark for the selected meeting.'
                    : 'Scan each learner’s Zentra QR code to draft attendance.',
              ),
              const SizedBox(height: 12),
              _scopePills(snapshot),
              const SizedBox(height: 4),
              _rulesSummary(snapshot),
              if (_rulesOpen) ...[const SizedBox(height: 8), _rulesCard()],
              const SizedBox(height: 14),
              _scanCard(),
              const SizedBox(height: 10),
              _messageBanner(),
              const SizedBox(height: 14),
              _summary(),
              const SizedBox(height: 12),
              _searchRow(),
              const SizedBox(height: 2),
              _listHeader(filtered.length),
              const SizedBox(height: 4),
              if (filtered.isEmpty)
                _empty()
              else
                for (final learner in filtered) _learnerRow(learner),
            ],
          ),
        ),
      ),
    );
  }

  int _compare(AttendanceScanEntry a, AttendanceScanEntry b) {
    if (_sort.startsWith('time')) {
      final left = widget.scanTimes[a.id];
      final right = widget.scanTimes[b.id];
      if (left != null || right != null) {
        if (left == null) return 1;
        if (right == null) return -1;
        final order = left.compareTo(right);
        if (order != 0) return _sort == 'time' ? -order : order;
      }
    }
    final order = a.name.toLowerCase().compareTo(b.name.toLowerCase());
    return _sort == 'nameDesc' ? -order : order;
  }

  Widget _scopePills(AttendanceScanSnapshot? snapshot) {
    final grade = [
      snapshot?.grade,
      snapshot?.section,
    ].where((value) => value != null && value.isNotEmpty).join(' · ');
    final time = [
      snapshot?.start,
      snapshot?.absent,
    ].where((value) => value != null && value.isNotEmpty).join(' – ');
    if ([grade, time].every((value) => value.isEmpty)) {
      return const SizedBox.shrink();
    }
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        if (grade.isNotEmpty)
          ZScopePill(
            text: grade,
            kind: ScopePillKind.grade,
            label: 'Grade and section',
            compact: true,
          ),
        if (time.isNotEmpty)
          ZScopePill(
            text: time,
            kind: ScopePillKind.schoolYear,
            label: 'Class time',
            compact: true,
          ),
      ],
    );
  }

  Widget _rulesSummary(AttendanceScanSnapshot? snapshot) => Column(
    children: [
      Row(
        children: [
          const Expanded(
            child: Text(
              'TIMING OVERVIEW',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF667085),
              ),
            ),
          ),
          TextButton(
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 32),
              padding: const EdgeInsets.symmetric(horizontal: 8),
              visualDensity: VisualDensity.compact,
              tapTargetSize: MaterialTapTargetSize.padded,
              textStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w400,
              ),
            ),
            onPressed: () => setState(() => _rulesOpen = !_rulesOpen),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Rules'),
                const SizedBox(width: 4),
                Icon(
                  _rulesOpen
                      ? LucideIcons.chevronDown
                      : LucideIcons.chevronRight,
                  size: 16,
                ),
              ],
            ),
          ),
        ],
      ),
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: _summaryTile(
              icon: LucideIcons.clock,
              tint: const Color(0xFFEEF2FF),
              ink: const Color(0xFF4263F0),
              label: 'Late After',
              value: snapshot?.late ?? '—',
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _summaryTile(
              icon: LucideIcons.calendarCheck,
              tint: const Color(0xFFFFF6E5),
              ink: const Color(0xFFB77908),
              label: 'Auto Absent',
              value: snapshot?.absent == null
                  ? '—'
                  : 'After ${snapshot!.absent}',
            ),
          ),
        ],
      ),
    ],
  );

  Widget _summaryTile({
    required IconData icon,
    required Color tint,
    required Color ink,
    required String label,
    required String value,
  }) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE6ECF4)),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: tint,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 16, color: ink),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: Color(0xFF667085)),
              ),
              const SizedBox(height: 2),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  maxLines: 1,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF172033),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _scanCard() => ClipRRect(
    borderRadius: BorderRadius.circular(18),
    child: AspectRatio(
      aspectRatio: 1.9,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFEDF2FF), Color(0xFFF6F2FF)],
              ),
            ),
          ),
          widget.camera,
          IgnorePointer(
            child: Center(
              child: FractionallySizedBox(
                widthFactor: .44,
                heightFactor: .6,
                child: CustomPaint(
                  painter: _ScanCornersPainter(const Color(0xFFD97706)),
                ),
              ),
            ),
          ),
          const IgnorePointer(
            child: Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Color(0xF2FFFFFF),
                  shape: BoxShape.circle,
                ),
                child: Padding(
                  padding: EdgeInsets.all(10),
                  child: Icon(
                    LucideIcons.qrCode,
                    size: 30,
                    color: Color(0xFF1F2937),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: 10,
            right: 10,
            child: IconButton(
              tooltip: widget.torchOn
                  ? 'Turn off flashlight'
                  : 'Turn on flashlight',
              style: IconButton.styleFrom(
                backgroundColor: Colors.black.withValues(alpha: .32),
                foregroundColor: Colors.white,
                minimumSize: const Size(40, 40),
              ),
              onPressed: widget.onTorch,
              icon: Icon(
                widget.torchOn
                    ? Icons.flash_on_rounded
                    : Icons.flash_off_rounded,
                size: 20,
              ),
            ),
          ),
          Positioned(
            bottom: 12,
            left: 16,
            right: 16,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .92),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'Tap to Scan',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF172033),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _messageBanner() => Semantics(
    liveRegion: true,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: widget.error ? const Color(0xFFFFF4F4) : const Color(0xFFEFF6FF),
        border: Border.all(
          color: widget.error
              ? const Color(0xFFFECACA)
              : const Color(0xFFD4E4FF),
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            widget.error ? LucideIcons.circleAlert : LucideIcons.scanLine,
            size: 17,
            color: widget.error
                ? const Color(0xFFDC2626)
                : const Color(0xFF2563EB),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              widget.message,
              style: TextStyle(
                fontSize: 12,
                height: 1.3,
                color: widget.error
                    ? const Color(0xFFDC2626)
                    : const Color(0xFF334155),
              ),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _summary() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'ATTENDANCE SUMMARY',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: .3,
          color: Color(0xFF71809B),
        ),
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          Expanded(
            child: _counter(
              'present',
              'Present',
              const Color(0xFF4263F0),
              const Color(0xFFEEF1FF),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _counter(
              'late',
              'Late',
              const Color(0xFFB45309),
              const Color(0xFFFFF6E5),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _counter(
              'absent',
              'Absent',
              const Color(0xFFE11D48),
              const Color(0xFFFFEDEF),
            ),
          ),
        ],
      ),
    ],
  );

  Widget _counter(String status, String label, Color ink, Color background) {
    final selected = _filter == status;
    return InkWell(
      key: ValueKey('scan-filter-$status'),
      borderRadius: BorderRadius.circular(12),
      onTap: () => _selectFilter(status),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? ink : ink.withValues(alpha: 0),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ink,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _count(status).toString(),
              key: ValueKey('scan-count-$status'),
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: ink,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _searchRow() => TextField(
    controller: _search,
    onChanged: (value) => setState(() => _query = value),
    style: const TextStyle(fontSize: 12),
    decoration: InputDecoration(
      hintText: 'Search student or LRN',
      hintStyle: const TextStyle(fontSize: 12, color: Color(0xFF98A2B3)),
      prefixIcon: const Icon(Icons.search, size: 20),
      suffixIcon: _query.trim().isEmpty
          ? null
          : IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.close, size: 16),
              onPressed: () {
                _search.clear();
                setState(() => _query = '');
              },
            ),
      filled: true,
      fillColor: const Color(0xFFF5F7FA),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(999),
        borderSide: const BorderSide(color: Color(0xFFBFD4FA)),
      ),
    ),
  );

  Widget _listHeader(int count) => Row(
    children: [
      Expanded(
        child: Text(
          'Showing $count records',
          semanticsLabel: '$_filterLabel: $count records',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, color: Color(0xFF9999A6)),
        ),
      ),
      TextButton.icon(
        onPressed: () => setState(() {
          const sorts = ['time', 'timeAsc', 'name', 'nameDesc'];
          _sort = sorts[(sorts.indexOf(_sort) + 1) % sorts.length];
        }),
        icon: const Icon(LucideIcons.listFilter, size: 14),
        label: Text(_sortLabel, style: const TextStyle(fontSize: 12)),
        style: TextButton.styleFrom(
          foregroundColor: const Color(0xFF334155),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          minimumSize: const Size(48, 48),
        ),
      ),
    ],
  );

  String get _filterLabel => switch (_filter) {
    'present' => 'Present Students',
    'late' => 'Late Students',
    'absent' => 'Absent Students',
    _ => 'Scanned Students',
  };

  String get _sortLabel => switch (_sort) {
    'timeAsc' => 'Time (Earliest)',
    'name' => 'Name (A–Z)',
    'nameDesc' => 'Name (Z–A)',
    _ => 'Time (Latest)',
  };

  Widget _rulesCard() => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE6ECF4)),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() => _rulesOpen = false),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                const Icon(
                  LucideIcons.settings,
                  size: 17,
                  color: Color(0xFF52627C),
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Attendance Rules',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF172033),
                    ),
                  ),
                ),
                Icon(
                  _rulesOpen ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                  size: 18,
                  color: const Color(0xFF71809B),
                ),
              ],
            ),
          ),
        ),
        if (_rulesOpen)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _ruleTime('Start Time', widget.snapshot?.start),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _ruleTime('Absent After', widget.snapshot?.absent),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Late threshold',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF667085),
                        ),
                      ),
                    ),
                    if (widget.snapshot?.late != null)
                      Text(
                        'Late from ${widget.snapshot!.late}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF98A2B3),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    spacing: 4,
                    children: _lateChips(
                      widget.snapshot?.lateAfterMinutes ?? 20,
                    ),
                  ),
                ),
                if (!widget.automatic) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Mark scanned student as',
                    style: TextStyle(fontSize: 12, color: Color(0xFF667085)),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final entry in {
                        'present': widget.historyEdit ? 'P' : 'Present',
                        if (widget.historyEdit) 'absent': 'A',
                        'late': widget.historyEdit ? 'L' : 'Late',
                        if (widget.historyEdit) 'excused': 'E',
                      }.entries)
                        ChoiceChip(
                          label: Text(entry.value),
                          labelStyle: const TextStyle(fontSize: 12),
                          selected: widget.manual == entry.key,
                          selectedColor: _statusColors(entry.key).$2,
                          materialTapTargetSize: MaterialTapTargetSize.padded,
                          onSelected: widget.busy
                              ? null
                              : (_) => widget.onManualChanged(entry.key),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
      ],
    ),
  );

  List<Widget> _lateChips(int late) {
    const presets = [10, 15, 30];
    final enabled = !widget.busy && widget.onLateAfterChanged != null;
    final custom = !presets.contains(late);
    return [
      for (final minutes in presets)
        _thresholdChip(
          '$minutes min',
          late == minutes,
          enabled ? () => widget.onLateAfterChanged!(minutes) : null,
        ),
      _thresholdChip(
        custom ? '$late min' : 'Custom',
        custom,
        enabled ? () => _pickCustomLate(late) : null,
        edit: custom,
      ),
    ];
  }

  Widget _thresholdChip(
    String label,
    bool selected,
    VoidCallback? onTap, {
    bool edit = false,
  }) => ChoiceChip(
    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
    labelPadding: const EdgeInsets.symmetric(horizontal: 4),
    visualDensity: VisualDensity.compact,
    label: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label),
        if (edit) ...[
          const SizedBox(width: 4),
          const Icon(LucideIcons.pencil, size: 14, color: Color(0xFF2442A8)),
        ],
      ],
    ),
    labelStyle: TextStyle(
      fontSize: 12,
      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
      color: selected ? const Color(0xFF2442A8) : const Color(0xFF52627C),
    ),
    selected: selected,
    showCheckmark: false,
    selectedColor: const Color(0xFFEEF2FF),
    backgroundColor: Colors.white,
    side: BorderSide(
      color: selected ? const Color(0xFFBFD4FA) : const Color(0xFFE4E9F2),
    ),
    materialTapTargetSize: MaterialTapTargetSize.padded,
    onSelected: onTap == null ? null : (_) => onTap(),
  );

  Future<void> _pickCustomLate(int current) async {
    final minutes = await showDialog<int>(
      context: context,
      builder: (_) => _CustomLateDialog(initial: current),
    );
    if (minutes != null && mounted) widget.onLateAfterChanged?.call(minutes);
  }

  Widget _ruleTime(String label, String? value) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Icon(LucideIcons.clock, size: 12, color: Color(0xFF98A2B3)),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: Color(0xFF667085)),
            ),
          ),
        ],
      ),
      const SizedBox(height: 5),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F7FA),
          border: Border.all(color: const Color(0xFFE4E9F2)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          value ?? '—',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
    ],
  );

  Widget _learnerRow(AttendanceScanEntry learner) {
    final status = _status(learner);
    final time = widget.scanTimes[learner.id];
    final words = learner.name
        .split(RegExp(r'[\s,]+'))
        .where((word) => word.isNotEmpty)
        .toList();
    final initials = words.isEmpty
        ? '?'
        : '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
              .toUpperCase();
    final colors = _statusColors(status);
    return Container(
      key: ValueKey('scan-learner-${learner.id}'),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFF0F3F8))),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 19,
            backgroundColor: colors.$2,
            foregroundColor: colors.$1,
            child: Text(
              initials,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  learner.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF172033),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'LRN ${learner.lrn}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF71809B),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (time != null) ...[
                Text(
                  _timeLabel(time),
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF71809B),
                  ),
                ),
                const SizedBox(height: 4),
              ],
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.$2,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  attendanceLabels[status] ?? 'Unmarked',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: colors.$1,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  (Color, Color, Color) _statusColors(String status) => switch (status) {
    'present' => (
      const Color(0xFF15803D),
      const Color(0xFFDCFCE7),
      const Color(0xFFBBF7D0),
    ),
    'late' => (
      const Color(0xFFB45309),
      const Color(0xFFFEF3C7),
      const Color(0xFFFDE68A),
    ),
    'absent' => (
      const Color(0xFFB91C1C),
      const Color(0xFFFEE2E2),
      const Color(0xFFFECACA),
    ),
    'excused' => (
      const Color(0xFF1D4ED8),
      const Color(0xFFDBEAFE),
      const Color(0xFFBFDBFE),
    ),
    _ => (
      const Color(0xFF667085),
      const Color(0xFFF2F4F7),
      const Color(0xFFE4E7EC),
    ),
  };

  Widget _empty() {
    final label = switch (_filter) {
      'present' => 'No learners marked Present yet.',
      'late' => 'No learners marked Late yet.',
      'absent' => 'No learners marked Absent yet.',
      _ => 'No learners scanned yet.',
    };
    return ZEmpty(
      icon: _query.trim().isEmpty ? LucideIcons.scanLine : LucideIcons.search,
      title: _query.trim().isEmpty ? label : 'No learners match your search.',
    );
  }

  String _timeLabel(DateTime time) {
    final hour = time.hour % 12 == 0 ? 12 : time.hour % 12;
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${time.hour < 12 ? 'AM' : 'PM'}';
  }
}

/// Amber corner brackets for the scan frame, matching the scanner mock.
class _ScanCornersPainter extends CustomPainter {
  const _ScanCornersPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 3.0;
    const inset = stroke / 2;
    final length = size.shortestSide * 0.34;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final radius = 12.0;
    final rect = Offset.zero & size;
    final path = Path()
      ..moveTo(inset, rect.top + length)
      ..lineTo(inset, rect.top + radius)
      ..quadraticBezierTo(inset, inset, inset + radius, inset)
      ..lineTo(inset + length, inset)
      ..moveTo(rect.right - length, inset)
      ..lineTo(rect.right - radius, inset)
      ..quadraticBezierTo(
        rect.right - inset,
        inset,
        rect.right - inset,
        inset + radius,
      )
      ..lineTo(rect.right - inset, inset + length)
      ..moveTo(inset, rect.bottom - length)
      ..lineTo(inset, rect.bottom - radius)
      ..quadraticBezierTo(
        inset,
        rect.bottom - inset,
        inset + radius,
        rect.bottom - inset,
      )
      ..lineTo(inset + length, rect.bottom - inset)
      ..moveTo(rect.right - length, rect.bottom - inset)
      ..lineTo(rect.right - radius, rect.bottom - inset)
      ..quadraticBezierTo(
        rect.right - inset,
        rect.bottom - inset,
        rect.right - inset,
        rect.bottom - radius,
      )
      ..lineTo(rect.right - inset, rect.bottom - length);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_ScanCornersPainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Owns its controller so disposal happens with the dialog route.
class _CustomLateDialog extends StatefulWidget {
  const _CustomLateDialog({required this.initial});
  final int initial;

  @override
  State<_CustomLateDialog> createState() => _CustomLateDialogState();
}

class _CustomLateDialogState extends State<_CustomLateDialog> {
  late final _controller = TextEditingController(text: '${widget.initial}');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final parsed = int.tryParse(_controller.text.trim());
    if (parsed == null) return;
    Navigator.of(context).pop(parsed.clamp(0, 240).toInt());
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Custom late threshold'),
    content: TextField(
      controller: _controller,
      autofocus: true,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: const InputDecoration(
        labelText: 'Minutes after start',
        suffixText: 'min',
      ),
      onSubmitted: (_) => _submit(),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      FilledButton(onPressed: _submit, child: const Text('Apply')),
    ],
  );
}
