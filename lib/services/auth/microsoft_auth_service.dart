import 'dart:convert';
import 'dart:io';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:dio/dio.dart';

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

  // Remplacez par votre Azure AD Client ID
  // Azure Portal > App registrations > New registration
  // Ajoutez Mobile/Desktop platform avec redirect URI: msauth://com.nka.bulletin/ENCODED_CLIENT_ID
  static const String _clientId = 'VOTRE_AZURE_CLIENT_ID';

  static const List<String> _scopes = [
    'openid',
    'email',
    'profile',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
  ];

  Future<MicrosoftSignInResult?> signIn() async {
    if (_clientId == 'VOTRE_AZURE_CLIENT_ID' || _clientId.isEmpty) {
      throw Exception(
        'Microsoft OAuth non configure. '
        'Allez sur portal.azure.com, creez une App Registration, '
        'ajoutez Mobile/Desktop platform avec redirect URI: msauth://com.nka.bulletin/VOTRE_CLIENT_ID_ENCODE, '
        'puis entrez le client ID dans microsoft_auth_service.dart'
      );
    }

    try {
      final result = await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          'https://login.microsoftonline.com/$_tenantId/oauth2/v2.0/authorize',
          _clientId,
          redirectUrl:
              'msauth://com.nka.bulletin/${_urlSafeBase64(_clientId)}',
          scopes: _scopes,
        ),
      );

      if (result == null) return null;

      final userInfo = await _fetchUserInfo(result.accessToken);
      final email =
          userInfo['mail'] ?? userInfo['userPrincipalName'] ?? '';
      if (email.isEmpty) {
        throw Exception('Impossible de recuperer l\'email depuis Microsoft');
      }

      return MicrosoftSignInResult(
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        email: email,
        displayName: userInfo['displayName'],
      );
    } catch (e) {
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _fetchUserInfo(String accessToken) async {
    try {
      final dio = Dio();
      final response = await dio.get(
        'https://graph.microsoft.com/v1.0/me',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
      return response.data as Map<String, dynamic>;
    } catch (e) {
      throw Exception('Erreur recuperation profil Microsoft: ${e.toString()}');
    }
  }

  String _urlSafeBase64(String input) {
    return base64
        .encode(utf8.encode(input))
        .replaceAll('=', '')
        .replaceAll('+', '-')
        .replaceAll('/', '_');
  }
}
