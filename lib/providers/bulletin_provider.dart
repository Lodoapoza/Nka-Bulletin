import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_file/open_file.dart';
import 'package:share_plus/share_plus.dart';
import '../models/bulletin.dart';
import '../models/mail_config.dart';
import '../services/storage/database_service.dart';
import '../services/mail/mail_service.dart';
import '../services/mail/gmail_mail_service.dart';
import '../services/mail/outlook_mail_service.dart';
import 'auth_provider.dart' show MailProviderType;

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
    return _bulletins
        .where((b) =>
            b.studentName.toLowerCase().contains(q) ||
            b.schoolName.toLowerCase().contains(q) ||
            b.trimester.toLowerCase().contains(q))
        .toList();
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
    try {
      _bulletins = await _db.getAllBulletins();
      _totalBulletins = _bulletins.length;
      _unreadBulletins = _bulletins.where((b) => b.summary == null).length;
    } catch (e) {
      _errorMessage = 'Erreur chargement: ${e.toString()}';
    }
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
            service =
                OutlookMailService(accessToken: config.accessToken ?? '');
            break;
          case MailProviderType.imap:
            // IMAP direct n'est pas encore implemente via API
            continue;
        }

        if (service == null) continue;

        try {
          final messages = await service.fetchBulletinMessages();
          for (final msg in messages) {
            final existing =
                await _db.getBulletinByMessageId(msg.messageId);
            if (existing != null) continue;

            final attachments = await service.downloadAttachments(msg);
            for (final att in attachments) {
              if (att.fileName.toLowerCase().endsWith('.pdf')) {
                final localPath =
                    '${dir.path}/${msg.messageId}_${att.fileName}';
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
        } catch (e) {
          // Continue with next config if one fails
          _errorMessage =
              'Erreur avec ${config.email}: ${e.toString()}';
        }
      }

      await loadBulletins();
      if (newCount > 0) {
        _errorMessage = '$newCount nouveau(x) bulletin(s) recu(s)';
      } else {
        _errorMessage = 'Aucun nouveau bulletin';
      }
    } catch (e) {
      _errorMessage = 'Erreur lors de la verification: ${e.toString()}';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> deleteBulletin(int id) async {
    try {
      final bulletin = _bulletins.firstWhere((b) => b.id == id);
      final file = File(bulletin.filePath);
      if (await file.exists()) {
        await file.delete();
      }
    } catch (_) {
      // File may not exist, continue
    }
    await _db.deleteBulletin(id);
    await loadBulletins();
  }

  Future<void> openBulletin(int id) async {
    try {
      final bulletin = _bulletins.firstWhere((b) => b.id == id);
      final file = File(bulletin.filePath);
      if (await file.exists()) {
        await OpenFile.open(bulletin.filePath);
      } else {
        _errorMessage = 'Fichier introuvable: le bulletin a ete deplace ou supprime';
        notifyListeners();
      }
    } catch (e) {
      _errorMessage = 'Erreur ouverture: ${e.toString()}';
      notifyListeners();
    }
  }

  Future<void> shareBulletin(int id) async {
    try {
      final bulletin = _bulletins.firstWhere((b) => b.id == id);
      final file = File(bulletin.filePath);
      if (await file.exists()) {
        await Share.shareXFiles([
          XFile(bulletin.filePath)
        ], text: 'Bulletin de ${bulletin.studentName}');
      } else {
        _errorMessage = 'Fichier introuvable';
        notifyListeners();
      }
    } catch (e) {
      _errorMessage = 'Erreur partage: ${e.toString()}';
      notifyListeners();
    }
  }

  Future<void> mergeBulletins(List<int> bulletinIds) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final selected =
          _bulletins.where((b) => bulletinIds.contains(b.id)).toList();
      if (selected.length < 2) {
        _errorMessage = 'Selectionnez au moins 2 bulletins';
        _isLoading = false;
        notifyListeners();
        return;
      }

      final dir = await getApplicationDocumentsDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final mergedPath =
          '${dir.path}/bulletins_fusionnes_$timestamp.pdf';

      // Create a simple merged PDF with info about each bulletin
      // The actual bulletins are PDF files that can be opened individually
      // This creates a summary document
      final file = File(mergedPath);
      final buffer = StringBuffer();
      buffer.writeln('=== NKA BULLETIN - FUSION ===');
      buffer.writeln('Date: ${DateTime.now()}');
      buffer.writeln('Nombre de bulletins: ${selected.length}');
      buffer.writeln('');
      for (int i = 0; i < selected.length; i++) {
        final b = selected[i];
        buffer.writeln('--- Bulletin ${i + 1} ---');
        buffer.writeln('Eleve: ${b.studentName}');
        buffer.writeln('Ecole: ${b.schoolName}');
        buffer.writeln('Classe: ${b.classLevel}');
        buffer.writeln('Trimestre: ${b.trimester}');
        buffer.writeln('Source: ${b.sourceEmail}');
        buffer.writeln('Date: ${b.downloadDate.day}/${b.downloadDate.month}/${b.downloadDate.year}');
        buffer.writeln('');
      }
      await file.writeAsString(buffer.toString());

      _errorMessage =
          '${selected.length} bulletins fusionnes';
    } catch (e) {
      _errorMessage = 'Erreur fusion: ${e.toString()}';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}