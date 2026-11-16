// Student detail — web parity: risk + LRN + Academic (…/students/:id/academic)
// + Attendance (…/students/:id/attendance, subjectSummary ?? summary)
// + Anecdotal (…/students/:id/anecdotal, own-full vs metadata-only)
// + ADM (GET /api/adm/my-cases filtered by studentId|lrn, hidden if none)
// + Referrals. All fetches in parallel; per-section errors degrade locally.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../../shared/models.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';

// --- attendance models (unchanged) ---

class SubjectRate {
  final String subjectId;
  final String name;
  final String code;
  final int present;
  final int total;
  final double rate;
  const SubjectRate({
    required this.subjectId,
    required this.name,
    required this.code,
    required this.present,
    required this.total,
    required this.rate,
  });
  factory SubjectRate.fromJson(Map<String, dynamic> j) => SubjectRate(
    subjectId: j['subjectId']?.toString() ?? '',
    name: j['name']?.toString() ?? '',
    code: j['code']?.toString() ?? '',
    present: (j['present'] ?? 0) as int,
    total: (j['total'] ?? 0) as int,
    rate: ((j['rate'] ?? 0) as num).toDouble(),
  );
}

class AttendanceSummary {
  final int present;
  final int absent;
  final int late;
  final int excused;
  final int total;
  final double rate;
  final bool isRisk;
  final List<SubjectRate> bySubject;
  final bool subjectEra;
  const AttendanceSummary({
    required this.present,
    required this.absent,
    required this.late,
    required this.excused,
    required this.total,
    required this.rate,
    required this.isRisk,
    required this.bySubject,
    required this.subjectEra,
  });

  factory AttendanceSummary.fromAttendancePayload(
    Map<String, dynamic> payload,
  ) {
    final subj = payload['subjectSummary'];
    if (subj is Map) {
      final m = Map<String, dynamic>.from(subj);
      return AttendanceSummary(
        present: (m['present'] ?? 0) as int,
        absent: (m['absent'] ?? 0) as int,
        late: (m['late'] ?? 0) as int,
        excused: (m['excused'] ?? 0) as int,
        total: (m['total'] ?? 0) as int,
        rate: ((m['rate'] ?? 0) as num).toDouble(),
        isRisk: (m['isRisk'] ?? false) as bool,
        bySubject: [
          for (final s in (m['bySubject'] as List? ?? []))
            SubjectRate.fromJson(s as Map<String, dynamic>),
        ],
        subjectEra: true,
      );
    }
    final sum = Map<String, dynamic>.from(payload['summary'] as Map? ?? {});
    return AttendanceSummary(
      present: (sum['present'] ?? 0) as int,
      absent: (sum['absent'] ?? 0) as int,
      late: (sum['late'] ?? 0) as int,
      excused: (sum['excused'] ?? 0) as int,
      total: (sum['total'] ?? 0) as int,
      rate: ((sum['rate'] ?? 0) as num).toDouble(),
      isRisk: (sum['isRisk'] ?? false) as bool,
      bySubject: const [],
      subjectEra: false,
    );
  }
}

// --- academic models (GET .../students/:id/academic) ---

class AcademicGrade {
  final String subject;
  final double? computedAverage;
  final double? transmutedGrade;
  final String? remarks;
  final String? lockStatus;
  const AcademicGrade({
    required this.subject,
    this.computedAverage,
    this.transmutedGrade,
    this.remarks,
    this.lockStatus,
  });
  factory AcademicGrade.fromJson(Map<String, dynamic> j) => AcademicGrade(
    subject: j['subject']?.toString() ?? '',
    computedAverage: (j['computedAverage'] as num?)?.toDouble(),
    transmutedGrade: (j['transmutedGrade'] as num?)?.toDouble(),
    remarks: j['remarks']?.toString(),
    lockStatus: j['lockStatus']?.toString(),
  );
}

class AcademicSummary {
  final int subjects;
  final int graded;
  final int passed;
  final int failed;
  final double? average;
  const AcademicSummary({
    required this.subjects,
    required this.graded,
    required this.passed,
    required this.failed,
    this.average,
  });
  factory AcademicSummary.fromJson(Map<String, dynamic> j) => AcademicSummary(
    subjects: (j['subjects'] ?? 0) as int,
    graded: (j['graded'] ?? 0) as int,
    passed: (j['passed'] ?? 0) as int,
    failed: (j['failed'] ?? 0) as int,
    average: (j['average'] as num?)?.toDouble(),
  );
}

