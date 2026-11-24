// Referrals — web teacher/advisory/referrals parity (adviser side).
// Composer: GET /anecdotal/referable student → record picker, ADM case vs
// Other matters type split, reviewer routing, reason.
// POST /api/anecdotal/:id/refer {referredToRole, reason, consultReviewer?}.
// 409 ADM_CASE_EXISTS surfaces verbatim.
// Timeline: GET /api/referrals/mine (bare array) with status/type badges,
// search, pressable cards, live draggable details and reason-confirmed cancel.

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../home/overview_data.dart';
import '../../design/screen_search.dart';
import '../../design/tokens.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import '../../shared/floating_add.dart';
import '../../design/shell.dart';
import '../../design/status_palette.dart';

final referralsProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  ref.watch(authProvider);
  ref.watch(termProvider);
  final api = ref.watch(apiClientProvider);
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  try {
    // The backend explicitly supports the full list when no paging params are sent.
    final res = await api.dio.get('/api/referrals/mine', cancelToken: cancel);
    final data = res.data;
    final List list = data is List
        ? data
        : (data is Map && data['referrals'] is List
              ? data['referrals'] as List
              : []);
    return [for (final r in list) Map<String, dynamic>.from(r as Map)];
  } on DioException catch (e) {
    throw api.toApiException(e);
  }
});

final referableProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  ref.watch(authProvider);
  ref.watch(termProvider);
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.dio.get('/api/anecdotal/referable');
    final data = res.data;
    final List list = data is List
        ? data
        : (data is Map && data['records'] is List
              ? data['records'] as List
              : []);
    return [for (final r in list) Map<String, dynamic>.from(r as Map)];
  } on DioException catch (e) {
    throw api.toApiException(e);
  }
});

String _apiMessage(DioException e, String fallback) {
  return userMessage(e, fallback: fallback);
}

String _humanize(String? v) {
  if (v == null || v.isEmpty) return '—';
  return v
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

String _statusLabel(String status) => switch (status) {
  'pending' => 'Pending',
  'in_progress' => 'In progress',
  'info_requested' => 'Info requested',
  'follow_up' => 'Follow up',
  'resolved' => 'Resolved',
  'dismissed' => 'Cancelled',
  'escalated' => 'Escalated',
  _ => _humanize(status),
};

bool _isAdm(Map<String, dynamic> r) =>
    (r['track']?.toString() == 'adm') ||
    (r['targetRole']?.toString() == 'adm_coordinator');

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});
  @override
  Widget build(BuildContext context) =>
      ZStatusPill(text: _statusLabel(status), tone: statusTone(status));
}

class _TypeBadge extends StatelessWidget {
  final bool adm;
  const _TypeBadge({required this.adm});
  @override
  Widget build(BuildContext context) => ZStatusPill(
    text: adm ? 'ADM case' : 'Other matters',
    tone: adm ? StatusTone.amber : StatusTone.blue,
  );
}

class ReferralPage extends ConsumerStatefulWidget {
  const ReferralPage({super.key});
  @override
  ConsumerState<ReferralPage> createState() => _State();
}

class _State extends ConsumerState<ReferralPage> with WidgetsBindingObserver {
  String _q = '';
  bool _composerOpen = false;
  String _type = '', _desk = '', _status = '';
  bool _descending = false;
  Timer? _timer;
  bool _refreshing = false;

