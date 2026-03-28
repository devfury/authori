import 'dart:convert';

import 'package:http/http.dart' as http;

class OAuthConfig {
  const OAuthConfig({
    required this.authServerBaseUrl,
    required this.tenantSlug,
    required this.clientId,
    required this.scope,
    required this.redirectUri,
  });

  final String authServerBaseUrl;
  final String tenantSlug;
  final String clientId;
  final String scope;
  final String redirectUri;

  String get _normalizedBaseUrl =>
      authServerBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');

  Uri buildUri(String path, [Map<String, String>? queryParameters]) {
    return Uri.parse(
      '$_normalizedBaseUrl/t/$tenantSlug/oauth/$path',
    ).replace(queryParameters: queryParameters);
  }
}

class AuthorizeClientInfo {
  const AuthorizeClientInfo({required this.clientId, required this.name});

  final String clientId;
  final String name;

  factory AuthorizeClientInfo.fromJson(Map<String, dynamic> json) {
    return AuthorizeClientInfo(
      clientId: json['clientId'] as String? ?? '',
      name: json['name'] as String? ?? '',
    );
  }
}

class AuthorizeInitiationResponse {
  const AuthorizeInitiationResponse({
    required this.requestId,
    required this.tenantSlug,
    required this.client,
    required this.requestedScopes,
  });

  final String requestId;
  final String tenantSlug;
  final AuthorizeClientInfo client;
  final List<String> requestedScopes;

  factory AuthorizeInitiationResponse.fromJson(Map<String, dynamic> json) {
    final requestedScopes =
        (json['requestedScopes'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList();

    return AuthorizeInitiationResponse(
      requestId: json['requestId'] as String? ?? '',
      tenantSlug: json['tenantSlug'] as String? ?? '',
      client: AuthorizeClientInfo.fromJson(
        (json['client'] as Map<String, dynamic>? ?? const <String, dynamic>{}),
      ),
      requestedScopes: requestedScopes,
    );
  }
}

class LoginAuthorizeResponse {
  const LoginAuthorizeResponse({required this.url});

  final String url;

  factory LoginAuthorizeResponse.fromJson(Map<String, dynamic> json) {
    return LoginAuthorizeResponse(url: json['url'] as String? ?? '');
  }
}

class TokenResponse {
  const TokenResponse({
    required this.accessToken,
    required this.tokenType,
    required this.expiresIn,
    this.refreshToken,
    this.scope,
    this.idToken,
  });

  final String accessToken;
  final String tokenType;
  final int expiresIn;
  final String? refreshToken;
  final String? scope;
  final String? idToken;

  factory TokenResponse.fromJson(Map<String, dynamic> json) {
    return TokenResponse(
      accessToken: json['access_token'] as String? ?? '',
      tokenType: json['token_type'] as String? ?? '',
      expiresIn: json['expires_in'] is int
          ? json['expires_in'] as int
          : int.tryParse('${json['expires_in'] ?? 0}') ?? 0,
      refreshToken: json['refresh_token'] as String?,
      scope: json['scope'] as String?,
      idToken: json['id_token'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'access_token': accessToken,
      'token_type': tokenType,
      'expires_in': expiresIn,
      'refresh_token': refreshToken,
      'scope': scope,
      'id_token': idToken,
    }..removeWhere((_, value) => value == null);
  }
}

class OAuthServiceException implements Exception {
  OAuthServiceException(this.message);

  final String message;

  @override
  String toString() => message;
}

class OAuthService {
  OAuthService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<AuthorizeInitiationResponse> initiateAuthorize({
    required OAuthConfig config,
    required String state,
    required String codeChallenge,
  }) async {
    final response = await _client.get(
      config.buildUri('authorize', {
        'response_type': 'code',
        'client_id': config.clientId,
        'redirect_uri': config.redirectUri,
        'scope': config.scope,
        'state': state,
        'code_challenge': codeChallenge,
        'code_challenge_method': 'S256',
      }),
      headers: const {'Accept': 'application/json'},
    );

    final payload = _decodeJson(response);
    _throwIfError(response, payload, fallbackMessage: '인가 요청 준비에 실패했습니다.');
    return AuthorizeInitiationResponse.fromJson(payload);
  }

  Future<LoginAuthorizeResponse> submitLogin({
    required OAuthConfig config,
    required String requestId,
    required String email,
    required String password,
    required List<String> grantedScopes,
  }) async {
    final response = await _client.post(
      config.buildUri('authorize'),
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({
        'requestId': requestId,
        'email': email,
        'password': password,
        'grantedScopes': grantedScopes,
      }),
    );

    final payload = _decodeJson(response);
    _throwIfError(response, payload, fallbackMessage: '로그인 제출에 실패했습니다.');
    return LoginAuthorizeResponse.fromJson(payload);
  }

  Future<TokenResponse> exchangeToken({
    required OAuthConfig config,
    required String code,
    required String codeVerifier,
  }) async {
    final response = await _client.post(
      config.buildUri('token'),
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': config.redirectUri,
        'client_id': config.clientId,
        'code_verifier': codeVerifier,
      }),
    );

    final payload = _decodeJson(response);
    _throwIfError(response, payload, fallbackMessage: '토큰 교환에 실패했습니다.');
    return TokenResponse.fromJson(payload);
  }

  Future<TokenResponse> refreshToken({
    required OAuthConfig config,
    required String refreshToken,
  }) async {
    final response = await _client.post(
      config.buildUri('token'),
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken,
        'client_id': config.clientId,
      }),
    );

    final payload = _decodeJson(response);
    _throwIfError(response, payload, fallbackMessage: '토큰 갱신에 실패했습니다.');
    return TokenResponse.fromJson(payload);
  }

  Future<void> revokeToken({
    required OAuthConfig config,
    required String token,
    String? tokenTypeHint,
  }) async {
    final response = await _client.post(
      config.buildUri('revoke'),
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode(
        {
          'token': token,
          'token_type_hint': tokenTypeHint,
          'client_id': config.clientId,
        }..removeWhere((_, value) => value == null),
      ),
    );

    final payload = _decodeJson(response);
    _throwIfError(response, payload, fallbackMessage: '토큰 폐기에 실패했습니다.');
  }

  Future<Map<String, dynamic>> fetchUserinfo({
    required OAuthConfig config,
    required String accessToken,
  }) async {
    final response = await _client.get(
      config.buildUri('userinfo'),
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Accept': 'application/json',
      },
    );

    final payload = _decodeJson(response);
    _throwIfError(response, payload, fallbackMessage: 'userinfo 조회에 실패했습니다.');
    return payload;
  }

  Map<String, dynamic> _decodeJson(http.Response response) {
    if (response.body.isEmpty) {
      return <String, dynamic>{};
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }

    throw OAuthServiceException('JSON 응답 형식이 올바르지 않습니다.');
  }

  void _throwIfError(
    http.Response response,
    Map<String, dynamic> payload, {
    required String fallbackMessage,
  }) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    final message =
        payload['message'] as String? ??
        payload['error_description'] as String? ??
        payload['error'] as String? ??
        fallbackMessage;

    throw OAuthServiceException(message);
  }

  void dispose() {
    _client.close();
  }
}
