import 'dart:typed_data';

import 'package:file_saver/file_saver.dart';

/// Saves [bytes] as a PDF into the device's shared Downloads folder.
///
/// Android writes through MediaStore (no dialog, visible in Files), desktop
/// platforms write to the user's Downloads directory, and iOS falls back to the
/// document picker because it has no shared Downloads folder.
///
/// Returns the saved location/URI, or `null` when the user cancels the iOS
/// picker.
Future<String?> savePdfToDevice({
  required String fileName,
  required Uint8List bytes,
}) async {
  final name = fileName.replaceFirst(
    RegExp(r'\.pdf$', caseSensitive: false),
    '',
  );
  try {
    return await FileSaver.instance.saveToDownloads(
      name: name,
      bytes: bytes,
      fileExtension: 'pdf',
      mimeType: MimeType.pdf,
    );
  } on UnsupportedError {
    return FileSaver.instance.saveAs(
      name: name,
      bytes: bytes,
      fileExtension: 'pdf',
      mimeType: MimeType.pdf,
    );
  }
}
