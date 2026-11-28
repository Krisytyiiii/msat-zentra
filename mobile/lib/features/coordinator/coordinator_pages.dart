import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/shell.dart' show staffNavigationHiddenProvider;
import '../../design/status_palette.dart';
import '../../shared/floating_add.dart';
import '../../shared/widgets.dart';
import '../adviser/adm_case_card.dart';
import '../home/overview_components.dart';
import 'coordinator_data.dart';
import 'coordinator_case_sheet.dart';
import 'coordinator_devices.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';
import '../../design/desk_theme.dart';

class CoordinatorOverviewPage extends ConsumerStatefulWidget {
  const CoordinatorOverviewPage({super.key});
  @override
  ConsumerState<CoordinatorOverviewPage> createState() => _OverviewState();
}

class _OverviewState extends ConsumerState<CoordinatorOverviewPage>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorOverviewPage> {
  static const _meetingPreview = (
    desk: 'referrals',
    page: 1,
    q: '',
    filter: '',
  );
  @override
  Future<void> reload() async {
    await Future.wait([
      ref
          .refresh(coordinatorProfileProvider.future)
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ref
          .refresh(coordinatorDashboardProvider.future)
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ref
          .refresh(coordinatorListProvider(_meetingPreview).future)
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
      ref
          .refresh(coordinatorScopeProvider.future)
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
    ]);
  }

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) await refresh();
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context));
    final profile = ref.watch(coordinatorProfileProvider);
    final scope = ref.watch(coordinatorScopeProvider);
    final dashboard = ref.watch(coordinatorDashboardProvider);
    final meetings = ref.watch(coordinatorListProvider(_meetingPreview));
    // Login hand-off: before the first profile/dashboard data lands, show the
    // same full shimmering overview skeleton the adviser workspace uses.
    final initialLoading =
        !profile.hasValue &&
        !dashboard.hasValue &&
        !profile.hasError &&
        !dashboard.hasError;
    return Theme(
      data: theme,
      child: initialLoading
          ? ScreenSkeleton(
              layout: SkeletonLayout.overview,
              label: 'Loading overview',
            )
          : Builder(
              builder: (context) => RefreshIndicator(
                onRefresh: refresh,
                child: SingleChildScrollView(
                  physics: AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                    16,
                    16,
                    16,
                    112 + MediaQuery.paddingOf(context).bottom,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: 760),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _welcome(context, profile, scope),
                          SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.bell,
                            title: 'Needs attention',
                            count: _attentionCount(dashboard.asData?.value),
                            child: dashboard.when(
                              loading: () => ZSkeletonRow(),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorDashboardProvider,
                                ),
                              ),
                              data: _attention,
                            ),
                          ),
                          SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.clock,
                            title: 'Up next',
                            action: 'View cases',
                            onAction: () => _open('/coordinator/referrals'),
                            child: meetings.when(
                              loading: () => ZSkeletonRow(),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorListProvider(_meetingPreview),
                                ),
                              ),
                              data: (page) => _upNext(context, page),
                            ),
                          ),
                          SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.activity,
                            title: 'At a glance',
                            child: dashboard.when(
                              loading: () => ScreenSkeleton(
                                layout: SkeletonLayout.summary,
                                section: true,
                              ),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorDashboardProvider,
                                ),
                              ),
                              data: _stats,
                            ),
                          ),
                          SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.chartPie,
                            title: 'Case mix',
                            child: dashboard.when(
                              loading: () => ScreenSkeleton(
                                layout: SkeletonLayout.chart,
                                section: true,
                              ),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorDashboardProvider,
                                ),
                              ),
                              data: (data) => _CaseMix(
                                stages: admMaps(data['stageBreakdown']),
                              ),
                            ),
                          ),
                          SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.chartColumn,
                            title: 'Cases by section',
                            child: dashboard.when(
                              loading: () => ScreenSkeleton(
                                layout: SkeletonLayout.chart,
                                section: true,
                              ),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorDashboardProvider,
                                ),
                              ),
                              data: (data) => _SectionMix(
                                sections: admMaps(data['sectionBreakdown']),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _welcome(
    BuildContext context,
    AsyncValue<AdmJson> profile,
    AsyncValue<CoordinatorScope> scope,
  ) {
    final theme = Theme.of(context);
    final schoolYear = scope.asData?.value.schoolYearName ?? '';
    final termNumber = scope.asData?.value.termNumber;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        profile.when(
          data: (p) {
            final value = admText(p['fullName']).trim();
            return Text(
              value.isEmpty ? 'Welcome back.' : 'Welcome back,\n$value.',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontSize: 21,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
              ),
            );
          },
          loading: () => SkeletonBox(height: 48),
          error: (error, _) => OverviewInlineError(
            error: error,
            retry: () => ref.invalidate(coordinatorProfileProvider),
          ),
        ),
        SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (schoolYear.isNotEmpty)
              ZScopePill(
                text: schoolYear,
                kind: ScopePillKind.schoolYear,
                compact: true,
              ),
            if (termNumber != null)
              ZScopePill(
                text: 'Term $termNumber',
                kind: ScopePillKind.term,
                compact: true,
              ),
          ],
        ),
      ],
    );
  }

  int? _attentionCount(AdmJson? data) {
    if (data == null) return null;
    final kpis = admMap(data['kpis']);
    return admInt(kpis['pendingSignature']) + admInt(data['needsRevision']);
  }

  Widget _attention(AdmJson data) {
    final kpis = admMap(data['kpis']);
    final pending = admInt(kpis['pendingSignature']);
    final revisions = admInt(data['needsRevision']);
    if (pending == 0 && revisions == 0) {
      return OverviewAllClear(
        text: 'No signatures or revisions waiting from these checks.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (pending > 0)
          OverviewAttentionRow(
            icon: LucideIcons.signature,
            title:
                '$pending case${pending == 1 ? '' : 's'} awaiting principal signature',
            subtitle: 'Review and endorse signed certifications.',
            onTap: () => _open('/coordinator/files'),
          ),
        if (pending > 0 && revisions > 0) SizedBox(height: 8),
        if (revisions > 0)
          OverviewAttentionRow(
            icon: LucideIcons.pencilLine,
            title:
                '$revisions case${revisions == 1 ? '' : 's'} needing revision',
            subtitle: 'Returned by the principal for more detail.',
            onTap: () => _open('/coordinator/files'),
          ),
      ],
    );
  }

  Widget _upNext(BuildContext context, AdmPage<AdmCaseRow> page) {
    // Dashboard rows have no meetings. The queue exposes each case's latest
    // slot, so label this bounded preview honestly.
    final upcoming =
        page.rows
            .where(
              (r) =>
                  r.meeting?.datetime != null &&
                  !r.meeting!.attended &&
                  r.meeting!.datetime!.isAfter(DateTime.now()),
            )
            .toList()
          ..sort(
            (a, b) => a.meeting!.datetime!.compareTo(b.meeting!.datetime!),
          );
    if (upcoming.isEmpty) {
      return ZEmpty(
        icon: LucideIcons.calendarDays,
        title: 'No upcoming meetings',
        subtitle: 'No upcoming meetings in the first 15 cases. Check ADM Cases for other meetings.',
      );
    }
    final next = upcoming.first;
    final theme = Theme.of(context);
    final accent = zLift(context, const Color(0xFFB45309));
    final start = admSchoolTime(next.meeting!.datetime!);
    final now = admPhilippineNow();
    final today =
        start.year == now.year &&
        start.month == now.month &&
        start.day == now.day;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          constraints: const BoxConstraints(minWidth: 60, minHeight: 64),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xfffff8eb),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xfffde0b4)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                DateFormat('h:mm').format(start),
                style: theme.textTheme.titleSmall?.copyWith(
                  color: accent,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              Text(
                DateFormat('a').format(start),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: accent,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                next.student,
                style: theme.textTheme.titleSmall?.copyWith(
                  color: zInk(context),
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                next.section.isNotEmpty ? next.section : next.stage,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  _MeetingMeta(
                    icon: LucideIcons.calendar,
                    text: today
                        ? 'Today'
                        : DateFormat('EEE, MMM d').format(start),
                  ),
                  _MeetingMeta(
                    icon: LucideIcons.clock,
                    text: DateFormat('h:mm a').format(start),
                  ),
                  if (next.meeting!.venue.isNotEmpty)
                    _MeetingMeta(
                      icon: LucideIcons.mapPin,
                      text: next.meeting!.venue,
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _stats(AdmJson data) {
    final kpis = admMap(data['kpis']);
    final devices = admMap(data['deviceSummary']);
    return OverviewStatsGrid(
      columns: 2,
      items: [
        OverviewStatItem(
          label: 'ADM profiles',
          value: admInt(kpis['active']),
          path: '/coordinator/referrals',
        ),
        OverviewStatItem(
          label: 'Total referred',
          value: admInt(data['totalReferred']),
          path: '/coordinator/referrals',
        ),
        OverviewStatItem(
          label: 'Principal-signed',
          value: admInt(kpis['signed']),
          path: '/coordinator/files',
        ),
        OverviewStatItem(
          label: 'Devices issued',
          value: admInt(devices['issued']),
          path: '/coordinator/devices',
        ),
      ],
      onOpen: _open,
    );
  }
}

class _MeetingMeta extends StatelessWidget {
  const _MeetingMeta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 16, color: zMutedInk(context)),
      const SizedBox(width: 5),
      Flexible(
        child: Text(
          text,
          style: TextStyle(fontSize: 12, color: zMutedInk(context)),
        ),
      ),
    ],
  );
}

