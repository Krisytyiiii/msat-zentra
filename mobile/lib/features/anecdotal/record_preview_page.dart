// Record preview — web OcForm01PreviewDialog parity (mobile-native).
// Folder/row tap opens this page: it fetches the single-page A4 PDF twin of
// the official GCForm-01 export (GET /api/anecdotal/:id/pdf, drawn
// server-side from the same record data) and renders it with pinch-zoom +
// double-tap. The PDF is cached on disk per signature state, so signed
// downloads can reuse the rendered bytes. The full-height print layout keeps
// signature controls in a sheet and exports in a separate bottom action bar.

import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:share_plus/share_plus.dart';

import '../../shared/models.dart';
import '../../shared/widgets.dart';
import '../../design/status_palette.dart';
import '../../shared/user_messages.dart';
import 'anecdotal_data.dart';
import 'signature_block.dart';
import 'preview_action_bar.dart';

class RecordPreviewPage extends ConsumerStatefulWidget {
  final MyAnecdotalRecord record;
  const RecordPreviewPage({super.key, required this.record});

  @override
  ConsumerState<RecordPreviewPage> createState() => _PreviewState();
}

class _PreviewState extends ConsumerState<RecordPreviewPage> {
  final _pdfController = PdfViewerController();
  PdfViewerParams? _params;
  final _zoom = ValueNotifier<double>(1);
  bool _viewerReady = false;
  int _pageCount = 0;
  int _pageNumber = 1;
  Map<String, dynamic>? _detail;
  Uint8List? _pdfBytes;
  String? _error;
  bool _busy = true;
  bool _exportingXlsx = false;
  bool _exportingPdf = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_params != null) return;
    _params ??= PdfViewerParams(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLow,
      margin: 16,
      pageDropShadow: const BoxShadow(
        color: Color(0x47000000), blurRadius: 18, offset: Offset(0, 6),
      ),
      sizeDelegateProvider: const PdfViewerSizeDelegateProviderSmart(),
      onViewerReady: (document, controller) {
        if (!mounted) return;
        setState(() {
          _viewerReady = true;
          _pageCount = document.pages.length;
        });
        _syncZoom();
      },
      onPageChanged: (page) {
        if (mounted && page != null) setState(() => _pageNumber = page);
      },
      onGeneralTap: (_, controller, details) {
        if (details.type != PdfViewerGeneralTapType.doubleTap) return false;
        final fit = controller.calcMatrixFitWidthForPage(pageNumber: _pageNumber);
        if (fit != null && controller.currentZoom > fit.storage[0] * 1.1) {
          controller.goTo(fit);
        } else {
          controller.zoomUp(zoomCenter: details.localPosition);
        }
        return true;
      },
      errorBannerBuilder: (_, error, stack, document) => ErrorView(
        message: 'The document could not be displayed. Please try again.',
        onRetry: _load,
      ),
    );
    _pdfController.addListener(_syncZoom);
  }

  void _syncZoom() {
    if (mounted && _pdfController.isReady) _zoom.value = _pdfController.currentZoom;
  }

  @override
  void dispose() {
    _pdfController.removeListener(_syncZoom);
    _zoom.dispose();
    // PdfViewerController holds no native resources in this version —
    // the viewer detaches itself when unmounted.
    super.dispose();
  }

  /// Cache identity includes the signature timestamp: signing/removing mints
  /// a new key, so a cached unsigned PDF can never shadow a signed one.
  String _cacheKey(Map<String, dynamic> detail) {
    final at = recordSignatureOf(detail)?.at.trim() ?? '';
    final stamp = at.isEmpty ? 'unsigned' : at.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-');
    return 'OCForm-01_${widget.record.id}_$stamp.pdf';
  }

  Future<File> _cacheFile(String key) async {
    final dir = await getApplicationDocumentsDirectory();
    final cache = Directory('${dir.path}/ocform01_pdfs');
    if (!await cache.exists()) await cache.create(recursive: true);
    return File('${cache.path}/$key');
  }

  Future<void> _load() async {
    setState(() {
      _detail = null;
      _pdfBytes = null;
      _error = null;
      _busy = true;
      _viewerReady = false;
      _pageNumber = 1;
    });
    try {
      final detail = await fetchRecordDetail(ref, widget.record.id);
      final key = _cacheKey(detail);
      final cached = await _cacheFile(key);
      Uint8List bytes;
      if (await cached.exists()) {
        bytes = await cached.readAsBytes();
      } else {
        final fresh = await downloadRecordPdf(ref, widget.record.id);
        bytes = Uint8List.fromList(fresh);
        await cached.writeAsBytes(bytes, flush: true);
      }
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _pdfBytes = bytes;
        _busy = false;
      });
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _error = anecdotalError(e, 'The official form could not be loaded. Check your connection and try again.');
          _busy = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = userMessage(e);
          _busy = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'The official form could not be loaded. Please try again.';
          _busy = false;
        });
      }
    }
  }

  String get _safeName => widget.record.studentName.trim().isEmpty
      ? widget.record.id
      : widget.record.studentName.trim().replaceAll(RegExp(r'\s+'), '-');

  Future<void> _shareXlsx() async {
    if (_exportingXlsx) return;
    setState(() => _exportingXlsx = true);
    try {
      final bytes = await downloadRecordExport(ref, widget.record.id);
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/OCForm-01_${_safeName}_${widget.record.date}.xlsx';
      await File(path).writeAsBytes(Uint8List.fromList(bytes), flush: true);
      if (mounted) {
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(path, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
            text: 'GCForm-01 ${widget.record.studentName}',
          ),
        );
      }
    } on DioException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(anecdotalError(e, 'Could not export.'))));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(userMessage(e))));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not share the file.')));
    } finally {
      if (mounted) setState(() => _exportingXlsx = false);
    }
  }

  Future<void> _sharePdf() async {
    final bytes = _pdfBytes;
    if (bytes == null || _exportingPdf) return;
    setState(() => _exportingPdf = true);
    try {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/OCForm-01_${_safeName}_${widget.record.date}.pdf';
      await File(path).writeAsBytes(bytes, flush: true);
      if (mounted) {
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(path, mimeType: 'application/pdf')],
            text: 'GCForm-01 ${widget.record.studentName}',
          ),
        );
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not share the file.')));
    } finally {
      if (mounted) setState(() => _exportingPdf = false);
    }
  }

  Future<void> _openSignature() async {
    final detail = _detail;
    if (detail == null) return;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      // Drag only the handle, not the drawing canvas.
      enableDrag: false,
      builder: (sheetContext) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (_, scrollController) => Column(
          children: [
            SingleChildScrollView(
              controller: scrollController,
              child: const SizedBox(
                height: 32,
                child: Center(child: Icon(Icons.drag_handle)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Expanded(child: Text('Report signature')),
                  IconButton(
                    tooltip: 'Close signature',
                    onPressed: () => Navigator.pop(sheetContext),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: SignatureBlock(
                  recordId: widget.record.id,
                  canSign: detail['canSign'] == true,
                  signature: recordSignatureOf(detail),
                  onChanged: () {
                    if (sheetContext.mounted) Navigator.pop(sheetContext, true);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final sig = _detail == null ? null : recordSignatureOf(_detail!);
    final loaded = !_busy && _error == null && _detail != null && _pdfBytes != null;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 80,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('GCForm-01 — Anecdotal Report',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            Text('${widget.record.studentName} · ${widget.record.date}',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          if (sig != null)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: ZStatusPill(text: 'Signed', tone: StatusTone.green),
            ),
        ],
      ),
      bottomNavigationBar: loaded
          ? PreviewActionBar(
              canSign: _detail!['canSign'] == true,
              signed: sig != null,
              onSign: _openSignature,
              onXlsx: _shareXlsx,
              onPdf: _sharePdf,
              xlsxBusy: _exportingXlsx,
              pdfBusy: _exportingPdf,
            )
          : null,
      body: ColoredBox(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        child: _busy
            ? const Padding(
                padding: EdgeInsets.all(16), child: ZSkeletonList(count: 6))
            : !loaded
                ? ErrorView(
                    message: _error ?? 'The official form could not be loaded.',
                    onRetry: _load)
                : Stack(
                    children: [
                      Positioned.fill(
                        child: PdfViewer.data(
                          _pdfBytes!,
                          sourceName: 'ocform01_${widget.record.id}',
                          controller: _pdfController,
                          params: _params!,
                        ),
                      ),
                      if (_viewerReady)
                        Positioned(
                          left: 12, right: 12, bottom: 12,
                          child: SafeArea(
                            top: false,
                            child: Row(
                              children: [
                                if (_pageCount > 1)
                                  Chip(label: Text('$_pageNumber of $_pageCount')),
                                const Spacer(),
                                Material(
                                  elevation: 4,
                                  borderRadius: BorderRadius.circular(8),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      IconButton(
                                        tooltip: 'Zoom out',
                                        onPressed: () => _pdfController.zoomDown(),
                                        icon: const Icon(Icons.remove),
                                      ),
                                      ValueListenableBuilder<double>(
                                        valueListenable: _zoom,
                                        builder: (_, zoom, _) => Text(
                                          '${(zoom * 100).round()}%',
                                          style: Theme.of(context).textTheme.bodySmall),
                                      ),
                                      IconButton(
                                        tooltip: 'Zoom in',
                                        onPressed: () => _pdfController.zoomUp(),
                                        icon: const Icon(Icons.add),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}
