// Learner-portal term selection.
//
// Deliberately the same screen as the adviser workspace's /term: the auth/desk
// palette, heading, school-year dropdown, term cards and selected-term summary.
// It writes the portal term scope (student or selected child) instead of the
// staff workspace term.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session.dart';
import '../../services/portal_service.dart';
import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../auth/auth_flow_ui.dart';
import '../auth/term_select_page.dart';

class PortalTermSelectPage extends ConsumerStatefulWidget {
  const PortalTermSelectPage({super.key});

  @override
  ConsumerState<PortalTermSelectPage> createState() =>
      _PortalTermSelectPageState();
}

class _PortalTermSelectPageState extends ConsumerState<PortalTermSelectPage> {
  String? _yearId;
  String? _termId;

  void _close() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    final role = ref.read(authProvider).role;
    context.go(role == 'parent' ? '/parent/overview' : '/student/overview');
  }

  void _continue(Term term, String? activeTermId) {
    // Picking the server's active term keeps the "follow the current term"
    // behaviour instead of pinning this device to it.
    selectPortalTerm(ref, term.id == activeTermId ? null : term.id);
    ref.read(portalModulePageProvider.notifier).state = 1;
    _close();
  }

  @override
  Widget build(BuildContext context) {
    final termsAsync = ref.watch(portalTermsResultProvider);
    final theme = Theme.of(context);
    return AuthFlowScaffold(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 28),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: theme.brightness == Brightness.dark
                            ? theme.colorScheme.secondary.withValues(alpha: 0.16)
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
                termsAsync.when(
                  loading: () => const ScreenSkeleton(
                    layout: SkeletonLayout.form,
                    label: 'Loading terms',
                    section: true,
                  ),
                  error: (error, _) => ErrorView(
                    message: error,
                    onRetry: () => ref.invalidate(portalTermsResultProvider),
                  ),
                  data: _content,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _content(PortalTermsResult result) {
    if (result.terms.isEmpty) {
      return const ZEmpty(
        icon: Icons.calendar_month_outlined,
        title: 'No terms yet',
        subtitle:
            'Your terms appear here once the school office publishes them.',
      );
    }
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final now = DateTime.now();

    // The portal returns a flat term list; group it into school years so the
    // picker reads exactly like the adviser workspace's.
    final years = <String, List<Term>>{};
    final names = <String, String>{};
    for (final term in result.terms) {
      final staffTerm = Term(
        id: term.id,
        schoolYearId: term.schoolYearId,
        schoolYearName: term.schoolYearName,
        termNumber: term.termNumber,
        startDate: DateTime.tryParse(term.startDate ?? ''),
        endDate: DateTime.tryParse(term.endDate ?? ''),
      );
      names[term.schoolYearId] = term.schoolYearName;
      years.putIfAbsent(term.schoolYearId, () => []).add(staffTerm);
    }
    for (final list in years.values) {
      list.sort((a, b) => a.termNumber.compareTo(b.termNumber));
    }

    Term? find(String? id) {
      for (final list in years.values) {
        for (final term in list) {
          if (term.id == id) return term;
        }
      }
      return null;
    }

    final activeYearId = find(result.activeTermId)?.schoolYearId;
    final initial = find(ref.watch(portalTermIdProvider)) ??
        find(result.activeTermId) ??
        years.values.first.first;
    final yearId = years.containsKey(_yearId) ? _yearId! : initial.schoolYearId;
    final terms = years[yearId] ?? years.values.first;
    final picked = terms.where((term) => term.id == _termId).firstOrNull ??
        terms.where((term) => term.id == initial.id).firstOrNull ??
        terms.first;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const TermFieldLabel(text: 'School year'),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          key: ValueKey('school-year-$yearId'),
          initialValue: yearId,
          isExpanded: true,
          icon: Icon(
            Icons.keyboard_arrow_down_rounded,
            color: colors.onSurfaceVariant,
          ),
          dropdownColor: colors.surface,
          borderRadius: BorderRadius.circular(12),
          items: [
            for (final entry in years.entries)
              DropdownMenuItem(
                value: entry.key,
                child: Text(
                  '${names[entry.key]}${entry.key == activeYearId ? ' (Active)' : ''}',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: colors.onSurface),
                ),
              ),
          ],
          onChanged: (id) => setState(() {
            _yearId = id;
            _termId = null;
          }),
        ),
        const SizedBox(height: 16),
        const TermFieldLabel(text: 'Term'),
        const SizedBox(height: 6),
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
                      selected: picked.id == term.id,
                      onTap: () => setState(() {
                        _yearId = yearId;
                        _termId = term.id;
                      }),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TermSummaryCard(
          term: picked,
          yearName: names[picked.schoolYearId] ?? picked.schoolYearName,
          status: termStatus(picked, now),
          reduceMotion: reduceMotion,
          onTap: () {},
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: () => _continue(picked, result.activeTermId),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF2563EB),
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(46),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  'Continue',
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
