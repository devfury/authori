import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'oauth_service.dart';
import 'pkce_helper.dart';

typedef ExternalUrlLauncher = Future<bool> Function(Uri uri);

abstract class DeepLinkClient {
  Future<Uri?> getInitialLink();

  Stream<Uri> get uriLinkStream;
}

class AppLinksDeepLinkClient implements DeepLinkClient {
  AppLinksDeepLinkClient() : _appLinks = AppLinks();

  final AppLinks _appLinks;

  @override
  Future<Uri?> getInitialLink() => _appLinks.getInitialLink();

  @override
  Stream<Uri> get uriLinkStream => _appLinks.uriLinkStream;
}

Future<bool> launchExternalBrowser(Uri uri) {
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    this.oauthService,
    this.deepLinkClient,
    this.urlLauncher,
  });

  final OAuthService? oauthService;
  final DeepLinkClient? deepLinkClient;
  final ExternalUrlLauncher? urlLauncher;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _PendingOAuthSession {
  const _PendingOAuthSession({
    required this.state,
    required this.codeVerifier,
    required this.config,
  });

  final String state;
  final String codeVerifier;
  final OAuthConfig config;
}

class _TokenSession {
  const _TokenSession({
    required this.config,
    required this.response,
    required this.receivedAt,
  });

  final OAuthConfig config;
  final TokenResponse response;
  final DateTime receivedAt;
}

Map<String, dynamic>? decodeJwtPayload(String? token) {
  if (token == null || token.isEmpty) {
    return null;
  }

  final segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    final normalized = base64Url.normalize(segments[1]);
    final decoded = utf8.decode(base64Url.decode(normalized));
    final payload = jsonDecode(decoded);
    return payload is Map<String, dynamic> ? payload : null;
  } catch (_) {
    return null;
  }
}

class _HomeScreenState extends State<HomeScreen> {
  static const String _settingsStorageKey =
      'authori.flutter_testapp.integration_settings';

  late final OAuthService _oauthService;
  late final DeepLinkClient _deepLinkClient;
  late final ExternalUrlLauncher _urlLauncher;
  StreamSubscription<Uri>? _deepLinkSubscription;

  final TextEditingController _baseUrlController = TextEditingController(
    text: 'http://localhost:3000',
  );
  final TextEditingController _tenantSlugController = TextEditingController(
    text: 'test',
  );
  final TextEditingController _clientIdController = TextEditingController(
    text: 'flutter-testapp',
  );
  final TextEditingController _scopeController = TextEditingController(
    text: 'openid profile email',
  );
  final TextEditingController _redirectUriController = TextEditingController(
    text: 'http://localhost:5174/oauth/callback',
  );
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _isBusy = false;
  bool _isAwaitingDeepLink = false;
  bool _isLoadingSettings = true;
  String? _errorMessage;
  String? _statusMessage;
  String? _authorizationCode;
  _TokenSession? _tokenSession;
  AuthorizeInitiationResponse? _authorizeResponse;
  _PendingOAuthSession? _pendingSession;

  OAuthConfig get _config => OAuthConfig(
    authServerBaseUrl: _baseUrlController.text.trim(),
    tenantSlug: _tenantSlugController.text.trim(),
    clientId: _clientIdController.text.trim(),
    scope: _scopeController.text.trim(),
    redirectUri: _redirectUriController.text.trim(),
  );

  String get _authorizeEndpoint => _config.buildUri('authorize').toString();
  String get _tokenEndpoint => _config.buildUri('token').toString();
  Map<String, dynamic>? get _accessTokenClaims =>
      decodeJwtPayload(_tokenSession?.response.accessToken);
  Map<String, dynamic>? get _refreshTokenClaims =>
      decodeJwtPayload(_tokenSession?.response.refreshToken);
  DateTime? get _expiresAt {
    final session = _tokenSession;
    if (session == null || session.response.expiresIn <= 0) {
      return null;
    }

    return session.receivedAt.add(
      Duration(seconds: session.response.expiresIn),
    );
  }

  @override
  void initState() {
    super.initState();
    _oauthService = widget.oauthService ?? OAuthService();
    _deepLinkClient = widget.deepLinkClient ?? AppLinksDeepLinkClient();
    _urlLauncher = widget.urlLauncher ?? launchExternalBrowser;
    _registerSettingsListeners();
    unawaited(_loadIntegrationSettings());
    unawaited(_initializeDeepLinks());
  }

