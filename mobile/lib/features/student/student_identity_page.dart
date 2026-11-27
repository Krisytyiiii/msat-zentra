import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../design/overview_theme.dart';
import '../../services/portal_service.dart';
import '../../shared/models.dart';
import '../../shared/user_messages.dart';
import '../../shared/widgets.dart';

/// Versioned, minimal identity payload. It is not a signed attendance proof;
/// receivers must match the LRN against their authorized class roster.
String studentQrPayload(PortalLearner learner) => jsonEncode({
  'type': 'zentra.student',
  'version': 1,
  'name': learner.name.trim(),
  'lrn': learner.lrn.trim(),
});

class StudentIdentityPage extends ConsumerStatefulWidget {
  const StudentIdentityPage({super.key, this.qr = false});
  final bool qr;

  @override
  ConsumerState<StudentIdentityPage> createState() => _IdentityState();
}

class _IdentityState extends ConsumerState<StudentIdentityPage> {
  final _cardKey = GlobalKey();
  bool _sharing = false;

  Future<void> _share() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    ui.Image? image;
    try {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      final boundary =
          _cardKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) return;
      image = await boundary.toImage(pixelRatio: 3);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null || !mounted) return;
      final box = context.findRenderObject() as RenderBox;
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              bytes.buffer.asUint8List(),
              mimeType: 'image/png',
              name: 'zentra-student-qr.png',
            ),
          ],
          fileNameOverrides: ['zentra-student-qr.png'],
          sharePositionOrigin: box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(userMessage(error))));
      }
    } finally {
      image?.dispose();
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final learner = ref.watch(studentMeProvider);
    return Theme(
      data: overviewScreenTheme(Theme.of(context)),
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          title: Text(widget.qr ? 'My QR Code' : 'Profile'),
          leading: ZBackButton(
            tooltip: 'Back',
            icon: const Icon(Icons.chevron_left),
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/student/overview'),
          ),
        ),
        body: learner.when(
          loading: () => LoadingView(
            layout: widget.qr ? SkeletonLayout.qr : SkeletonLayout.profile,
          ),
          error: (error, _) => ErrorView(
            message: error,
            onRetry: () => ref.invalidate(studentMeProvider),
          ),
          data: (student) => SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: widget.qr
                    ? RepaintBoundary(
                        key: _cardKey,
                        child: StudentQrCard(
                          learner: student,
                          onExport: _sharing ? null : _share,
                        ),
                      )
                    : Column(
                        children: [
                          _Identity(learner: student),
                          const SizedBox(height: 16),
                          Card(
                            child: ListTile(
                              leading: const Icon(Icons.qr_code_2),
                              title: const Text('My QR Code'),
                              subtitle: const Text(
                                'For attendance and identity check',
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => context.push('/student/profile/qr'),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const _blue = Color(0xFF2444B8);
const _muted = Color(0xFF71809B);
const _border = Color(0xFFE0E7FA);

class _Identity extends StatelessWidget {
  const _Identity({required this.learner});
  final PortalLearner learner;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFF3F5FB),
      border: Border.all(color: _border),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        Container(
          width: 60,
          height: 60,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
          ),
          padding: const EdgeInsets.all(3),
          child: ClipOval(
            child: learner.photoUrl == null || learner.photoUrl!.isEmpty
                ? const Icon(Icons.person_outline, color: _blue, size: 30)
                : Image.network(
                    learner.photoUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.person_outline,
                      color: _blue,
                      size: 30,
                    ),
                  ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                learner.name,
                style: const TextStyle(
                  fontSize: 16,
                  color: _blue,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                'LRN: ${learner.lrn.isEmpty ? 'Not available' : learner.lrn}',
                style: const TextStyle(
                  fontSize: 12,
                  color: _muted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class StudentQrCard extends StatelessWidget {
  const StudentQrCard({super.key, required this.learner, this.onExport});
  final PortalLearner learner;
  final VoidCallback? onExport;

  @override
  Widget build(BuildContext context) {
    final hasIdentity =
        learner.lrn.trim().isNotEmpty && learner.name.trim().isNotEmpty;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _border),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x09000000),
            blurRadius: 10,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF5D5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.qr_code_2, size: 20, color: _blue),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'QR VERIFICATION',
                      style: TextStyle(
                        fontSize: 12,
                        color: _muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      'For attendance and identity check',
                      style: TextStyle(fontSize: 12, color: _muted),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Save or share QR card',
                onPressed: hasIdentity ? onExport : null,
                icon: const Icon(Icons.file_download_outlined, color: _blue),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _Identity(learner: learner),
          const SizedBox(height: 16),
          if (hasIdentity)
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 240),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8F9FE),
                    border: Border.all(color: _border),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: Semantics(
                      label: 'Student attendance QR code for ${learner.name}',
                      image: true,
                      child: QrImageView(
                        data: studentQrPayload(learner),
                        version: QrVersions.auto,
                        errorCorrectionLevel: QrErrorCorrectLevel.H,
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.all(12),
                        eyeStyle: const QrEyeStyle(
                          eyeShape: QrEyeShape.square,
                          color: _blue,
                        ),
                        dataModuleStyle: const QrDataModuleStyle(
                          dataModuleShape: QrDataModuleShape.square,
                          color: _blue,
                        ),
                        embeddedImage: const AssetImage(
                          'assets/zentra.png',
                        ),
                        embeddedImageStyle: const QrEmbeddedImageStyle(
                          size: Size(32, 32),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Your name and LRN are required to generate a QR code. Contact the school to update your profile.',
              ),
            ),
          const SizedBox(height: 16),
          _detail(
            Icons.school_outlined,
            'School',
            'Mati School of Arts and Trades',
          ),
          _detail(
            Icons.menu_book_outlined,
            'Grade Level',
            learner.gradeLevel.isEmpty ? 'Not assigned' : learner.gradeLevel,
          ),
          _detail(
            Icons.layers_outlined,
            'Section',
            learner.sectionName ?? 'Not assigned',
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Divider(height: 1, color: _border),
          ),
          Image.asset(
            'assets/msat.jpg',
            width: 48,
            height: 48,
            fit: BoxFit.contain,
          ),
          const SizedBox(height: 16),
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.verified_outlined, size: 18, color: _blue),
              SizedBox(width: 6),
              Flexible(
                child: Text(
                  'VERIFIED BY ZENTRA',
                  style: TextStyle(
                    fontSize: 12,
                    letterSpacing: 1,
                    color: _blue,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _detail(IconData icon, String label, String value) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      border: Border.all(color: _border),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Icon(icon, size: 16, color: _blue),
        const SizedBox(width: 10),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$label: ',
                  style: const TextStyle(color: _muted),
                ),
                TextSpan(
                  text: value,
                  style: const TextStyle(
                    color: _blue,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            style: const TextStyle(fontSize: 12),
          ),
        ),
      ],
    ),
  );
}
