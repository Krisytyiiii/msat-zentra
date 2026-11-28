import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zentra_mobile/shared/identity_tile.dart';

void main() {
  test('identity hues are stable and learner-specific', () {
    final ana = zIdentityHue('123456789012');
    expect(zIdentityHue('123456789012'), ana);
    expect(zIdentityColor('123456789012'), zIdentityPalette[ana]);
    final colors = {
      for (final key in [
        '123456789012',
        '123456789013',
        '123456789014',
        '123456789015',
        '123456789016',
        '123456789017',
        '123456789018',
        '123456789019',
        'Mira Learner',
        'Reogie Akero Mabawad',
      ])
        zIdentityColor(key),
    };
    expect(colors.length, greaterThan(3));
    expect(zIdentityHue(''), 0);
  });

  test('initials take the first and last word', () {
    expect(zInitials('Reogie Akero Mabawad'), 'RM');
    expect(zInitials('Mira Learner'), 'ML');
    expect(zInitials('  solo  '), 'S');
    expect(zInitials('   '), '?');
  });

  testWidgets('tile renders saturated fill with white initials', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ZIdentityTile(name: 'Mira Learner', seed: '123456789012'),
        ),
      ),
    );
    final box = tester.widget<Container>(
      find.descendant(
        of: find.byType(ZIdentityTile),
        matching: find.byType(Container),
      ),
    );
    final decoration = box.decoration! as BoxDecoration;
    expect(
      decoration.color,
      zIdentityColor('123456789012'),
    );
    expect(decoration.borderRadius, BorderRadius.circular(38 * 0.28));
    final text = tester.widget<Text>(find.text('ML'));
    expect(text.style?.color, Colors.white);
    expect(text.style?.fontWeight, FontWeight.w700);
  });
}
