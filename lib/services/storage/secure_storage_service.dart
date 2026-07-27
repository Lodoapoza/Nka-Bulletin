import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> savePin(String pin) async {
    await _storage.write(key: 'user_pin', value: pin);
  }

  Future<String?> getPin() async {
    return await _storage.read(key: 'user_pin');
  }

  Future<bool> hasPin() async {
    return await _storage.containsKey(key: 'user_pin');
  }

  Future<void> saveToken(String key, String token) async {
    await _storage.write(key: 'token_$key', value: token);
  }

  Future<String?> getToken(String key) async {
    return await _storage.read(key: 'token_$key');
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    await _storage.write(key: 'biometric_enabled', value: enabled.toString());
  }

  Future<bool> getBiometricEnabled() async {
    final value = await _storage.read(key: 'biometric_enabled');
    return value == 'true';
  }

  Future<void> deleteAll() async {
    await _storage.deleteAll();
  }
}