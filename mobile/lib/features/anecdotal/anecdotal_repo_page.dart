// Anecdotal records repo — web anecdotal/page.tsx + folders/ parity.
// All records (search, 20/page) | By student (grouped hubs). Tap opens the
// official GCForm-01 preview (native A4 sheet + signature + Download .xlsx).
// Empty states deep-link to Bama filing (?new=1 equivalent).
// NOTE: custom-folder + follow-up UI was removed; the API helpers in
// anecdotal_data.dart are intentionally kept for future use.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/overview_theme.dart';
import '../../design/screen_search.dart';
import '../../design/status_palette.dart';
import '../../design/tokens.dart';
import '../../shared/widgets.dart';
import 'anecdotal_data.dart';
import 'record_preview_page.dart';

class AnecdotalRepoPage extends ConsumerStatefulWidget {
  const AnecdotalRepoPage({super.key});
  @override
  ConsumerState<AnecdotalRepoPage> createState() => _State();
}

class _State extends ConsumerState<AnecdotalRepoPage> {
  String _view = 'all'; // all | students
  String _q = '';
  String? _category; // single category filter (chips double as the legend)
  bool _nameDescending = false;
  final Set<String> _expandedStudents = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Header search: keep the list scoped to the shared query and restart
    // paging whenever it changes. Standalone previews keep their own field.
    final scope = ScreenSearchScope.maybeOf(context);
    if (scope == null) return;
    final next = scope.query.trim().toLowerCase();
    if (next != _q) {
      _q = next;
    }
  }

  bool get _filtered => _q.isNotEmpty || _category != null;

  void _openDetail(MyAnecdotalRecord r) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => RecordPreviewPage(record: r)));
  }

  /// Chips are the legend and the filter at once: tapping the selected chip
  /// again (or Clear) drops back to every category.
  void _selectCategory(String key) {
    setState(() {
      _category = _category == key ? null : key;
    });
  }

  void _clearFilters() {
    ScreenSearchScope.maybeOf(context)?.clear();
    setState(() {
      _q = '';
      _category = null;
    });
  }

  List<MyAnecdotalRecord> _visible(List<MyAnecdotalRecord> records) {
    final q = _q;
    final category = _category;
    final shown = records.where((r) {
      if (q.isNotEmpty) {
        final hit =
            r.studentName.toLowerCase().contains(q) ||
            r.lrn.contains(q) ||
            r.section.toLowerCase().contains(q);
        if (!hit) return false;
      }
      if (category != null && r.category.trim().toLowerCase() != category) {
        return false;
      }
      return true;
    }).toList();
    shown.sort((a, b) {
      final comparison = a.studentName.toLowerCase().compareTo(
        b.studentName.toLowerCase(),
      );
      return _nameDescending ? -comparison : comparison;
    });
    return shown;
  }

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(anecdotalMineProvider);
    final navigationClearance = ref.watch(authProvider).role == 'adviser'
        ? 112.0 + MediaQuery.paddingOf(context).bottom
        : 8.0;
    return RefreshIndicator(
      onRefresh: () async {
        await ref.refresh(anecdotalMineProvider.future).then<void>((_) {});
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: _header(context, repo.asData?.value)),
          SliverToBoxAdapter(child: _toolbar(context)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      repo.asData == null
                          ? 'Showing — records'
                          : 'Showing ${_visible(repo.asData!.value).length} records',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF929FB5),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => setState(() {
                      _nameDescending = !_nameDescending;
                    }),
                    icon: const Icon(LucideIcons.listFilter, size: 14),
                    label: Text(
                      _nameDescending ? 'Name (Z-A)' : 'Name (A-Z)',
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
            ),
          ),
          repo.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ZSkeletonList(),
              ),
            ),
            error: (e, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorView(
                message: e,
                onRetry: () => ref.invalidate(anecdotalMineProvider),
              ),
            ),
            data: (records) {
              final shown = _visible(records);
              if (shown.isEmpty) return _empty(records);
              if (_view == 'students') return _studentHubs(shown);
              return SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.separated(
                  itemCount: shown.length,
                  separatorBuilder: (context, _) => const SizedBox(height: 12),
                  itemBuilder: (context, i) => _RecordRow(
                    record: shown[i],
                    onTap: () => _openDetail(shown[i]),
                  ),
                ),
              );
            },
          ),
          SliverToBoxAdapter(child: SizedBox(height: navigationClearance)),
        ],
      ),
    );
  }

  Widget _header(BuildContext context, List<MyAnecdotalRecord>? records) {
    final term = ref.watch(termProvider);
    final sections =
        records
            ?.map((record) => record.section.trim())
            .where((section) => section.isNotEmpty)
            .toSet()
            .toList()
          ?..sort();
    final students = records
        ?.map((record) {
          if (record.studentId.isNotEmpty) return 'id:${record.studentId}';
          if (record.lrn.isNotEmpty) return 'lrn:${record.lrn}';
          return 'name:${record.studentName}:${record.section}';
        })
        .toSet()
        .length;
    final categories = records
        ?.map((record) => record.category.trim().toLowerCase())
        .where((category) => category.isNotEmpty)
        .toSet()
        .length;
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: Container(
        width: double.infinity,
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ZContentHeader(
              title: 'Anecdotal records',
              icon: Icons.note_alt_outlined,
              description: 'Your learner observations and anecdotal records for this school year.',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (term != null)
                  ZScopePill(
                    text: term.schoolYearName,
                    kind: ScopePillKind.schoolYear,
                    compact: true,
                  ),
                const ZScopePill(
                  text: 'All terms',
                  kind: ScopePillKind.term,
                  compact: true,
                ),
                for (final section in sections ?? <String>[])
                  ZStatusPill(text: section, tone: StatusTone.violet),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF9F9FA),
                border: Border.all(color: const Color(0xFFE8E8ED)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  for (final entry in [
                    (records?.length, 'Records'),
                    (students, 'Students'),
                    (categories, 'Categories'),
                  ].indexed) ...[
                    if (entry.$1 > 0)
                      const SizedBox(
                        height: 30,
                        child: VerticalDivider(
                          width: 16,
                          color: Color(0xFFE8E8ED),
                        ),
                      ),
                    Expanded(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            entry.$2.$1?.toString() ?? '—',
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.6,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                          Text(
                            entry.$2.$2,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.6,
                              color: Color(0xFF71809B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// One horizontal line for both controls: the view switch stays pinned on
  /// the left, the category chips (which are also the colour legend) scroll
  /// underneath it, and Clear joins them only while a filter is active.
  Widget _toolbar(BuildContext context) {
    final scope = ScreenSearchScope.maybeOf(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (scope == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: ZSearchField(
              hint: 'Search name, LRN, or section',
              onChanged: (v) => setState(() {
                _q = v.trim().toLowerCase();
              }),
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(16, scope == null ? 0 : 4, 0, 0),
          child: Row(
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final view in const [
                    ('all', 'All'),
                    ('students', 'Students'),
                  ])
                    TextButton(
                      onPressed: () => setState(() {
                        _view = view.$1;
                      }),
                      style: TextButton.styleFrom(
                        minimumSize: const Size(48, 32),
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        tapTargetSize: MaterialTapTargetSize.padded,
                        foregroundColor: _view == view.$1
                            ? const Color(0xFF2563EB)
                            : theme.colorScheme.onSurfaceVariant,
                        backgroundColor: _view == view.$1
                            ? const Color(0xFFEFF6FF)
                            : Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(
                            color: _view == view.$1
                                ? const Color(0xFFBFDBFE)
                                : Colors.transparent,
                          ),
                        ),
                        textStyle: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      child: Text(view.$2),
                    ),
                ],
              ),
              const SizedBox(width: 6),
              Container(
                width: 1,
                height: 24,
                color: theme.colorScheme.outlineVariant,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.only(right: 16),
                  child: Row(
                    children: [
                      for (final entry in anecdotalCategoryLabels.entries) ...[
                        _CategoryChip(
                          label: entry.value,
                          color: anecdotalCategoryColors[entry.key]!,
                          selected: _category == entry.key,
                          onTap: () => _selectCategory(entry.key),
                        ),
                        const SizedBox(width: 6),
                      ],
                      if (_filtered) _ClearChip(onTap: _clearFilters),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _empty(List<MyAnecdotalRecord> records) {
    if (records.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: ZEmpty(
            icon: Icons.folder_outlined,
            title: 'No files stored yet',
            subtitle: 'File your first record with Bama.',
            actionLabel: 'Chat with Bama',
            onAction: () => context.go('/adviser/bama?new=1'),
          ),
        ),
      );
    }
    final category = _category == null
        ? null
        : anecdotalCategoryLabels[_category];
    final subtitle = category == null
        ? 'Try a different search.'
        : _q.isEmpty
        ? 'Nothing filed under $category yet.'
        : 'Nothing under $category matches this search.';
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: ZEmpty(
          icon: Icons.search_off_outlined,
          title: 'No records match',
          subtitle: subtitle,
          actionLabel: 'Clear filters',
          onAction: _clearFilters,
        ),
      ),
    );
  }

  Widget _studentHubs(List<MyAnecdotalRecord> shown) {
    final theme = Theme.of(context);
    final groups = <String, List<MyAnecdotalRecord>>{};
    for (final r in shown) {
      groups
          .putIfAbsent(r.studentId.isEmpty ? r.lrn : r.studentId, () => [])
          .add(r);
    }
    final entries = groups.entries.toList()
      ..sort(
        (a, b) => b.value
            .map((r) => r.observationDatetime)
            .fold('', (p, e) => e.compareTo(p) > 0 ? e : p)
            .compareTo(
              a.value
                  .map((r) => r.observationDatetime)
                  .fold('', (p, e) => e.compareTo(p) > 0 ? e : p),
            ),
      );
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      sliver: SliverList.separated(
        itemCount: entries.length,
        separatorBuilder: (context, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final records = entries[i].value
            ..sort(
              (a, b) => b.observationDatetime.compareTo(a.observationDatetime),
            );
          final first = records.first;
          final cats = {
            for (final r in records) r.category.trim().toLowerCase(),
          }..remove('');
          // Mixed categories keep a neutral folder so no single colour lies.
          final uniform = cats.length == 1
              ? anecdotalCategoryColor(cats.first)
              : null;
          return ZCard(
            padding: EdgeInsets.zero,
            child: Theme(
              data: theme.copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                key: ValueKey(entries[i].key),
                initiallyExpanded: _expandedStudents.contains(entries[i].key),
                onExpansionChanged: (expanded) => setState(() {
                  if (expanded) {
                    _expandedStudents.add(entries[i].key);
                  } else {
                    _expandedStudents.remove(entries[i].key);
                  }
                }),
                dense: true,
                showTrailingIcon: false,
                tilePadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                title: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(
                              ZTokens.radiusMd,
                            ),
                            color:
                                (uniform ??
                                        theme.colorScheme.surfaceContainerLow)
                                    .withValues(
                                      alpha: uniform == null ? 1 : 0.14,
                                    ),
                          ),
                          child: Icon(
                            Icons.folder_outlined,
                            size: 16,
                            color:
                                uniform ?? theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                first.studentName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                'LRN ${first.lrn}',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontFeatures: const [
                                    FontFeature.tabularFigures(),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${records.length} record${records.length == 1 ? '' : 's'}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Divider(height: 1, color: Color(0xFFE6ECF4)),
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final category in cats)
                                ZStatusPill(
                                  text: anecdotalCategoryLabel(category),
                                  tone: anecdotalCategoryTone(category),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          _expandedStudents.contains(entries[i].key)
                              ? Icons.expand_less
                              : Icons.expand_more,
                          size: 20,
                        ),
                      ],
                    ),
                  ],
                ),
                childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      for (final entry in records.indexed)
                        CustomPaint(
                          painter: _RecordBranchPainter(
                            color: theme.colorScheme.outlineVariant,
                            isLast: entry.$1 == records.length - 1,
                          ),
                          child: Padding(
                            padding: const EdgeInsets.only(left: 16, bottom: 8),
                            child: _RecordRow(
                              record: entry.$2,
                              onTap: () => _openDetail(entry.$2),
                              dense: true,
                            ),
                          ),
                        ),
                    ],
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

class _RecordBranchPainter extends CustomPainter {
  const _RecordBranchPainter({required this.color, required this.isLast});
  final Color color;
  final bool isLast;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final middle = (size.height - 8) / 2;
    if (!isLast) {
      canvas.drawLine(const Offset(1, 0), Offset(1, size.height), paint);
    }
    final branch = Path()
      ..moveTo(1, 0)
      ..lineTo(1, middle - 8)
      ..quadraticBezierTo(1, middle, 9, middle)
      ..lineTo(16, middle);
    canvas.drawPath(branch, paint);
  }

  @override
  bool shouldRepaint(_RecordBranchPainter oldDelegate) =>
      color != oldDelegate.color || isLast != oldDelegate.isLast;
}

/// Category legend + filter in one compact control. Collapsed it is just a
/// colour dot (the legend); selecting it expands into a labelled pill and
/// filters the list, selecting it again collapses and clears the filter.
class _CategoryChip extends StatelessWidget {
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryChip({
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    return Tooltip(
      message: selected ? 'Show all categories' : '$label records',
      child: Semantics(
        button: true,
        selected: selected,
        label: '$label records',
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ZTokens.radiusPill),
          child: SizedBox(
            height: 44,
            child: Center(
              child: AnimatedSize(
                duration: ZTokens.micro,
                curve: ZTokens.easeOut,
                alignment: Alignment.center,
                child: Container(
                  height: 30,
                  width: selected ? null : 30,
                  padding: EdgeInsets.symmetric(horizontal: selected ? 10 : 0),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(ZTokens.radiusPill),
                    color: color.withValues(
                      alpha: selected
                          ? (dark ? 0.24 : 0.16)
                          : (dark ? 0.12 : 0.10),
                    ),
                    border: Border.all(
                      color: color.withValues(alpha: selected ? 0.70 : 0.40),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: color,
                        ),
                      ),
                      if (selected) ...[
                        const SizedBox(width: 5),
                        Text(
                          label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: dark
                                ? color
                                : Color.lerp(color, Colors.black, 0.35),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ClearChip extends StatelessWidget {
  final VoidCallback onTap;
  const _ClearChip({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: 'Clear filters',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ZTokens.radiusPill),
        child: SizedBox(
          width: 30,
          height: 44,
          child: Center(
            child: Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.surfaceContainerLow,
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Icon(
                Icons.close,
                size: 14,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RecordRow extends StatelessWidget {
  final MyAnecdotalRecord record;
  final VoidCallback onTap;
  final bool dense;
  const _RecordRow({
    required this.record,
    required this.onTap,
    this.dense = false,
  });

  @override
  Widget build(BuildContext context) {
    final observedAt = DateTime.tryParse(record.observationDatetime);
    final dateLabel = observedAt == null
        ? 'Not recorded'
        : DateFormat('MMM d, y')
              .format(observedAt.toUtc().add(const Duration(hours: 8)));
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE6ECF4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.all(dense ? 10 : 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: dense ? 32 : 40,
                    height: dense ? 32 : 40,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(ZTokens.radiusMd),
                      color: anecdotalCategoryColor(record.category)
                          .withValues(alpha: 0.12),
                      border: Border.all(
                        color: anecdotalCategoryColor(record.category)
                            .withValues(alpha: 0.2),
                      ),
                    ),
                    child: Icon(
                      Icons.folder_rounded,
                      size: dense ? 16 : 20,
                      color: anecdotalCategoryColor(record.category),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                record.studentName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF172033),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            ZStatusPill(
                              text: anecdotalCategoryLabel(record.category),
                              tone: anecdotalCategoryTone(record.category),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'LRN ${record.lrn}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF71809B),
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: Color(0xFFF0F3F8)),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.start,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        LucideIcons.calendar,
                        size: 13,
                        color: Color(0xFF8B9BBA),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        dateLabel,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF8B9BBA),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
