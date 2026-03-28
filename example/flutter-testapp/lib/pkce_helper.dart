import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

final Random _secureRandom = Random.secure();

const String _verifierCharset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.';

String generateCodeVerifier() {
  return List.generate(
    64,
    (_) => _verifierCharset[_secureRandom.nextInt(_verifierCharset.length)],
  ).join();
}

String generateCodeChallenge(String codeVerifier) {
  final digest = sha256.convert(ascii.encode(codeVerifier));
  return base64Url.encode(digest.bytes).replaceAll('=', '');
}

String generateState() {
  final bytes = List<int>.generate(16, (_) => _secureRandom.nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}
