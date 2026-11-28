import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../design/status_palette.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';
import 'auth_flow_ui.dart';

String? termStatus(Term term, DateTime now) {
  final start = term.startDate;
  final end = term.endDate;
  if (start == null || end == null || end.isBefore(start)) return null;
  if (now.isBefore(start)) return 'Upcoming';
  if (now.isAfter(end)) return 'Ended';
  return 'Ongoing';
}

Term? defaultTerm(List<SchoolYear> years, DateTime now) {
  for (final year in years) {
    for (final term in year.terms) {
      if (termStatus(term, now) == 'Ongoing') return term;
    }
  }
  if (years.isEmpty) return null;
  final year = years.where((year) => year.isActive).firstOrNull ?? years.first;
  final terms = [...year.terms]
    ..sort((a, b) => a.termNumber.compareTo(b.termNumber));
  return terms.firstOrNull;
}

class TermSelectPage extends ConsumerStatefulWidget {
  const TermSelectPage({super.key});

  @override
  ConsumerState<TermSelectPage> createState() => _TermSelectPageState();
}

class _TermSelectPageState extends ConsumerState<TermSelectPage>
    with SingleTickerProviderStateMixin {
  late final _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 460),
    reverseDuration: const Duration(milliseconds: 300),
  );
  late final _opacity = _entrance.drive(CurveTween(curve: Curves.easeOut));
  late final _position = Tween(
    begin: const Offset(0, 0.025),
    end: Offset.zero,
  ).animate(_entrance.drive(CurveTween(curve: Curves.easeOutCubic)));
  String? _yearId;
  String? _termId;
  String? _error;
  bool _saving = false;
  bool _entered = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_saving && MediaQuery.disableAnimationsOf(context)) {
      _entrance.value = 1;
      _entered = true;
    } else if (!_entered) {
      _entered = true;
      _entrance.forward();
    }
  }

  @override
  void dispose() {
    _entrance.dispose();
    super.dispose();
  }

  Future<void> _continue(Term selected, SchoolYear year) async {
    if (_saving) return;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (!reduceMotion) {
        await _entrance.reverse(from: 1).orCancel;
      }
      if (!mounted) return;
      await ref
          .read(termProvider.notifier)
          .select(
            Term(
              id: selected.id,
              schoolYearId: year.id,
              schoolYearName: year.name,
              termNumber: selected.termNumber,
              startDate: selected.startDate,
              endDate: selected.endDate,
            ),
          );
      if (mounted) context.go('/gate');
    } on TickerCanceled {
      // The route was disposed during its exit animation; never persist a pick.
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = userMessage(
          error,
          fallback: 'We couldn’t open this term. Please try again.',
        );
      });
      if (reduceMotion) {
        _entrance.value = 1;
      } else {
        _entrance.forward();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final years = ref.watch(schoolYearsProvider);
    final current = ref.watch(termProvider);
    final theme = Theme.of(context);
    return PopScope(
      canPop: !_saving,
      child: AuthFlowScaffold(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 28),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: FadeTransition(
                opacity: _opacity,
                child: SlideTransition(
                  position: _position,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: theme.brightness == Brightness.dark
                                  ? theme.colorScheme.secondary.withValues(
                                      alpha: 0.16,
                                    )
                                  : const Color(0xFFE8EFFF),
                              borderRadius: BorderRadius.circular(11),
                            ),
                            child: Icon(
                              LucideIcons.calendarRange,
                              size: 18,
                              color: theme.brightness == Brightness.dark
                                  ? const Color(0xFFA9C9FF)
                                  : const Color(0xFF2442A8),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Select term',
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.4,
                                    color: theme.colorScheme.onSurface,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  'Choose which term your workspace will display.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    height: 1.3,
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      years.when(
                        loading: () => const ScreenSkeleton(
                          layout: SkeletonLayout.form,
                          label: 'Loading school years',
                          section: true,
                        ),
                        error: (error, _) => ErrorView(
                          message: error,
                          onRetry: () => ref.invalidate(schoolYearsProvider),
                        ),
                        data: (list) => _content(list, current),
                      ),
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

  Widget _content(List<SchoolYear> years, Term? current) {
    if (years.isEmpty) {
      return const ZEmpty(
        icon: Icons.calendar_month_outlined,
        title: 'No school years yet',
        subtitle:
            'Please ask the school office to set up a school year before continuing.',
      );
    }
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final now = DateTime.now();
    final validCurrent = years
        .expand((year) => year.terms)
        .where(
          (term) =>
              term.id == current?.id &&
              term.schoolYearId == current?.schoolYearId,
        )
        .firstOrNull;
    final initial = validCurrent ?? defaultTerm(years, now);
    final year =
        years.where((year) => year.id == _yearId).firstOrNull ??
        years.where((year) => year.id == initial?.schoolYearId).firstOrNull ??
        years.where((year) => year.isActive).firstOrNull ??
        years.first;
    final terms = [...year.terms]
      ..sort((a, b) => a.termNumber.compareTo(b.termNumber));
    final picked =
        terms.where((term) => term.id == _termId).firstOrNull ??
        terms.where((term) => term.id == initial?.id).firstOrNull ??
        defaultTerm([year], now);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return IgnorePointer(
      ignoring: _saving,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const TermFieldLabel(text: 'School year'),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            key: ValueKey('school-year-${year.id}'),
            initialValue: year.id,
            isExpanded: true,
            icon: Icon(
              Icons.keyboard_arrow_down_rounded,
              color: colors.onSurfaceVariant,
            ),
            dropdownColor: colors.surface,
            borderRadius: BorderRadius.circular(12),
            items: [
              for (final year in years)
                DropdownMenuItem(
                  value: year.id,
                  child: Text(
                    '${year.name}${year.isActive ? ' (Active)' : ''}',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, color: colors.onSurface),
                  ),
                ),
            ],
            onChanged: _saving
                ? null
                : (id) => setState(() {
                    _yearId = id;
                    _termId = null;
                    _error = null;
                  }),
          ),
          const SizedBox(height: 16),
          const TermFieldLabel(text: 'Term'),
          const SizedBox(height: 6),
          if (terms.isEmpty)
            const ZEmpty(
              icon: Icons.event_note_outlined,
              title: 'No terms in this school year',
              subtitle:
                  'Choose another school year, or ask the school office to add its terms.',
            )
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final term in terms)
                        Expanded(
                          child: Padding(
                            padding: EdgeInsets.only(
                              right: term == terms.last ? 0 : 8,
                            ),
                            child: TermOption(
                              term: term,
                              status: termStatus(term, now),
                              selected: picked?.id == term.id,
                              onTap: () => setState(() {
                                _yearId = year.id;
                                _termId = term.id;
                                _error = null;
                              }),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                if (picked != null) ...[
                  const SizedBox(height: 12),
                  TermSummaryCard(
                    term: picked,
                    yearName: year.name,
                    status: termStatus(picked, now),
                    reduceMotion: reduceMotion,
                    onTap: () {},
                  ),
                ],
              ],
            ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Semantics(
              liveRegion: true,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: colors.error.withValues(alpha: 0.09),
                  border: Border.all(
                    color: colors.error.withValues(alpha: 0.3),
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.error_outline, size: 15, color: colors.error),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        _error!,
                        style: TextStyle(color: colors.error, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: picked == null || _saving
                ? null
                : () => _continue(picked, year),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFF2563EB).withValues(alpha: 0.45),
              disabledForegroundColor: Colors.white.withValues(alpha: 0.6),
              minimumSize: const Size.fromHeight(46),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_saving) ...[
                  const AuthSpinner(size: 15, color: Colors.white),
                  const SizedBox(width: 9),
                ],
                Flexible(
                  child: Text(
                    _saving ? 'Opening workspace…' : 'Continue',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class TermFieldLabel extends StatelessWidget {
  const TermFieldLabel({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.labelLarge?.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    ),
  );
}

/// Compact workspace card-style term option: surface fill, hairline border,
/// amber edge and wash when selected.
class TermOption extends StatelessWidget {
  const TermOption({
    super.key,
    required this.term,
    required this.status,
    required this.selected,
    required this.onTap,
  });
  final Term term;
  final String? status;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final dark = theme.brightness == Brightness.dark;
    final accent = colors.primary;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        color: selected
            ? (dark ? accent.withValues(alpha: 0.16) : const Color(0xFFFFF6E5))
            : colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: selected ? accent : colors.outline,
            width: selected ? 1.5 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey('term-${term.id}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 9),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Term ${term.termNumber}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected ? accent : colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  status ?? 'No dates',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    color: colors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class TermSummaryCard extends StatelessWidget {
  const TermSummaryCard({
    super.key,
    required this.term,
    required this.yearName,
    required this.status,
    required this.reduceMotion,
    required this.onTap,
  });
  final Term term;
  final String yearName;
  final String? status;
  final bool reduceMotion;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final start = term.startDate;
    final end = term.endDate;
    // School dates use Philippine calendar dates, not the device's time zone.
    String date(DateTime value) =>
        DateFormat('MMM d, y')
            .format(value.toUtc().add(const Duration(hours: 8)));
    final range = start == null || end == null || end.isBefore(start)
        ? 'Dates not set'
        : '${date(start)} – ${date(end)}';
    return Semantics(
      selected: true,
      inMutuallyExclusiveGroup: true,
      child: AnimatedContainer(
        duration: reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 160),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.outline),
        ),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            key: const ValueKey('selected-term-details'),
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 10,
                    runSpacing: 6,
                    children: [
                      Text(
                        'Selected term · ${term.termNumber}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                      if (status != null)
                        ZPill(
                          tone: switch (status) {
                            'Ongoing' => StatusTone.green,
                            'Upcoming' => StatusTone.amber,
                            _ => StatusTone.neutral,
                          },
                          child: Text(status!),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    yearName,
                    style: TextStyle(
                      color: colors.onSurfaceVariant,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(
                        LucideIcons.calendarDays,
                        size: 13,
                        color: colors.onSurfaceVariant,
                      ),
                      const SizedBox(width: 7),
                      Flexible(
                        child: Text(
                          range,
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Icon(
                        Icons.check_circle,
                        color: colors.primary,
                        size: 14,
                      ),
                      const SizedBox(width: 7),
                      Flexible(
                        child: Text(
                          'Selected',
                          style: TextStyle(
                            color: colors.primary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
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
