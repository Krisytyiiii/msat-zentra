import 'package:flutter/material.dart';
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
    this.start,
    this.late,
    this.absent,
    this.lateAfterMinutes = 20,
  });
  final List<AttendanceScanEntry> learners;
  final Map<String, String> marks;
  final String? schoolYear, term, grade, start, late, absent;
  final int lateAfterMinutes;
}

/// Presentation for [AttendanceScannerPage]. Camera/lifecycle stay in the page.
class AttendanceScanView extends StatefulWidget {
  const AttendanceScanView({
    super.key,
    required this.title,
    required this.historyEdit,
    required this.automatic,
    required this.allowAutomatic,
    required this.manual,
    required this.message,
    required this.error,
    required this.busy,
    required this.camera,
    required this.onDone,
    required this.onAutomaticChanged,
    required this.onManualChanged,
    this.onTorch,
    this.torchOn = false,
    this.snapshot,
    this.scanTimes = const {},
    this.onLateAfterChanged,
  });

  final String title;
  final bool historyEdit, automatic, allowAutomatic, error, busy, torchOn;
  final String manual, message;
  final Widget camera;
  final AttendanceScanSnapshot? snapshot;
  final Map<String, DateTime> scanTimes;
  final VoidCallback onDone;
  final VoidCallback? onTorch;
  final ValueChanged<bool> onAutomaticChanged;
  final ValueChanged<String> onManualChanged;
  final ValueChanged<int>? onLateAfterChanged;

  @override
  State<AttendanceScanView> createState() => _AttendanceScanViewState();
}

class _AttendanceScanViewState extends State<AttendanceScanView> {
  final _search = TextEditingController();
  String _tab = 'scanned';
  String _query = '';
  bool _descending = false;
  bool _rulesOpen = true;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  String _status(AttendanceScanEntry learner) =>
      widget.snapshot?.marks[learner.id] ?? '';

