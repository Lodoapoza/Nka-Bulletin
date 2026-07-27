import 'dart:convert';
import 'package:flutter_appauth/flutter_appauth.dart';

class GoogleSignInResult {
  final String? accessToken;
  final String? idToken;
  final String email;
  final String? displayName;
  final String? photoUrl;

  const GoogleSignInResult({
    this.accessToken,
    this.idToken,
    required this.email,
    this.displayName,
    this.photoUrl,
  });
}

class GoogleAuthService {
  final FlutterAppAuth _appAuth = const FlutterAppAuth();

  // Remplacez par votre Web Client ID Google Cloud Console
  // Creer un projet > APIs & Services > Credentials > OAuth 2.0 Client ID (Web application)
  // Ajoutez l'URL de redirection: com.googleusercontent.apps.VOTRE_CLIENT_ID:/oauth2redirect
  static const String _clientId = 'VOTRE_GOOGLE_WEB_CLIENT_ID';

  static const List<String> _scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
  ];

  Future<GoogleSignInResult?> signIn() async {
    if (_clientId == 'VOTRE_GOOGLE_WEB_CLIENT_ID' || _clientId.isEmpty) {
      throw Exception(
        'Google OAuth non configure. '
        'Allez sur console.cloud.google.com, creez un projet, '
        'activez Gmail API, creez un OAuth 2.0 Client ID (Web), '
        'puis entrez le client ID dans google_auth_service.dart'
      );
    }

    try {
      final result = await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          'https://accounts.google.com/o/oauth2/v2/auth',
          _clientId,
          redirectUrl: 'com.googleusercontent.apps.$_clientId:/oauth2redirect',
          scopes: _scopes,
        ),
      );

      if (result == null) return null;

      // Decode JWT to get email
      String? email;
      String? displayName;
      String? photoUrl;
      if (result.idToken != null) {
        final parts = result.idToken!.split('.');
        if (parts.length >= 2) {
          final payload = json.decode(
            utf8.decode(base64.decode(base64UrlDecode(parts[1]))),
          );
          email = payload['email'] as String?;
          displayName = payload['name'] as String?;
          photoUrl = payload['picture'] as String?;
        }
      }

      if (email == null || email.isEmpty) {
        throw Exception('Impossible de recuperer l\'email depuis Google');
      }

      return GoogleSignInResult(
        accessToken: result.accessToken,
        idToken: result.idToken,
        email: email,
        displayName: displayName,
        photoUrl: photoUrl,
      );
    } catch (e) {
      rethrow;
    }
  }

  Future<void> signOut() async {
    // Nothing to do for web-based OAuth
  }
}

String base64UrlDecode(String input) {
  return base64.decode(input.replaceAll('-', '+').replaceAll('_', '/') +
      '=' * (4 - input.length % 4));
}
