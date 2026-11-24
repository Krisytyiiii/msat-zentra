import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/shared/back_button.dart';
import 'package:zentra_mobile/design/theme.dart';

void main() {
  testWidgets('screen Back has a circular outline and preserves its action', (
    tester,
  ) async {
    var presses = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(leading: ZBackButton(onPressed: () => presses++)),
        ),
      ),
    );
    final button = tester.widget<IconButton>(find.byType(IconButton));
    expect(button.style!.shape!.resolve({}), isA<CircleBorder>());
    expect(button.style!.side!.resolve({})!.color, const Color(0xFFE5E8F0));
    final rect = tester.getRect(find.byType(IconButton));
    expect(rect.width, rect.height);
    await tester.tap(find.byTooltip('Back'));
    expect(presses, 1);
  });

  testWidgets('automatic AppBar back arrows use the same outline', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: zLightTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      Scaffold(appBar: AppBar(title: const Text('Detail'))),
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.byType(BackButton), findsOneWidget);
    final outline = find.descendant(
      of: find.byType(BackButton),
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is Container &&
            widget.decoration is BoxDecoration &&
            (widget.decoration! as BoxDecoration).shape == BoxShape.circle,
      ),
    );
    expect(outline, findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Open'), findsOneWidget);
  });
}
