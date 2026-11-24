import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/core/notifications.dart';
import 'package:zentra_mobile/core/session.dart';
import 'package:zentra_mobile/design/shell.dart';
import 'package:zentra_mobile/design/theme.dart';

void main() {
  testWidgets('notifications opens a full-screen light inbox with Back and mark-all', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        overviewProvider.overrideWith((ref) async => {'isAdviser': true}),
        notificationsProvider.overrideWith((ref) async => [
          const ZNotification(
            id: 'n', type: 'referral', message: 'A referral update',
            isRead: false, createdAt: '2026-11-24T08:00:00Z',
          ),
        ]),
      ],
      child: MaterialApp(
        theme: zDarkTheme(),
        home: Scaffold(body: Consumer(builder: (context, ref, _) => TextButton(
          onPressed: () => showZNotifications(context, ref),
          child: const Text('Open'),
        ))),
      ),
    ));
    final container = ProviderScope.containerOf(tester.element(find.byType(Consumer)));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('A referral update'), findsOneWidget);
    expect(find.byTooltip('Mark all read'), findsOneWidget);
    expect(find.byType(BottomSheet), findsNothing);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    final page = find.ancestor(of: find.text('Notifications'), matching: find.byType(Scaffold)).first;
    expect(tester.getSize(page).height, tester.view.physicalSize.height /
        tester.view.devicePixelRatio);
    expect(container.read(staffNavigationHiddenProvider), isTrue);
    expect(find.byTooltip('Close notifications'), findsNothing);
    expect(
      (tester.getCenter(find.byTooltip('Mark all read')).dy -
          tester.getCenter(find.text('Notifications')).dy).abs(),
      lessThan(8),
    );
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(container.read(staffNavigationHiddenProvider), isFalse);
    expect(tester.takeException(), isNull);
  });
}
