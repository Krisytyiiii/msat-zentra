// Pushed advisory attendance board for one learner.
//
// Mirrors the web desk's right-hand board: tapping a row on
// `/adviser/advisory/attendance` opens this full-screen page (outside the
// shell, one header) with the overall rate, meetup window and per-subject
// cards. A deep link carries `?section=` so the page can reload the matrix
// itself; the row tap also passes the loaded snapshot for an instant paint.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/adviser_navigation.dart';
import '../../shared/widgets.dart';
import 'advisory_attendance_board.dart';
import 'advisory_attendance_data.dart';

/// Snapshot handed over by the list row so the board opens without a refetch.
class AdvisoryAttendanceSelection {
  const AdvisoryAttendanceSelection({
    required this.student,
    required this.subjects,
  });
  final AdvisoryAttendanceStudent student;
  final List<AdvisoryAttendanceSubject> subjects;
}

class AdvisoryAttendanceDetailPage extends ConsumerWidget {
  const AdvisoryAttendanceDetailPage({
    super.key,
    required this.studentId,
    this.sectionId,
    this.student,
    this.subjects,
  });

  final String studentId;
  final String? sectionId;
  final AdvisoryAttendanceStudent? student;
  final List<AdvisoryAttendanceSubject>? subjects;

  void _close(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    if (router != null && router.canPop()) {
      router.pop();
    } else if (router != null) {
      router.go('/adviser/advisory/attendance');
    } else {
      Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canPop = ModalRoute.of(context)?.canPop ?? false;
    final section = sectionId;
    final snapshot = student;

    if (section == null || section.isEmpty) {
      if (snapshot != null && subjects != null) {
        return _page(context, canPop, snapshot, subjects!, null, ref);
      }
      return _unavailable(context, canPop);
    }

    // The list's snapshot paints immediately; the live matrix then keeps the
    // board current (and gives the pull-to-refresh something to reload).
    final matrix = ref.watch(sectionAttendanceMatrixProvider(section));
    final data = matrix.asData?.value;
    AdvisoryAttendanceStudent? live;
    if (data != null) {
      for (final row in data.students) {
        if (row.studentId == studentId) {
          live = row;
          break;
        }
      }
    }
    final effective = live ?? snapshot;

    if (effective == null) {
      if (matrix.hasError) {
        return Scaffold(
          appBar: _bar(context, canPop, 'Advisory attendance'),
          body: AdviserBamaAccess(
            child: ErrorView(
              message: matrix.error,
              onRetry: () =>
                  ref.invalidate(sectionAttendanceMatrixProvider(section)),
            ),
          ),
        );
      }
      if (data != null) return _unavailable(context, canPop);
      return Scaffold(
        appBar: _bar(context, canPop, 'Advisory attendance'),
        body: const AdviserBamaAccess(
          child: LoadingView(layout: SkeletonLayout.attendance),
        ),
      );
    }

    return _page(
      context,
      canPop,
      effective,
      data?.subjects ?? subjects ?? const <AdvisoryAttendanceSubject>[],
      section,
      ref,
    );
  }

  Widget _page(
    BuildContext context,
    bool canPop,
    AdvisoryAttendanceStudent student,
    List<AdvisoryAttendanceSubject> subjects,
    String? section,
    WidgetRef ref,
  ) {
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [AdvisoryAttendanceBoard(student: student, subjects: subjects)],
    );
    return Scaffold(
      appBar: _bar(context, canPop, student.name),
      body: AdviserBamaAccess(
        child: section == null || section.isEmpty
            ? list
            : RefreshIndicator(
                onRefresh: () async {
                  try {
                    await ref
                        .refresh(
                          sectionAttendanceMatrixProvider(section).future,
                        )
                        .then<void>((_) {});
                  } catch (_) {
                    // The board keeps the last good snapshot; the error is
                    // already surfaced by the provider when there is none.
                  }
                },
                child: list,
              ),
      ),
    );
  }

  AppBar _bar(BuildContext context, bool canPop, String title) => AppBar(
    title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
    leading: canPop
        ? null
        : ZBackButton(
            tooltip: 'Close',
            icon: const Icon(Icons.close),
            onPressed: () => _close(context),
          ),
  );

  Widget _unavailable(BuildContext context, bool canPop) => Scaffold(
    appBar: _bar(context, canPop, 'Advisory attendance'),
    body: const AdviserBamaAccess(
      child: ZEmptyPage(
        icon: Icons.person_off_outlined,
        title: 'Learner not available',
        subtitle: 'This learner is not on the advisory attendance board for the selected section.',
      ),
    ),
  );
}
