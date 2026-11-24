import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../shared/user_messages.dart';
import '../adviser/schedule_timing.dart';
import 'gradebook_data.dart';

class GradebookEditor extends StatefulWidget {
  const GradebookEditor.score({
    super.key,
    required this.onSave,
    required this.learner,
    required this.assessment,
    this.initialScore,
  }) : type = null,
       audience = 'regular',
       onAssessmentSave = null;
  const GradebookEditor.assessment({
    super.key,
    required this.type,
    required this.audience,
    required this.onAssessmentSave,
  }) : learner = null,
       assessment = null,
       initialScore = null,
       onSave = null;
  final String? type;
  final String audience;
  final RecordLearner? learner;
  final RecordAssessment? assessment;
  final double? initialScore;
  final Future<void> Function(String title, double value)? onSave;
  final Future<void> Function(
    String title,
    double maxScore,
    String audience,
    DateTime dateGiven,
  )?
  onAssessmentSave;
  @override
  State<GradebookEditor> createState() => _EditorState();
}

class _EditorState extends State<GradebookEditor> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  late final _value = TextEditingController(
    text: widget.type != null
        ? '100'
        : widget.initialScore == null
        ? ''
        : gradeNumber(widget.initialScore!),
  );
  bool _saving = false;
  bool _completed = false;
  String? _error;
  late String _audience = widget.audience;
  late DateTime _date = () {
    final now = philippineTime(DateTime.now());
    return DateTime.utc(now.year, now.month, now.day);
  }();

  Future<void> _pickDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: DateTime(_date.year, _date.month, _date.day),
      firstDate: DateTime(1900),
      lastDate: DateTime(2100, 12, 31),
    );
    if (selected != null && mounted && !_saving) {
      setState(
        () => _date = DateTime.utc(selected.year, selected.month, selected.day),
      );
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _value.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || _completed || !_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final value = double.parse(_value.text.trim());
      if (widget.type != null) {
        await widget.onAssessmentSave!(
          _title.text.trim(),
          value,
          _audience,
          _date,
        );
      } else {
        await widget.onSave!(_title.text.trim(), value);
      }
      if (mounted) {
        setState(() {
          _saving = false;
          _completed = true;
        });
        // Rebuild PopScope before closing the route that was protected while
        // saving. Keep the action guarded throughout the dismissal animation.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.of(context).pop(true);
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = userMessage(error);
        });
      }
    }
  }

  static const _sheetInk = Color(0xFF0F172A);
  static const _sheetMuted = Color(0xFF64748B);
  static const _sheetLine = Color(0xFFE2E8F0);
  static const _sheetAccent = Color(0xFF1D4ED8);
  static const _sheetIcon = Color(0xFF94A3B8);
  static const _sheetValue = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: _sheetInk,
  );

  InputDecoration _sheetInput(String label, {String? hint}) =>
      InputDecoration(
        labelText: label,
        hintText: hint,
        floatingLabelBehavior: FloatingLabelBehavior.always,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        isDense: true,
        contentPadding: const EdgeInsets.only(top: 2),
        hintStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: _sheetIcon,
        ),
        labelStyle: const TextStyle(fontSize: 11, color: _sheetMuted),
        floatingLabelStyle: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: _sheetMuted,
        ),
        errorStyle: const TextStyle(fontSize: 11),
        counterText: '',
      );

  Widget _sheetField(Widget child) => Container(
    padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: _sheetLine),
    ),
    child: child,
  );

  Widget _sheetLeading(IconData icon) => Icon(icon, size: 18, color: _sheetIcon);

  Widget _assessmentSheet(BuildContext context) {
    final dateText = DateFormat('MM/dd/yyyy').format(_date);
    return PopScope(
      canPop: !_saving,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Form(
              key: _form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD8DEE9),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF4FF),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          LucideIcons.clipboardCheck,
                          size: 20,
                          color: _sheetAccent,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Add ${assessmentTypes[widget.type]}',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                                color: _sheetInk,
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              '${_audience == 'adm' ? 'ADM' : 'Regular'} assessment',
                              style: const TextStyle(
                                fontSize: 12,
                                color: _sheetMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.asset(
                          'assets/zentra.png',
                          width: 32,
                          height: 32,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _sheetField(
                    Row(
                      children: [
                        _sheetLeading(LucideIcons.graduationCap),
                        const SizedBox(width: 12),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            key: const ValueKey('assessment-student-type'),
                            initialValue: _audience,
                            isExpanded: true,
                            icon: const Icon(
                              LucideIcons.chevronDown,
                              size: 18,
                              color: _sheetIcon,
                            ),
                            decoration: _sheetInput('Student type'),
                            style: _sheetValue,
                            dropdownColor: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            items: const [
                              DropdownMenuItem(
                                value: 'regular',
                                child: Text('Regular'),
                              ),
                              DropdownMenuItem(value: 'adm', child: Text('ADM')),
                            ],
                            onChanged: _saving
                                ? null
                                : (value) {
                                    if (value != null) {
                                      setState(() => _audience = value);
                                    }
                                  },
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      key: const ValueKey('assessment-date'),
                      borderRadius: BorderRadius.circular(20),
                      onTap: _saving ? null : _pickDate,
                      child: _sheetField(
                        Row(
                          children: [
                            _sheetLeading(LucideIcons.calendarDays),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Date',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w500,
                                      color: _sheetMuted,
                                    ),
                                  ),
                                  const SizedBox(height: 1),
                                  Text(dateText, style: _sheetValue),
                                ],
                              ),
                            ),
                            Container(
                              width: 32,
                              height: 32,
                              decoration: const BoxDecoration(
                                color: Color(0xFFEEF4FF),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                LucideIcons.calendar,
                                size: 16,
                                color: _sheetAccent,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  _sheetField(
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: _sheetLeading(LucideIcons.fileText),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _title,
                            enabled: !_saving,
                            style: _sheetValue,
                            maxLength: 120,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: _sheetInput(
                              'Assessment title',
                              hint: 'Enter assessment title',
                            ),
                            validator: (text) =>
                                (text?.trim().isEmpty ?? true)
                                ? 'Enter an assessment title.'
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 2, right: 4),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: ValueListenableBuilder<TextEditingValue>(
                        valueListenable: _title,
                        builder: (context, value, _) => Text(
                          '${value.text.length}/120',
                          style: const TextStyle(
                            fontSize: 11,
                            color: _sheetIcon,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _sheetField(
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: _sheetLeading(LucideIcons.badgeCheck),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            key: const ValueKey('assessment-max-score'),
                            controller: _value,
                            enabled: !_saving,
                            style: _sheetValue,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                                  decimal: true,
                                ),
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _save(),
                            decoration: _sheetInput('Maximum score'),
                            validator: (text) {
                              final number = double.tryParse(
                                text?.trim() ?? '',
                              );
                              if (number == null ||
                                  !number.isFinite ||
                                  number > 100000 ||
                                  number <= 0) {
                                return 'Enter a maximum score greater than 0 and up to 100,000.';
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(6, 6, 0, 0),
                    child: Row(
                      children: [
                        Icon(
                          LucideIcons.info,
                          size: 12,
                          color: Color(0xFF60A5FA),
                        ),
                        SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'Greater than 0, up to 100,000',
                            style: TextStyle(fontSize: 11, color: _sheetIcon),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        flex: 4,
                        child: SizedBox(
                          height: 48,
                          child: OutlinedButton(
                            onPressed: _saving
                                ? null
                                : () => Navigator.of(context).pop(),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: _sheetInk,
                              side: const BorderSide(color: _sheetLine),
                              shape: const StadiumBorder(),
                              textStyle: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            child: const Text('Cancel'),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 7,
                        child: SizedBox(
                          height: 48,
                          child: FilledButton(
                            onPressed: _saving || _completed ? null : _save,
                            style: FilledButton.styleFrom(
                              backgroundColor: _sheetAccent,
                              foregroundColor: Colors.white,
                              shape: const StadiumBorder(),
                              textStyle: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    _saving ? 'Saving…' : 'Add assessment',
                                  ),
                                  const SizedBox(width: 4),
                                  const Icon(LucideIcons.plus, size: 16),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.type != null) return _assessmentSheet(context);
    final adding = widget.type != null;
    return PopScope(
      canPop: !_saving,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Form(
              key: _form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    adding
                        ? 'Add ${assessmentTypes[widget.type]}'
                        : 'Edit score',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    adding
                        ? '${_audience == 'adm' ? 'ADM' : 'Regular'} assessment'
                        : '${widget.learner!.displayName}\n${widget.assessment!.title}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  if (adding) ...[
                    DropdownButtonFormField<String>(
                      key: const ValueKey('assessment-student-type'),
                      initialValue: _audience,
                      decoration: const InputDecoration(
                        labelText: 'Student type',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'regular',
                          child: Text('Regular'),
                        ),
                        DropdownMenuItem(value: 'adm', child: Text('ADM')),
                      ],
                      onChanged: _saving
                          ? null
                          : (value) {
                              if (value != null) {
                                setState(() => _audience = value);
                              }
                            },
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      key: const ValueKey('assessment-date'),
                      onPressed: _saving ? null : _pickDate,
                      icon: const Icon(Icons.calendar_today_outlined, size: 18),
                      label: Text(
                        'Date: ${DateFormat('MM/dd/yyyy').format(_date)}',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _title,
                      enabled: !_saving,
                      decoration: const InputDecoration(
                        labelText: 'Assessment title',
                      ),
                      maxLength: 120,
                      textCapitalization: TextCapitalization.sentences,
                      validator: (text) => (text?.trim().isEmpty ?? true)
                          ? 'Enter an assessment title.'
                          : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    key: ValueKey(
                      adding ? 'assessment-max-score' : 'score-input',
                    ),
                    controller: _value,
                    enabled: !_saving,
                    decoration: InputDecoration(
                      labelText: adding ? 'Maximum score' : 'Score',
                      helperText: adding
                          ? 'Greater than 0, up to 100,000'
                          : '0 to ${gradeNumber(widget.assessment!.maxScore)} · blank scores remain missing',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _save(),
                    validator: (text) {
                      final number = double.tryParse(text?.trim() ?? '');
                      final max = adding
                          ? 100000.0
                          : widget.assessment!.maxScore;
                      if (number == null ||
                          !number.isFinite ||
                          number > max ||
                          (adding ? number <= 0 : number < 0)) {
                        return adding
                            ? 'Enter a maximum score greater than 0 and up to 100,000.'
                            : 'Enter a score from 0 to ${gradeNumber(max)}.';
                      }
                      return null;
                    },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Wrap(
                    alignment: WrapAlignment.end,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      TextButton(
                        onPressed: _saving
                            ? null
                            : () => Navigator.of(context).pop(),
                        child: const Text('Cancel'),
                      ),
                      FilledButton(
                        onPressed: _saving || _completed ? null : _save,
                        child: Text(
                          _saving
                              ? 'Saving…'
                              : adding
                              ? 'Add assessment'
                              : 'Save score',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
