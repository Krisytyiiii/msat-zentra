// Contextual staff search.
//
// The staff app bar owns exactly one search field. Its behaviour follows the
// current route: desks that can filter their own content (advisory, academic,
// anecdotal, referrals, Bama history) read the query from [ScreenSearchScope]
// and stop rendering an inline field, while every other desk opens a
// role-filtered page finder instead. Scope is provided by `ZentraShell`, so
// standalone page previews and widget tests keep their local search fields.

import 'package:flutter/material.dart';

enum ScreenSearchMode { filter, pages }

@immutable
class ScreenSearchSpec {
  const ScreenSearchSpec.filter(this.title, this.hint)
    : mode = ScreenSearchMode.filter;
  const ScreenSearchSpec.pages(this.title)
    : mode = ScreenSearchMode.pages,
      hint = 'Find a page…';

  /// Title of the screen currently on top, shown where the brand used to be.
  final String title;
  final ScreenSearchMode mode;
  final String hint;

  bool get filtersContent => mode == ScreenSearchMode.filter;
}

/// Resolves the header title and search behaviour for a matched location.
///
/// Kept in one place so every route stays consistent: add new searchable
/// desks here and in [screenSearchCatalog] instead of inside the shell.
ScreenSearchSpec screenSearchSpecFor(String location, [Uri? uri]) {
  switch (location) {
    case '/adviser/advisory':
      return const ScreenSearchSpec.filter(
        'Advisory list',
        'Search name or LRN',
      );
    case '/adviser/academic':
      return const ScreenSearchSpec.filter('Academic', 'Search name or LRN');
    case '/adviser/adm-cases':
      return const ScreenSearchSpec.pages('ADM cases');
    case '/adviser/anecdotal':
      return const ScreenSearchSpec.filter(
        'Anecdotal',
        'Search name, LRN, or section',
      );
    case '/adviser/schedule':
    case '/workspace/schedule':
      return const ScreenSearchSpec.pages('Schedule');
    case '/adviser/bama':
      return const ScreenSearchSpec.pages('Chat with Bama');
    case '/adviser/bama/history':
      return ScreenSearchSpec.filter(
        uri?.queryParameters['type'] == 'grade-flag'
            ? 'Grade flag logs'
            : 'Anecdotal logs',
        'Search chats…',
      );
    case '/adviser/referrals':
      return const ScreenSearchSpec.filter(
        'Referrals',
        'Filter by name, LRN, or role',
      );
    case '/workspace/overview':
      return const ScreenSearchSpec.pages('Overview');
    case '/workspace/classes':
      return const ScreenSearchSpec.pages('Class');
    case '/workspace/gradebook':
      return const ScreenSearchSpec.pages('Gradebook');
    case '/workspace/attendance':
      return const ScreenSearchSpec.pages('Attendance');
    case '/teacher/more':
      return const ScreenSearchSpec.pages('Settings');
  }
  if (location.startsWith('/adviser/students/')) {
    return const ScreenSearchSpec.pages('Student details');
  }
  if (location.startsWith('/workspace/classes/')) {
    return const ScreenSearchSpec.pages('Gradebook');
  }
  final segments = Uri.parse(location).pathSegments;
  final last = segments.isEmpty ? '' : segments.last;
  final title = last.isEmpty
      ? 'Zentra'
      : last
            .replaceAll('-', ' ')
            .split(' ')
            .where((word) => word.isNotEmpty)
            .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
            .join(' ');
  return ScreenSearchSpec.pages(title);
}

@immutable
class ScreenSearchDestination {
  const ScreenSearchDestination(this.label, this.path, this.icon);
  final String label;
  final String path;
  final IconData icon;
}

/// Drawer destinations offered by the page finder, in drawer order.
List<ScreenSearchDestination> screenSearchCatalog({required bool isAdviser}) {
  return [
    const ScreenSearchDestination(
      'Overview',
      '/workspace/overview',
      Icons.dashboard_outlined,
    ),
    if (isAdviser) ...[
      const ScreenSearchDestination(
        'Advisory list',
        '/adviser/advisory',
        Icons.group_outlined,
      ),
      const ScreenSearchDestination(
        'Academic',
        '/adviser/academic',
        Icons.school_outlined,
      ),
      const ScreenSearchDestination(
        'ADM cases',
        '/adviser/adm-cases',
        Icons.folder_shared_outlined,
      ),
      const ScreenSearchDestination(
        'Anecdotal',
        '/adviser/anecdotal',
        Icons.note_outlined,
      ),
      const ScreenSearchDestination(
        'Section schedule',
        '/adviser/schedule',
        Icons.calendar_month_outlined,
      ),
      const ScreenSearchDestination(
        'Chat with Bama',
        '/adviser/bama',
        Icons.chat_bubble_outline,
      ),
      const ScreenSearchDestination(
        'Referrals',
        '/adviser/referrals',
        Icons.send_outlined,
      ),
    ],
    const ScreenSearchDestination(
      'Class',
      '/workspace/classes',
      Icons.class_outlined,
    ),
    const ScreenSearchDestination(
      'Gradebook',
      '/workspace/gradebook',
      Icons.grade_outlined,
    ),
    const ScreenSearchDestination(
      'Attendance',
      '/workspace/attendance',
      Icons.fact_check_outlined,
    ),
    if (!isAdviser)
      const ScreenSearchDestination(
        'My schedule',
        '/workspace/schedule',
        Icons.calendar_month_outlined,
      ),
  ];
}

/// Shared query for the current desk. Pages listen through
/// [ScreenSearchScope] so typing in the header filters them live.
class ScreenSearchController extends ChangeNotifier {
  String _query = '';

  String get query => _query;

  void setQuery(String value) {
    if (value == _query) return;
    _query = value;
    notifyListeners();
  }

  void clear() => setQuery('');

  /// Used when navigation replaces the desk: the new screen reads an empty
  /// query without notifying listeners mid-build.
  void resetSilently() => _query = '';
}

class ScreenSearchScope extends InheritedNotifier<ScreenSearchController> {
  const ScreenSearchScope({
    super.key,
    required ScreenSearchController controller,
    required super.child,
  }) : super(notifier: controller);

  /// Rebuilds the caller when the query changes (use inside `build`).
  static ScreenSearchController? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ScreenSearchScope>()?.notifier;

  /// Reads the controller without subscribing (use inside callbacks).
  static ScreenSearchController? read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<ScreenSearchScope>()?.notifier;
}