// --- anecdotal models (GET .../students/:id/anecdotal, profile-only) ---

class AnecdotalFollowup {
  final String by;
  final String date;
  final String notes;
  const AnecdotalFollowup({
    required this.by,
    required this.date,
    required this.notes,
  });
  factory AnecdotalFollowup.fromJson(Map<String, dynamic> j) =>
      AnecdotalFollowup(
        by: j['by']?.toString() ?? '',
        date: j['date']?.toString() ?? '',
        notes: j['notes']?.toString() ?? '',
      );
}

class AnecdotalRecord {
  final String id;
  final String observationDatetime;
  final String category;
  final String confidentialityLevel;
  final bool mine;
  final String? location;
  final String? incident;
  final String? notes;
  final String? classPerformance;
  final String? attendanceSummary;
  final List<AnecdotalFollowup> followups;
  final int followupCount;
  const AnecdotalRecord({
    required this.id,
    required this.observationDatetime,
    required this.category,
    required this.confidentialityLevel,
    required this.mine,
    this.location,
    this.incident,
    this.notes,
    this.classPerformance,
    this.attendanceSummary,
    required this.followups,
    required this.followupCount,
  });
  factory AnecdotalRecord.fromJson(Map<String, dynamic> j) => AnecdotalRecord(
    id: j['id']?.toString() ?? '',
    observationDatetime: j['observationDatetime']?.toString() ?? '',
    category: j['category']?.toString() ?? '',
    confidentialityLevel: j['confidentialityLevel']?.toString() ?? '',
    mine: (j['mine'] ?? false) as bool,
    location: j['location']?.toString(),
    incident: j['incident']?.toString(),
    notes: j['notes']?.toString(),
    classPerformance: j['classPerformance']?.toString(),
    attendanceSummary: j['attendanceSummary']?.toString(),
    followups: [
      for (final f in (j['followups'] as List? ?? []))
        AnecdotalFollowup.fromJson(f as Map<String, dynamic>),
    ],
    followupCount:
        (j['followupCount'] ??
                (j['followups'] is List ? (j['followups'] as List).length : 0))
            as int,
  );
}

class _DetailData {
  final Map<String, dynamic> detail;
  final Map<String, dynamic>? attendance;
  final Map<String, dynamic>? academic;
  final List<AnecdotalRecord> anecdotal;
  final List<Map<String, dynamic>> admCases;
  const _DetailData({
    required this.detail,
    required this.attendance,
    required this.academic,
    required this.anecdotal,
    required this.admCases,
  });
}

