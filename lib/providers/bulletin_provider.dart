import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../models/bulletin.dart';
import '../models/mail_config.dart';
import '../services/storage/database_service.dart';
import '../services/mail/mail_service.dart';
import '../services/mail/gmail_mail_service.dart';
import '../services/mail/outlook_mail_service.dart';
import 'auth_provider.dart' show AuthProvider, MailProviderType;

class BulletinProvider extends ChangeNotifier {
  final DatabaseService _db = DatabaseService();
  List<Bulletin> _bulletins = [];
  bool _isLoading = false;
  String? _errorMessage;
  int _totalBulletins = 0;
  int _unreadBulletins = 0;
  String _searchQuery = '';

  List<Bulletin> get bulletins {
    if (_searchQuery.isEmpty) return _bulletins;
    final q = _searchQuery.toLowerCase();
    return _bulletins.where((b) =>
      b.studentName.toLowerCase().contains(q) ||
      b.schoolName.toLowerCase().contains(q) ||
      b.trimester.toLowerCase().contains(q)).toList();
  }
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  int get totalBulletins => _totalBulletins;
  int get unreadBulletins => _unreadBulletins;
  String get searchQuery => _searchQuery;

  BulletinProvider() {
    loadBulletins();
  }

  Future<void> loadBulletins() async {
    _bulletins = await _db.getAllBulletins();
    _totalBulletins = _bulletins.length;
    _unreadBulletins = _bulletins.where((b) => b.summary == null).length;
    notifyListeners();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  Future<void> checkForNewBulletins(List<MailConfig> configs) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final dir = await getApplicationDocumentsDirectory();
      int newCount = 0;

      for (final config in configs) {
        if (!config.isActive) continue;
        MailService? service;
        switch (config.providerType) {
          case MailProviderType.google:
            service = GmailMailService(accessToken: config.accessToken ?? '');
            break;
          case MailProviderType.microsoft:
            service = OutlookMailService(accessToken: config.accessToken ?? '');
            break;
          case MailProviderType.imap:
            continue;
        }

        if (service == null) continue;

        final messages = await service.fetchBulletinMessages();
        for (final msg in messages) {
          final existing = await _db.getBulletinByMessageId(msg.messageId);
          if (existing != null) continue;

          final attachments = await service.downloadAttachments(msg);
          for (final att in attachments) {
            if (att.filePath.endsWith('.pdf')) {
              final localPath = '${dir.path}/${msg.messageId}_${att.fileName}';
              final file = File(localPath);
              await file.writeAsBytes(att.bytes);

              final bulletin = Bulletin(
                studentName: msg.fromName,
                schoolName: msg.subject,
                classLevel: '',
                trimester: '',
                filePath: localPath,
                downloadDate: DateTime.now(),
                sourceEmail: config.email,
                fileSize: att.bytes.length,
              );
              await _db.insertBulletin(bulletin);
              newCount++;
            }
          }
        }
      }

      await loadBulletins();
      if (newCount > 0) {
        _errorMessage = null;
      }
    } catch (e) {
      _errorMessage = 'Erreur lors de la verification: ${e.toString()}';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> deleteBulletin(int id) async {
    final bulletin = _bulletins.firstWhere((b) => b.id == id);
    final file = File(bulletin.filePath);
    if (await file.exists()) {
      await file.delete();
    }
    await _db.deleteBulletin(id);
    await loadBulletins();
  }

  Future<void> openBulletin(int id) async {
    final bulletin = _bulletins.firstWhere((b) => b.id == id);
    // Open PDF file
    final file = File(bulletin.filePath);
    if (await file.exists()) {
      // Use open_file or url_launcher to open PDF
    }
  }
}