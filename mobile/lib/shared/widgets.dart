// Zentra component library — web-matched (monochrome ink, 6px, 1px borders).
// Web visuals, with 48px interactive targets and scalable metadata chips.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../design/tokens.dart';
import '../design/status_palette.dart';
import 'user_messages.dart';
import 'skeletons.dart';
export 'skeletons.dart';
export 'back_button.dart';

// --- Legacy names kept (restyled to web tokens) ---

class LoadingView extends StatelessWidget {
  final String label;
  final SkeletonLayout? layout;
  const LoadingView({super.key, this.label = 'Loading…', this.layout});
  @override
  Widget build(BuildContext context) =>
      ScreenSkeleton(layout: layout, label: label);
}

class ErrorView extends StatelessWidget {
  final Object? message;
  final VoidCallback? onRetry;
  const ErrorView({super.key, required this.message, this.onRetry});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Align(
        alignment: Alignment.center,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFDFE7F5)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Color(0xFFFFF1F1),
                  ),
                  child: const Icon(
                    Icons.error_outline,
                    size: 20,
                    color: Color(0xFFDC2626),
                  ),
                ),
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    userMessage(message),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.45,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF192034),
                    ),
                  ),
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: 14),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF4263F0),
                      foregroundColor: Colors.white,
                      minimumSize: const Size(0, 48),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: onRetry,
                    child: const Text('Try again'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RiskBadge extends StatelessWidget {
  final String level;
  const RiskBadge({super.key, required this.level});
  @override
  Widget build(BuildContext context) =>
      ZStatusPill(text: level, tone: riskTone(level), badge: true);
}

/// Mobile port of the web shared `Pill` (`frontend/src/components/ui/pill.tsx`):
/// one rectangle chip for compact metadata (LRN, section, risk level, term, …).
/// Shape, padding, type size and tone families match the web chip so a value
/// reads the same on both clients; `tone` only changes the colour family.
///
/// A `label` names the field: it becomes the screen-reader label and shows in a
/// long-press tooltip (the web chip's hover tooltip).
class ZPill extends StatelessWidget {
  const ZPill({
    super.key,
    required this.child,
    this.tone = StatusTone.neutral,
    this.label,
    this.badge = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
  });

  final Widget child;
  final StatusTone tone;

  /// Field name (e.g. "School year", "Section"), not the value on the chip.
  final String? label;

  /// Rounded-full legacy chip (web `Badge`) instead of the shared rectangle.
  final bool badge;

  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = statusColors(tone, Theme.of(context), badge: badge);
    final pill = Container(
      constraints: const BoxConstraints(minHeight: 20),
      padding: padding,
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(
          badge ? ZTokens.radiusPill : ZTokens.radiusMd,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: DefaultTextStyle.merge(
              style: TextStyle(
                color: colors.foreground,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
              child: IconTheme.merge(
                data: IconThemeData(color: colors.foreground, size: 12),
                child: child,
              ),
            ),
          ),
        ],
      ),
    );
    if (label == null) return pill;
    return Tooltip(
      message: label!,
      triggerMode: TooltipTriggerMode.longPress,
      waitDuration: const Duration(milliseconds: 100),
      child: pill,
    );
  }
}

enum ScopePillKind { schoolYear, term, grade }

/// Consistent content title, separate from the persistent navigation AppBar.
class ZContentHeader extends StatelessWidget {
  const ZContentHeader({
    super.key, required this.title, required this.icon,
    this.description, this.trailing, this.titleMetadata = const [], this.titleTrailing,
  });
  final String title;
  final IconData icon;
  final String? description;
  final Widget? trailing;
  final List<Widget> titleMetadata;
  final Widget? titleTrailing;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.white,
    child: LayoutBuilder(builder: (context, constraints) {
      final heading = Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46, height: 46,
            decoration: BoxDecoration(color: const Color(0xFFE8EFFF),
              borderRadius: BorderRadius.circular(16)),
            child: Icon(icon, size: 24, color: const Color(0xFF2442A8)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(title, style: const TextStyle(fontSize: 22, height: 1.2,
                    fontWeight: FontWeight.w700, color: Color(0xFF171C36), letterSpacing: -0.5)),
                  ...titleMetadata,
                ])),
              if (titleTrailing != null) ...[
                const SizedBox(width: 8),
                titleTrailing!,
              ],
            ]),
            if (description != null && description!.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(description!, style: const TextStyle(
                fontSize: 11, height: 1.3, color: Color(0xFF626B82))),
            ],
          ])),
        ],
      );
      if (trailing == null) return heading;
      if (constraints.maxWidth < 360 || MediaQuery.textScalerOf(context).scale(22) > 28) {
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          heading, const SizedBox(height: 8),
          Align(alignment: Alignment.centerRight, child: trailing),
        ]);
      }
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: heading), const SizedBox(width: 8), trailing!,
      ]);
    }),
  );
}

