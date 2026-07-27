import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import '../services/auth/google_auth_service.dart';
import '../services/auth/microsoft_auth_service.dart';
import '../services/auth/biometric_service.dart';
import '../services/storage/secure_storage_service.dart';
import '../services/storage/database_service.dart';
import '../models/mail_config.dart';

enum AuthStep { unauthenticated, choosingProvider, signingIn, settingPin, needsUnlock, authenticated }

class AuthProvider extends ChangeNotifier {
  final GoogleAuthService _googleAuth = GoogleAuthService();
  final MicrosoftAuthService _microsoftAuth = MicrosoftAuthService();
  final BiometricService _biometricService = BiometricService();
  final SecureStorageService _storage = SecureStorageService();
  final DatabaseService _db = DatabaseService();

  AuthStep _authStep = AuthStep.unauthenticated;
  String? _currentUserEmail;
  String? _currentUserDisplayName;
  String? _errorMessage;
  bool _isLoading = false;
  bool _isBiometricEnabled = false;
  List<MailConfig> _mailConfigs = [];

  AuthStep get authStep => _authStep;
  String? get currentUserEmail => _currentUserEmail;
  String? get currentUserDisplayName => _currentUserDisplayName;
  String? get errorMessage => _errorMessage;
  bool get isLoading => _isLoading;
  bool get isBiometricEnabled => _isBiometricEnabled;
  List<MailConfig> get mailConfigs => _mailConfigs;

  AuthProvider() {
    _checkExistingAuth();
  }

  Future<void> _checkExistingAuth() async {
    final hasPin = await _storage.hasPin();
    if (!hasPin) {
      _authStep = AuthStep.unauthenticated;
      notifyListeners();
      return;
    }
    _isBiometricEnabled = await _storage.getBiometricEnabled();
    if (_isBiometricEnabled) {
      _authStep = AuthStep.needsUnlock;
    } else {
      _authStep = AuthStep.needsUnlock;
    }
    _mailConfigs = await _db.getMailConfigs();
    if (_mailConfigs.isNotEmpty) {
      _currentUserEmail = _mailConfigs.first.email;
      _currentUserDisplayName = _mailConfigs.first.displayName;
    }
    notifyListeners();
  }

  void goToProviderChoice() {
    _authStep = AuthStep.choosingProvider;
    _errorMessage = null;
    notifyListeners();
  }

  Future<bool> signInWithGoogle() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final result = await _googleAuth.signIn();
      if (result != null) {
        _currentUserEmail = result.email;
        _currentUserDisplayName = result.displayName;

        final config = MailConfig(
          email: result.email,
          displayName: result.displayName ?? result.email,
          providerType: MailProviderType.google,
          accessToken: result.accessToken,
        );
        await _db.saveMailConfig(config);
        await _storage.saveToken('google_access', result.accessToken!);
        if (result.idToken != null) {
          await _storage.saveToken('google_id', result.idToken!);
        }

        _authStep = AuthStep.settingPin;
        _mailConfigs = await _db.getMailConfigs();
        notifyListeners();
        return true;
      }
      _errorMessage = 'Connexion Google annulee';
      return false;
    } catch (e) {
      _errorMessage = 'Erreur Google: ${e.toString()}';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> signInWithMicrosoft() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final result = await _microsoftAuth.signIn();
      if (result != null) {
        _currentUserEmail = result.email;
        _currentUserDisplayName = result.displayName;

        final config = MailConfig(
          email: result.email,
          displayName: result.displayName ?? result.email,
          providerType: MailProviderType.microsoft,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        );
        await _db.saveMailConfig(config);
        await _storage.saveToken('ms_access', result.accessToken!);
        if (result.refreshToken != null) {
          await _storage.saveToken('ms_refresh', result.refreshToken!);
        }

        _authStep = AuthStep.settingPin;
        _mailConfigs = await _db.getMailConfigs();
        notifyListeners();
        return true;
      }
      _errorMessage = 'Connexion Microsoft annulee';
      return false;
    } catch (e) {
      _errorMessage = 'Erreur Microsoft: ${e.toString()}';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> signInWithImap({
    required String host,
    required int port,
    required String login,
    required String password,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final config = MailConfig(
        email: login,
        displayName: login,
        providerType: MailProviderType.imap,
        imapHost: host,
        imapPort: port,
        imapLogin: login,
        imapPassword: password,
      );
      await _db.saveMailConfig(config);

      _currentUserEmail = login;
      _currentUserDisplayName = login;
      _authStep = AuthStep.settingPin;
      _mailConfigs = await _db.getMailConfigs();
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Erreur IMAP: ${e.toString()}';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> setupPin(String pin) async {
    if (pin.length < 4) {
      _errorMessage = 'Le PIN doit avoir au moins 4 chiffres';
      notifyListeners();
      return false;
    }
    await _storage.savePin(pin);
    _authStep = AuthStep.authenticated;
    notifyListeners();
    return true;
  }

  Future<bool> unlockWithPin(String pin) async {
    final savedPin = await _storage.getPin();
    if (pin == savedPin) {
      _authStep = AuthStep.authenticated;
      notifyListeners();
      return true;
    }
    _errorMessage = 'PIN incorrect';
    notifyListeners();
    return false;
  }

  Future<bool> unlockWithBiometrics() async {
    try {
      final canAuth = await _biometricService.canAuthenticate();
      if (!canAuth) {
        _errorMessage = 'Biometrie non disponible';
        notifyListeners();
        return false;
      }
      final authenticated = await _biometricService.authenticate();
      if (authenticated) {
        _authStep = AuthStep.authenticated;
        notifyListeners();
        return true;
      }
      _errorMessage = 'Authentification biometrique echouee';
      notifyListeners();
      return false;
    } catch (e) {
      _errorMessage = 'Erreur biometrie: ${e.toString()}';
      notifyListeners();
      return false;
    }
  }

  Future<void> changePin(String oldPin, String newPin) async {
    final savedPin = await _storage.getPin();
    if (oldPin != savedPin) {
      _errorMessage = 'Ancien PIN incorrect';
      notifyListeners();
      return;
    }
    if (newPin.length < 4) {
      _errorMessage = 'Le nouveau PIN doit avoir au moins 4 chiffres';
      notifyListeners();
      return;
    }
    await _storage.savePin(newPin);
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    await _storage.setBiometricEnabled(enabled);
    _isBiometricEnabled = enabled;
    notifyListeners();
  }

  Future<void> signOut() async {
    await _googleAuth.signOut();
    await _storage.deleteAll();
    await _db.clearAllData();
    _authStep = AuthStep.unauthenticated;
    _currentUserEmail = null;
    _currentUserDisplayName = null;
    _mailConfigs = [];
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> removeMailConfig(int configId) async {
    await _db.deleteMailConfig(configId);
    _mailConfigs = await _db.getMailConfigs();
    if (_mailConfigs.isEmpty) {
      await signOut();
    } else {
      _currentUserEmail = _mailConfigs.first.email;
      _currentUserDisplayName = _mailConfigs.first.displayName;
    }
    notifyListeners();
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthProvider && authStep == other.authStep;

  @override
  int get hashCode => authStep.hashCode;
}