import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

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

  @override
  Widget build(BuildContext context) {
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