String _humanize(String? v) {
  if (v == null || v.isEmpty) return 'Not encoded';
  return v
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

class StudentDetailPage extends ConsumerStatefulWidget {
  final AdvisoryStudent student;
  const StudentDetailPage({super.key, required this.student});

  @override
  ConsumerState<StudentDetailPage> createState() => _StudentDetailState();
}

class _StudentDetailState extends ConsumerState<StudentDetailPage> {
  Future<_DetailData> _fetch(ApiClient api) async {
    final id = Uri.encodeComponent(widget.student.studentId);
    final isRoster = widget.student.studentId.startsWith('roster:');
    final detailFuture = api.dio
        .get('/api/teacher/advisory/students/$id')
        .then((r) => Map<String, dynamic>.from(r.data as Map))
        .catchError(
          (Object e) => {
            'name': widget.student.name,
            'lrn': widget.student.lrn,
            'riskLevel': widget.student.riskLevel,
          },
        );
    final attendanceFuture = api.dio
        .get('/api/teacher/advisory/students/$id/attendance')
        .then((r) => Map<String, dynamic>.from(r.data as Map))
        .catchError((Object _) => <String, dynamic>{});
    final academicFuture = api.dio
        .get('/api/teacher/advisory/students/$id/academic')
        .then((r) => Map<String, dynamic>.from(r.data as Map))
        .catchError((Object _) => <String, dynamic>{});
    // Anecdotal endpoint is profile-only; roster enlistments resolve to empty.
    final anecdotalFuture = isRoster
        ? Future.value(<AnecdotalRecord>[])
        : api.dio
              .get('/api/teacher/advisory/students/$id/anecdotal')
              .then((r) {
                final data = Map<String, dynamic>.from(r.data as Map);
                return [
                  for (final rec in (data['records'] as List? ?? []))
                    AnecdotalRecord.fromJson(rec as Map<String, dynamic>),
                ];
              })
              .catchError((Object _) => <AnecdotalRecord>[]);
    final admFuture = api.dio
        .get('/api/adm/my-cases')
        .then((r) {
          final data = r.data;
          final List list = data is List
              ? data
              : (data is Map && data['cases'] is List
                    ? data['cases'] as List
                    : []);
          final sid = widget.student.studentId;
          final lrn = widget.student.lrn;
          return [
            for (final c in list)
              if (c is Map &&
                  (c['studentId']?.toString() == sid ||
                      c['lrn']?.toString() == lrn))
                Map<String, dynamic>.from(c),
          ];
        })
        .catchError((Object _) => <Map<String, dynamic>>[]);
    final results = await Future.wait([
      detailFuture,
      attendanceFuture,
      academicFuture,
      anecdotalFuture,
      admFuture,
    ]);
    final attendanceRaw = results[1] as Map<String, dynamic>;
    final academicRaw = results[2] as Map<String, dynamic>;
    return _DetailData(
      detail: results[0] as Map<String, dynamic>,
      attendance: attendanceRaw.isEmpty || attendanceRaw['summary'] == null
          ? null
          : attendanceRaw,
      academic: academicRaw.isEmpty || academicRaw['grades'] == null
          ? null
          : academicRaw,
      anecdotal: (results[3] as List).cast<AnecdotalRecord>(),
      admCases: (results[4] as List).cast<Map<String, dynamic>>(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(apiClientProvider);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Student details')),
      body: FutureBuilder(
        future: _fetch(api),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: ZSkeletonList(count: 4),
            );
          }
          final data = snap.data!;
          final d = data.detail;
          final referrals = (d['referrals'] as List? ?? []);
          final attendance = data.attendance == null
              ? null
              : AttendanceSummary.fromAttendancePayload(data.attendance!);
          final academicRaw = data.academic;
          final academicGrades = academicRaw == null
              ? null
              : [
                  for (final g in (academicRaw['grades'] as List? ?? []))
                    AcademicGrade.fromJson(g as Map<String, dynamic>),
                ];
          final academicSummary =
              academicRaw == null || academicRaw['summary'] == null
              ? null
              : AcademicSummary.fromJson(
                  Map<String, dynamic>.from(academicRaw['summary'] as Map),
                );
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 900),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  ZCard(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.person_outline,
                          color: theme.colorScheme.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                (d['name'] ?? widget.student.name).toString(),
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  _DetailPill(
                                    label:
                                        'LRN ${d['lrn'] ?? widget.student.lrn}',
                                  ),
                                  RiskBadge(
                                    level:
                                        (d['riskLevel'] ??
                                                widget.student.riskLevel)
                                            .toString(),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const _SectionHeading(
                    title: 'Academic',
                    icon: Icons.menu_book_outlined,
                  ),
                  if (academicGrades == null)
                    const ZEmpty(
                      icon: Icons.grade_outlined,
                      title: 'No grades encoded this term',
                      subtitle: 'Scores appear once the subject teacher encodes them.',
                    )
                  else
                    _AcademicCard(
                      grades: academicGrades,
                      summary: academicSummary,
                    ),
                  const _SectionHeading(
                    title: 'Attendance',
                    icon: Icons.fact_check_outlined,
                  ),
                  if (attendance == null)
                    const ZEmpty(
                      icon: Icons.fact_check_outlined,
                      title: 'No attendance yet',
                      subtitle: 'Records appear once takes are submitted for this term.',
                    )
                  else
                    _AttendanceCard(summary: attendance),
                  _SectionHeading(
                    title: 'Anecdotal (${data.anecdotal.length})',
                    icon: Icons.note_outlined,
                  ),
                  if (data.anecdotal.isEmpty)
                    const ZEmpty(
                      icon: Icons.note_outlined,
                      title: 'No anecdotal records this term',
                      subtitle: 'File one in Chat with Bama.',
                    )
                  else
                    for (final rec in data.anecdotal)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _AnecdotalCard(record: rec),
                      ),
                  if (data.admCases.isNotEmpty) ...[
                    _SectionHeading(
                      title: 'ADM (${data.admCases.length})',
                      icon: Icons.assignment_outlined,
                    ),
                    for (final c in data.admCases)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _AdmCard(caseData: c),
                      ),
                  ],
                  _SectionHeading(
                    title: 'Referrals (${referrals.length})',
                    icon: Icons.send_outlined,
                  ),
                  if (referrals.isEmpty)
                    const ZEmpty(
                      icon: Icons.send_outlined,
                      title: 'No referrals',
                      subtitle:
                          'File an anecdotal in Bama, then refer from there.',
                    )
                  else
                    for (final r in referrals)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: ZCard(
                          child: Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                _humanize(
                                  (r as Map)['referredToRole']?.toString(),
                                ),
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              FlagChip(
                                flag: (r['status']?.toString() ?? 'pending'),
                              ),
                            ],
                          ),
                        ),
                      ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _AcademicCard extends StatefulWidget {
  final List<AcademicGrade> grades;
  final AcademicSummary? summary;
  const _AcademicCard({required this.grades, required this.summary});

  @override
  State<_AcademicCard> createState() => _AcademicCardState();
}

class _AcademicCardState extends State<_AcademicCard> {
  bool finalVersion = true;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final grades = widget.grades;
    final summary = widget.summary;
    final failing = grades.where((g) => g.remarks == 'Failed').toList();
    final gradedAvg = summary?.average;
    return ZCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Student grades', style: theme.textTheme.titleSmall),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _DetailPill(
                label: 'Gen avg ${gradedAvg?.toStringAsFixed(1) ?? '—'}',
                color: theme.colorScheme.primary,
              ),
              _DetailPill(
                label: summary == null
                    ? '${grades.length} subjects'
                    : '${summary.graded} of ${summary.subjects} graded',
              ),
              if (summary != null) ...[
                _DetailPill(
                  label: '${summary.passed} passed',
                  color: zSuccessText(theme),
                ),
                _DetailPill(
                  label: '${summary.failed} failed',
                  color: summary.failed > 0 ? zDangerText(theme) : null,
                ),
              ],
            ],
          ),
          if (summary != null && failing.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                '${failing.length} failing — ${failing.map((g) => g.subject).join(', ')} · Needs intervention',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: zDangerText(theme),
                ),
              ),
            ),
          if (summary != null && failing.isEmpty && summary.graded > 0)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'All ${summary.graded} passed · On track',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: zSuccessText(theme),
                ),
              ),
            ),
          const SizedBox(height: 16),
          SegTabs<String>(
            values: const ['final', 'computed'],
            labels: const ['Final', 'Computed'],
            selected: finalVersion ? 'final' : 'computed',
            onChanged: (value) =>
                setState(() => finalVersion = value == 'final'),
          ),
          const SizedBox(height: 16),
          Text(
            finalVersion
                ? 'FINAL GRADE PER SUBJECT'
                : 'COMPUTED AVERAGE PER SUBJECT',
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final minWidth = 280 * MediaQuery.textScalerOf(context).scale(1);
              final columns = constraints.maxWidth >= minWidth * 2 + 12 ? 2 : 1;
              final width =
                  (constraints.maxWidth - (columns - 1) * 12) / columns;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final grade in grades)
                    SizedBox(
                      width: width,
                      child: _SubjectGradeCard(
                        grade: grade,
                        finalVersion: finalVersion,
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.icon});
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 12),
    child: Row(
      children: [
        Icon(icon, size: 18, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleSmall),
        ),
      ],
    ),
  );
}

