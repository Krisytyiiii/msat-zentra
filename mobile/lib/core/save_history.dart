import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import 'config.dart';

/// Local account partition only; the server still verifies the token.
String? saveHistoryOwner(String? token) {
  try {
    final parts = token!.split('.');
    final claims = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    final id = claims['sub'];
    return id is String && id.isNotEmpty ? id : null;
  } catch (_) {
    return null;
  }
}

Future<Box> openSaveHistory() async => Hive.isBoxOpen(AppConfig.saveHistoryBox)
    ? Hive.box(AppConfig.saveHistoryBox)
    : Hive.openBox(AppConfig.saveHistoryBox);

String saveHistoryKey(String owner, String id) =>
    '${Uri.encodeComponent(owner)}.task.$id';

String saveReceiptKey(String owner, String id) =>
    '${Uri.encodeComponent(owner)}.receipt.$id';
