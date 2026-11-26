// Link status + the "Link your classes" card.
//
// The workspace no longer stops an unlinked teacher at app start: Overview
// opens normally and every class-driven desk shows this card instead of a
// dead end. Linking uses the same claim endpoint as before and also enters
// the current term (the backend issues the term grant on claim).

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../shared/user_messages.dart';

class TeacherLink {
  const TeacherLink({required this.linked, this.name});
  final bool linked;
  final String? name;
}

/// Whether the signed-in teacher has linked their teacher-list code.
///
/// Fail-open: while loading or after a request failure callers treat the
/// teacher as linked so a hiccup never hides an already-linked timetable.
final teacherLinkProvider = FutureProvider.autoDispose<TeacherLink>((
  ref,
) async {
  final auth = ref.watch(authProvider);
  final term = ref.watch(termProvider);
  if (!auth.loggedIn ||
      (auth.role != 'adviser' && auth.role != 'subject_teacher') ||
      term == null) {
    return const TeacherLink(linked: true);
  }
  final api = ref.watch(apiClientProvider);
  try {
    final payload = (await api.dio.get('/api/teacher/schedule/teachers/me'))
        .data;
    final me = payload is Map ? payload : const {};
    final teacher = me['teacherName'];
    return TeacherLink(
      linked: teacher is Map,
      name: teacher is Map ? teacher['name']?.toString() : null,
    );
  } on DioException catch (error) {
    throw api.toApiException(error);
  }
});

/// The card shown wherever a teacher still needs to link their classes.
class LinkClassesCard extends ConsumerStatefulWidget {
  const LinkClassesCard({super.key, this.onLinked});

  /// Runs after a successful link so the hosting desk can refresh its data.
  final Future<void> Function()? onLinked;

  @override
  ConsumerState<LinkClassesCard> createState() => _LinkClassesCardState();
}

class _LinkClassesCardState extends ConsumerState<LinkClassesCard> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _claim() async {
    if (_busy) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(apiClientProvider)
          .dio
          .post(
            '/api/teacher/schedule/teachers/claim',
            data: {'code': _code.text.trim()},
          );
      ref.invalidate(teacherLinkProvider);
      await widget.onLinked?.call();
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Classes linked. Loading your timetable…'),
        ),
      );
    } on DioException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            userMessage(
              e,
              fallback: 'We couldn’t link your classes. Check your code and try again.',
            ),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6ECF4)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A0B1220),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8EFFF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  LucideIcons.keyRound,
                  size: 19,
                  color: Color(0xFF2442A8),
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Enter your link code',
                      style: TextStyle(
                        fontSize: 15,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF171C36),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Your Master Teacher shares this code with you.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: Color(0xFF71809B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _code,
            enabled: !_busy,
            textInputAction: TextInputAction.done,
            textCapitalization: TextCapitalization.characters,
            onSubmitted: (_) => _claim(),
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Color(0xFF171C36),
              fontFeatures: [FontFeature.tabularFigures()],
            ),
            decoration: InputDecoration(
              hintText: 'Link code (e.g. MS-101)',
              hintStyle: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: Color(0xFF9AA5BB),
              ),
              prefixIcon: const Icon(
                LucideIcons.link2,
                size: 18,
                color: Color(0xFF71809B),
              ),
              filled: true,
              fillColor: const Color(0xFFF7F9FC),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 14,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFE6ECF4)),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFE6ECF4)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: theme.colorScheme.primary),
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFF2563EB)
                  .withValues(alpha: 0.45),
              disabledForegroundColor: Colors.white70,
            ),
            onPressed: _busy ? null : _claim,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Row(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(LucideIcons.link, size: 18),
                      SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          'Link classes',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
          ),
          const SizedBox(height: 10),
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(LucideIcons.info, size: 14, color: Color(0xFF71809B)),
              SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Linking also verifies your teacher code for the selected term.',
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    color: Color(0xFF71809B),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Full-screen style placeholder for a class-driven desk with no link yet.
class TeacherLinkPlaceholder extends StatelessWidget {
  const TeacherLinkPlaceholder({super.key, this.onLinked});

  final Future<void> Function()? onLinked;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: LinkClassesCard(onLinked: onLinked),
        ),
      ),
    );
  }
}
