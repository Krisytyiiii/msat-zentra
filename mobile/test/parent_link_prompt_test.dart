import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/features/parent/parent_link_prompt.dart';
import 'package:zentra_mobile/features/parent/parent_portal_pages.dart';
import 'package:zentra_mobile/services/portal_service.dart';
import 'package:zentra_mobile/shared/models.dart';

void main() {
  testWidgets('an unlinked parent is prompted for the learner LRN', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          selectedChildProvider.overrideWith((ref) => null),
          parentChildrenProvider.overrideWith((ref) async => <PortalChild>[]),
          parentLinkRequestsProvider
              .overrideWith((ref) async => <PortalLinkRequest>[]),
        ],
        child: const MaterialApp(home: ParentOverviewPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(ParentLinkPrompt), findsOneWidget);
    expect(find.text('No linked learners'), findsOneWidget);
    expect(find.text('Link a learner'), findsOneWidget);

    await tester.tap(find.text('Link a learner'));
    await tester.pumpAndSettle();

    expect(find.text('Send link request'), findsOneWidget);
    expect(find.byKey(const ValueKey('link-learner-lrn')), findsOneWidget);
  });

  testWidgets('overview greets the guardian and names the monitored learner',
      (tester) async {
    final home = PortalHome.fromJson({
      'learner': {
        'studentId': 's1',
        'name': 'Juan Dela Cruz',
        'lrn': '136130990001',
        'gradeLevel': 'G7',
        'sectionName': 'Rizal',
      },
      'term': {
        'id': 't1',
        'termNumber': 1,
        'schoolYearId': 'sy1',
        'schoolYearName': 'SY 2026-2027',
      },
      'attendance': {'rate': 1, 'present': 0, 'absent': 0, 'late': 0, 'excused': 0, 'total': 0, 'hasMarks': false},
      'moduleCounts': {'all': 0, 'submitted': 0, 'pending': 0, 'overdue': 0},
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          selectedChildProvider.overrideWith((ref) => 's1'),
          parentChildrenProvider.overrideWith((ref) async => <PortalChild>[]),
          parentLinkRequestsProvider
              .overrideWith((ref) async => <PortalLinkRequest>[]),
          parentMeProvider.overrideWith(
            (ref) async => PortalParent(name: 'Maria Dela Cruz'),
          ),
          parentHomeProvider.overrideWith((ref, childId) async => home),
        ],
        child: const MaterialApp(home: ParentOverviewPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome back,\nMaria Dela Cruz.'), findsOneWidget);
    expect(find.text('Monitoring'), findsOneWidget);
    expect(find.text('Juan Dela Cruz'), findsOneWidget);
  });

  testWidgets('pending requests show the approval state and can be cancelled',
      (tester) async {
    final request = PortalLinkRequest(
      id: 'link-1',
      relationship: 'Mother',
      approved: false,
      requestedAt: DateTime.now().toIso8601String(),
      studentId: 's1',
      studentName: 'Juan Dela Cruz',
      lrn: '136130990001',
      gradeLevel: 'G7',
      sectionName: 'Rizal',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          selectedChildProvider.overrideWith((ref) => null),
          parentChildrenProvider.overrideWith((ref) async => <PortalChild>[]),
          parentLinkRequestsProvider
              .overrideWith((ref) async => <PortalLinkRequest>[request]),
        ],
        child: const MaterialApp(home: ParentOverviewPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(ParentLinkPrompt), findsOneWidget);
    expect(find.text('Waiting for approval'), findsOneWidget);
    expect(find.text('Juan Dela Cruz · LRN 136130990001'), findsOneWidget);
    expect(find.byKey(const ValueKey('parent-link-cancel-link-1')), findsOneWidget);
    expect(find.text('Link a learner'), findsNothing);
  });
}
