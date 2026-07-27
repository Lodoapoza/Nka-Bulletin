import 'dart:convert';
import 'dart:io';
import 'package:flutter_appauth/flutter_appauth.dart';

class MicrosoftSignInResult {
  final String accessToken;
  final String? refreshToken;
  final String email;
  final String? displayName;

  const MicrosoftSignInResult({
    required this.accessToken,
    this.refreshToken,
    required this.email,
    this.displayName,
  });
}

class MicrosoftAuthService {
  final FlutterAppAuth _appAuth = const FlutterAppAuth();
  static const String _tenantId = 'common';
  static const String _clientId = 'YOUR_AZURE_CLIENT_ID';
  static const List<String> _scopes = [
    'openid',
    'email',
    'profile',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
  ];

  Future<MicrosoftSignInResult?> signIn() async {
    try {
      final AuthorizationTokenResponse? result =
          await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          'https://login.microsoftonline.com/$_tenantId/oauth2/v2.0/authorize',
          _clientId,
          redirectUrl: 'msauth://com.nka.bulletin/${_urlSafeBase64(_clientId)}',
          scopes: _scopes,
        ),
      );

      if (result == null) return null;

      final userInfo = await _fetchUserInfo(result.accessToken);
      return MicrosoftSignInResult(
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        email: userInfo['mail'] ?? userInfo['userPrincipalName'] ?? '',
        displayName: userInfo['displayName'],
      );
    } catch (e) {
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _fetchUserInfo(String accessToken) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(
        Uri.parse('https://graph.microsoft.com/v1.0/me'),
      );
      request.headers.set('Authorization', 'Bearer $accessToken');
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      return json.decode(body) as Map<String, dynamic>;
    } finally {
      client.close();
    }
  }

  String _urlSafeBase64(String input) {
    return base64.encode(utf8.encode(input))
        .replaceAll('=', '')
        .replaceAll('+', '-')
        .replaceAll('/', '_');
  }
}
