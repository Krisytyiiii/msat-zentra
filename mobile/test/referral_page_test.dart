import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/theme.dart';
import 'package:zentra_mobile/features/referral/referral_page.dart';
import 'package:zentra_mobile/shared/widgets.dart';

Future<void> mount(
  WidgetTester tester, {
  List<Map<String, dynamic>> referrals = const [],
  double width = 390,
  double scale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        referralsProvider.overrideWith((ref) async => referrals),
        referableProvider.overrideWith((ref) async => []),
      ],
      child: MaterialApp(
        theme: zWorkspaceTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const Scaffold(body: ReferralPage()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('floating plus replaces the top referral composer card', (
    tester,
  ) async {
    await mount(tester);
    expect(find.text('Refer'), findsNothing);
    expect(
      find.text('Pick a filed anecdotal record, then route it.'),
      findsNothing,
    );
    expect(find.text('Timeline'), findsOneWidget);
    expect(find.byTooltip('New referral'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.text('No referrals this term'), findsOneWidget);
    final fab = tester.getRect(find.byType(FloatingActionButton));
    expect(fab.right, closeTo(374, 1));
    expect(fab.bottom, closeTo(876, 1));
  });

  testWidgets(
    'plus opens the existing composer once, and can reopen after dismissal',
    (tester) async {
      await mount(tester);
      final add = find.byTooltip('New referral');
      final open = tester
          .widget<FloatingActionButton>(find.byType(FloatingActionButton))
          .onPressed!;
      open();
      open(); // prevent duplicate same-frame sheets
      await tester.pumpAndSettle();
      expect(find.text('New referral'), findsOneWidget);
      expect(find.text('Anecdotal record'), findsOneWidget);
      expect(find.text('Send referral'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Send referral'), findsNothing);
      await tester.tap(add);
      await tester.pumpAndSettle();
      expect(find.text('Send referral'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('last timeline card can scroll fully above the floating button', (
    tester,
  ) async {
    await mount(
      tester,
      referrals: [
        for (var i = 0; i < 12; i++)
          {
            'id': 'referral-$i',
            'studentName': 'Learner $i',
            'lrn': '123456789012',
            'targetRole': 'nurse',
            'status': 'pending',
          },
      ],
    );
    await tester.drag(find.byType(ListView), const Offset(0, -6000));
    await tester.pumpAndSettle();
    final last = find.ancestor(
      of: find.text('Learner 11'),
      matching: find.byType(ZCard),
    );
    expect(last, findsOneWidget);
    expect(
      tester.getRect(last).bottom,
      lessThan(tester.getRect(find.byType(FloatingActionButton)).top),
    );
  });

  testWidgets('empty state keeps refresh and fits narrow large-text layouts', (
    tester,
  ) async {
    await mount(tester, width: 320, scale: 1.5);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    expect(find.text('No referrals this term'), findsOneWidget);
    expect(find.byTooltip('New referral'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
