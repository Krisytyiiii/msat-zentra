// Student detail — web parity: risk + LRN + Academic (…/students/:id/academic)
// + Attendance (…/students/:id/attendance, subjectSummary ?? summary)
// + Anecdotal (…/students/:id/anecdotal, own-full vs metadata-only)
// + ADM (GET /api/adm/my-cases filtered by studentId|lrn, hidden if none)
// + Referrals. All fetches in parallel; per-section errors degrade locally.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/adviser_navigation.dart';
import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/tokens.dart';
import '../../shared/models.dart';
import '../../design/status_palette.dart';
import '../../shared/widgets.dart';

// Advisory learner detail palette — scoped light content under the app's own
// header, matching the advisory list's white cards.
const _ink = Color(0xFF0F172A);
const _body = Color(0xFF334155);
const _muted = Color(0xFF71809B);
const _faint = Color(0xFF94A3B8);
const _line = Color(0xFFE6ECF4);
const _soft = Color(0xFFF6F8FB);
const _blue = Color(0xFF2563EB);
const _red = Color(0xFFDC2626);
const _redSoft = Color(0xFFFFF5F5);
const _redLine = Color(0xFFFBD5D5);
const _green = Color(0xFF1F8A48);
const _greenSoft = Color(0xFFF1FBF4);
const _greenLine = Color(0xFFCFF0DA);
const _amber = Color(0xFFB45309);
const _amberSoft = Color(0xFFFFFAEF);
const _amberLine = Color(0xFFF7E5B8);

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
  late final Future<_DetailData> _future;

  @override
  void initState() {
    super.initState();
    // One request set per visit: rebuilding (grade toggle, text scale) must
    // not refetch the five endpoints.
    _future = _fetch(ref.read(apiClientProvider));
  }

  /// A deep link or notification can open this page as the first route, so
  /// there is nothing to pop; offer a way back to the advisory list instead.
  void _close() {
    final router = GoRouter.maybeOf(context);
    if (router != null && router.canPop()) {
      router.pop();
    } else if (router != null) {
      router.go('/adviser/advisory');
    } else {
      Navigator.of(context).maybePop();
    }
  }

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
    final canPop = ModalRoute.of(context)?.canPop ?? false;
    return FutureBuilder(
      future: _future,
      builder: (context, snap) {
        final data = snap.data;
        return Scaffold(
          appBar: AppBar(
            centerTitle: true,
            leadingWidth: 64,
            leading: canPop
                ? ZBackButton(
                    icon: const Icon(LucideIcons.chevronLeft),
                    tooltip: 'Back',
                    onPressed: _close,
                  )
                : ZBackButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Close',
                    onPressed: _close,
                  ),
            title: const Text('Student Profile'),
          ),
          body: AdviserBamaAccess(
            child: Theme(
              data: overviewScreenTheme(Theme.of(context)),
              child: ColoredBox(
                color: Colors.white,
                child: data == null
                    ? const Padding(
                        padding: EdgeInsets.all(16),
                        child: ZSkeletonList(count: 4),
                      )
                    : _loaded(context, data),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _loaded(BuildContext context, _DetailData data) {
    final d = data.detail;
    final term = ref.watch(termProvider);
    final risk = (d['riskLevel'] ?? widget.student.riskLevel).toString();
    final name = (d['name'] ?? widget.student.name).toString();
    final lrn = (d['lrn'] ?? widget.student.lrn).toString();
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
    // Subject codes come from the attendance payload (the academic rows only
    // carry names), so a subject keeps one short code across both sections.
    final codes = <String, String>{
      for (final s in attendance?.bySubject ?? const <SubjectRate>[])
        if (s.code.isNotEmpty) s.name.toLowerCase(): s.code,
    };
    final gradeLevel = (d['gradeLevel'] ?? '').toString();
    final gradeLabel = gradeLevel.isEmpty
        ? ''
        : 'Grade ${gradeLevel.replaceFirst(RegExp(r'^G'), '')}';
    final schoolYear = term?.schoolYearName ?? '';
    final subtitle = [
      if (gradeLabel.isNotEmpty) gradeLabel,
      if (schoolYear.isNotEmpty) 'SY $schoolYear',
    ].join(' · ');
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            _IdentityCard(
              name: name,
              lrn: lrn,
              subtitle: subtitle,
              risk: risk,
              onCopyLrn: () async {
                await Clipboard.setData(ClipboardData(text: lrn));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context)
                    .showSnackBar(const SnackBar(content: Text('LRN copied.')));
              },
            ),
            _SectionHeader(
              icon: LucideIcons.bookOpen,
              color: _blue,
              title: 'ACADEMIC OVERVIEW',
            ),
            if (academicGrades == null)
              _SectionCard(
                child: _EmptyBlock(
                  icon: LucideIcons.graduationCap,
                  title: 'No grades encoded this term',
                  subtitle:
                      'Scores appear once the subject teacher encodes them.',
                ),
              )
            else
              _AcademicCard(
                grades: academicGrades,
                summary: academicSummary,
                codes: codes,
              ),
            _SectionHeader(
              icon: LucideIcons.activity,
              color: _red,
              title: 'ATTENDANCE MONITORING',
            ),
            if (attendance == null)
              _SectionCard(
                child: _EmptyBlock(
                  icon: LucideIcons.calendarCheck,
                  title: 'No attendance yet',
                  subtitle:
                      'Records appear once takes are submitted for this term.',
                ),
              )
            else
              _AttendanceCard(summary: attendance),
            _SectionHeader(
              icon: LucideIcons.folder,
              color: _amber,
              title: 'ANECDOTAL RECORDS (${data.anecdotal.length})',
            ),
            if (data.anecdotal.isEmpty)
              _SectionCard(
                tone: _Tone.amber,
                child: _EmptyBlock(
                  icon: LucideIcons.fileText,
                  tone: _Tone.amber,
                  title: 'No anecdotal records this term',
                  subtitle: 'File observations directly or log voice notes with Bama AI assistant.',
                ),
              )
            else
              for (final rec in data.anecdotal)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _AnecdotalCard(record: rec),
                ),
            if (data.admCases.isNotEmpty) ...[
              _SectionHeader(
                icon: LucideIcons.clipboardList,
                color: _blue,
                title: 'ADM (${data.admCases.length})',
              ),
              for (final c in data.admCases)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _AdmCard(caseData: c),
                ),
            ],
            _SectionHeader(
              icon: LucideIcons.send,
              color: _blue,
              title: 'REFERRALS (${referrals.length})',
            ),
            if (referrals.isEmpty)
              _SectionCard(
                child: _EmptyBlock(
                  icon: LucideIcons.send,
                  title: 'No active referrals',
                  subtitle: 'File an anecdotal note first or escalate immediately to the Guidance Counselor.',
                ),
              )
            else
              for (final r in referrals)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _SectionCard(
                    padded: true,
                    child: Row(
                      children: [
                        const Icon(LucideIcons.send, size: 16, color: _blue),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _humanize((r as Map)['referredToRole']?.toString()),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _ink,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FlagChip(flag: (r['status']?.toString() ?? 'pending')),
                      ],
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  final first = parts.first.characters.first;
  final last = parts.length > 1 ? parts.last.characters.first : '';
  return '$first$last'.toUpperCase();
}

// --- content building blocks -------------------------------------------------

enum _Tone { neutral, red, green, amber, blue }

class _TonePill extends StatelessWidget {
  const _TonePill({required this.text, required this.tone});
  final String text;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = switch (tone) {
      _Tone.red => (_redSoft, _red, _redLine),
      _Tone.green => (_greenSoft, _green, _greenLine),
      _Tone.amber => (_amberSoft, _amber, _amberLine),
      _Tone.blue => (const Color(0xFFEFF5FF), _blue, const Color(0xFFD6E4FF)),
      _Tone.neutral => (_soft, _muted, _line),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(ZTokens.radiusPill),
        border: Border.all(color: border),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
    this.color = _blue,
  });
  final IconData icon;
  final String title;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 22, bottom: 10),
    child: Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: _body,
            ),
          ),
        ),
      ],
    ),
  );
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.child,
    this.tone = _Tone.neutral,
    this.padded = false,
  });
  final Widget child;
  final _Tone tone;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final (bg, border) = switch (tone) {
      _Tone.red => (_redSoft, _redLine),
      _Tone.amber => (_amberSoft, _amberLine),
      _Tone.green => (_greenSoft, _greenLine),
      _ => (Colors.white, _line),
    };
    return Container(
      padding: EdgeInsets.all(padded ? 12 : 0),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: child,
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    this.tone = _Tone.neutral,
  });
  final String label;
  final String value;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, border, color) = switch (tone) {
      _Tone.red => (_redSoft, _redLine, _red),
      _Tone.green => (_greenSoft, _greenLine, _green),
      _ => (_soft, _line, _ink),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: _muted,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyBlock extends StatelessWidget {
  const _EmptyBlock({
    required this.icon,
    required this.title,
    this.subtitle,
    this.tone = _Tone.neutral,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    return ZEmpty(icon: icon, title: title, subtitle: subtitle, compact: true);
  }
}

class _IdentityCard extends StatelessWidget {
  const _IdentityCard({
    required this.name,
    required this.lrn,
    required this.subtitle,
    required this.risk,
    required this.onCopyLrn,
  });
  final String name;
  final String lrn;
  final String subtitle;
  final String risk;
  final VoidCallback onCopyLrn;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _ink,
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Text(
                          _initials(name),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      Positioned(
                        left: -2,
                        top: -2,
                        child: Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _red,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: EdgeInsets.only(
                            right: risk.isNotEmpty
                                ? MediaQuery.textScalerOf(context).scale(65) +
                                      20
                                : 0,
                          ),
                          child: Text(
                            name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: _ink,
                            ),
                          ),
                        ),
                        if (subtitle.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11, color: _muted),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: _line),
              ),
              Center(
                child: Semantics(
                  button: true,
                  label: 'Copy LRN',
                  child: InkWell(
                    onTap: onCopyLrn,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: _soft,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: _line),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              'LRN $lrn',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                color: _muted,
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(LucideIcons.copy, size: 12, color: _faint),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (risk.isNotEmpty)
          Positioned(
            top: 10,
            right: 10,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(ZTokens.radiusPill),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x140F172A),
                    blurRadius: 4,
                    offset: Offset(0, 1),
                  ),
                ],
              ),
              child: _TonePill(
                text: _humanize(risk).replaceAll('_', ' '),
                tone: switch (risk.toLowerCase()) {
                  'high' => _Tone.red,
                  'moderate' => _Tone.amber,
                  'low' => _Tone.green,
                  _ => _Tone.neutral,
                },
              ),
            ),
          ),
      ],
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({
    required this.labels,
    required this.selected,
    required this.onChanged,
  });
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(3),
    decoration: BoxDecoration(
      color: _soft,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: _line),
    ),
    child: Row(
      children: [
        for (var i = 0; i < labels.length; i++)
          Expanded(
            child: Semantics(
              checked: i == selected,
              inMutuallyExclusiveGroup: true,
              child: Material(
                color: i == selected ? Colors.white : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                child: InkWell(
                  onTap: () => onChanged(i),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: i == selected ? _line : Colors.transparent,
                      ),
                    ),
                    child: Text(
                      labels[i],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: i == selected ? _ink : _muted,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _AcademicCard extends StatefulWidget {
  final List<AcademicGrade> grades;
  final AcademicSummary? summary;
  final Map<String, String> codes;
  const _AcademicCard({
    required this.grades,
    required this.summary,
    this.codes = const {},
  });

  @override
  State<_AcademicCard> createState() => _AcademicCardState();
}

class _AcademicCardState extends State<_AcademicCard> {
  bool finalVersion = true;
  bool _expanded = false;

  static const _collapsedRows = 3;

  @override
  Widget build(BuildContext context) {
    final grades = widget.grades;
    final summary = widget.summary;
    final failing = grades.where((g) => g.remarks == 'Failed').toList();
    final visible = _expanded
        ? grades
        : grades.take(_collapsedRows).toList(growable: false);
    final subjects = summary?.subjects ?? grades.length;
    final graded = summary?.graded;
    return _SectionCard(
      padded: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: _MetricTile(
                    label: 'GEN. AVG',
                    value: summary?.average == null
                        ? '—'
                        : summary!.average!.toStringAsFixed(1),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _MetricTile(
                    label: 'GRADED',
                    value: graded == null ? '—' : '$graded / $subjects',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _MetricTile(
                    label: 'PASSED',
                    value: summary == null ? '—' : '${summary.passed}',
                    tone: _Tone.green,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _MetricTile(
                    label: 'FAILED',
                    value: summary == null ? '—' : '${summary.failed}',
                    tone: summary != null && summary.failed > 0
                        ? _Tone.red
                        : _Tone.neutral,
                  ),
                ),
              ],
            ),
            if (summary != null && summary.graded > 0) ...[
              const SizedBox(height: 8),
              Text(
                failing.isNotEmpty
                    ? '${failing.length} failing — ${failing.map((g) => g.subject).join(', ')} · Needs intervention'
                    : 'All ${summary.graded} passed · On track',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: failing.isNotEmpty ? _red : _green,
                ),
              ),
            ],
            const SizedBox(height: 12),
            _Segmented(
              labels: const ['Final', 'Computed'],
              selected: finalVersion ? 0 : 1,
              onChanged: (value) => setState(() => finalVersion = value == 0),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: Text(
                    finalVersion
                        ? 'FINAL GRADE PER SUBJECT'
                        : 'COMPUTED AVERAGE PER SUBJECT',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                      color: _muted,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '$subjects Enrolled',
                  style: const TextStyle(fontSize: 10, color: _faint),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final grade in visible)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: _SubjectRow(
                  grade: grade,
                  finalVersion: finalVersion,
                  code: widget.codes[grade.subject.toLowerCase()] ?? '',
                ),
              ),
            if (grades.length > _collapsedRows)
              Center(
                child: TextButton.icon(
                  onPressed: () => setState(() => _expanded = !_expanded),
                  iconAlignment: IconAlignment.end,
                  icon: Icon(
                    _expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                    size: 14,
                  ),
                  label: Text(
                    _expanded
                        ? 'Show fewer subjects'
                        : 'Show all ${grades.length} subjects',
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: _muted,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    textStyle: const TextStyle(fontSize: 11),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({
    required this.grade,
    required this.finalVersion,
    required this.code,
  });
  final AcademicGrade grade;
  final bool finalVersion;
  final String code;

  @override
  Widget build(BuildContext context) {
    final failed = grade.remarks == 'Failed';
    final value = finalVersion
        ? grade.transmutedGrade?.toStringAsFixed(0)
        : grade.computedAverage?.toStringAsFixed(1);
    final pending = value == null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: _soft,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: pending ? _faint : (failed ? _red : _blue),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              grade.subject,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _ink,
              ),
            ),
          ),
          if (code.isNotEmpty) ...[
            const SizedBox(width: 6),
            Text(
              code,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 9, color: _faint),
            ),
          ],
          const SizedBox(width: 8),
          if (pending)
            const _TonePill(text: 'Pending', tone: _Tone.neutral)
          else
            Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: failed ? _red : _ink,
                fontFeatures: const [FontFeature.tabularFigures()],
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
    final rate = summary.rate.clamp(0.0, 1.0);
    final pct = (rate * 100).toStringAsFixed(1);
    final warning = summary.total > 0 && rate < 0.8;
    final sorted = [...summary.bySubject]
      ..sort((a, b) => a.rate.compareTo(b.rate));
    final weakest = sorted.isEmpty ? null : sorted.first;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: warning ? _redLine : _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      '$pct%',
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: _ink,
                        letterSpacing: -0.8,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (summary.isRisk)
                      const _TonePill(text: 'HIGH', tone: _Tone.red),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _RateDonut(value: rate, percent: pct, warning: warning),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            summary.subjectEra
                ? '${summary.present} present across ${summary.total} subject sessions'
                : '${summary.present} present across ${summary.total} sessions (AM/PM record — no per-subject takes yet)',
            style: const TextStyle(
              fontSize: 11.5,
              color: _muted,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'PRESENT',
                  value: '${summary.present}',
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MetricTile(
                  label: 'ABSENT',
                  value: '${summary.absent}',
                  tone: summary.absent > 0 ? _Tone.red : _Tone.neutral,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MetricTile(label: 'LATE', value: '${summary.late}'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MetricTile(
                  label: 'EXCUSED',
                  value: '${summary.excused}',
                ),
              ),
            ],
          ),
          if (weakest != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              decoration: BoxDecoration(
                color: _redSoft,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: _redLine),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 1),
                    child: Icon(LucideIcons.circleAlert, size: 13, color: _red),
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Weakest Subject Record',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: _red,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${weakest.name} at ${(weakest.rate * 100).toStringAsFixed(1)}% (${weakest.present}/${weakest.total} sessions attended)',
                          style: const TextStyle(
                            fontSize: 11,
                            height: 1.35,
                            color: _red,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < sorted.length; i++) ...[
              _SubjectAttendanceRow(s: sorted[i]),
              if (i != sorted.length - 1) const SizedBox(height: 10),
            ],
          ],
        ],
      ),
    );
  }
}

class _RateDonut extends StatelessWidget {
  const _RateDonut({
    required this.value,
    required this.percent,
    required this.warning,
  });
  final double value;
  final String percent;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final color = warning ? _red : _green;
    return SizedBox(
      width: 46,
      height: 46,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 46,
            height: 46,
            child: CircularProgressIndicator(
              value: value,
              strokeWidth: 4,
              color: color,
              backgroundColor: color.withValues(alpha: 0.14),
            ),
          ),
          Text(
            '$percent%',
            style: TextStyle(
              fontSize: 8.5,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _SubjectAttendanceRow extends StatelessWidget {
  const _SubjectAttendanceRow({required this.s});
  final SubjectRate s;

  @override
  Widget build(BuildContext context) {
    final rate = s.rate.clamp(0.0, 1.0);
    final low = rate < 0.8;
    final color = low ? _red : _green;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                s.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: _ink,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerRight,
                child: Text.rich(
                  TextSpan(
                    children: [
                      if (s.code.isNotEmpty)
                        TextSpan(
                          text: '${s.code}   ',
                          style: const TextStyle(fontSize: 9, color: _faint),
                        ),
                      TextSpan(
                        text:
                            '${s.present}/${s.total} · ${(rate * 100).toStringAsFixed(1)}%',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: low ? _red : _body,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: rate,
            minHeight: 4,
            color: color,
            backgroundColor: color.withValues(alpha: 0.14),
          ),
        ),
      ],
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
              child: ZEmpty(compact: true, icon: Icons.history,
                title: 'No timeline entries yet.'),
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
