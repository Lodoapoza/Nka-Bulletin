import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsProvider extends ChangeNotifier {
  SharedPreferences? _prefs;
  bool _isDarkMode = false;
  bool _notificationsEnabled = true;
  int _checkFrequencyMinutes = 30;

  bool get isDarkMode => _isDarkMode;
  bool get notificationsEnabled => _notificationsEnabled;
  int get checkFrequencyMinutes => _checkFrequencyMinutes;

  SettingsProvider() {
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    _prefs = await SharedPreferences.getInstance();
    _isDarkMode = _prefs?.getBool('dark_mode') ?? false;
    _notificationsEnabled = _prefs?.getBool('notifications') ?? true;
    _checkFrequencyMinutes = _prefs?.getInt('check_freq') ?? 30;
    notifyListeners();
  }

  Future<void> setDarkMode(bool value) async {
    _isDarkMode = value;
    await _prefs?.setBool('dark_mode', value);
    notifyListeners();
  }

  Future<void> setNotifications(bool value) async {
    _notificationsEnabled = value;
    await _prefs?.setBool('notifications', value);
    notifyListeners();
  }

  Future<void> setCheckFrequency(int minutes) async {
    _checkFrequencyMinutes = minutes;
    await _prefs?.setInt('check_freq', minutes);
    notifyListeners();
  }

  Future<void> resetAllSettings() async {
    await _prefs?.clear();
    _isDarkMode = false;
    _notificationsEnabled = true;
    _checkFrequencyMinutes = 30;
    notifyListeners();
  }
}