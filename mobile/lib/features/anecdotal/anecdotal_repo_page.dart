// Anecdotal records repo — web anecdotal/page.tsx + folders/ parity.
// All records (search, 20/page) | By student (grouped hubs). Tap opens the
// official GCForm-01 preview (native A4 sheet + signature + Download .xlsx).
// Empty states deep-link to Bama filing (?new=1 equivalent).
// NOTE: custom-folder + follow-up UI was removed; the API helpers in
// anecdotal_data.dart are intentionally kept for future use.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/screen_search.dart';
import '../../design/tokens.dart';
import '../../shared/widgets.dart';
import 'anecdotal_data.dart';
import 'record_preview_page.dart';

const _pageSize = 20;

class AnecdotalRepoPage extends ConsumerStatefulWidget {
  const AnecdotalRepoPage({super.key});
  @override
  ConsumerState<AnecdotalRepoPage> createState() => _State();
}

class _State extends ConsumerState<AnecdotalRepoPage> {
  String _view = 'all'; // all | students
  String _q = '';
  String? _category; // single category filter (chips double as the legend)
  int _page = 0;

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
      _page = 0;
    }
  }

  bool get _filtered => _q.isNotEmpty || _category != null;

  void _openDetail(MyAnecdotalRecord r) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => RecordPreviewPage(record: r)),
    );
  }

  /// Chips are the legend and the filter at once: tapping the selected chip
  /// again (or Clear) drops back to every category.
  void _selectCategory(String key) {
    setState(() {
      _category = _category == key ? null : key;
      _page = 0;
    });
  }

  void _clearFilters() {
    ScreenSearchScope.maybeOf(context)?.clear();
    setState(() {
      _q = '';
      _category = null;
      _page = 0;
    });
  }

  List<MyAnecdotalRecord> _visible(List<MyAnecdotalRecord> records) {
    final q = _q;
    final category = _category;
    return records.where((r) {
      if (q.isNotEmpty) {
        final hit = r.studentName.toLowerCase().contains(q) ||
            r.lrn.contains(q) ||
            r.section.toLowerCase().contains(q);
        if (!hit) return false;
      }
      if (category != null && r.category.trim().toLowerCase() != category) return false;
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final repo = ref.watch(anecdotalMineProvider);
    return Column(children: [
      _toolbar(context),
      Expanded(
        child: repo.when(
          loading: () => const Padding(padding: EdgeInsets.all(16), child: ZSkeletonList()),
          error: (e, _) => ErrorView(message: e, onRetry: () => ref.invalidate(anecdotalMineProvider)),
          data: (records) {
            final shown = _visible(records);
            if (shown.isEmpty) return _empty(records);
            if (_view == 'students') return _studentHubs(shown);
            final pages = (shown.length / _pageSize).ceil().clamp(1, 9999);
            final page = _page.clamp(0, pages - 1);
            final slice = shown.skip(page * _pageSize).take(_pageSize).toList();
            return Column(children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async => ref.invalidate(anecdotalMineProvider),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    itemCount: slice.length,
                    separatorBuilder: (context, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _RecordRow(record: slice[i], onTap: () => _openDetail(slice[i])),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
                child: Row(children: [
                  Expanded(
                    child: Text('${shown.length} record${shown.length == 1 ? '' : 's'}',
                        style: theme.textTheme.bodySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                  ),
                  if (pages > 1) ...[
                    IconButton(
                      tooltip: 'Previous page',
                      onPressed: page > 0 ? () => setState(() => _page = page - 1) : null,
                      icon: const Icon(Icons.chevron_left, size: 20),
                    ),
                    Text('${page + 1} / $pages',
                        style: theme.textTheme.bodySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                    IconButton(
                      tooltip: 'Next page',
                      onPressed: page < pages - 1 ? () => setState(() => _page = page + 1) : null,
                      icon: const Icon(Icons.chevron_right, size: 20),
                    ),
                  ],
                ]),
              ),
            ]);
          },
        ),
      ),
    ]);
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
                _page = 0;
              }),
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(16, scope == null ? 0 : 12, 0, 8),
          child: Row(children: [
            SegTabs<String>(
              values: const ['all', 'students'],
              labels: const ['All', 'Students'],
              selected: _view,
              onChanged: (v) => setState(() => _view = v),
            ),
            const SizedBox(width: 10),
            Container(width: 1, height: 24, color: theme.colorScheme.outlineVariant),
            const SizedBox(width: 10),
            Expanded(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.only(right: 16),
                child: Row(children: [
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
                ]),
              ),
            ),
          ]),
        ),
      ],
    );
  }

  Widget _empty(List<MyAnecdotalRecord> records) {
    if (records.isEmpty) {
      return ZEmptyPage(
        icon: Icons.folder_outlined,
        title: 'No files stored yet',
        subtitle: 'File your first record with Bama.',
        actionLabel: 'Chat with Bama',
        onAction: () => context.go('/adviser/bama?new=1'),
        onRefresh: () async => ref.invalidate(anecdotalMineProvider),
      );
    }
    final category = _category == null ? null : anecdotalCategoryLabels[_category];
    return ZEmptyPage(
      icon: Icons.filter_alt_off_outlined,
      title: 'No records match',
      subtitle: category == null
          ? 'Try a different search.'
          : _q.isEmpty
              ? 'Nothing filed under $category yet.'
              : 'Nothing under $category matches this search.',
      actionLabel: 'Clear filters',
      onAction: _clearFilters,
      onRefresh: () async => ref.invalidate(anecdotalMineProvider),
    );
  }

  Widget _studentHubs(List<MyAnecdotalRecord> shown) {
    final theme = Theme.of(context);
    final groups = <String, List<MyAnecdotalRecord>>{};
    for (final r in shown) {
      groups.putIfAbsent(r.studentId.isEmpty ? r.lrn : r.studentId, () => []).add(r);
    }
    final entries = groups.entries.toList()
      ..sort((a, b) => b.value.map((r) => r.observationDatetime).fold('', (p, e) => e.compareTo(p) > 0 ? e : p).compareTo(
          a.value.map((r) => r.observationDatetime).fold('', (p, e) => e.compareTo(p) > 0 ? e : p)));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(anecdotalMineProvider),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
        itemCount: entries.length,
        separatorBuilder: (context, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final records = entries[i].value..sort((a, b) => b.observationDatetime.compareTo(a.observationDatetime));
          final first = records.first;
          final cats = {for (final r in records) r.category.trim().toLowerCase()}..remove('');
          // Mixed categories keep a neutral folder so no single colour lies.
          final uniform = cats.length == 1 ? anecdotalCategoryColor(cats.first) : null;
          return ZCard(
            padding: EdgeInsets.zero,
            child: Theme(
              data: theme.copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                dense: true,
                leading: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(ZTokens.radiusMd),
                    color: (uniform ?? theme.colorScheme.surfaceContainerLow).withValues(alpha: uniform == null ? 1 : 0.14),
                  ),
                  child: Icon(
                    Icons.folder_outlined,
                    size: 16,
                    color: uniform ?? theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                title: Text(first.studentName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                subtitle: Text('${first.lrn} · ${first.section} · ${records.length} record${records.length == 1 ? '' : 's'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.only(left: 8),
                    decoration: BoxDecoration(
                      border: Border(left: BorderSide(color: theme.colorScheme.outlineVariant)),
                    ),
                    child: Column(children: [
                      for (final r in records)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _RecordRow(record: r, onTap: () => _openDetail(r), dense: true),
                        ),
                    ]),
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

/// Category legend + filter in one compact control. Collapsed it is just a
/// colour dot (the legend); selecting it expands into a labelled pill and
/// filters the list, selecting it again collapses and clears the filter.
class _CategoryChip extends StatelessWidget {
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryChip({required this.label, required this.color, required this.selected, required this.onTap});

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
                    color: color.withValues(alpha: selected ? (dark ? 0.24 : 0.16) : (dark ? 0.12 : 0.10)),
                    border: Border.all(color: color.withValues(alpha: selected ? 0.70 : 0.40)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                    ),
                    if (selected) ...[
                      const SizedBox(width: 5),
                      Text(
                        label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: dark ? color : Color.lerp(color, Colors.black, 0.35),
                        ),
                      ),
                    ],
                  ]),
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
              child: Icon(Icons.close, size: 14, color: theme.colorScheme.onSurfaceVariant),
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
  const _RecordRow({required this.record, required this.onTap, this.dense = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ZCard(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: dense ? 8 : 10),
      onTap: onTap,
      child: Row(children: [
        Container(
          width: dense ? 32 : 40,
          height: dense ? 32 : 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(ZTokens.radiusMd),
            color: anecdotalCategoryColor(record.category).withValues(alpha: 0.12),
          ),
          child: Icon(Icons.folder_outlined, size: dense ? 16 : 20, color: anecdotalCategoryColor(record.category)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(record.studentName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            Text('${record.lrn} · ${record.section}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
            const SizedBox(height: 6),
            Row(children: [
              ZStatusPill(text: anecdotalCategoryLabel(record.category), tone: anecdotalCategoryTone(record.category)),
              const SizedBox(width: 8),
              Flexible(
                child: Text(record.date,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    )),
              ),
            ]),
          ]),
        ),
        const Icon(Icons.chevron_right, size: 18),
      ]),
    );
  }
}
