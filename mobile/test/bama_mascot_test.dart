import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/design/bama_mascot.dart';

Widget wrapMascot({bool reducedMotion = false, bool accessible = false}) {
  return MaterialApp(
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: reducedMotion,
          accessibleNavigation: accessible,
        ),
        child: const Scaffold(body: Center(child: BamaMascot(size: 96))),
      ),
    ),
  );
}

String? shownAsset(WidgetTester tester) {
  final image = tester.widget<Image>(find.byType(Image));
  final provider = image.image;
  return provider is AssetImage ? provider.assetName : null;
}

void main() {
  testWidgets('renders the new Bama avatar with Bama semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(wrapMascot());
    expect(shownAsset(tester), BamaMascot.normalAsset);
    expect(find.bySemanticsLabel("Bama's profile mascot"), findsOneWidget);
    semantics.dispose();
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('keeps the new avatar static', (tester) async {
    await tester.pumpWidget(wrapMascot());
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 100));
      expect(shownAsset(tester), 'assets/mascots/bama-v2.png');
    }
    await tester.pumpWidget(const SizedBox());
  });

  for (final mode in ['reduced motion', 'accessible navigation']) {
    testWidgets('$mode keeps the mascot static', (tester) async {
      await tester.pumpWidget(
        wrapMascot(
          reducedMotion: mode == 'reduced motion',
          accessible: mode == 'accessible navigation',
        ),
      );
      for (var i = 0; i < 70; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        expect(shownAsset(tester), BamaMascot.normalAsset);
      }
      await tester.pumpWidget(const SizedBox());
    });
  }
}