  bool get _visible =>
      mounted &&
      WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused &&
      (ModalRoute.of(context)?.isCurrent ?? true) &&
      TickerMode.valuesOf(context).enabled;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_visible) unawaited(_refreshLive());
    });
  }

  Future<void> _refreshLive() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      await ref.refresh(referralsProvider.future).then<void>((_) {});
    } catch (_) {
      // The provider exposes the retryable error.
    } finally {
      _refreshing = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _visible) {
      unawaited(_refreshLive());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(referralsProvider);
    ref.invalidate(referableProvider);
  }

  @override
  Widget build(BuildContext context) {
    final theme = overviewScreenTheme(Theme.of(context))
        .copyWith(scaffoldBackgroundColor: Colors.white);
    return Theme(
      data: theme,
      child: ColoredBox(
        color: Colors.white,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Builder(builder: _content),
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context) {
    final list = ref.watch(referralsProvider);
    final term = ref.watch(termProvider);
    final summary = ref.watch(overviewSummaryProvider).asData?.value;
    final sectionName = summary?.sectionName;
    final sectionGradeLevel = summary?.sectionGradeLevel;
    // The staff shell owns search; standalone keeps this field.
    final scope = ScreenSearchScope.maybeOf(context);
    final q = (scope?.query ?? _q).trim().toLowerCase();
    return Stack(
      children: [
        Positioned.fill(
          child: list.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: ZSkeletonList(),
            ),
            error: (e, _) => ErrorView(
              message: e,
              onRetry: () => ref.invalidate(referralsProvider),
            ),
            data: (items) {
              final shown = items.where((r) {
                if (_type.isNotEmpty &&
                    (_isAdm(r) ? 'adm' : 'other') != _type) {
                  return false;
                }
                if (_desk.isNotEmpty && r['targetRole'] != _desk) return false;
                if (_status.isNotEmpty && r['status'] != _status) return false;
                if (q.isEmpty) return true;
                return (r['studentName']?.toString() ?? '')
                        .toLowerCase()
                        .contains(q) ||
                    (r['lrn']?.toString() ?? '').contains(q) ||
                    (r['targetRole']?.toString() ?? '').toLowerCase().contains(
                      q,
                    );
              }).toList();
              shown.sort((a, b) {
                final nameA = (a['studentName'] ?? '').toString().toLowerCase();
                final nameB = (b['studentName'] ?? '').toString().toLowerCase();
                return _descending
                    ? nameB.compareTo(nameA)
                    : nameA.compareTo(nameB);
              });
              return RefreshIndicator(
                onRefresh: () async => _refresh(),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                    12,
                    16,
                    12,
                    200 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    const ZContentHeader(
                      title: 'Referrals',
                      icon: Icons.send_outlined,
                      description: 'Track referrals for your advisees and follow updates from the receiving desks.',
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (term != null) ...[
                          ZScopePill(
                            text: term.schoolYearName,
                            kind: ScopePillKind.schoolYear,
                            compact: true,
                          ),
                          ZScopePill(
                            text: 'Term ${term.termNumber}',
                            kind: ScopePillKind.term,
                            compact: true,
                          ),
                        ],
                        if (sectionName != null && sectionName.isNotEmpty)
                          ZScopePill(
                            text: [
                              if (sectionGradeLevel != null)
                                sectionGradeLevel.replaceFirst(
                                  RegExp(r'^Grade\s*', caseSensitive: false),
                                  'G',
                                ),
                              sectionName,
                            ].where((value) => value.isNotEmpty).join(' · '),
                            kind: ScopePillKind.grade,
                            label: 'Grade and section',
                            compact: true,
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _counters(items),
                    const SizedBox(height: 14),
                    if (scope == null) ...[
                      ZSearchField(
                        hint: 'Filter by name, LRN, or role',
                        onChanged: (v) => setState(() => _q = v),
                      ),
                      const SizedBox(height: 12),
                    ],
                    const Text(
                      'FILTER REFERRALS',
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
                          child: _filter(
                            context,
                            'Type',
                            _type,
                            const {
                              '': 'All types',
                              'adm': 'ADM case',
                              'other': 'Other matters',
                            },
                            (v) => _type = v,
                            primary: true,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: _filter(context, 'Desk', _desk, const {
                            '': 'All',
                            'guidance_counselor': 'Guidance',
                            'nurse': 'Nurse',
                            'adm_coordinator': 'ADM Coordinator',
                            'principal': 'Principal',
                          }, (v) => _desk = v),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: _filter(context, 'Status', _status, {
                            '': 'All',
                            for (final s in [
                              'pending',
                              'in_progress',
                              'info_requested',
                              'follow_up',
                              'resolved',
                              'dismissed',
                              'escalated',
                            ])
                              s: _statusLabel(s),
                          }, (v) => _status = v),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Showing ${shown.length} records',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF9999A6),
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () =>
                              setState(() => _descending = !_descending),
                          icon: const Icon(LucideIcons.listFilter, size: 14),
                          label: Text(
                            _descending ? 'Name (Z-A)' : 'Name (A-Z)',
                            style: const TextStyle(fontSize: 12),
                          ),
                          style: TextButton.styleFrom(
                            foregroundColor: const Color(0xFF334155),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 0,
                            ),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (shown.isEmpty)
                      ZEmpty(
                        icon: items.isEmpty
                            ? Icons.send_outlined
                            : Icons.search,
                        title: items.isEmpty
                            ? 'No referrals this term'
                            : 'No referrals match',
                        subtitle: items.isEmpty
                            ? 'Sent referrals and their status appear here.'
                            : 'Try a different search or filter.',
                      ),
                    for (final row in shown) ...[
                      _ReferralCard(referral: row, onChanged: _refresh),
                      const SizedBox(height: 8),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
        Positioned(
          right: 16,
          bottom: 0,
          child: FloatingAdd(
            child: FloatingActionButton(
              heroTag: 'new-referral',
              tooltip: 'New referral',
              onPressed: _openComposer,
              child: const Icon(Icons.add),
            ),
          ),
        ),
      ],
    );
  }

  Widget _counters(List<Map<String, dynamic>> items) {
    final counts = [
      ('Pending', items.where((r) => r['status'] == 'pending').length),
      ('In progress', items.where((r) => r['status'] == 'in_progress').length),
      ('Resolved', items.where((r) => r['status'] == 'resolved').length),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF9F9FA),
        border: Border.all(color: const Color(0xFFE8E8ED)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (var i = 0; i < counts.length; i++) ...[
            if (i > 0)
              const SizedBox(height: 30, child: VerticalDivider(width: 16)),
            Expanded(
              child: Text.rich(
                TextSpan(
                  text: '${counts[i].$2}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E293B),
                  ),
                  children: [
                    TextSpan(
                      text: '\n${counts[i].$1}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w400,
                        color: Color(0xFF71809B),
                      ),
                    ),
                  ],
                ),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, height: 1.6),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _filter(
    BuildContext context,
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> update, {
    bool primary = false,
  }) {
    final blue = statusColors(StatusTone.blue, Theme.of(context));
    final active = primary || value.isNotEmpty;
    return PopupMenuButton<String>(
      tooltip: label == 'Desk' ? 'Receiving desk' : label,
      initialValue: value,
      onSelected: (v) => setState(() => update(v)),
      itemBuilder: (_) => [
        for (final entry in options.entries)
          PopupMenuItem(value: entry.key, child: Text(entry.value)),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: active ? blue.background : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active
                    ? blue.foreground.withValues(alpha: 0.25)
                    : const Color(0xFFE5E5EA),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label == 'Type'
                        ? options[value]!
                        : '$label: ${options[value]}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: active ? blue.foreground : const Color(0xFF7185A4),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronDown,
                  size: 12,
                  color: active ? blue.foreground : const Color(0xFF7185A4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openComposer() async {
    if (_composerOpen) return;
    _composerOpen = true;
    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
        ),
        builder: (ctx) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.85,
          builder: (_, scroll) =>
              _ComposerSheet(scroll: scroll, onSent: _refresh),
        ),
      );
    } finally {
      _composerOpen = false;
    }
  }
}

String _referralDate(Object? value) {
  final date = DateTime.tryParse(value?.toString() ?? '');
  return date == null
      ? 'Not recorded'
      : DateFormat('MMM d, y')
            .format(date.toUtc().add(const Duration(hours: 8)));
}

class _ReferralCard extends StatefulWidget {
  final Map<String, dynamic> referral;
  final VoidCallback onChanged;
  const _ReferralCard({required this.referral, required this.onChanged});

  @override
  State<_ReferralCard> createState() => _ReferralCardState();
}

class _ReferralCardState extends State<_ReferralCard> {
  bool _opening = false;
  Map<String, dynamic> get referral => widget.referral;

  @override
  Widget build(BuildContext context) {
    final r = referral;
    final status = r['status']?.toString() ?? 'pending';
    final adm = _isAdm(r);
    final name = (r['studentName']?.toString().isNotEmpty ?? false)
        ? r['studentName'].toString()
        : 'Referral';
    final words = name.trim().split(RegExp(r'\s+'));
    return Card(
      key: ValueKey('referral-card-${r['id']}'),
      margin: const EdgeInsets.only(bottom: 4),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openTrack(context),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: const Color(0xFFEFF6FF),
                    foregroundColor: const Color(0xFF52627C),
                    child: Text(
                      '${words.first.characters.first}${words.length > 1 ? words.last.characters.first : ''}'
                          .toUpperCase(),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF172033),
                          ),
                        ),
                        Text(
                          'LRN ${r['lrn'] ?? '—'}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: _StatusBadge(status: status),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _TypeBadge(adm: adm),
                  ZStatusPill(
                    text: _humanize(r['targetRole']?.toString()),
                    tone: StatusTone.neutral,
                  ),
                  if ((r['consultReviewer']?.toString().isNotEmpty ?? false))
                    ZStatusPill(
                      text:
                          'Review: ${_humanize(r['consultReviewer']?.toString())}',
                      tone: StatusTone.neutral,
                    ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: Color(0xFFF0F3F8)),
              ),
              Row(
                children: [
                  const Icon(
                    LucideIcons.calendar,
                    size: 13,
                    color: Color(0xFF8B9BBA),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      _referralDate(r['referredAt']),
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF8B9BBA),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openTrack(BuildContext context) async {
    if (_opening) return;
    _opening = true;
    final navigation = ProviderScope.containerOf(
      context,
      listen: false,
    ).read(staffNavigationHiddenProvider.notifier);
    final scroll = ScrollController();
    navigation.state = true;
    try {
      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.5,
        ),
        builder: (_) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.5,
            child: _ReferralDetails(
              referralId: referral['id'].toString(),
              scroll: scroll,
              onChanged: widget.onChanged,
            ),
          ),
        ),
      );
    } finally {
      navigation.state = false;
      scroll.dispose();
      _opening = false;
    }
  }
}

class _ReferralDetails extends ConsumerStatefulWidget {
  const _ReferralDetails({
    required this.referralId,
    required this.scroll,
    required this.onChanged,
  });
  final String referralId;
  final ScrollController scroll;
  final VoidCallback onChanged;

  @override
  ConsumerState<_ReferralDetails> createState() => _ReferralDetailsState();
}

class _ReferralDetailsState extends ConsumerState<_ReferralDetails>
    with WidgetsBindingObserver {
  Timer? _timer;
  bool _cancelOpen = false, _refreshing = false;
  late final AuthState _owner;
  late final String _termScope;
  String get _currentScope {
    final term = ref.read(termProvider);
    return '${term?.schoolYearId}:${term?.id}';
  }

  bool get _visible =>
      mounted &&
      (ModalRoute.of(context)?.isCurrent ?? true) &&
      WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused;

  @override
  void initState() {
    super.initState();
    _owner = ref.read(authProvider);
    _termScope = _currentScope;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_visible && !_cancelOpen) unawaited(_refresh());
    });
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      await ref.refresh(referralsProvider.future).then<void>((_) {});
    } catch (_) {
      // The details render the provider's retry state.
    } finally {
      _refreshing = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _visible) unawaited(_refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    ref.watch(termProvider);
    if (!identical(auth, _owner) || _currentScope != _termScope) {
      return const Center(
        child: Text('Your account or term changed. Reopen the referral.'),
      );
    }
    return ref
        .watch(referralsProvider)
        .when(
          loading: () => const LoadingView(),
          error: (error, _) => ErrorView(
            message: error,
            onRetry: () => ref.invalidate(referralsProvider),
          ),
          data: (rows) {
            final row = rows
                .where((r) => r['id'].toString() == widget.referralId)
                .firstOrNull;
            if (row == null) {
              return const Center(
                child: Text('This referral is no longer available.'),
              );
            }
            return _TrackSheet(
              referral: row,
              scroll: widget.scroll,
              onCancel:
                  row['status'] == 'resolved' || row['status'] == 'dismissed'
                  ? null
                  : () => _askCancel(context, ref),
            );
          },
        );
  }

  Future<void> _askCancel(BuildContext context, WidgetRef ref) async {
    if (_cancelOpen) return;
    _cancelOpen = true;
    final auth = ref.read(authProvider);
    final term = ref.read(termProvider);
    final reason = TextEditingController();
    String? error;
    bool busy = false;
    try {
      await showModalBottomSheet(
        context: context,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
        ),
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheet) => PopScope(
            canPop: !busy,
            child: SingleChildScrollView(
              child: Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
                  left: 16,
                  right: 16,
                  top: 8,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Cancel this referral?',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Scheduled sessions are cancelled too. This cannot be undone, but you can refer again afterwards.',
                      style: Theme.of(ctx).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: reason,
                      decoration: const InputDecoration(
                        labelText: 'Reason (required)',
                      ),
                      maxLength: 500,
                      maxLines: 3,
                    ),
                    if (error != null)
                      Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(ctx).colorScheme.error,
                          fontSize: 13,
                        ),
                      ),
                    const SizedBox(height: 8),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: ZTokens.destructiveRed,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: busy
                          ? null
                          : () async {
                              if (busy) return;
                              if (reason.text.trim().isEmpty) {
                                setSheet(() => error = 'A reason is required.');
                                return;
                              }
                              if (!identical(auth, ref.read(authProvider)) ||
                                  term?.id != ref.read(termProvider)?.id ||
                                  term?.schoolYearId !=
                                      ref.read(termProvider)?.schoolYearId) {
                                setSheet(
                                  () => error = 'Your account or term changed. Reopen the referral.',
                                );
                                return;
                              }
                              final current = ref
                                  .read(referralsProvider)
                                  .asData
                                  ?.value
                                  .where(
                                    (r) =>
                                        r['id'].toString() == widget.referralId,
                                  )
                                  .firstOrNull;
                              if (current == null ||
                                  current['status'] == 'resolved' ||
                                  current['status'] == 'dismissed') {
                                setSheet(
                                  () => error = 'This referral can no longer be cancelled. Refresh the details.',
                                );
                                return;
                              }
                              setSheet(() {
                                busy = true;
                                error = null;
                              });
                              try {
                                await ref
                                    .read(apiClientProvider)
                                    .dio
                                    .post(
                                      '/api/referrals/${widget.referralId}/cancel',
                                      data: {'reason': reason.text.trim()},
                                    );
                                if (!mounted) return;
                                widget.onChanged();
                                if (ctx.mounted) Navigator.pop(ctx);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Referral cancelled.'),
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (mounted) widget.onChanged();
                                if (ctx.mounted) {
                                  setSheet(
                                    () => error = userMessage(
                                      e,
                                      fallback: 'Could not cancel.',
                                    ),
                                  );
                                }
                              } finally {
                                if (ctx.mounted) setSheet(() => busy = false);
                              }
                            },
                      child: Text(busy ? 'Cancelling…' : 'Cancel referral'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    } finally {
      // The route's exit animation may still hold the field for one frame.
      WidgetsBinding.instance.addPostFrameCallback((_) => reason.dispose());
      _cancelOpen = false;
    }
  }
}

class _TrackSheet extends StatelessWidget {
  final Map<String, dynamic> referral;
  final ScrollController scroll;
  final VoidCallback? onCancel;
  const _TrackSheet({
    required this.referral,
    required this.scroll,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final r = referral;
    final status = r['status']?.toString() ?? 'pending';
    final adm = _isAdm(r);
    final timeline = (r['timeline'] as List? ?? []);
    final name = (r['studentName']?.toString().isNotEmpty ?? false)
        ? r['studentName'].toString()
        : 'Referral track';
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((part) => part.characters.first)
        .join()
        .toUpperCase();
    Widget panel(
      String title,
      List<Widget> children, {
      bool highlighted = false,
    }) => Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: highlighted ? const Color(0xFFF3F9FF) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted
              ? const Color(0xFFBFDBFE)
              : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: highlighted
                  ? const Color(0xFF1E3A8A)
                  : const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          ...children.map((child) => Material(
            type: MaterialType.transparency,
            child: child,
          )),
        ],
      ),
    );
    return ColoredBox(
      color: Colors.white,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        controller: scroll,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Text(
                  initials,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    _StatusBadge(status: status),
                    const SizedBox(height: 4),
                    Text(
                      'To ${_humanize(r['targetRole']?.toString())} · LRN ${r['lrn'] ?? '—'}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Close referral details',
                style: IconButton.styleFrom(
                  foregroundColor: const Color(0xFF64748B),
                  side: const BorderSide(color: Color(0xFFE5E8F0)),
                  minimumSize: const Size(42, 42),
                  shape: const CircleBorder(),
                ),
                icon: const Icon(LucideIcons.x, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(height: 1, color: Color(0xFFF1F5F9)),
          ),
          const Text(
            'Referral details',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _TypeBadge(adm: adm),
              if (r['consultReviewer'] != null)
                ZStatusPill(
                  text: 'Review: ${_humanize(r['consultReviewer'].toString())}',
                  tone: StatusTone.neutral,
                ),
            ],
          ),
          if ((r['reason']?.toString() ?? '').isNotEmpty) ...[
            panel('Filing reason', [
              Text(
                r['reason'].toString(),
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.45,
                  color: Color(0xFF0F172A),
                ),
              ),
            ], highlighted: true),
          ],
          if ((r['anecdotalExcerpt']?.toString() ?? '').isNotEmpty) ...[
            panel('Anecdotal record', [
              Text(r['anecdotalExcerpt'].toString()),
              if (r['observationDate'] != null)
                Text(
                  'Observed ${_referralDate(r['observationDate'])}',
                  style: theme.textTheme.bodySmall,
                ),
            ]),
          ],
          if (r['bookedSession'] is Map) ...[
            panel('Booked session', [
              Text(
                '${_humanize((r['bookedSession'] as Map)['sessionType']?.toString())} · ${_referralDate((r['bookedSession'] as Map)['scheduledAt'])}',
              ),
              if ((r['bookedSession'] as Map)['venue'] != null)
                Text((r['bookedSession'] as Map)['venue'].toString()),
            ]),
          ],
          for (final field in {
            'notes': 'Notes',
            'escalationReason': 'Escalation reason',
          }.entries)
            if ((r[field.key]?.toString() ?? '').isNotEmpty) ...[
              panel(field.value, [Text(r[field.key].toString())]),
            ],
          if ((r['referredAt']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Submitted ${_referralDate(r['referredAt'])}',
              style: theme.textTheme.bodySmall?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
          if (adm) ...[
            panel('ADM evidence', [
              Text(
                'Stage: ${(r['admStageLabel'] ?? r['admStage'] ?? '—').toString()} · Eligibility: ${(r['admEligibility'] ?? '—').toString()} · Modules ${r['modulesSubmitted'] ?? 0}/${r['modulesTotal'] ?? 0}',
                style: theme.textTheme.bodySmall,
              ),
            ]),
          ],
          panel('Timeline (${timeline.length})', [
            if (timeline.isEmpty)
              const ZEmpty(
                compact: true,
                icon: Icons.history,
                title: 'No timeline entries yet.',
              )
            else
              for (final t in timeline)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
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
          ]),
          if (onCancel != null) ...[
            const SizedBox(height: 24),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: ZTokens.destructiveRed,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
              ),
              onPressed: onCancel,
              child: const Text('Cancel referral'),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ComposerSheet extends ConsumerStatefulWidget {
  final ScrollController scroll;
  final VoidCallback onSent;
  const _ComposerSheet({required this.scroll, required this.onSent});

  @override
  ConsumerState<_ComposerSheet> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_ComposerSheet> {
  String? _studentKey;
  Map<String, dynamic>? _record;
  String _kind = 'other'; // adm | other
  String _receiver = 'other:guidance';
  final _reason = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  String get _desk => _receiver.split(':').first == 'adm'
      ? 'adm_coordinator'
      : _receiver.split(':').last == 'guidance'
      ? 'guidance_counselor'
      : _receiver.split(':').last;
  String? get _reviewer => _receiver.startsWith('adm:')
      ? (_receiver.split(':').last == 'guidance'
            ? 'guidance_counselor'
            : _receiver.split(':').last)
      : null;
  String get _filedTo => _receiver.startsWith('adm:')
      ? 'ADM Coordinator via ${_humanize(_receiver.split(':').last)}'
      : _humanize(_desk);

  Future<void> _send() async {
    if (_record == null) {
      setState(() => _error = 'Pick an anecdotal record first.');
      return;
    }
    if (_reason.text.trim().isEmpty) {
      setState(() => _error = 'A reason is required.');
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await ref
          .read(apiClientProvider)
          .dio
          .post(
            '/api/anecdotal/${_record!['id']}/refer',
            data: {
              'referredToRole': _desk,
              'reason': _reason.text.trim(),
              if (_reviewer != null) 'consultReviewer': _reviewer,
            },
          );
      widget.onSent();
      if (mounted) Navigator.pop(context);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Referral sent.')));
      }
    } on DioException catch (e) {
      setState(() {
        _busy = false;
        _error = _apiMessage(
          e,
          'We couldn’t send the referral. Please try again.',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final referable = ref.watch(referableProvider);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: referable.when(
        loading: () => const ZSkeletonList(count: 3),
        error: (e, _) => ErrorView(
          message: e,
          onRetry: () => ref.invalidate(referableProvider),
        ),
        data: (records) {
          final open = records.where((r) => r['hasReferral'] != true).toList();
          final students = <String, Map<String, String>>{};
          for (final r in open) {
            final key = (r['studentId']?.toString().isNotEmpty ?? false)
                ? r['studentId'].toString()
                : 'lrn:${r['lrn']}';
            students.putIfAbsent(
              key,
              () => {
                'name': (r['studentName'] ?? '').toString(),
                'lrn': (r['lrn'] ?? '').toString(),
              },
            );
          }
          if (_studentKey != null && !students.containsKey(_studentKey)) {
            _studentKey = null;
          }
          final studentRecords = _studentKey == null
              ? const <Map<String, dynamic>>[]
              : open.where((r) {
                  final key = (r['studentId']?.toString().isNotEmpty ?? false)
                      ? r['studentId'].toString()
                      : 'lrn:${r['lrn']}';
                  return key == _studentKey;
                }).toList();
          if (_record != null &&
              !studentRecords.any((r) => r['id'] == _record!['id'])) {
            _record = null;
          }
          return ListView(
            controller: widget.scroll,
            children: [
              const Text(
                'New referral',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _studentKey,
                decoration: const InputDecoration(labelText: 'Student'),
                items: [
                  for (final e in students.entries)
                    DropdownMenuItem(
                      value: e.key,
                      child: Text(
                        '${e.value['name']} · ${e.value['lrn']}',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                ],
                onChanged: (v) => setState(() {
                  _studentKey = v;
                  _record = null;
                }),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<Map<String, dynamic>>(
                initialValue: _record,
                decoration: const InputDecoration(
                  labelText: 'Anecdotal record',
                ),
                items: [
                  for (final r in studentRecords)
                    DropdownMenuItem(
                      value: r,
                      child: Text(
                        '${r['observationDate'] ?? ''} · ${_humanize(r['category']?.toString())}',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                ],
                onChanged: _studentKey == null
                    ? null
                    : (v) => setState(() => _record = v),
              ),
              if (_record != null &&
                  (_record!['excerpt']?.toString().isNotEmpty ?? false)) ...[
                const SizedBox(height: 4),
                Text(
                  (_record!['excerpt'] ?? '').toString(),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 8),
              SegTabs<String>(
                values: const ['adm', 'other'],
                labels: const ['ADM case', 'Other matters'],
                selected: _kind,
                onChanged: (v) => setState(() {
                  _kind = v;
                  _receiver = v == 'adm' ? 'adm:nurse' : 'other:guidance';
                }),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _receiver,
                decoration: const InputDecoration(labelText: 'Received by'),
                items: _kind == 'adm'
                    ? const [
                        DropdownMenuItem(
                          value: 'adm:nurse',
                          child: Text(
                            'Nurse (ADM)',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                        DropdownMenuItem(
                          value: 'adm:guidance',
                          child: Text(
                            'Guidance (ADM)',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                        DropdownMenuItem(
                          value: 'adm:lrpc',
                          child: Text(
                            'LRPC (ADM)',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                      ]
                    : const [
                        DropdownMenuItem(
                          value: 'other:guidance',
                          child: Text(
                            'Guidance',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                        DropdownMenuItem(
                          value: 'other:nurse',
                          child: Text('Nurse', style: TextStyle(fontSize: 13)),
                        ),
                      ],
                onChanged: (v) => setState(() => _receiver = v ?? _receiver),
              ),
              const SizedBox(height: 4),
              Text(
                'Filed to: $_filedTo',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _reason,
                decoration: const InputDecoration(labelText: 'Reason'),
                maxLines: 3,
                style: const TextStyle(fontSize: 13),
              ),
              if (_error != null) ...[
                const SizedBox(height: 4),
                Text(
                  _error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 13,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : _send,
                child: Text(_busy ? 'Sending…' : 'Send referral'),
              ),
            ],
          );
        },
      ),
    );
  }
}