/// Fixed light capsule for screen scope, separate from semantic status chips.
class ZScopePill extends StatelessWidget {
  const ZScopePill({super.key, required this.text, required this.kind, this.label, this.compact = false});
  final String text;
  final ScopePillKind kind;
  final String? label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final amber = kind == ScopePillKind.term;
    final violet = kind == ScopePillKind.grade;
    final foreground = amber ? const Color(0xFFB45309) : violet ? const Color(0xFF7C3AED) : const Color(0xFF2563EB);
    final fieldLabel = label ?? switch (kind) {
      ScopePillKind.schoolYear => 'School year',
      ScopePillKind.term => 'Term',
      ScopePillKind.grade => 'Grade level',
    };
    return Tooltip(
      message: fieldLabel,
      triggerMode: TooltipTriggerMode.longPress,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: compact ? 7 : 10, vertical: compact ? 3 : 5),
        decoration: BoxDecoration(
          color: amber ? const Color(0xFFFFF6E5) : violet ? const Color(0xFFF5F3FF) : const Color(0xFFEAF2FF),
          border: Border.all(color: amber ? const Color(0xFFFDE6B0) : violet ? const Color(0xFFDDD6FE) : const Color(0xFFD4E4FF)),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          ExcludeSemantics(child: Icon(switch (kind) {
            ScopePillKind.schoolYear => LucideIcons.calendarDays,
            ScopePillKind.term => LucideIcons.bookOpen,
            ScopePillKind.grade => LucideIcons.graduationCap,
          }, size: compact ? 11 : 13, color: foreground)),
          SizedBox(width: compact ? 4 : 5),
          Flexible(child: Text(text, style: TextStyle(
            fontSize: compact ? 11 : 12, fontWeight: FontWeight.w600, color: foreground))),
        ]),
      ),
    );
  }
}

class ZStatusPill extends StatelessWidget {
  const ZStatusPill({
    super.key,
    required this.text,
    this.tone = StatusTone.neutral,
    this.badge = false,
    this.label,
  });
  final String text;
  final StatusTone tone;
  final bool badge;
  final String? label;

  @override
  Widget build(BuildContext context) =>
      ZPill(tone: tone, label: label, badge: badge, child: Text(text));
}

class FlagChip extends StatelessWidget {
  final String flag; // academic | attendance | behavioral
  const FlagChip({super.key, required this.flag});
  @override
  Widget build(BuildContext context) => ZStatusPill(
    text: flag.replaceAll('_', ' '),
    tone: switch (flag.toLowerCase()) {
      'academic' => StatusTone.amber,
      'attendance' => StatusTone.green,
      'behavioral' => StatusTone.blue,
      _ => statusTone(flag),
    },
  );
}

class PendingChip extends StatelessWidget {
  final int count;
  const PendingChip({super.key, required this.count});
  @override
  Widget build(BuildContext context) {
    if (count == 0) return const SizedBox.shrink();
    return Chip(
      label: Text('$count pending sync', style: const TextStyle(fontSize: 11)),
      avatar: const Icon(Icons.cloud_upload_outlined, size: 14),
      visualDensity: VisualDensity.compact,
    );
  }
}

// --- New web-ports ---

class ZCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  const ZCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final content = Padding(padding: padding, child: child);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : Semantics(
              button: true,
              child: InkWell(
                customBorder: Theme.of(context).cardTheme.shape,
                onTap: onTap,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: ZTokens.controlH,
                  ),
                  child: content,
                ),
              ),
            ),
    );
  }
}