class _DetailPill extends StatelessWidget {
  const _DetailPill({required this.label, this.color});
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = color ?? theme.colorScheme.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        border: Border.all(color: tone.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(ZTokens.radiusMd),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: tone,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class _SubjectGradeCard extends StatelessWidget {
  const _SubjectGradeCard({required this.grade, required this.finalVersion});
  final AcademicGrade grade;
  final bool finalVersion;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final failed = grade.remarks == 'Failed';
    final tone = failed ? zDangerText(theme) : theme.colorScheme.primary;
    final value = finalVersion
        ? grade.transmutedGrade?.toStringAsFixed(0)
        : grade.computedAverage?.toStringAsFixed(1);
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(ZTokens.radiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.menu_book_outlined, size: 18, color: tone),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    grade.subject,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Container(
            color: theme.colorScheme.surfaceContainerLow,
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  finalVersion ? 'Final grade' : 'Computed average',
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 6),
                Text(
                  value ?? '—',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    color: value == null
                        ? theme.colorScheme.onSurfaceVariant
                        : tone,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (grade.remarks != null)
                      _DetailPill(
                        label: grade.remarks!,
                        color: failed
                            ? zDangerText(theme)
                            : zSuccessText(theme),
                      ),
                    _DetailPill(label: _humanize(grade.lockStatus)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AttendanceCard extends StatelessWidget {
  final AttendanceSummary summary;
  const _AttendanceCard({required this.summary});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pct = (summary.rate * 100).toStringAsFixed(1);
    final sorted = [...summary.bySubject]
      ..sort((a, b) => a.rate.compareTo(b.rate));
    final weakest = sorted.isEmpty ? null : sorted.first;
    return ZCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                '$pct% present',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              if (summary.isRisk) const RiskBadge(level: 'High'),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: summary.rate.clamp(0, 1),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            summary.subjectEra
                ? '${summary.present} present across ${summary.total} subject sessions'
                : '${summary.present} present across ${summary.total} sessions (AM/PM record — no per-subject takes yet)',
            style: theme.textTheme.bodySmall?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _DetailPill(label: 'Present ${summary.present}'),
              _DetailPill(label: 'Absent ${summary.absent}'),
              _DetailPill(label: 'Late ${summary.late}'),
              _DetailPill(label: 'Excused ${summary.excused}'),
            ],
          ),
          if (weakest != null) ...[
            const SizedBox(height: 4),
            Text(
              'Weakest: ${weakest.name} at ${(weakest.rate * 100).toStringAsFixed(1)}% (${weakest.present}/${weakest.total})',
              style: theme.textTheme.bodySmall?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
          if (sorted.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Divider(height: 1),
            for (var i = 0; i < sorted.length; i++) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${sorted[i].name} (${sorted[i].code})',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${sorted[i].present}/${sorted[i].total} — ${(sorted[i].rate * 100).toStringAsFixed(1)}%',
                      style: const TextStyle(
                        fontSize: 12,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
              if (i != sorted.length - 1) const Divider(height: 1),
            ],
          ],
        ],
      ),
    );
  }
}

class _AnecdotalCard extends StatelessWidget {
  final AnecdotalRecord record;
  const _AnecdotalCard({required this.record});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = record.observationDatetime.length >= 10
        ? record.observationDatetime.substring(0, 10)
        : record.observationDatetime;
    return ZCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        dense: true,
        enabled: record.mine,
        title: Text(
          record.category.isEmpty ? 'Anecdotal' : record.category,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '$date · ${record.confidentialityLevel}',
          style: theme.textTheme.bodySmall,
        ),
        trailing: record.mine
            ? null
            : Text(
                '${record.followupCount} follow-ups',
                style: theme.textTheme.bodySmall,
              ),
        children: record.mine
            ? [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if ((record.location ?? '').isNotEmpty)
                        Text(
                          'Location: ${record.location}',
                          style: theme.textTheme.bodySmall,
                        ),
                      if ((record.incident ?? '').isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          record.incident!,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ],
                      if ((record.notes ?? '').isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Notes: ${record.notes}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                      if ((record.classPerformance ?? '').isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Class: ${record.classPerformance}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                      if ((record.attendanceSummary ?? '').isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Attendance: ${record.attendanceSummary}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                      if (record.followups.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Follow-ups (${record.followups.length})',
                          style: theme.textTheme.labelSmall,
                        ),
                        for (final f in record.followups)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              '${f.date} · ${f.by}: ${f.notes}',
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
              ]
            : [],
      ),
    );
  }
}

class _AdmCard extends StatelessWidget {
  final Map<String, dynamic> caseData;
  const _AdmCard({required this.caseData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stage = caseData['stage']?.toString() ?? '';
    final stageLabel = caseData['stageLabel']?.toString() ?? stage;
    final eligibility = caseData['eligibilityStatus']?.toString() ?? 'pending';
    final timeline = (caseData['timeline'] as List? ?? []);
    final modulesSub = caseData['modulesSubmitted']?.toString() ?? '0';
    final modulesTotal = caseData['modulesTotal']?.toString() ?? '0';
    final approved = caseData['approved'] == true;
    return ZCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        dense: true,
        leading: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: approved ? zSuccessText(theme) : const Color(0xFFF59E0B),
          ),
        ),
        title: Text(
          stageLabel.isEmpty ? 'ADM case' : stageLabel,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          'Eligibility: $eligibility · Modules $modulesSub/$modulesTotal',
          style: theme.textTheme.bodySmall,
        ),
        children: [
          if (timeline.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Text(
                'No timeline entries yet.',
                style: TextStyle(fontSize: 13),
              ),
            )
          else
            for (final t in timeline)
              ListTile(
                dense: true,
                title: Text(
                  (t as Map)['label']?.toString() ?? '',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  '${(t['date'] ?? t['at'] ?? '').toString()}${(t['detail']?.toString().isNotEmpty ?? false) ? ' · ${t['detail']}' : ''}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
        ],
      ),
    );
  }
}