const _stageTones = [
  StatusTone.blue,
  StatusTone.violet,
  StatusTone.amber,
  StatusTone.green,
  StatusTone.teal,
  StatusTone.indigo,
  StatusTone.rose,
  StatusTone.sky,
];

class _CaseMix extends StatelessWidget {
  const _CaseMix({required this.stages});
  final List<AdmJson> stages;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = [
      for (final row in stages)
        if (admInt(row['count']) > 0)
          (
            label: admText(row['short']).isEmpty
                ? admText(row['stage'])
                : admText(row['short']),
            count: admInt(row['count']),
          ),
    ];
    final total = rows.fold(0, (sum, row) => sum + row.count);
    if (total == 0) {
      return const ZEmpty(
        compact: true,
        icon: LucideIcons.chartPie,
        title: 'No ADM cases yet',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ADM cases by pipeline stage.', style: theme.textTheme.bodySmall),
        const SizedBox(height: 16),
        Semantics(
          label: rows.map((r) => '${r.label}: ${r.count}').join(', '),
          child: ExcludeSemantics(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: SizedBox(
                height: 8,
                child: Row(
                  children: [
                    for (var i = 0; i < rows.length; i++)
                      Expanded(
                        flex: rows[i].count,
                        child: ColoredBox(
                          color: statusColors(
                            _stageTones[i % _stageTones.length],
                            theme,
                          ).foreground,
                          child: const SizedBox.expand(),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < rows.length; i++)
              Padding(
                padding: EdgeInsets.only(bottom: i == rows.length - 1 ? 0 : 6),
                child: ZStatusPill(
                  text: '${rows[i].label} ${rows[i].count}',
                  tone: _stageTones[i % _stageTones.length],
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _SectionMix extends StatelessWidget {
  const _SectionMix({required this.sections});
  final List<AdmJson> sections;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = [
      for (final row in sections)
        if (admInt(row['count']) > 0)
          (
            label: admText(row['section']),
            gradeLevel: admText(row['gradeLevel']),
            count: admInt(row['count']),
          ),
    ]..sort((a, b) => b.count.compareTo(a.count));
    if (rows.isEmpty) {
      return const ZEmpty(
        compact: true,
        icon: LucideIcons.chartColumn,
        title: 'No section cases yet',
      );
    }
    final top = rows.take(3).toList();
    final maximum = top.fold(
      1,
      (max, row) => row.count > max ? row.count : max,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Top 3 sections by ADM cases.', style: theme.textTheme.bodySmall),
        const SizedBox(height: 12),
        for (var i = 0; i < top.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  top[i].gradeLevel.isEmpty
                      ? top[i].label
                      : '${top[i].gradeLevel} · ${top[i].label}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 13),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${top[i].count}',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: top[i].count / maximum,
              minHeight: 8,
              backgroundColor: theme.colorScheme.surfaceContainerLow,
              color: theme.colorScheme.primary,
            ),
          ),
        ],
      ],
    );
  }
}

class CoordinatorListPage extends ConsumerStatefulWidget {
  const CoordinatorListPage({super.key, required this.desk});
  final String desk; // referrals | enrolled | certifications | devices
  @override
  ConsumerState<CoordinatorListPage> createState() => _ListState();
}

class _ListState extends ConsumerState<CoordinatorListPage>
    with WidgetsBindingObserver, CoordinatorRefresh<CoordinatorListPage> {
  late String _filter = widget.desk == 'enrolled'
      ? 'enrollment_monitoring'
      : '';
  String _query = '', _rawQuery = '';
  bool _descending = false;
  bool _sheetOpen = false;
  Timer? _debounce;
  AdmListQuery get query =>
      (desk: widget.desk, page: 1, q: _query, filter: _filter);
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final value = ScreenSearchScope.maybeOf(context)?.query ?? '';
    if (value != _rawQuery) {
      _rawQuery = value;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 300), () {
        if (mounted) {
          setState(() => _query = value);
        }
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Future<void> reload() async {
    if (widget.desk == 'devices') {
      await ref.refresh(coordinatorDevicesProvider(query).future).then((_) {});
    } else {
      await ref.refresh(coordinatorListProvider(query).future).then((_) {});
    }
  }

  Map<String, String> get filters => switch (widget.desk) {
    'devices' => {
      '': 'All devices',
      'issued': 'Issued',
      'returned': 'Returned',
    },
    'enrolled' => {
      'enrollment_monitoring': 'Enrollment monitoring',
      'completion': 'Completed',
    },
    'certifications' => {
      '': 'All files',
      'certification': 'Preparation / revision',
      'principal_approval': 'Awaiting principal',
      'approved': 'Approved',
    },
    _ => {'': 'All stages', ...admStages},
  };
  Future<void> _open(AdmCaseRow row) async {
    if (widget.desk == 'referrals') {
      if (_sheetOpen) return;
      _sheetOpen = true;
      var book = false;
      final navigation = ref.read(staffNavigationHiddenProvider.notifier);
      navigation.state = true;
      try {
        await showCoordinatorCaseSheet(
          context,
          row,
          onBook: () => book = true,
        );
      } finally {
        navigation.state = false;
        _sheetOpen = false;
      }
      if (!mounted) return;
      if (book) {
        await _bookMeeting(row);
      } else {
        await refresh();
      }
      return;
    }
    await _openCase(row);
  }

  /// Dedicated routed meeting screen inside the persistent coordinator shell
  /// (same chrome as the adviser Grade Record), not a pushed overlay.
  Future<void> _bookMeeting(AdmCaseRow row) async {
    final meetingId = row.meeting?.id;
    final query = meetingId == null || meetingId.isEmpty
        ? ''
        : '?meetingId=${Uri.encodeComponent(meetingId)}';
    await context.push(
      '/coordinator/referrals/${Uri.encodeComponent(row.id)}/meeting$query',
    );
    if (mounted) await refresh();
  }

  Future<void> _openCase(AdmCaseRow row) async {
    final path = switch (widget.desk) {
      'enrolled' => 'enrolled',
      'certifications' => 'files',
      _ => 'referrals',
    };
    await context.push('/coordinator/$path/${Uri.encodeComponent(row.id)}');
    if (mounted) await refresh();
  }

  String get _title => switch (widget.desk) {
    'enrolled' => 'Enrolled',
    'certifications' => 'Files',
    'devices' => 'Devices',
    _ => 'ADM Cases',
  };

  String get _description => switch (widget.desk) {
    'enrolled' =>
      'Principal-approved learners in enrollment monitoring and completion.',
    'certifications' => 'Recommendations, evidence and case history awaiting the principal signature.',
    'devices' => 'Issued and returned devices across ADM cases.',
    _ => 'Monitor ADM cases across the school year.',
  };

  IconData get _icon => switch (widget.desk) {
    'enrolled' => Icons.school_outlined,
    'certifications' => Icons.folder_open_outlined,
    'devices' => Icons.devices_outlined,
    _ => Icons.folder_shared_outlined,
  };

  String get _filterLabel => widget.desk == 'referrals' ? 'Stage' : 'Status';

  /// Web `CoordinatorReferralsFigures`: six board figures over the desk's
  /// whole-cohort stage counts, not the currently loaded rows.
  /// ADM Cases counters: the desk's whole cohort, not the stage ledger.
  ///  - Total        — every case on the board (closed ones still listed)
  ///  - Needs review — filed/consultation cases waiting on the coordinator
  ///  - Booked       — parent meetings scheduled but not yet attended
  List<(String, int)> _caseCounts(List<AdmCaseRow> rows) {
    var needsReview = 0, booked = 0;
    for (final row in rows) {
      if (row.stage == 'anecdotal' || row.status.key == 'need_review') {
        needsReview += 1;
      }
      final meeting = row.meeting;
      if (meeting != null && !meeting.attended) booked += 1;
    }
    return [
      ('Total', rows.length),
      ('Needs review', needsReview),
      ('Booked', booked),
    ];
  }

  List<(String, int)> _counterValues(AdmJson dashboard) {
    final kpis = admMap(dashboard['kpis']);
    final devices = admMap(dashboard['deviceSummary']);
    return switch (widget.desk) {
      'certifications' => [
        ('Approved', admInt(kpis['signed'])),
        ('Awaiting', admInt(kpis['pendingSignature'])),
        ('Needs revision', admInt(dashboard['needsRevision'])),
      ],
      'devices' => [
        ('Issued', admInt(devices['issued'])),
        ('Returned', admInt(devices['returned'])),
        ('Total', admInt(devices['issued']) + admInt(devices['returned'])),
      ],
      _ => [
        ('Active', admInt(kpis['active'])),
        ('Signed', admInt(kpis['signed'])),
        ('Revision', admInt(dashboard['needsRevision'])),
      ],
    };
  }

  /// Enrolled monitoring lanes, derived from the loaded cohort exactly like
  /// web: no released modules → Not released, all submitted (or completed) →
  /// Complete, otherwise In progress.
  List<(String, int)> _enrolledCounts(List<AdmCaseRow> rows) {
    var inProgress = 0, complete = 0, notReleased = 0;
    for (final row in rows) {
      if (row.stage == 'completion') {
        complete += 1;
        continue;
      }
      final total = row.modulesTotal;
      if (total <= 0) {
        notReleased += 1;
      } else if (row.modulesSubmitted >= total) {
        complete += 1;
      } else {
        inProgress += 1;
      }
    }
    return [
      ('In progress', inProgress),
      ('Complete', complete),
      ('Not released', notReleased),
    ];
  }

  /// Files (certifications) lanes, derived from the same merged cohort the
  /// desk lists — and classified with the exact rule the card pill uses — so
  /// the strip always adds up to the visible cards. Preparation/revision also
  /// holds returned cases (their stage went back to certification).
  List<(String, int)> _certificationCounts(List<AdmCaseRow> rows) {
    var prepared = 0, awaiting = 0, approved = 0;
    for (final row in rows) {
      switch (_certificationStatus(row).$1) {
        case 'Approved':
          approved += 1;
        case 'Awaiting principal':
          awaiting += 1;
        default:
          prepared += 1;
      }
    }
    return [
      ('Prepared', prepared),
      ('Awaiting', awaiting),
      ('Approved', approved),
    ];
  }

  Map<String, dynamic> _caseJson(AdmCaseRow row) => {
    'id': row.id,
    'studentName': row.student,
    'lrn': row.lrn,
    'stage': row.stage,
    'stageLabel': admLabel(row.stage),
    'eligibilityStatus': admLabel(row.eligibility),
    'referralStatus': row.referralStatus,
    'modulesSubmitted': row.modulesSubmitted,
    'modulesTotal': row.modulesTotal,
    'approved': row.approvedBy.isNotEmpty,
  };

  /// ADM Cases card footer: booking + meeting type on the left, grade chip on
  /// the right (the Files cards' grade capsule placement).
  Widget _caseFooter(AdmCaseRow row) {
    final meeting = row.meeting;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _cardFact(
                'Book',
                meeting == null
                    ? 'Not booked'
                    : admDate(meeting.datetime?.toIso8601String() ?? ''),
              ),
              const SizedBox(height: 4),
              _cardFact('Type', row.meetingType),
            ],
          ),
        ),
        if (row.grade.isNotEmpty) ...[
          const SizedBox(width: 8),
          ZScopePill(
            text: row.grade,
            kind: ScopePillKind.grade,
            compact: true,
          ),
        ],
      ],
    );
  }

  Widget _cardFact(String label, String value) => Text.rich(
    TextSpan(
      text: '$label: ',
      style: TextStyle(fontSize: 12, color: zMutedInk(context)),
      children: [
        TextSpan(
          text: value,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: zInk(context),
          ),
        ),
      ],
    ),
    maxLines: 2,
    overflow: TextOverflow.ellipsis,
  );

  Widget _progressFooter(AdmCaseRow row) {    final completed = row.stage == 'completion';
    final pillColor = completed
        ? zLift(context, const Color(0xFF15803D))
        : zLift(context, const Color(0xFF2563EB));
    final pillBackground = completed
        ? zWash(context, const Color(0xFFF0FDF4))
        : zWash(context, const Color(0xFFEFF6FF));
    final pillBorder = completed
        ? zWash(context, const Color(0xFFBBF7D0))
        : zWash(context, const Color(0xFFBFDBFE));
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: pillBackground,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: pillBorder),
          ),
          child: Text(
            completed ? 'Completed' : 'In progress',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: pillColor,
            ),
          ),
        ),
        const Spacer(),
        Text.rich(
          TextSpan(
            text: '${row.modulesSubmitted}/${row.modulesTotal}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: zInk(context),
            ),
            children: [
              TextSpan(
                text: ' modules',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w400,
                  color: zMutedInk(context),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _certificationFooter(AdmCaseRow row) {
    if (row.grade.isEmpty) return const SizedBox.shrink();
    return Align(
      alignment: Alignment.centerRight,
      child: ZScopePill(
        text: row.grade,
        kind: ScopePillKind.grade,
        compact: true,
      ),
    );
  }

  /// Files cards carry the certification state in the top-right corner, like
  /// the ADM Cases status badge (it used to sit in the footer).
  (String, StatusTone) _certificationStatus(AdmCaseRow row) {
    if (row.approvedBy.isNotEmpty) return ('Approved', StatusTone.green);
    if (row.stage == 'principal_approval') {
      return ('Awaiting principal', StatusTone.blue);
    }
    return ('Prepared', StatusTone.amber);
  }

  Widget _certificationStatusPill(AdmCaseRow row) {
    final (label, tone) = _certificationStatus(row);
    return ZStatusPill(text: label, tone: tone);
  }

  Future<void> _issueDevice() async {
    await context.push('/coordinator/devices/issue');
    if (mounted) await refresh();
  }

  @override
  Widget build(BuildContext context) {
    final isDevices = widget.desk == 'devices';
    final search = ScreenSearchScope.maybeOf(context);
    final scope = ref.watch(coordinatorScopeProvider).asData?.value;
    final theme = overviewScreenTheme(Theme.of(context));
    return Theme(
      data: theme,
      child: Stack(
        children: [
          ColoredBox(
            color: Theme.of(context).scaffoldBackgroundColor,
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(12, 16, 12, 120),
                    children: [
                      ZContentHeader(
                        title: _title,
                        icon: _icon,
                        description: _description,
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
                      const SizedBox(height: 16),
                      if (widget.desk == 'enrolled')
                        switch (ref.watch(coordinatorListProvider(query))) {
                          AsyncData(:final value) => AdmCaseCounters(
                            counts: _enrolledCounts(value.rows),
                          ),
                          AsyncError() => const SizedBox.shrink(),
                          _ => const SkeletonBox(height: 44),
                        }
                      else if (widget.desk == 'certifications')
                        switch (ref.watch(
                          coordinatorListProvider((
                            desk: 'certifications',
                            page: 1,
                            q: '',
                            filter: '',
                          )),
                        )) {
                          AsyncData(:final value) => AdmCaseCounters(
                            counts: _certificationCounts(value.rows),
                          ),
                          AsyncError() => const SizedBox.shrink(),
                          _ => const SkeletonBox(height: 44),
                        }
                      else if (widget.desk == 'referrals')
                        switch (ref.watch(
                          coordinatorListProvider((
                            desk: 'referrals',
                            page: 1,
                            q: '',
                            filter: '',
                          )),
                        )) {
                          AsyncData(:final value) => AdmCaseCounters(
                            counts: _caseCounts(value.rows),
                          ),
                          AsyncError() => const SizedBox.shrink(),
                          _ => const SkeletonBox(height: 44),
                        }
                      else if (widget.desk == 'devices')
                        switch (ref.watch(coordinatorDevicesProvider(query))) {
                          AsyncData(:final value) => AdmCaseCounters(
                            counts: [
                              ('Issued', value.issued),
                              ('Returned', value.returned),
                              ('Total', value.issued + value.returned),
                            ],
                          ),
                          AsyncError() => const SizedBox.shrink(),
                          _ => const SkeletonBox(height: 44),
                        }
                      else
                        ref
                            .watch(coordinatorDashboardProvider)
                            .when(
                              loading: () => const SkeletonBox(height: 44),
                              error: (_, _) => const SizedBox.shrink(),
                              data: (data) =>
                                  AdmCaseCounters(counts: _counterValues(data)),
                            ),
                      const SizedBox(height: 14),
                      if (search == null) ...[
                        ZSearchField(
                          hint: 'Filter by name or LRN',
                          onChanged: (v) => setState(() => _query = v),
                        ),
                        const SizedBox(height: 12),
                      ],
                      Text(
                        'FILTER ADM RECORDS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                          color: zMutedInk(context),
                        ),
                      ),
                      Row(
                        children: [
                          AdmCaseFilterPill(
                            label: _filterLabel,
                            value: _filter,
                            options: filters,
                            update: (v) => setState(() => _filter = v),
                            primary: widget.desk == 'referrals',
                            fitContent: true,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      if (isDevices)
                        AdmAsync(
                          value: ref.watch(coordinatorDevicesProvider(query)),
                          retry: refresh,
                          builder: (data) {
                            final filtered =
                                _query.trim().isNotEmpty || _filter.isNotEmpty;
                            final needs = ref
                                    .watch(
                                      coordinatorListProvider((
                                        desk: 'deviceCandidates',
                                        page: 1,
                                        q: '',
                                        filter: '',
                                      )),
                                    )
                                    .asData
                                    ?.value
                                    .rows
                                    .where(
                                      (r) =>
                                          r.devicesIssued == 0 &&
                                          r.approvedBy.isNotEmpty,
                                    )
                                    .length ??
                                0;
                            final needsText = needs == 1
                                ? '1 principal-approved case still needs a device.'
                                : '$needs principal-approved cases still need a device.';
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _recordCount(data.total),
                                if (data.rows.isEmpty)
                                  ZEmpty(
                                    icon: Icons.devices_outlined,
                                    title: filtered
                                        ? 'No matching devices.'
                                        : 'No devices issued yet',
                                    subtitle: filtered
                                        ? null
                                        : needs > 0
                                        ? needsText
                                        : 'Devices you issue to principal-approved cases will appear here.',
                                    actionLabel: !filtered && needs > 0
                                        ? 'Issue device'
                                        : null,
                                    onAction: !filtered && needs > 0
                                        ? _issueDevice
                                        : null,
                                  )
                                else ...[
                                  if (needs > 0)
                                    Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 8,
                                      ),
                                      child: _NeedsDeviceNote(text: needsText),
                                    ),
                                  for (final row in _sortedDevices(data.rows))
                                    Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 8,
                                      ),
                                      child: CoordinatorDeviceCard(
                                        key: ValueKey(row.id),
                                        device: row,
                                      ),
                                    ),
                                ],
                              ],
                            );
                          },
                        )
                      else
                        AdmAsync(
                          value: ref.watch(coordinatorListProvider(query)),
                          retry: refresh,
                          builder: (data) {
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _recordCount(data.total),
                                if (data.rows.isEmpty)
                                  ZEmpty(
                                    icon: _icon,
                                    title: switch (widget.desk) {
                                      'enrolled' =>
                                        'No enrolled learners match',
                                      'certifications' =>
                                        'No certification files match',
                                      _ => 'No matching ADM records',
                                    },
                                    subtitle: switch (widget.desk) {
                                      'enrolled' => 'ADM learners under enrollment monitoring and completion appear here.',
                                      'certifications' => 'Certification files awaiting signature and returned cases appear here.',
                                      _ => 'ADM cases for this school year appear here.',
                                    },
                                  ),
                                for (final row in _sortedCases(data.rows))
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: AdmCaseCard(
                                      key: ValueKey(row.id),
                                      caseData: _caseJson(row),
                                      showStatusPill:
                                          widget.desk == 'referrals' ||
                                          widget.desk == 'certifications',
                                      topRight: switch (widget.desk) {
                                        'referrals' => ZStatusPill(
                                          text: row.status.label,
                                          tone: admCaseStatusTone(
                                            row.status.key,
                                          ),
                                        ),
                                        'certifications' =>
                                          _certificationStatusPill(row),
                                        _ => null,
                                      },
                                      footer: switch (widget.desk) {
                                        'enrolled' => _progressFooter(row),
                                        'certifications' =>
                                          _certificationFooter(row),
                                        'referrals' => _caseFooter(row),
                                        _ => null,
                                      },
                                      onTap: () => _open(row),
                                    ),
                                  ),
                              ],
                            );
                          },
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (isDevices)
            Positioned(
              right: 16,
              bottom: 0,
              child: FloatingAdd(
                child: FloatingActionButton(
                  key: const ValueKey('coordinator-issue-device'),
                  heroTag: 'coordinator-issue-device',
                  tooltip: 'Issue device',
                  onPressed: _issueDevice,
                  child: const Icon(LucideIcons.plus),
                ),
              ),
            ),
        ],
      ),
    );
  }

  List<AdmCaseRow> _sortedCases(List<AdmCaseRow> rows) {
    final list = [...rows];
    list.sort((a, b) {
      final order = a.student.toLowerCase().compareTo(b.student.toLowerCase());
      return _descending ? -order : order;
    });
    return list;
  }

  List<AdmDevice> _sortedDevices(List<AdmDevice> rows) {
    final list = [...rows];
    list.sort((a, b) {
      final order = a.student.toLowerCase().compareTo(b.student.toLowerCase());
      return _descending ? -order : order;
    });
    return list;
  }

  Widget _recordCount(int total) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            'Showing $total record${total == 1 ? '' : 's'}',
            style: TextStyle(fontSize: 12, color: zMutedInk(context)),
          ),
        ),
        TextButton.icon(
          onPressed: () => setState(() => _descending = !_descending),
          icon: const Icon(LucideIcons.listFilter, size: 14),
          label: Text(
            _descending ? 'Name (Z-A)' : 'Name (A-Z)',
            style: const TextStyle(fontSize: 12),
          ),
          style: TextButton.styleFrom(
            foregroundColor: zInk(context),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            visualDensity: VisualDensity.compact,
          ),
        ),
      ],
    ),
  );
}

/// Inline "cases still need a device" note above the ledger, the mobile twin
/// of the web devices callout.
class _NeedsDeviceNote extends StatelessWidget {
  const _NeedsDeviceNote({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: zWash(context, const Color(0xFFEFF6FF)),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: zWash(context, const Color(0xFFBFDBFE))),
    ),
    child: Row(
      children: [
        Icon(
          LucideIcons.tabletSmartphone,
          size: 15,
          color: zLift(context, const Color(0xFF2563EB)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 12, color: zInk(context)),
          ),
        ),
      ],
    ),
  );
}