  int _count(String tab) {
    final learners = widget.snapshot?.learners ?? const <AttendanceScanEntry>[];
    if (tab == 'scanned') {
      return learners.where((l) => _status(l).isNotEmpty).length;
    }
    return learners.where((l) => _status(l) == tab).length;
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = widget.snapshot;
    final learners = [...?snapshot?.learners];
    final query = _query.trim().toLowerCase();
    final filtered = learners.where((l) {
      final status = _status(l);
      if (_tab == 'scanned' ? status.isEmpty : status != _tab) return false;
      return l.name.toLowerCase().contains(query) ||
          l.lrn.toLowerCase().contains(query);
    }).toList();
    filtered.sort(
      (a, b) =>
          _descending ? b.name.compareTo(a.name) : a.name.compareTo(b.name),
    );

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFD),
      appBar: AppBar(
        shape: const Border(bottom: BorderSide(color: Color(0xFFEDF0F6))),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        centerTitle: false,
        titleSpacing: 4,
        leadingWidth: 64,
        leading: ZBackButton(
            tooltip: 'Back',
            icon: const Icon(LucideIcons.chevronLeft, size: 20),
            onPressed: widget.busy ? null : widget.onDone,
        ),
        title: const Text(
          'Scan Attendance',
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w700,
            color: Color(0xFF101828),
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: FilledButton.icon(
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
            onPressed: widget.busy ? null : widget.onDone,
            icon: const Icon(LucideIcons.clipboardCheck, size: 19),
            label: const Text('Done · Review Attendance'),
          ),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _scopeCard(snapshot),
              const SizedBox(height: 12),
              _cameraCard(),
              const SizedBox(height: 10),
              _messageBanner(),
              const SizedBox(height: 12),
              _rulesCard(),
              const SizedBox(height: 14),
              _tabs(),
              const SizedBox(height: 10),
              _searchRow(),
              const SizedBox(height: 10),
              if (filtered.isEmpty)
                _empty()
              else
                for (final learner in filtered) ...[
                  _learnerCard(learner),
                  const SizedBox(height: 8),
                ],
              if (widget.snapshot != null) ...[
                const SizedBox(height: 4),
                Text(
                  widget.historyEdit
                      ? 'Only the scanned student’s mark is replaced. Everyone else stays unchanged; ADM-exempt students are skipped.'
                      : 'Scans are kept as drafts. Review and save attendance on the next screen. Existing marks and ADM-exempt students are not overwritten.',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF71809B),
                    height: 1.35,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _scopeCard(AttendanceScanSnapshot? snapshot) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFF3F7FF),
      border: Border.all(color: const Color(0xFFDCE7F8)),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: const Color(0xFFBFD4FA)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                LucideIcons.scanLine,
                color: Color(0xFF2563EB),
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'QR ATTENDANCE',
                    style: TextStyle(
                      fontSize: 11,
                      letterSpacing: .4,
                      color: Color(0xFF2563EB),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF101828),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    widget.historyEdit
                        ? 'Correct a learner’s mark for the selected meeting.'
                        : 'Scan each learner’s Zentra QR code to draft attendance.',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF667085),
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        if ([
          snapshot?.schoolYear,
          snapshot?.term,
          snapshot?.grade,
        ].any((value) => value != null && value.isNotEmpty)) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (snapshot?.schoolYear != null &&
                  snapshot!.schoolYear!.isNotEmpty)
                ZScopePill(text: snapshot.schoolYear!, kind: ScopePillKind.schoolYear, compact: true),
              if (snapshot?.term != null && snapshot!.term!.isNotEmpty)
                ZScopePill(text: snapshot.term!, kind: ScopePillKind.term, compact: true),
              if (snapshot?.grade != null && snapshot!.grade!.isNotEmpty)
                ZScopePill(text: snapshot.grade!, kind: ScopePillKind.grade, compact: true),
            ],
          ),
        ],
      ],
    ),
  );

  Widget _cameraCard() => ClipRRect(
    borderRadius: BorderRadius.circular(22),
    child: AspectRatio(
      aspectRatio: 1.45,
      child: Stack(
        fit: StackFit.expand,
        children: [
          widget.camera,
          IgnorePointer(
            child: Center(
              child: FractionallySizedBox(
                widthFactor: .56,
                heightFactor: .62,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    DecoratedBox(
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.white, width: 3),
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                    Container(
                      height: 2,
                      margin: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF60A5FA),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF3B82F6)
                                .withValues(alpha: .8),
                            blurRadius: 12,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                    ),
                  ],
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
                backgroundColor: Colors.black.withValues(alpha: .42),
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
          const Positioned(
            bottom: 12,
            left: 16,
            right: 16,
            child: Text(
              'Align QR code inside the frame',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
                shadows: [Shadow(blurRadius: 6)],
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
        color: widget.error ? const Color(0xFFFFF4F4) : Colors.white,
        border: Border.all(
          color: widget.error
              ? const Color(0xFFFECACA)
              : const Color(0xFFE6ECF4),
        ),
        borderRadius: BorderRadius.circular(14),
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

  Widget _rulesCard() => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE6ECF4)),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => setState(() => _rulesOpen = !_rulesOpen),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                const Icon(
                  LucideIcons.settings,
                  size: 17,
                  color: Color(0xFF475467),
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Attendance Rules',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF101828),
                    ),
                  ),
                ),
                Icon(
                  _rulesOpen ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                  size: 18,
                  color: const Color(0xFF667085),
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
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Late After',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF667085),
                            ),
                          ),
                          DropdownButtonFormField<int>(
                            key: ValueKey(
                              widget.snapshot?.lateAfterMinutes ?? 20,
                            ),
                            initialValue:
                                widget.snapshot?.lateAfterMinutes ?? 20,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 8,
                              ),
                            ),
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF101828),
                            ),
                            items: [
                              for (var minutes = 0; minutes <= 240; minutes++)
                                DropdownMenuItem(
                                  value: minutes,
                                  child: Text(
                                    '$minutes min',
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                            ],
                            onChanged:
                                widget.busy || widget.onLateAfterChanged == null
                                ? null
                                : (value) {
                                    if (value != null) {
                                      widget.onLateAfterChanged!(value);
                                    }
                                  },
                          ),
                          if (widget.snapshot?.late != null)
                            Text(
                              widget.snapshot!.late!,
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF667085),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _ruleTime('Absent After', widget.snapshot?.absent),
                    ),
                  ],
                ),
                if (widget.allowAutomatic) ...[
                  const SizedBox(height: 6),
                  Material(
                    color: Colors.transparent,
                    child: SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: const Text(
                        'Automatic marking',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        widget.historyEdit
                            ? 'Late from ${widget.snapshot?.lateAfterMinutes ?? 20} minutes after start. Only the scanned student changes.'
                            : 'Late from ${widget.snapshot?.lateAfterMinutes ?? 20} minutes after start. Unmarked students become Absent after the period.',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFF71809B),
                        ),
                      ),
                      value: widget.automatic,
                      onChanged: widget.busy ? null : widget.onAutomaticChanged,
                    ),
                  ),
                ],
                if (!widget.automatic) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
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

  Widget _tabs() {
    const tabs = [
      ('scanned', 'Scanned', LucideIcons.scanLine, Color(0xFF2563EB)),
      ('present', 'Present', LucideIcons.circleCheck, Color(0xFF16A34A)),
      ('late', 'Late', LucideIcons.clock, Color(0xFFD97706)),
      ('absent', 'Absent', LucideIcons.circleX, Color(0xFFDC2626)),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final tab in tabs)
            InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => setState(() => _tab = tab.$1),
              child: Container(
                padding: const EdgeInsets.fromLTRB(10, 6, 10, 7),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      width: 2,
                      color: _tab == tab.$1 ? tab.$4 : Colors.transparent,
                    ),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      tab.$3,
                      size: 15,
                      color: _tab == tab.$1 ? tab.$4 : const Color(0xFF98A2B3),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      '${tab.$2} (${_count(tab.$1)})',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: _tab == tab.$1
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: _tab == tab.$1
                            ? tab.$4
                            : const Color(0xFF667085),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _searchRow() => Row(
    children: [
      Expanded(
        child: TextField(
          controller: _search,
          onChanged: (value) => setState(() => _query = value),
          style: const TextStyle(fontSize: 13),
          decoration: InputDecoration(
            hintText: 'Search learner or LRN...',
            hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF98A2B3)),
            prefixIcon: const Icon(
              LucideIcons.search,
              size: 18,
              color: Color(0xFF667085),
            ),
            isDense: true,
            filled: true,
            fillColor: const Color(0xFFF2F5F9),
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: const BorderSide(color: Color(0xFFBFD4FA)),
            ),
          ),
        ),
      ),
      const SizedBox(width: 8),
      PopupMenuButton<bool>(
        tooltip: 'Sort learners',
        initialValue: _descending,
        onSelected: (value) => setState(() => _descending = value),
        itemBuilder: (_) => const [
          PopupMenuItem(value: false, child: Text('Name (A-Z)')),
          PopupMenuItem(value: true, child: Text('Name (Z-A)')),
        ],
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: const Color(0xFFE4E9F2)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(
            LucideIcons.listFilter,
            size: 18,
            color: Color(0xFF475467),
          ),
        ),
      ),
    ],
  );

  Widget _learnerCard(AttendanceScanEntry learner) {
    final status = _status(learner);
    final time = widget.scanTimes[learner.id];
    final initials = learner.name
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    final colors = [
      (const Color(0xFFEFF6FF), const Color(0xFF2563EB)),
      (const Color(0xFFF5F3FF), const Color(0xFF7C3AED)),
      (const Color(0xFFFFFBEB), const Color(0xFFB45309)),
      (const Color(0xFFECFDF5), const Color(0xFF0F766E)),
    ];
    final color = colors[learner.id.hashCode.abs() % colors.length];
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE9EEF6)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: color.$1,
            child: Text(
              initials.isEmpty
                  ? '?'
                  : '${initials.first.characters.first}${initials.length > 1 ? initials.last.characters.first : ''}'
                        .toUpperCase(),
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: color.$2,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  learner.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF101828),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'LRN ${learner.lrn}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF98A2B3),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (time != null)
                Text(
                  _timeLabel(time),
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF667085),
                  ),
                ),
              const SizedBox(height: 4),
              _statusPill(status),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statusPill(String status) {
    final label = attendanceLabels[status] ?? 'Unmarked';
    final colors = _statusColors(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colors.$2,
        border: Border.all(color: colors.$3),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: colors.$1,
        ),
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
    final label = switch (_tab) {
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
