// Shared Overview presentation.
//
// The teacher/adviser Overview and the ADM coordinator Overview render the same
// board chrome, stat tiles, attention rows and inline states, so the two desks
// share one visual language. Each page supplies its own data and destinations.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../design/tokens.dart';
import '../../shared/user_messages.dart';

/// Bordered Overview board with an icon tile, title, optional count/action and
/// a hairline above its body.
class OverviewBoard extends StatelessWidget {
  const OverviewBoard({
    super.key,
    required this.icon,
    required this.title,
    required this.child,
    this.count,
    this.action,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final Widget child;
  final int? count;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final isSchedule = title == 'Up next';
    final scheduleAccent = dark
        ? const Color(0xFF8FB6F5)
        : const Color(0xff0755dc);
    final accent = isSchedule ? scheduleAccent : theme.colorScheme.primary;
    final hairline = isSchedule
        ? (dark ? theme.colorScheme.outline : const Color(0xffe7ecf2))
        : theme.colorScheme.outline.withValues(alpha: 0.7);
    return Material(
      color: isSchedule
          ? theme.colorScheme.surface
          : theme.cardTheme.color ?? theme.colorScheme.surface,
      elevation: 1,
      shadowColor: Colors.black.withValues(alpha: dark ? 0.4 : 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(isSchedule ? 18 : 16),
        side: BorderSide(
          color: isSchedule
              ? (dark ? theme.colorScheme.outline : const Color(0xffdce5ef))
              : theme.colorScheme.outline,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: isSchedule
                ? const EdgeInsets.symmetric(horizontal: 12, vertical: 6)
                : EdgeInsets.fromLTRB(14, 8, action == null ? 14 : 6, 8),
            child: Row(
              children: [
                Container(
                  padding: EdgeInsets.all(isSchedule ? 7 : 5),
                  decoration: BoxDecoration(
                    color:
                        (isSchedule
                                ? (dark
                                      ? const Color(0xFFFFC65C)
                                      : const Color(0xffb45309))
                                : accent)
                            .withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(
                    icon,
                    size: isSchedule ? 20 : 18,
                    color: isSchedule
                        ? (dark
                              ? const Color(0xFFFFC65C)
                              : const Color(0xffb45309))
                        : accent,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontSize: isSchedule ? 16 : 14,
                      color: isSchedule ? theme.colorScheme.onSurface : null,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (count != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      '$count',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                if (action != null)
                  // Keep the action at the trailing edge, while allowing
                  // its label to shrink on narrow or large-text layouts.
                  Flexible(
                    flex: 3,
                    fit: FlexFit.loose,
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: onAction,
                        style: TextButton.styleFrom(
                          backgroundColor: isSchedule
                              ? (dark
                                    ? scheduleAccent.withValues(alpha: 0.14)
                                    : const Color(0xffeaf2fd))
                              : null,
                          shape: isSchedule ? const StadiumBorder() : null,
                          minimumSize: Size(0, isSchedule ? 32 : 40),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          tapTargetSize: isSchedule
                              ? MaterialTapTargetSize.padded
                              : MaterialTapTargetSize.shrinkWrap,
                          foregroundColor: isSchedule
                              ? accent
                              : theme.colorScheme.onSurfaceVariant,
                          textStyle: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (isSchedule) ...[
                              const Icon(LucideIcons.calendar, size: 16),
                              const SizedBox(width: 6),
                            ],
                            Flexible(
                              child: Text(
                                action!,
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isSchedule) ...[
                              const SizedBox(width: 4),
                              const Icon(LucideIcons.chevronRight, size: 16),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // Hairline as a plain box: a header `Divider` would be counted as a
          // stats row separator elsewhere and can't be themed per board.
          Container(height: 1, color: hairline),
          Padding(
            padding: isSchedule
                ? const EdgeInsets.fromLTRB(12, 12, 12, 12)
                : const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// Quiet body copy for an empty board.
class OverviewBoardNote extends StatelessWidget {
  const OverviewBoardNote(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: Theme.of(context).colorScheme.surfaceContainerLow,
          child: Icon(
            LucideIcons.calendarDays,
            size: 18,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    ),
  );
}

/// One tappable figure in the Overview "At a glance" board.
class OverviewStatItem {
  const OverviewStatItem({
    required this.label,
    required this.value,
    required this.path,
  });
  final String label;
  final int? value;
  final String path;
}

/// Responsive Overview figure grid. Defaults to a single row (or column on
/// narrow screens); pass [columns] for a fixed multi-column grid (e.g. 2×2).
class OverviewStatsGrid extends StatelessWidget {
  const OverviewStatsGrid({
    super.key,
    required this.items,
    required this.onOpen,
    this.columns,
  });
  final List<OverviewStatItem> items;
  final ValueChanged<String> onOpen;
  final int? columns;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final row =
          constraints.maxWidth >= 330 &&
          MediaQuery.textScalerOf(context).scale(13) <= 16;
      final theme = Theme.of(context);
      final accent = theme.colorScheme.primary;
      final tiles = [
        for (final item in items)
          Semantics(
            button: true,
            child: InkWell(
              onTap: () => onOpen(item.path),
              focusColor: theme.colorScheme.primary.withValues(alpha: 0.12),
              hoverColor: theme.colorScheme.primary.withValues(alpha: 0.04),
              highlightColor: theme.colorScheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(ZTokens.radiusMd),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(6, 10, 6, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      item.value?.toString() ?? '—',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color: accent,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.label.toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.7,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (item.value == null)
                      Text(
                        'Unavailable',
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
      ];
      final dividerColor = theme.colorScheme.outline.withValues(alpha: 0.7);
      final columns = this.columns;
      if (columns != null && columns > 0) {
        final rows = <Widget>[];
        for (var start = 0; start < tiles.length; start += columns) {
          final end = (start + columns).clamp(0, tiles.length);
          final rowTiles = tiles.sublist(start, end);
          if (rows.isNotEmpty) {
            rows.add(
              Divider(
                height: 1,
                indent: 14,
                endIndent: 14,
                color: dividerColor,
              ),
            );
          }
          rows.add(
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < rowTiles.length; i++) ...[
                    if (i > 0)
                      VerticalDivider(
                        width: 1,
                        thickness: 1,
                        indent: 10,
                        endIndent: 10,
                        color: dividerColor,
                      ),
                    Expanded(child: rowTiles[i]),
                  ],
                  // Keep the final partial row at the same cell width.
                  for (var i = rowTiles.length; i < columns; i++) ...[
                    if (i > 0)
                      VerticalDivider(
                        width: 1,
                        thickness: 1,
                        indent: 10,
                        endIndent: 10,
                        color: dividerColor,
                      ),
                    const Expanded(child: SizedBox.shrink()),
                  ],
                ],
              ),
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: rows,
        );
      }
      return row
          ? IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < tiles.length; i++) ...[
                    if (i > 0)
                      VerticalDivider(
                        width: 1,
                        thickness: 1,
                        indent: 10,
                        endIndent: 10,
                        color: dividerColor,
                      ),
                    Expanded(child: tiles[i]),
                  ],
                ],
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < tiles.length; i++) ...[
                  if (i > 0)
                    Divider(
                      height: 1,
                      indent: 14,
                      endIndent: 14,
                      color: dividerColor,
                    ),
                  tiles[i],
                ],
              ],
            );
    },
  );
}

/// Tappable attention row with an accent icon tile and chevron.
class OverviewAttentionRow extends StatelessWidget {
  const OverviewAttentionRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = ZDesk.dataAccent(context);
    return Material(
      color: Colors.transparent,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(ZTokens.radiusMd),
          focusColor: accent.withValues(alpha: 0.12),
          hoverColor: accent.withValues(alpha: 0.04),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(ZTokens.radiusMd),
                  ),
                  child: Icon(icon, size: 17, color: accent),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: theme.textTheme.titleSmall),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronRight,
                  size: 18,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class OverviewActionRequired extends StatelessWidget {
  const OverviewActionRequired({
    super.key,
    required this.message,
    required this.action,
    required this.onAction,
  });
  final String message;
  final String action;
  final VoidCallback onAction;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(message),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton(onPressed: onAction, child: Text(action)),
      ),
    ],
  );
}

/// Green "nothing needs action" callout, one message per board.
class OverviewAllClear extends StatelessWidget {
  const OverviewAllClear({super.key, required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const accent = Color(0xFF059669);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: ZDesk.isDark(context) ? 0.10 : 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.32)),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.circleCheck, size: 16, color: accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodySmall?.copyWith(height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}

class OverviewInlineError extends StatelessWidget {
  const OverviewInlineError({
    super.key,
    required this.error,
    required this.retry,
  });
  final Object error;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          userMessage(error),
          style: Theme.of(context).textTheme.bodySmall
              ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        TextButton(onPressed: retry, child: const Text('Try again')),
      ],
    ),
  );
}
