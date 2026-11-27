// Workspace-matched sign-in: same desk palette, hairline borders and controls
// the signed-in shells use (Light/Dark/System), with a compact editorial layout.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../design/brand.dart';
import 'auth_flow_ui.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _form = GlobalKey<FormState>();
  final _passwordFocus = FocusNode();
  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  bool get _working => _busy;

  @override
  void dispose() {
    _email.dispose();
    _pass.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_working || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ok = await ref
          .read(authProvider.notifier)
          .login(email: _email.text.trim(), password: _pass.text);
      if (!mounted) return;
      if (ok) {
        TextInput.finishAutofillContext();
        context.go(mobileLoginDestination(ref.read(authProvider).role));
      } else {
        setState(() => _error = ref.read(authProvider).error);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not sign in. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _googleSignIn() {
    if (_working) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Google sign-in is not available in the mobile app yet. Use your email and password.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AuthFlowScaffold(
      centerContent: true,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 760;
          if (!wide) {
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: _formCard(context, showLogo: true, showSchool: true),
              ),
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(flex: 5, child: _brandPanel(context)),
              const SizedBox(width: 44),
              Container(
                width: 1,
                height: 236,
                color: Theme.of(context).colorScheme.outline,
              ),
              const SizedBox(width: 44),
              Expanded(
                flex: 4,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 360),
                  child: _formCard(
                    context,
                    showLogo: false,
                    showSchool: false,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _formCard(
    BuildContext context, {
    required bool showLogo,
    required bool showSchool,
  }) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final buttonForeground =
        theme.filledButtonTheme.style?.foregroundColor?.resolve(
          const <WidgetState>{},
        ) ??
        colors.onPrimary;
    return AutofillGroup(
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showLogo) ...[
              Row(
                children: [
                  const ZLogo(size: 30, radius: 8),
                  const SizedBox(width: 9),
                  Text(
                    'Zentra',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 26),
            ],
            Text(
              'Welcome back',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.6,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Use your school email and password.',
              style: TextStyle(
                color: colors.onSurfaceVariant,
                fontSize: 13,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 22),
            const _FieldLabel(text: 'School email'),
            const SizedBox(height: 6),
            TextFormField(
              key: const Key('login-email'),
              controller: _email,
              enabled: !_working,
              decoration: const InputDecoration(hintText: 'name@msat.edu'),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.username],
              autocorrect: false,
              onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
              validator: (value) {
                final email = value?.trim() ?? '';
                if (email.isEmpty) {
                  return 'Enter your school email.';
                }
                if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
                  return 'Enter a valid email address.';
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            const _FieldLabel(text: 'Password'),
            const SizedBox(height: 6),
            TextFormField(
              key: const Key('login-password'),
              controller: _pass,
              focusNode: _passwordFocus,
              enabled: !_working,
              decoration: InputDecoration(
                hintText: 'Enter your password',
                suffixIcon: IconButton(
                  tooltip: _showPassword ? 'Hide password' : 'Show password',
                  onPressed: () =>
                      setState(() => _showPassword = !_showPassword),
                  icon: Icon(
                    _showPassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    size: 18,
                  ),
                  color: colors.onSurfaceVariant,
                ),
              ),
              obscureText: !_showPassword,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _submit(),
              validator: (value) => value == null || value.isEmpty
                  ? 'Enter your password.'
                  : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: colors.error.withValues(alpha: 0.09),
                    border: Border.all(
                      color: colors.error.withValues(alpha: 0.3),
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.error_outline,
                        size: 15,
                        color: colors.error,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          _error!,
                          style: TextStyle(color: colors.error, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _working ? null : _submit,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_busy) ...[
                    AuthSpinner(size: 15, color: buttonForeground),
                    const SizedBox(width: 9),
                  ],
                  Text(_busy ? 'Signing in…' : 'Sign in'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: Divider(color: colors.outline)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    'OR',
                    style: TextStyle(
                      fontSize: 10,
                      color: colors.onSurfaceVariant,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                Expanded(child: Divider(color: colors.outline)),
              ],
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _working ? null : _googleSignIn,
              icon: SvgPicture.string(
                _googleLogoSvg,
                width: 17,
                height: 17,
              ),
              label: const Text('Sign in with Google'),
            ),
            if (showSchool) ...[
              const SizedBox(height: 22),
              Text(
                'Mati School of Arts and Trades',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: colors.onSurfaceVariant,
                  fontSize: 11,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _brandPanel(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const ZLogo(size: 44, radius: 11),
          const SizedBox(height: 22),
          Text(
            'Your school workspace',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontSize: 30,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.9,
              height: 1.15,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Sign in to open the classes, records, and updates linked to your account.',
            style: TextStyle(
              color: colors.onSurfaceVariant,
              fontSize: 14,
              height: 1.55,
            ),
          ),
          const SizedBox(height: 26),
          Text(
            'MATI SCHOOL OF ARTS AND TRADES',
            style: TextStyle(
              color: colors.onSurfaceVariant,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.9,
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.labelLarge?.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    ),
  );
}

// Same four-color "G" as the web login button (LoginForm.tsx GoogleIcon).
const _googleLogoSvg = '''
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>
''';
