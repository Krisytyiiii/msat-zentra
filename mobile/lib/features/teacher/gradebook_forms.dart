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
  static const _sheetAccent = Color(0xFF1D4ED8);

  Widget _assessmentSheet(BuildContext context) {
    return PopScope(
      canPop: !_saving,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SafeArea(
          top: false,
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            child: Container(
              color: Colors.white,
              height: MediaQuery.sizeOf(context).height * 0.5,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 22, bottom: 24),
                    child: Center(
                      child: Container(
                        width: 32,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFF737373),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(13, 12, 16, 16),
                      child: Theme(
                        data: Theme.of(context).copyWith(
                          colorScheme: ColorScheme.fromSeed(
                            seedColor: _sheetAccent,
                            brightness: Brightness.light,
                            primary: _sheetAccent,
                            surface: Colors.white,
                          ),
                          textTheme: Theme.of(context).textTheme.apply(
                            bodyColor: _sheetInk,
                            displayColor: _sheetInk,
                          ),
                          inputDecorationTheme: InputDecorationTheme(
                            filled: true,
                            fillColor: Colors.white,
                            labelStyle: const TextStyle(
                              fontSize: 12,
                              color: _sheetMuted,
                            ),
                            helperStyle: const TextStyle(
                              fontSize: 12,
                              color: _sheetMuted,
                            ),
                            contentPadding: const EdgeInsets.all(14),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0xFFE2E8F0),
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0xFFE2E8F0),
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(color: _sheetAccent),
                            ),
                          ),
                          outlinedButtonTheme: OutlinedButtonThemeData(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: _sheetInk,
                              minimumSize: const Size.fromHeight(48),
                              alignment: Alignment.centerLeft,
                              side: const BorderSide(color: Color(0xFFE2E8F0)),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                          ),
                        ),
                        child: Form(
                          key: _form,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              ColoredBox(
                                color: Colors.white,
                                child: Padding(
                                  padding: EdgeInsets.zero,
                                  child: Column(
                                    children: [
                                      Row(
                                        children: [
                                          Container(
                                            width: 46,
                                            height: 46,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              color: const Color(0xFF2563EB),
                                              borderRadius:
                                                  BorderRadius.circular(13),
                                            ),
                                            child: const Icon(
                                              LucideIcons.clipboardCheck,
                                              size: 18,
                                              color: Colors.white,
                                            ),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'Add ${assessmentTypes[widget.type]}',
                                                  style: const TextStyle(
                                                    fontSize: 15,
                                                    fontWeight: FontWeight.w700,
                                                    color: _sheetInk,
                                                  ),
                                                ),
                                                const SizedBox(height: 4),
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
                                          IconButton(
                                            tooltip: 'Close',
                                            onPressed: _saving || _completed
                                                ? null
                                                : () =>
                                                      Navigator.of(context)
                                                          .pop(),
                                            icon: const Icon(
                                              LucideIcons.x,
                                              size: 20,
                                            ),
                                            style: IconButton.styleFrom(
                                              foregroundColor: _sheetMuted,
                                              side: const BorderSide(
                                                color: Color(0xFFE5E8F0),
                                              ),
                                              minimumSize: const Size(42, 42),
                                              shape: const CircleBorder(),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 12),
                                child: Divider(
                                  height: 1,
                                  color: Color(0xFFF1F5F9),
                                ),
                              ),
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
                                  DropdownMenuItem(
                                    value: 'adm',
                                    child: Text('ADM'),
                                  ),
                                ],
                                onChanged: _saving || _completed
                                    ? null
                                    : (value) {
                                        if (value != null) {
                                          setState(() => _audience = value);
                                        }
                                      },
                              ),
                              const SizedBox(height: 16),
                              OutlinedButton.icon(
                                key: const ValueKey('assessment-date'),
                                onPressed: _saving || _completed
                                    ? null
                                    : _pickDate,
                                icon: const Icon(
                                  LucideIcons.calendarDays,
                                  size: 18,
                                ),
                                label: Text(
                                  'Date: ${DateFormat('MM/dd/yyyy').format(_date)}',
                                ),
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: _title,
                                enabled: !_saving && !_completed,
                                decoration: const InputDecoration(
                                  labelText: 'Assessment title',
                                ),
                                maxLength: 120,
                                textCapitalization:
                                    TextCapitalization.sentences,
                                validator: (text) =>
                                    (text?.trim().isEmpty ?? true)
                                    ? 'Enter an assessment title.'
                                    : null,
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                key: const ValueKey('assessment-max-score'),
                                controller: _value,
                                enabled: !_saving && !_completed,
                                decoration: const InputDecoration(
                                  labelText: 'Maximum score',
                                  helperText: 'Greater than 0, up to 100,000',
                                ),
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                                textInputAction: TextInputAction.done,
                                onFieldSubmitted: (_) => _save(),
                                validator: (text) {
                                  final number = double.tryParse(
                                    text?.trim() ?? '',
                                  );
                                  if (number == null ||
                                      !number.isFinite ||
                                      number <= 0 ||
                                      number > 100000) {
                                    return 'Enter a maximum score greater than 0 and up to 100,000.';
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
                                      color: Theme.of(context)
                                          .colorScheme
                                          .error,
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 20),
                              FilledButton(
                                style: FilledButton.styleFrom(
                                  backgroundColor: _sheetAccent,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size.fromHeight(48),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                ),
                                onPressed: _saving || _completed ? null : _save,
                                child: Text(_saving ? 'Adding…' : 'Add'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
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