class ZKpi extends StatelessWidget {
  final String value;
  final String label;
  final String? desc;
  final IconData icon;
  const ZKpi({
    super.key,
    required this.value,
    required this.label,
    this.desc,
    required this.icon,
  });
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ZCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(ZTokens.radiusMd),
              color: theme.colorScheme.surfaceContainerLow,
            ),
            child: Icon(icon, size: 18),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          Text(
            label.toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              letterSpacing: 0.4,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (desc != null) Text(desc!, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

class ZSearchField extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  const ZSearchField({
    super.key,
    this.hint = 'Search…',
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => TextField(
    decoration: InputDecoration(
      prefixIcon: const Icon(Icons.search, size: 18),
      hintText: hint,
    ),
    onChanged: onChanged,
  );
}

/// Shared white/blue "nothing here yet" card. Renders inline inside a section
/// (`compact: true`) or centred on a page through [ZEmptyPage].
class ZEmpty extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// Section-level sizing: smaller icon and padding, so it can sit inside a
  /// card column without pushing the rest of the section down.
  final bool compact;

  const ZEmpty({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.center,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 14 : 20,
            vertical: compact ? 14 : 24,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFDFE7F5)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: EdgeInsets.all(compact ? 8 : 10),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFFEAF0FF),
                ),
                child: Icon(
                  icon,
                  size: compact ? 18 : 20,
                  color: const Color(0xFF4263F0),
                ),
              ),
              SizedBox(height: compact ? 8 : 12),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF192034),
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.5,
                    color: Color(0xFF71809B),
                  ),
                ),
              ],
              if (actionLabel != null) ...[
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF4263F0),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: onAction, child: Text(actionLabel!)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Page-level empty state: centres [ZEmpty] in the space the page has left
/// under its header, still scrolls when text is scaled up, and can pull to
/// refresh so an otherwise empty desk is not stuck without a reload path.
class ZEmptyPage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Future<void> Function()? onRefresh;

  const ZEmptyPage({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.onRefresh,
  });

  static const _padding = EdgeInsets.all(24);

  @override
  Widget build(BuildContext context) {
    final content = LayoutBuilder(
      builder: (context, constraints) {
        // Inside an unbounded parent (a plain ListView) there is nothing to
        // centre against, so the callout keeps its natural height.
        final viewport = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 0.0;
        final minHeight = viewport > _padding.vertical
            ? viewport - _padding.vertical
            : 0.0;
        return SingleChildScrollView(
          physics: onRefresh == null
              ? const ClampingScrollPhysics()
              : const AlwaysScrollableScrollPhysics(),
          padding: _padding,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: minHeight),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: ZEmpty(
                  icon: icon,
                  title: title,
                  subtitle: subtitle,
                  actionLabel: actionLabel,
                  onAction: onAction,
                ),
              ),
            ),
          ),
        );
      },
    );
    final refresh = onRefresh;
    if (refresh == null) return content;
    return RefreshIndicator(onRefresh: refresh, child: content);
  }
}

class ZSkeletonRow extends StatelessWidget {
  const ZSkeletonRow({super.key});
  @override
  Widget build(BuildContext context) {
    return const ScreenSkeleton(
      layout: SkeletonLayout.notifications,
      section: true,
      count: 1,
    );
  }
}

class ZSkeletonList extends StatelessWidget {
  final int count;
  const ZSkeletonList({super.key, this.count = 5});
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: ScreenSkeleton(section: true, count: count),
  );
}

class SegTabs<T> extends StatelessWidget {
  final List<T> values;
  final List<String> labels;
  final T selected;
  final ValueChanged<T> onChanged;
  const SegTabs({
    super.key,
    required this.values,
    required this.labels,
    required this.selected,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(ZTokens.radiusLg),
        color: theme.colorScheme.surfaceContainerLow,
      ),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (var i = 0; i < values.length; i++)
            Semantics(
              checked: values[i] == selected,
              inMutuallyExclusiveGroup: true,
              child: TextButton(
                onPressed: () => onChanged(values[i]),
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, ZTokens.controlH),
                  foregroundColor: theme.colorScheme.onSurface,
                  backgroundColor: values[i] == selected
                      ? theme.colorScheme.surface
                      : Colors.transparent,
                  side: values[i] == selected
                      ? BorderSide(color: theme.colorScheme.outline)
                      : BorderSide.none,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(ZTokens.radiusMd),
                  ),
                ),
                child: Text(
                  labels[i],
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
