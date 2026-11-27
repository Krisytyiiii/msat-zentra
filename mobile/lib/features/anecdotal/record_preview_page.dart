// Record preview — web OcForm01PreviewDialog parity (mobile-native).
// Folder/row tap opens this page: it fetches the single-page A4 PDF twin of
// the official GCForm-01 export (GET /api/anecdotal/:id/pdf, drawn
// server-side from the same record data) and renders it with pinch-zoom +
// double-tap. The PDF is cached on disk per signature state, so signed
// downloads can reuse the rendered bytes. Share/download live in the header
// menu (PDF only); the bottom bar holds just the signature action.

import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:share_plus/share_plus.dart';

import '../../shared/models.dart';
import '../../shared/pdf_download.dart';
import '../../shared/widgets.dart';
import '../../design/adviser_navigation.dart';
import '../../design/overview_theme.dart';
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
        color: Color(0x47000000),
        blurRadius: 18,
        offset: Offset(0, 6),
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
        final fit = controller.calcMatrixFitWidthForPage(
          pageNumber: _pageNumber,
        );
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
    if (mounted && _pdfController.isReady) {
      _zoom.value = _pdfController.currentZoom;
    }
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
  // Bump when the server-rendered form changes (artwork, layout): the PDF is
  // cached on disk per record + signature state, so a new template must not be
  // shadowed by an older cached copy.
  static const _formVersion = 3;

  String _cacheKey(Map<String, dynamic> detail) {
    final at = recordSignatureOf(detail)?.at.trim() ?? '';
    final stamp = at.isEmpty
        ? 'unsigned'
        : at.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-');
    return 'OCForm-01_v${_formVersion}_${widget.record.id}_$stamp.pdf';
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
          _error = anecdotalError(
            e,
            'The official form could not be loaded. Check your connection and try again.',
          );
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

  String get _fileName => 'OCForm-01_${_safeName}_${widget.record.date}.pdf';

  Future<void> _sharePdf() async {
    final bytes = _pdfBytes;
    if (bytes == null || _exportingPdf) return;
    setState(() => _exportingPdf = true);
    try {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/$_fileName';
      await File(path).writeAsBytes(bytes, flush: true);
      if (mounted) {
        final box = context.findRenderObject() as RenderBox?;
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(path, mimeType: 'application/pdf')],
            fileNameOverrides: [_fileName],
            sharePositionOrigin: box == null
                ? null
                : box.localToGlobal(Offset.zero) & box.size,
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not share the PDF.')),
        );
      }
    } finally {
      if (mounted) setState(() => _exportingPdf = false);
    }
  }

  Future<void> _downloadPdf() async {
    final bytes = _pdfBytes;
    if (bytes == null || _exportingPdf) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _exportingPdf = true);
    try {
      final saved = await savePdfToDevice(fileName: _fileName, bytes: bytes);
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            saved == null ? 'Download cancelled.' : '$_fileName saved.',
          ),
        ),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not save the PDF.')),
      );
    } finally {
      if (mounted) setState(() => _exportingPdf = false);
    }
  }

  Future<void> _openSignature() async {
    final detail = _detail;
    if (detail == null) return;
    final height = MediaQuery.sizeOf(context).height * 0.5;
    final sheetTheme = overviewScreenTheme(Theme.of(context));
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      constraints: BoxConstraints(maxHeight: height),
      builder: (sheetContext) => Theme(
        // Same desk sheet shell as the interventions details screen.
        data: sheetTheme,
        child: SafeArea(
          child: SizedBox(
            height: height,
            child: ColoredBox(
              color: sheetTheme.colorScheme.surface,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  SignatureBlock(
                    recordId: widget.record.id,
                    canSign: detail['canSign'] == true,
                    signature: recordSignatureOf(detail),
                    onChanged: () {
                      if (sheetContext.mounted) {
                        Navigator.pop(sheetContext, true);
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final sig = _detail == null ? null : recordSignatureOf(_detail!);
    final loaded =
        !_busy && _error == null && _detail != null && _pdfBytes != null;
    final hasPdf = _pdfBytes != null;
    return Scaffold(
      appBar: AppBar(
        // Same header height as the Grade Record screen (desk chrome).
        toolbarHeight: 72,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        shape: Border(
          bottom: BorderSide(color: Theme.of(context).colorScheme.outline),
        ),
        centerTitle: true,
        leadingWidth: 64,
        leading: ZBackButton(
          icon: const Icon(LucideIcons.chevronLeft),
          tooltip: 'Back',
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Anecdotal Report'),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Document actions',
            enabled: hasPdf && !_exportingPdf,
            // Same circular outline as the screen Back button.
            style: IconButton.styleFrom(
              side: BorderSide(color: Theme.of(context).colorScheme.outline),
              minimumSize: const Size(42, 42),
              shape: const CircleBorder(),
            ),
            icon: _exportingPdf
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(LucideIcons.moreVertical),
            onSelected: (value) {
              if (!hasPdf) return;
              if (value == 'share') _sharePdf();
              if (value == 'download') _downloadPdf();
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'share',
                child: Row(
                  children: [
                    Icon(LucideIcons.share2, size: 16),
                    const SizedBox(width: 10),
                    const Text('Share'),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'download',
                child: Row(
                  children: [
                    Icon(LucideIcons.download, size: 16),
                    const SizedBox(width: 10),
                    const Text('Download'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 4),
        ],
      ),
      bottomNavigationBar: loaded && _detail!['canSign'] == true
          ? PreviewActionBar(
              canSign: true,
              signed: sig != null,
              onSign: _openSignature,
            )
          : null,
      body: AdviserBamaAccess(
        busy: _exportingPdf,
        child: ColoredBox(
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: _busy
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: ZSkeletonList(count: 6),
                )
              : !loaded
              ? ErrorView(
                  message: _error ?? 'The official form could not be loaded.',
                  onRetry: _load,
                )
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
                        left: 12,
                        right: 12,
                        bottom: 12,
                        child: SafeArea(
                          top: false,
                          child: Row(
                            children: [
                              if (_pageCount > 1)
                                Chip(
                                  label: Text('$_pageNumber of $_pageCount'),
                                ),
                              const Spacer(),
                              Material(
                                elevation: 4,
                                borderRadius: BorderRadius.circular(8),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      tooltip: 'Zoom out',
                                      onPressed: () =>
                                          _pdfController.zoomDown(),
                                      icon: const Icon(Icons.remove),
                                    ),
                                    ValueListenableBuilder<double>(
                                      valueListenable: _zoom,
                                      builder: (_, zoom, _) => Text(
                                        '${(zoom * 100).round()}%',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall,
                                      ),
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
      ),
    );
  }
}
