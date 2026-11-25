import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../design/overview_theme.dart';
import '../../shared/user_messages.dart';
import '../adviser/schedule_timing.dart';
import 'attendance_scan_view.dart';

export 'attendance_scan_view.dart'
    show AttendanceScanEntry, AttendanceScanSnapshot;

class AttendanceScannerPage extends StatefulWidget {
  const AttendanceScannerPage({
    super.key,
    required this.title,
    required this.onScan,
    required this.onAutomaticTick,
    this.historyEdit = false,
    this.allowAutomatic = true,
    this.snapshot,
    this.onLateAfterChanged,
  });
  final String title;
  final Future<String> Function(String raw, bool automatic, String manual)
  onScan;
  final Future<String?> Function() onAutomaticTick;
  final bool historyEdit;
  final bool allowAutomatic;

  /// Live sheet scope/roster; omitted in isolated previews.
  final AttendanceScanSnapshot Function()? snapshot;
  final Future<void> Function(int)? onLateAfterChanged;

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
  bool _busy = false, _error = false, _torch = false;
  final _scanTimes = <String, DateTime>{};
  String _manual = 'present';
  String _message = 'Point the camera at a student’s Zentra QR code.';
  String? _lastRaw;
  DateTime? _lastRead;
  final _handled = <String>{};
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _automatic = widget.allowAutomatic;
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
      final before = Map<String, String>.of(
        widget.snapshot?.call().marks ?? const {},
      );
      final message = await widget.onScan(raw, _automatic, _manual);
      _handled.add(raw);
      final after = widget.snapshot?.call();
      if (after != null) {
        final stamp = philippineTime(DateTime.now());
        for (final learner in after.learners) {
          final status = after.marks[learner.id];
          if (status != null && before[learner.id] != status) {
            _scanTimes[learner.id] = stamp;
          }
        }
      }
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
    child: AttendanceScanView(
      title: widget.title,
      historyEdit: widget.historyEdit,
      automatic: _automatic,
      manual: _manual,
      message: _message,
      error: _error,
      busy: _busy,
      torchOn: _torch,
      snapshot: widget.snapshot?.call(),
      scanTimes: _scanTimes,
      onLateAfterChanged: widget.onLateAfterChanged == null
          ? null
          : _changeLateAfter,
      onDone: () => Navigator.of(context).pop(),
      onSave: () => Navigator.of(context).pop(true),
      onTorch: _toggleTorch,
      onManualChanged: (value) => setState(() {
        _manual = value;
        _lastRaw = null;
        _handled.clear();
      }),
      camera: MobileScanner(
        controller: _controller,
        onDetect: _detect,
        errorBuilder: (context, error) => ColoredBox(
          color: const Color(0xFF111827),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.no_photography_outlined,
                    color: Colors.white,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Camera unavailable. Allow camera access in device settings or use Manual attendance.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white),
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
    ),
  );

  Future<void> _toggleTorch() async {
    try {
      await _controller.toggleTorch();
      if (mounted) setState(() => _torch = !_torch);
    } catch (_) {
      // Torch availability is device-specific; scanning still works.
    }
  }

  Future<void> _changeLateAfter(int minutes) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onLateAfterChanged!(minutes);
      if (mounted) {
        setState(() {
          _message =
              'Late after $minutes minutes. Existing marks are unchanged.';
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
      if (mounted) setState(() => _busy = false);
    }
  }
}