  @override
  void dispose() {
    _deepLinkSubscription?.cancel();
    if (widget.oauthService == null) {
      _oauthService.dispose();
    }
    _baseUrlController.dispose();
    _tenantSlugController.dispose();
    _clientIdController.dispose();
    _scopeController.dispose();
    _redirectUriController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _registerSettingsListeners() {
    _baseUrlController.addListener(_persistIntegrationSettings);
    _tenantSlugController.addListener(_persistIntegrationSettings);
    _clientIdController.addListener(_persistIntegrationSettings);
    _scopeController.addListener(_persistIntegrationSettings);
    _redirectUriController.addListener(_persistIntegrationSettings);
  }

  Future<void> _loadIntegrationSettings() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_settingsStorageKey);

    if (raw != null) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        _baseUrlController.text =
            json['authServerBaseUrl'] as String? ?? _baseUrlController.text;
        _tenantSlugController.text =
            json['tenantSlug'] as String? ?? _tenantSlugController.text;
        _clientIdController.text =
            json['clientId'] as String? ?? _clientIdController.text;
        _scopeController.text =
            json['scope'] as String? ?? _scopeController.text;
        _redirectUriController.text =
            json['redirectUri'] as String? ?? _redirectUriController.text;
      } catch (_) {
        await preferences.remove(_settingsStorageKey);
      }
    }

    if (!mounted) return;
    setState(() {
      _isLoadingSettings = false;
    });
  }

  Future<void> _persistIntegrationSettings() async {
    if (_isLoadingSettings) {
      return;
    }

    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _settingsStorageKey,
      jsonEncode({
        'authServerBaseUrl': _baseUrlController.text,
        'tenantSlug': _tenantSlugController.text,
        'clientId': _clientIdController.text,
        'scope': _scopeController.text,
        'redirectUri': _redirectUriController.text,
      }),
    );
  }

  Future<void> _initializeDeepLinks() async {
    final initialUri = await _deepLinkClient.getInitialLink();
    if (initialUri != null && mounted) {
      await _handleDeepLink(initialUri);
    }

    _deepLinkSubscription = _deepLinkClient.uriLinkStream.listen((uri) {
      unawaited(_handleDeepLink(uri));
    });
  }

  Future<void> _login() async {
    FocusScope.of(context).unfocus();

    if (_emailController.text.trim().isEmpty ||
        _passwordController.text.isEmpty) {
      setState(() {
        _errorMessage = '이메일과 비밀번호를 모두 입력해 주세요.';
        _statusMessage = null;
      });
      return;
    }

    setState(() {
      _isBusy = true;
      _isAwaitingDeepLink = false;
      _errorMessage = null;
      _statusMessage = null;
    });

    try {
      final currentConfig = _config;
      final codeVerifier = generateCodeVerifier();
      final codeChallenge = generateCodeChallenge(codeVerifier);
      final state = generateState();

      final authorizeResponse = await _oauthService.initiateAuthorize(
        config: currentConfig,
        state: state,
        codeChallenge: codeChallenge,
      );

      final loginResponse = await _oauthService.submitLogin(
        config: currentConfig,
        requestId: authorizeResponse.requestId,
        email: _emailController.text.trim(),
        password: _passwordController.text,
        grantedScopes: authorizeResponse.requestedScopes,
      );

      final launched = await _urlLauncher(Uri.parse(loginResponse.url));
      if (!launched) {
        throw OAuthServiceException('브라우저를 열지 못했습니다.');
      }

      setState(() {
        _authorizeResponse = authorizeResponse;
        _pendingSession = _PendingOAuthSession(
          state: state,
          codeVerifier: codeVerifier,
          config: currentConfig,
        );
        _tokenSession = null;
        _authorizationCode = null;
        _isAwaitingDeepLink = true;
        _statusMessage = '브라우저에서 인증을 완료한 뒤 deep link로 앱에 다시 돌아오세요.';
      });
    } on OAuthServiceException catch (error) {
      setState(() {
        _errorMessage = _mapErrorMessage(error.message);
      });
    } catch (error) {
      setState(() {
        _errorMessage = '로그인 처리 중 오류가 발생했습니다: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
        });
      }
    }
  }

  Future<void> _handleDeepLink(Uri uri) async {
    if (uri.scheme != 'authori' ||
        uri.host != 'oauth' ||
        uri.path != '/callback') {
      return;
    }

    final pendingSession = _pendingSession;
    if (pendingSession == null) {
      if (!mounted) return;
      setState(() {
        _errorMessage = '진행 중인 인증 세션이 없어 deep link를 처리할 수 없습니다.';
        _statusMessage = null;
        _isAwaitingDeepLink = false;
      });
      return;
    }

    final callbackError = uri.queryParameters['error'];
    final callbackErrorDescription = uri.queryParameters['error_description'];
    if (callbackError != null) {
      if (!mounted) return;
      setState(() {
        _errorMessage = callbackErrorDescription ?? callbackError;
        _statusMessage = null;
        _isAwaitingDeepLink = false;
      });
      return;
    }

    final returnedCode = uri.queryParameters['code'];
    final returnedState = uri.queryParameters['state'];

    if (returnedCode == null || returnedCode.isEmpty) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'deep link에 authorization code가 없습니다.';
        _statusMessage = null;
        _isAwaitingDeepLink = false;
      });
      return;
    }

    if (returnedState != pendingSession.state) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'state 검증에 실패했습니다. 다시 로그인해 주세요.';
        _statusMessage = null;
        _isAwaitingDeepLink = false;
      });
      return;
    }

    if (!mounted) return;
    setState(() {
      _isBusy = true;
      _errorMessage = null;
      _statusMessage = 'deep link callback을 받아 토큰을 교환하는 중입니다.';
    });

    try {
      final tokenResponse = await _oauthService.exchangeToken(
        config: pendingSession.config,
        code: returnedCode,
        codeVerifier: pendingSession.codeVerifier,
      );

      if (!mounted) return;
      setState(() {
        _authorizationCode = returnedCode;
        _tokenSession = _TokenSession(
          config: pendingSession.config,
          response: tokenResponse,
          receivedAt: DateTime.now(),
        );
        _pendingSession = null;
        _isAwaitingDeepLink = false;
        _statusMessage = 'deep link callback 처리와 토큰 교환에 성공했습니다.';
      });
    } on OAuthServiceException catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = _mapErrorMessage(error.message);
        _isAwaitingDeepLink = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'deep link 처리 중 오류가 발생했습니다: $error';
        _isAwaitingDeepLink = false;
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
        });
      }
    }
  }

  Future<void> _refreshToken() async {
    final session = _tokenSession;
    final currentRefreshToken = session?.response.refreshToken;

    if (session == null ||
        currentRefreshToken == null ||
        currentRefreshToken.isEmpty) {
      setState(() {
        _errorMessage = '갱신 가능한 refresh token이 없습니다.';
        _statusMessage = null;
      });
      return;
    }

    setState(() {
      _isBusy = true;
      _errorMessage = null;
      _statusMessage = null;
    });

    try {
      final refreshed = await _oauthService.refreshToken(
        config: session.config,
        refreshToken: currentRefreshToken,
      );

      if (!mounted) return;
      setState(() {
        _tokenSession = _TokenSession(
          config: session.config,
          response: TokenResponse(
            accessToken: refreshed.accessToken,
            tokenType: refreshed.tokenType,
            expiresIn: refreshed.expiresIn,
            refreshToken: refreshed.refreshToken ?? currentRefreshToken,
            scope: refreshed.scope,
            idToken: refreshed.idToken,
          ),
          receivedAt: DateTime.now(),
        );
        _statusMessage = '토큰을 갱신했습니다.';
      });
    } on OAuthServiceException catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = _mapErrorMessage(error.message);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = '토큰 갱신 중 오류가 발생했습니다: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
        });
      }
    }
  }

  Future<void> _revokeAndLogout() async {
    final session = _tokenSession;
    if (session == null) {
      _resetSession();
      return;
    }

    setState(() {
      _isBusy = true;
      _errorMessage = null;
      _statusMessage = null;
    });

    try {
      final revokeTargets = <({String token, String hint})>[
        if (session.response.refreshToken != null &&
            session.response.refreshToken!.isNotEmpty)
          (token: session.response.refreshToken!, hint: 'refresh_token'),
        if (session.response.accessToken.isNotEmpty)
          (token: session.response.accessToken, hint: 'access_token'),
      ];

      for (final target in revokeTargets) {
        await _oauthService.revokeToken(
          config: session.config,
          token: target.token,
          tokenTypeHint: target.hint,
        );
      }

      if (!mounted) return;
      setState(() {
        _errorMessage = null;
        _statusMessage = '토큰을 폐기하고 로그아웃했습니다.';
        _authorizationCode = null;
        _tokenSession = null;
        _authorizeResponse = null;
        _pendingSession = null;
        _isAwaitingDeepLink = false;
      });
    } on OAuthServiceException catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = _mapErrorMessage(error.message);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = '토큰 폐기 중 오류가 발생했습니다: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
        });
      }
    }
  }

  void _resetSession() {
    setState(() {
      _errorMessage = null;
      _statusMessage = '세션을 초기화했습니다.';
      _authorizationCode = null;
      _tokenSession = null;
      _authorizeResponse = null;
      _pendingSession = null;
      _isAwaitingDeepLink = false;
    });
  }

  String _mapErrorMessage(String raw) {
    switch (raw) {
      case 'invalid_credentials':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'account_locked':
        return '계정이 잠겼습니다. 잠시 후 다시 시도해 주세요.';
      case 'invalid_request: expired or not found':
        return '인가 요청이 만료되었습니다. 다시 시도해 주세요.';
      case 'invalid_client':
        return 'Client ID 설정이 올바르지 않습니다. 등록된 클라이언트 정보를 확인해 주세요.';
      case 'redirect_uri_mismatch':
        return 'Redirect URI가 등록된 값과 일치하지 않습니다.';
      case 'code_verifier required':
        return 'PKCE 검증 정보가 없습니다. 로그인 흐름을 다시 시작해 주세요.';
      case 'unsupported_grant_type':
        return '지원하지 않는 토큰 요청입니다.';
      case 'invalid_grant':
      case 'invalid_grant: code already used':
      case 'invalid_grant: code expired':
      case 'invalid_grant: redirect_uri mismatch':
      case 'invalid_grant: token revoked':
      case 'invalid_grant: token reuse detected':
      case 'invalid_grant: token expired':
        return '인증 세션이 유효하지 않거나 만료됐습니다. 처음부터 다시 로그인해 주세요.';
      case 'invalid_token':
        return 'access token이 유효하지 않습니다.';
      case 'token_revoked':
        return '토큰이 이미 폐기되었습니다.';
      default:
        return raw;
    }
  }

  String _prettyJson(Object? value, String emptyMessage) {
    if (value == null) {
      return emptyMessage;
    }

    const encoder = JsonEncoder.withIndent('  ');

    if (value is TokenResponse) {
      return encoder.convert(value.toJson());
    }

    if (value is _TokenSession) {
      return encoder.convert(value.response.toJson());
    }

    return encoder.convert(value);
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoadingSettings) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Authori Flutter 테스트앱')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'test tenant용 OAuth2 Authorization Code + PKCE 테스트 앱',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'bridge 앱을 redirect URI로 사용하고, 인증 완료 후 authori://oauth/callback deep link로 돌아와 토큰을 교환합니다.',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '연동 설정',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 16,
                          runSpacing: 16,
                          children: [
                            _buildTextField(
                              _baseUrlController,
                              'Auth Server Base URL',
                              hintText: 'http://localhost:3000',
                            ),
                            _buildTextField(
                              _tenantSlugController,
                              'Tenant Slug',
                              hintText: 'test',
                            ),
                            _buildTextField(
                              _clientIdController,
                              'Client ID',
                              hintText: 'flutter-testapp',
                            ),
                            _buildTextField(
                              _scopeController,
                              'Scope',
                              hintText: 'openid profile email',
                            ),
                            _buildTextField(
                              _redirectUriController,
                              'Redirect URI (Bridge App URL)',
                              hintText: 'http://localhost:5174/oauth/callback',
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Flutter deep link callback은 고정값 authori://oauth/callback 을 사용합니다.',
                          style: TextStyle(color: Color(0xFF475569)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '엔드포인트',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 12),
                        _EndpointRow(
                          label: 'Authorize',
                          value: _authorizeEndpoint,
                        ),
                        _EndpointRow(label: 'Token', value: _tokenEndpoint),
                        const _EndpointRow(
                          label: 'Flutter Deep Link',
                          value: 'authori://oauth/callback',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '로그인 정보',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 16,
                          runSpacing: 16,
                          children: [
                            _buildTextField(
                              _emailController,
                              'Email',
                              hintText: 'user@example.com',
                            ),
                            _buildTextField(
                              _passwordController,
                              'Password',
                              hintText: '비밀번호',
                              obscureText: true,
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            FilledButton(
                              onPressed: _isBusy ? null : _login,
                              child: _isBusy
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text('로그인'),
                            ),
                            OutlinedButton(
                              onPressed:
                                  _isBusy ||
                                      _tokenSession?.response.refreshToken ==
                                          null
                                  ? null
                                  : _refreshToken,
                              child: const Text('토큰 갱신'),
                            ),
                            OutlinedButton(
                              onPressed: _isBusy || _tokenSession == null
                                  ? null
                                  : _revokeAndLogout,
                              child: const Text('토큰 폐기 + 로그아웃'),
                            ),
                            TextButton(
                              onPressed: _isBusy ? null : _resetSession,
                              child: const Text('세션 초기화'),
                            ),
                          ],
                        ),
                        if (_isAwaitingDeepLink) ...[
                          const SizedBox(height: 12),
                          const Text(
                            '브라우저 인증 완료 후 bridge 앱이 authori://oauth/callback 으로 앱을 다시 엽니다.',
                            style: TextStyle(
                              color: Color(0xFF1D4ED8),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        if (_statusMessage != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            _statusMessage!,
                            style: const TextStyle(
                              color: Color(0xFF166534),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        if (_errorMessage != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            _errorMessage!,
                            style: const TextStyle(
                              color: Color(0xFFDC2626),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        if (_authorizeResponse != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            'requestId: ${_authorizeResponse!.requestId} · scopes: ${_authorizeResponse!.requestedScopes.join(' ')}',
                            style: const TextStyle(color: Color(0xFF475569)),
                          ),
                        ],
                        if (_authorizationCode != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            '최근 callback code: $_authorizationCode',
                            style: const TextStyle(color: Color(0xFF475569)),
                          ),
                        ],
                        if (_tokenSession != null) ...[
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 16,
                            runSpacing: 12,
                            children: [
                              _MetaBadge(
                                label: '토큰 타입',
                                value: _tokenSession!.response.tokenType,
                              ),
                              _MetaBadge(
                                label: '만료 시각',
                                value:
                                    _expiresAt?.toLocal().toString() ?? '미제공',
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 16,
                    runSpacing: 16,
                    children: [
                      _ResultCard(
                        title: '토큰 원문',
                        content: _prettyJson(_tokenSession, '아직 토큰이 없습니다.'),
                      ),
                      _ResultCard(
                        title: 'Access Token 클레임',
                        content: _prettyJson(
                          _accessTokenClaims,
                          'JWT payload를 해석할 수 없습니다.',
                        ),
                      ),
                      _ResultCard(
                        title: 'Refresh Token 클레임',
                        content: _prettyJson(
                          _refreshTokenClaims,
                          'refresh token이 JWT가 아니거나 아직 없습니다.',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(
    TextEditingController controller,
    String label, {
    String? hintText,
    bool obscureText = false,
  }) {
    return SizedBox(
      width: 440,
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        decoration: InputDecoration(labelText: label, hintText: hintText),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: Padding(padding: const EdgeInsets.all(20), child: child),
    );
  }
}

class _EndpointRow extends StatelessWidget {
  const _EndpointRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 4),
          SelectableText(
            value,
            style: const TextStyle(
              fontFamily: 'monospace',
              color: Color(0xFF334155),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaBadge extends StatelessWidget {
  const _MetaBadge({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: const Color(0xFF64748B)),
          ),
          const SizedBox(height: 4),
          SelectableText(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF0F172A),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.title, required this.content});

  final String title;
  final String content;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 472,
      child: _SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Container(
              height: 280,
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Scrollbar(
                child: SingleChildScrollView(
                  child: SelectableText(
                    content,
                    style: const TextStyle(
                      color: Color(0xFFE2E8F0),
                      fontFamily: 'monospace',
                      height: 1.5,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
