import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../design/theme.dart' show zLightTheme;
import '../../shared/floating_add.dart';
import '../../shared/widgets.dart';
import '../adviser/adm_case_card.dart';
import '../home/overview_components.dart';
import 'coordinator_data.dart';
import 'coordinator_devices.dart';
import 'coordinator_models.dart';
import 'coordinator_widgets.dart';

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
    final theme = overviewScreenTheme(zLightTheme());
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
          ? const ScreenSkeleton(
              layout: SkeletonLayout.overview,
              label: 'Loading overview',
            )
          : Builder(
              builder: (context) => RefreshIndicator(
                onRefresh: refresh,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                    16,
                    16,
                    16,
                    112 + MediaQuery.paddingOf(context).bottom,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 760),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _welcome(context, profile, scope),
                          const SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.bell,
                            title: 'Needs attention',
                            count: _attentionCount(dashboard.asData?.value),
                            child: dashboard.when(
                              loading: () => const ZSkeletonRow(),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorDashboardProvider,
                                ),
                              ),
                              data: _attention,
                            ),
                          ),
                          const SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.clock,
                            title: 'Up next',
                            action: 'View cases',
                            onAction: () => _open('/coordinator/referrals'),
                            child: meetings.when(
                              loading: () => const ZSkeletonRow(),
                              error: (error, _) => OverviewInlineError(
                                error: error,
                                retry: () => ref.invalidate(
                                  coordinatorListProvider(_meetingPreview),
                                ),
                              ),
                              data: (page) => _upNext(context, page),
                            ),
                          ),
                          const SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.activity,
                            title: 'At a glance',
                            child: dashboard.when(
                              loading: () => const ScreenSkeleton(
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
                          const SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.chartPie,
                            title: 'Case mix',
                            child: dashboard.when(
                              loading: () => const ScreenSkeleton(
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
                          const SizedBox(height: 16),
                          OverviewBoard(
                            icon: LucideIcons.chartColumn,
                            title: 'Cases by section',
                            child: dashboard.when(
                              loading: () => const ScreenSkeleton(
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
          loading: () => const SkeletonBox(height: 48),
          error: (error, _) => OverviewInlineError(
            error: error,
            retry: () => ref.invalidate(coordinatorProfileProvider),
          ),
        ),
        const SizedBox(height: 6),
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
      return const OverviewAllClear(
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
            onTap: () => _open('/coordinator/certifications'),
          ),
        if (pending > 0 && revisions > 0) const SizedBox(height: 8),
        if (revisions > 0)
          OverviewAttentionRow(
            icon: LucideIcons.pencilLine,
            title:
                '$revisions case${revisions == 1 ? '' : 's'} needing revision',
            subtitle: 'Returned by the principal for more detail.',
            onTap: () => _open('/coordinator/certifications'),
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
      return const ZEmpty(
        icon: LucideIcons.calendarDays,
        title: 'No upcoming meetings',
        subtitle: 'No upcoming meetings in the first 15 cases. Check ADM Cases for other meetings.',
      );
    }
    final next = upcoming.first;
    final theme = Theme.of(context);
    const accent = Color(0xffb45309);
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
                  color: const Color(0xff080d23),
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
          path: '/coordinator/certifications',
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
      Icon(icon, size: 16, color: const Color(0xff52647b)),
      const SizedBox(width: 5),
      Flexible(
        child: Text(
          text,
          style: const TextStyle(fontSize: 12, color: Color(0xff52647b)),
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
          (label: admText(row['section']), count: admInt(row['count'])),
    ];
    if (rows.isEmpty) {
      return const ZEmpty(
        compact: true,
        icon: LucideIcons.chartColumn,
        title: 'No section cases yet',
      );
    }
    final maximum = rows.fold(
      1,
      (max, row) => row.count > max ? row.count : max,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'ADM learners by school section.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < rows.take(6).length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  rows[i].label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 13),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${rows[i].count}',
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
              value: rows[i].count / maximum,
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
  int _page = 1;
  late String _filter = widget.desk == 'certifications'
      ? 'certification'
      : widget.desk == 'enrolled'
      ? 'enrollment_monitoring'
      : '';
  String _query = '', _rawQuery = '';
  Timer? _debounce;
  AdmListQuery get query =>
      (desk: widget.desk, page: _page, q: _query, filter: _filter);
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final value = ScreenSearchScope.maybeOf(context)?.query ?? '';
    if (value != _rawQuery) {
      _rawQuery = value;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 300), () {
        if (mounted) {
          setState(() {
            _query = value;
            _page = 1;
          });
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
      'certification': 'Preparation / revision',
      'principal_approval': 'Awaiting principal',
      'approved': 'Approved',
    },
    _ => {'': 'All stages', ...admStages},
  };
  Future<void> _open(AdmCaseRow row) async {
    final path = widget.desk == 'enrolled' ? 'enrolled' : 'referrals';
    await context.push('/coordinator/$path/${Uri.encodeComponent(row.id)}');
    if (mounted) await refresh();
  }

  void _reconcilePage(int pages) {
    if (_page <= pages) return;
    final requested = query;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && query == requested) setState(() => _page = pages);
    });
  }

  String get _title => switch (widget.desk) {
    'enrolled' => 'Enrolled',
    'certifications' => 'Certifications',
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
    'certifications' => Icons.verified_outlined,
    'devices' => Icons.devices_outlined,
    _ => Icons.folder_shared_outlined,
  };

  String get _filterLabel => widget.desk == 'referrals' ? 'Stage' : 'Status';

  List<(String, int)> _counterValues(AdmJson dashboard) {
    final kpis = admMap(dashboard['kpis']);
    final devices = admMap(dashboard['deviceSummary']);
    return switch (widget.desk) {
      'enrolled' => [
        ('ADM profiles', admInt(kpis['active'])),
        ('Signed', admInt(kpis['signed'])),
        ('Devices issued', admInt(devices['issued'])),
      ],
      'certifications' => [
        ('Awaiting', admInt(kpis['pendingSignature'])),
        ('Signed', admInt(kpis['signed'])),
        ('Revision', admInt(dashboard['needsRevision'])),
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

  Map<String, dynamic> _caseJson(AdmCaseRow row) => {
    'id': row.id,
    'studentName': row.student,
    'lrn': row.lrn,
    'stage': row.stage,
    'stageLabel': admLabel(row.stage),
    'eligibilityStatus': admLabel(row.eligibility),
    'modulesSubmitted': row.modulesSubmitted,
    'modulesTotal': row.modulesTotal,
    'approved': row.approvedBy.isNotEmpty,
  };

  Future<void> _issueDevice() async {
    await context.push('/coordinator/devices/issue');
    if (mounted) await refresh();
  }

  @override
  Widget build(BuildContext context) {
    final isDevices = widget.desk == 'devices';
    final search = ScreenSearchScope.maybeOf(context);
    final theme = overviewScreenTheme(zLightTheme())
        .copyWith(scaffoldBackgroundColor: Colors.white);
    return Theme(
      data: theme,
      child: Stack(
        children: [
          ColoredBox(
            color: Colors.white,
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
                          ZPill(
                            label: 'Scope',
                            tone: StatusTone.neutral,
                            badge: true,
                            child: const Text('School-managed scope'),
                          ),
                          ZPill(
                            label: 'Records',
                            tone: StatusTone.blue,
                            badge: true,
                            child: const Text('Cross-term records'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
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
                          onChanged: (v) => setState(() {
                            _query = v;
                            _page = 1;
                          }),
                        ),
                        const SizedBox(height: 12),
                      ],
                      const Text(
                        'FILTER ADM RECORDS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                          color: Color(0xFF929FB5),
                        ),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: AdmCaseFilterPill(
                              label: _filterLabel,
                              value: _filter,
                              options: filters,
                              update: (v) => setState(() {
                                _filter = v;
                                _page = 1;
                              }),
                              primary: widget.desk == 'referrals',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      if (isDevices)
                        AdmAsync(
                          value: ref.watch(coordinatorDevicesProvider(query)),
                          retry: refresh,
                          builder: (data) {
                            _reconcilePage(data.totalPages);
                            return Column(
                              children: [
                                _recordCount(data.total),
                                if (data.rows.isEmpty)
                                  const ZEmpty(
                                    icon: Icons.devices_outlined,
                                    title: 'No matching devices.',
                                  ),
                                for (final row in data.rows)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: CoordinatorDeviceCard(
                                      key: ValueKey(row.id),
                                      device: row,
                                    ),
                                  ),
                                AdmPager(
                                  page: _page,
                                  pages: data.totalPages,
                                  total: data.total,
                                  onPage: (p) => setState(() => _page = p),
                                ),
                              ],
                            );
                          },
                        )
                      else
                        AdmAsync(
                          value: ref.watch(coordinatorListProvider(query)),
                          retry: refresh,
                          builder: (data) {
                            _reconcilePage(data.totalPages);
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
                                        'No certifications match',
                                      _ => 'No matching ADM records',
                                    },
                                    subtitle: switch (widget.desk) {
                                      'enrolled' => 'ADM learners under enrollment monitoring and completion appear here.',
                                      'certifications' => 'Certifications awaiting signature and returned cases appear here.',
                                      _ => 'ADM cases for this school year appear here.',
                                    },
                                  ),
                                for (final row in data.rows)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: AdmCaseCard(
                                      key: ValueKey(row.id),
                                      caseData: _caseJson(row),
                                      onTap: () => _open(row),
                                    ),
                                  ),
                                AdmPager(
                                  page: _page,
                                  pages: data.totalPages,
                                  total: data.total,
                                  onPage: (p) => setState(() => _page = p),
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

  Widget _recordCount(int total) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Align(
      alignment: Alignment.centerLeft,
      child: Text(
        'Showing $total record${total == 1 ? '' : 's'}',
        style: const TextStyle(fontSize: 12, color: Color(0xFF9999A6)),
      ),
    ),
  );
}
