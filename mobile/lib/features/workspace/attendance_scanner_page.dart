import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../design/overview_theme.dart';
import '../../shared/user_messages.dart';

class AttendanceScannerPage extends StatefulWidget {
  const AttendanceScannerPage({
    super.key,
    required this.title,
    required this.onScan,
    required this.onAutomaticTick,
    this.historyEdit = false,
    this.allowAutomatic = true,
  });
  final String title;
  final Future<String> Function(String raw, bool automatic, String manual)
  onScan;
  final Future<String?> Function() onAutomaticTick;
  final bool historyEdit;
  final bool allowAutomatic;

  @override
  State<AttendanceScannerPage> createState() => _ScannerState();
}

class _ScannerState extends State<AttendanceScannerPage>
    with WidgetsBindingObserver {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.normal,
  );
  late bool _automatic;
  bool _busy = false, _error = false;
  String _manual = 'present';
  String _message = 'Point the camera at a student’s Zentra QR code.';
  String? _lastRaw;
  DateTime? _lastRead;
  final _handled = <String>{};
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _automatic = !widget.historyEdit && widget.allowAutomatic;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_controller.value.hasCameraPermission) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(_restartCamera());
    } else {
      unawaited(_controller.stop());
    }
  }

  Future<void> _restartCamera() async {
    try {
      await _controller.start();
    } catch (_) {
      if (mounted) {
        setState(() {
          _message = 'Camera unavailable. Check camera permissions or use Manual attendance.';
          _error = true;
        });
      }
    }
  }

  Future<void> _tick() async {
    if (!_automatic ||
        widget.historyEdit ||
        _busy ||
        !mounted ||
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed ||
        ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    _busy = true;
    try {
      final message = await widget.onAutomaticTick();
      if (message != null && mounted) {
        setState(() {
          _message = message;
          _error = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _message = userMessage(error);
          _error = true;
        });
      }
    } finally {
      _busy = false;
    }
  }

  Future<void> _detect(BarcodeCapture capture) async {
    if (!mounted ||
        _busy ||
        ModalRoute.of(context)?.isCurrent != true ||
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
      return;
    }
    final raw = capture.barcodes
        .map((barcode) => barcode.rawValue)
        .whereType<String>()
        .firstOrNull;
    if (raw == null) return;
    if (_handled.contains(raw)) return;
    final now = DateTime.now();
    if (_lastRaw == raw &&
        _lastRead != null &&
        now.difference(_lastRead!) < const Duration(seconds: 3)) {
      return;
    }
    _lastRaw = raw;
    _lastRead = now;
    _busy = true;
    try {
      final message = await widget.onScan(raw, _automatic, _manual);
      _handled.add(raw);
      if (mounted) {
        setState(() {
          _message = message;
          _error = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _message = userMessage(error);
          _error = true;
        });
      }
    } finally {
      _busy = false;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: overviewScreenTheme(Theme.of(context)),
    child: Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        centerTitle: true,
        title: const Text('Scan Attendance'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.chevron_left),
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            onPressed: _busy ? null : () => Navigator.of(context).pop(),
            icon: const Icon(Icons.fact_check_outlined),
            label: const Text('Done · review attendance'),
          ),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _ScannerCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'QR ATTENDANCE',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF71809B),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.title,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.historyEdit
                          ? 'Correct a learner’s mark for the selected meeting.'
                          : 'Scan each learner’s Zentra QR code to draft attendance.',
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF71809B),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _controller,
                        onDetect: _detect,
                        errorBuilder: (context, error) => ColoredBox(
                          color: const Color(0xFFF3F5FB),
                          child: Center(
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.no_photography_outlined),
                                  const SizedBox(height: 12),
                                  const Text(
                                    'Camera unavailable. Allow camera access in device settings or use Manual attendance.',
                                    textAlign: TextAlign.center,
                                  ),
                                  TextButton(
                                    onPressed: _restartCamera,
                                    child: const Text('Try again'),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      IgnorePointer(
                        child: Center(
                          child: FractionallySizedBox(
                            widthFactor: .68,
                            heightFactor: .68,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                border: Border.all(
                                  color: Colors.white,
                                  width: 3,
                                ),
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const Positioned(
                        bottom: 16,
                        left: 16,
                        right: 16,
                        child: IgnorePointer(
                          child: Text(
                            'Align QR code inside the frame',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              shadows: [Shadow(blurRadius: 6)],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _ScannerCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Marking mode',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (widget.allowAutomatic)
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Automatic marking'),
                        subtitle: Text(
                          widget.historyEdit
                              ? 'Present before 20 minutes; Late from 20 minutes. Only the scanned student changes.'
                              : 'Present before 20 minutes; Late from 20 minutes. Unmarked students become Absent after the period ends.',
                        ),
                        value: _automatic,
                        onChanged: _busy
                            ? null
                            : (value) => setState(() {
                                _automatic = value;
                                _lastRaw = null;
                                _handled.clear();
                              }),
                      ),
                    if (widget.historyEdit && !widget.allowAutomatic) ...[
                      const SizedBox(height: 12),
                      const Text(
                        'Choose a status, then scan. Only the scanned student will be updated for the selected date.',
                      ),
                    ],
                    if (!_automatic) ...[
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final entry in {
                            'present': 'Present',
                            if (widget.historyEdit) 'absent': 'Absent',
                            'late': 'Late',
                            if (widget.historyEdit) 'excused': 'Excused',
                          }.entries)
                            ChoiceChip(
                              label: Text(entry.value),
                              selected: _manual == entry.key,
                              selectedColor: switch (entry.key) {
                                'present' => const Color(0xFFDCFCE7),
                                'absent' => const Color(0xFFFEE2E2),
                                'late' => const Color(0xFFFEF3C7),
                                _ => const Color(0xFFDBEAFE),
                              },
                              materialTapTargetSize:
                                  MaterialTapTargetSize.padded,
                              onSelected: _busy
                                  ? null
                                  : (_) => setState(() {
                                      _manual = entry.key;
                                      _lastRaw = null;
                                      _handled.clear();
                                    }),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: _ScannerCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        _error ? Icons.error_outline : Icons.qr_code_scanner,
                        color: _error
                            ? const Color(0xFFDC2626)
                            : const Color(0xFF2563EB),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _message,
                          style: TextStyle(
                            fontSize: 14,
                            color: _error
                                ? const Color(0xFFDC2626)
                                : const Color(0xFF334155),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                widget.historyEdit
                    ? 'Only the scanned student’s mark is replaced. Everyone else stays unchanged; ADM-exempt students are skipped. Review and save your changes on the next screen.'
                    : 'Scans are saved as drafts. Review and save attendance on the next screen. Existing marks and ADM-exempt students are not overwritten.',
                style: const TextStyle(fontSize: 12, color: Color(0xFF71809B)),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ScannerCard extends StatelessWidget {
  const _ScannerCard({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE6ECF4)),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Material(color: Colors.transparent, child: child),
  );
}
