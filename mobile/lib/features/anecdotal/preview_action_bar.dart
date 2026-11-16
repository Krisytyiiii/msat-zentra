import 'package:flutter/material.dart';

import '../../shared/spinner.dart';

/// Document actions stay outside the paper and never consume its reading area.
class PreviewActionBar extends StatelessWidget {
  const PreviewActionBar({
    super.key,
    required this.canSign,
    required this.signed,
    required this.onSign,
    required this.onXlsx,
    required this.onPdf,
    this.xlsxBusy = false,
    this.pdfBusy = false,
  });

  final bool canSign;
  final bool signed;
  final VoidCallback onSign;
  final VoidCallback onXlsx;
  final VoidCallback onPdf;
  final bool xlsxBusy;
  final bool pdfBusy;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
    ),
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          children: [
            if (canSign)
              Expanded(
                child: TextButton.icon(
                  onPressed: onSign,
                  icon: const Icon(Icons.draw_outlined, size: 18),
                  label: Text(signed ? 'Signature' : 'Sign'),
                ),
              ),
            Expanded(
              child: TextButton.icon(
                onPressed: xlsxBusy ? null : onXlsx,
                icon: xlsxBusy
                    ? const ZSpinner(size: 16)
                    : const Icon(Icons.download_outlined, size: 18),
                label: const Text('.xlsx'),
              ),
            ),
            Expanded(
              child: TextButton.icon(
                onPressed: pdfBusy ? null : onPdf,
                icon: pdfBusy
                    ? const ZSpinner(size: 16)
                    : const Icon(Icons.picture_as_pdf_outlined, size: 18),
                label: const Text('.PDF'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
