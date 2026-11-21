import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Controlled date navigation shared by Class and attendance sheets.
class DateStripSelector extends StatefulWidget {
  const DateStripSelector({
    super.key,
    required this.selectedDate,
    required this.today,
    required this.firstDate,
    required this.lastDate,
    required this.onChanged,
    this.enabled = true,
    this.selectableDayPredicate,
    this.hasEvent,
    this.stripKey,
    this.pickerHelpText = 'Choose date',
  });

  final DateTime selectedDate, today, firstDate, lastDate;
  final FutureOr<void> Function(DateTime) onChanged;
  final bool enabled;
  final bool Function(DateTime)? selectableDayPredicate, hasEvent;
  final Key? stripKey;
  final String pickerHelpText;

  @override
  State<DateStripSelector> createState() => _DateStripState();
}

class _DateStripState extends State<DateStripSelector> {
  late final PageController _pages = PageController(
    initialPage: _index(widget.selectedDate),
    viewportFraction: 1 / 6,
  );
  bool _changing = false, _moving = false;
  int _movement = 0;
  static DateTime _day(DateTime value) =>
      DateTime.utc(value.year, value.month, value.day);
  int get _count =>
      _day(widget.lastDate).difference(_day(widget.firstDate)).inDays + 1;
  int _index(DateTime date) =>
      _day(date).difference(_day(widget.firstDate)).inDays.clamp(0, _count - 1);
  DateTime _date(int page) => _day(widget.firstDate).add(Duration(days: page));
  bool get _enabled => widget.enabled && !_changing;
  bool _eligible(DateTime date) =>
      !date.isBefore(_day(widget.firstDate)) &&
      !date.isAfter(_day(widget.lastDate)) &&
      (widget.selectableDayPredicate?.call(date) ?? true);

  DateTime? _adjacent(int direction) {
    var day = _day(widget.selectedDate).add(Duration(days: direction));
    if (direction > 0 && day.isBefore(_day(widget.firstDate))) {
      day = _day(widget.firstDate);
    } else if (direction < 0 && day.isAfter(_day(widget.lastDate))) {
      day = _day(widget.lastDate);
    }
    while (!day.isBefore(_day(widget.firstDate)) &&
        !day.isAfter(_day(widget.lastDate))) {
      if (_eligible(day)) return day;
      day = day.add(Duration(days: direction));
    }
    return null;
  }

  Future<void> _center() async {
    if (!mounted || !_pages.hasClients) return;
    final target = _index(widget.selectedDate);
    if ((_pages.page! - target).abs() < 0.001) return;
    final movement = ++_movement;
    _moving = true;
    try {
      if (MediaQuery.disableAnimationsOf(context)) {
        _pages.jumpToPage(target);
      } else {
        await _pages.animateToPage(
          target,
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOut,
        );
      }
    } finally {
      if (movement == _movement) _moving = false;
    }
  }

  Future<void> _select(DateTime date) async {
    if (!_enabled ||
        !_eligible(date) ||
        _day(date) == _day(widget.selectedDate)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _center());
      return;
    }
    setState(() => _changing = true);
    try {
      await widget.onChanged(date);
    } finally {
      if (mounted) {
        setState(() => _changing = false);
        WidgetsBinding.instance.addPostFrameCallback((_) => _center());
      }
    }
  }

  Future<void> _pick() async {
    if (!_enabled) return;
    final initial = _eligible(_day(widget.selectedDate))
        ? _day(widget.selectedDate)
        : _adjacent(1) ?? _adjacent(-1);
    if (initial == null) return;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: _day(widget.firstDate),
      lastDate: _day(widget.lastDate),
      selectableDayPredicate: widget.selectableDayPredicate,
      helpText: widget.pickerHelpText,
    );
    if (picked != null && mounted) await _select(_day(picked));
  }

  @override
  void didUpdateWidget(DateStripSelector oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_day(oldWidget.selectedDate) != _day(widget.selectedDate) ||
        _day(oldWidget.firstDate) != _day(widget.firstDate)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _center());
    }
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previous = _adjacent(-1), next = _adjacent(1);
    final height = 16 + MediaQuery.textScalerOf(context).scale(12) * 1.5;
    final buttonStyle = IconButton.styleFrom(
      minimumSize: Size(32, height),
      maximumSize: Size(32, height),
      padding: EdgeInsets.zero,
      tapTargetSize: MaterialTapTargetSize.padded,
      foregroundColor: const Color(0xFF52627C),
      side: const BorderSide(color: Color(0xFFE6ECF4)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE6ECF4)),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              IconButton.outlined(
                tooltip: 'Previous day',
                style: buttonStyle,
                onPressed: _enabled && previous != null
                    ? () => _select(previous)
                    : null,
                icon: const Icon(Icons.chevron_left, size: 18),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Material(
                  color: const Color(0xFFF8F9FB),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: Color(0xFFE6ECF4)),
                  ),
                  child: InkWell(
                    onTap: _enabled ? _pick : null,
                    borderRadius: BorderRadius.circular(12),
                    child: SizedBox(
                      height: height,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.calendar_today_outlined,
                            size: 14,
                            color: Color(0xFF52627C),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              DateFormat('EEE, MMM d, yyyy')
                                  .format(widget.selectedDate),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF192034),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              IconButton.outlined(
                tooltip: 'Next day',
                style: buttonStyle,
                onPressed: _enabled && next != null
                    ? () => _select(next)
                    : null,
                icon: const Icon(Icons.chevron_right, size: 18),
              ),
              TextButton(
                onPressed: _enabled && _eligible(_day(widget.today))
                    ? () => _select(_day(widget.today))
                    : null,
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, 48),
                  foregroundColor: const Color(0xFF2563EB),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                child: const Text('Today', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
          const Divider(height: 12, color: Color(0xFFF0F3F8)),
          SizedBox(
            height: 24 + MediaQuery.textScalerOf(context).scale(12) * 3,
            child: PageView.builder(
              key: widget.stripKey,
              controller: _pages,
              // Class supports a very wide calendar. A huge finite sliver with
              // fractional page widths loses precision in Flutter's geometry;
              // preserve the original lazy/unbounded strip for that case.
              itemCount: _count > 100000 ? null : _count,
              physics: _enabled ? null : const NeverScrollableScrollPhysics(),
              onPageChanged: (index) {
                if (_moving || _changing) return;
                final date = _date(index);
                if (_eligible(date)) {
                  unawaited(_select(date));
                } else {
                  final direction = date.isBefore(_day(widget.selectedDate))
                      ? -1
                      : 1;
                  final next = _adjacent(direction);
                  if (next != null) {
                    unawaited(_select(next));
                  } else {
                    WidgetsBinding.instance.addPostFrameCallback(
                      (_) => _center(),
                    );
                  }
                }
              },
              itemBuilder: (context, index) {
                final date = _date(index);
                final selected = date == _day(widget.selectedDate);
                return Padding(
                  padding: const EdgeInsets.all(2),
                  child: TextButton(
                    onPressed: _enabled && _eligible(date)
                        ? () => _select(date)
                        : null,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      backgroundColor: selected
                          ? const Color(0xFF4060EF)
                          : const Color(0xFFF8F9FB),
                      foregroundColor: selected
                          ? Colors.white
                          : const Color(0xFF71809B),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          DateFormat('EEE').format(date).toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          DateFormat('d').format(date),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: selected
                                ? Colors.white
                                : const Color(0xFF263045),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: selected
                                ? const Color(0xFFF59E0B)
                                : widget.hasEvent?.call(date) == true
                                ? const Color(0xFFCBD5E1)
                                : const Color(0xFFE6ECF4),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
