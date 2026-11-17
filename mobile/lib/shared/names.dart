// Learner-name helpers for advisory and teaching desks.
//
// Direct port of frontend/src/lib/names.ts: records are stored as typed at
// enlistment ("Juan Dela Cruz") but desks read surname-first ("Dela Cruz,
// Juan"). Names that already carry a comma are treated as surname-first and
// re-normalised to one space after it. Filipino/foreign surname particles stay
// attached to the surname ("Juan Dela Cruz" → "Dela Cruz", not "Cruz").

const _surnameParticles = {
  'de',
  'del',
  'dela',
  'delos',
  'delas',
  'da',
  'das',
  'dos',
  'la',
  'las',
  'los',
  'san',
  'santa',
  'sta',
  'sto',
  'van',
  'von',
  'der',
  'den',
  'bin',
  'binti',
  'al',
  'el',
};

String _normalizeParticle(String token) =>
    token.toLowerCase().replaceAll('.', '');

({String surname, String given}) splitLearnerName(String fullName) {
  final trimmed = fullName.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (trimmed.isEmpty) return (surname: '', given: '');

  if (trimmed.contains(',')) {
    final parts = trimmed.split(',');
    return (surname: parts.first.trim(), given: parts.skip(1).join(',').trim());
  }

  final parts = trimmed.split(' ');
  if (parts.length == 1) return (surname: parts.first, given: '');

  var start = parts.length - 1;
  while (start > 1 &&
      _surnameParticles.contains(_normalizeParticle(parts[start - 1]))) {
    start -= 1;
  }

  return (
    surname: parts.skip(start).join(' '),
    given: parts.take(start).join(' '),
  );
}

/// "Juan Dela Cruz" → "Dela Cruz, Juan".
String formatSurnameFirst(String fullName) {
  final parts = splitLearnerName(fullName);
  if (parts.surname.isEmpty) return fullName;
  return parts.given.isEmpty
      ? parts.surname
      : '${parts.surname}, ${parts.given}';
}

/// Alphabetical by surname, then given name.
int compareSurnameFirst(String a, String b) {
  final left = splitLearnerName(a);
  final right = splitLearnerName(b);
  final bySurname = left.surname.toLowerCase().compareTo(
    right.surname.toLowerCase(),
  );
  if (bySurname != 0) return bySurname;
  return left.given.toLowerCase().compareTo(right.given.toLowerCase());
}
