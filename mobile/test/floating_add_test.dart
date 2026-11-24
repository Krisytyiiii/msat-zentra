import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/shared/floating_add.dart';

void main() {
  testWidgets('Add keeps the same blue style and gap across mobile sizes', (
    tester,
  ) async {
    addTearDown(() => savePanelHeight.value = 0);
    for (final width in [320.0, 430.0]) {
      for (final inset in [0.0, 34.0]) {
        for (final historyHeight in [48.0, 316.0]) {
          savePanelHeight.value = historyHeight;
          await tester.pumpWidget(
            MaterialApp(
              home: MediaQuery(
                data: MediaQueryData(
                  size: Size(width, 800),
                  viewPadding: EdgeInsets.only(bottom: inset),
                ),
                child: const Scaffold(
                  body: Stack(
                    children: [
                      Positioned(
                        right: 16,
                        bottom: 0,
                        child: FloatingAdd(
                          child: FloatingActionButton(
                            onPressed: null,
                            child: Icon(Icons.add),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
          final button = find.byType(FloatingActionButton);
          final rect = tester.getRect(button);
          final scaffold = tester.getRect(find.byType(Scaffold));
          final panelTop =
              scaffold.bottom -
              inset.clamp(12.0, double.infinity) -
              68 -
              historyHeight;
          expect(panelTop - rect.bottom, 12);
          expect(scaffold.right - rect.right, 16);
          expect(
            Theme.of(tester.element(button))
                .floatingActionButtonTheme
                .backgroundColor,
            const Color(0xFF2563EB),
          );
        }
      }
    }
  });
}
