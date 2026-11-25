import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:zentra_mobile/shared/widgets.dart';

void main() {
  for (final dark in [false, true]) {
    testWidgets('scope capsules match scanner colors and icons, dark=$dark', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 600);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(
            brightness: dark ? Brightness.dark : Brightness.light,
          ),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: const Scaffold(
            body: Padding(
              padding: EdgeInsets.all(12),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ZScopePill(
                    text: 'SY 2026–2027',
                    kind: ScopePillKind.schoolYear,
                  ),
                  ZScopePill(text: 'Term 2', kind: ScopePillKind.term),
                  ZScopePill(text: 'G7', kind: ScopePillKind.grade),
                  ZStatusPill(text: 'Pending'),
                ],
              ),
            ),
          ),
        ),
      );
      expect(find.byIcon(LucideIcons.calendarDays), findsOneWidget);
      expect(find.byIcon(LucideIcons.bookOpen), findsOneWidget);
      expect(find.byIcon(LucideIcons.graduationCap), findsOneWidget);
      expect(find.byTooltip('School year'), findsOneWidget);
      expect(find.byTooltip('Term'), findsOneWidget);
      expect(find.byTooltip('Grade level'), findsOneWidget);
      for (final capsule in tester.widgetList<ZScopePill>(
        find.byType(ZScopePill),
      )) {
        final decoration =
            tester
                    .widget<Container>(
                      find.descendant(
                        of: find.byWidget(capsule),
                        matching: find.byType(Container),
                      ),
                    )
                    .decoration!
                as BoxDecoration;
        expect(decoration.borderRadius, BorderRadius.circular(999));
        expect(
          decoration.color,
          capsule.kind == ScopePillKind.term
              ? const Color(0xFFFFF6E5)
              : capsule.kind == ScopePillKind.grade
              ? const Color(0xFFF5F3FF)
              : const Color(0xFFEAF2FF),
        );
        expect(
          (decoration.border! as Border).top.color,
          capsule.kind == ScopePillKind.term
              ? const Color(0xFFFDE6B0)
              : capsule.kind == ScopePillKind.grade
              ? const Color(0xFFDDD6FE)
              : const Color(0xFFD4E4FF),
        );
        final icon = tester.widget<Icon>(
          find.descendant(of: find.byWidget(capsule), matching: find.byType(Icon)),
        );
        expect(icon.color, switch (capsule.kind) {
          ScopePillKind.schoolYear => const Color(0xFF2563EB),
          ScopePillKind.term => const Color(0xFFB45309),
          ScopePillKind.grade => const Color(0xFF7C3AED),
        });
      }
      final status = tester.widget<Container>(
        find.descendant(
          of: find.byType(ZStatusPill),
          matching: find.byType(Container),
        ),
      );
      expect(
        (status.decoration! as BoxDecoration).borderRadius,
        isNot(BorderRadius.circular(999)),
      );
      expect(tester.takeException(), isNull);
    });
  }
}
