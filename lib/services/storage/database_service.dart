import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../../models/bulletin.dart';
import '../../models/mail_config.dart';

class DatabaseService {
  static Database? _database;

  Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    return openDatabase(
      join(dbPath, 'nka_bulletin.db'),
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE bulletins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_name TEXT NOT NULL,
            school_name TEXT NOT NULL,
            class_level TEXT NOT NULL DEFAULT '',
            trimester TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL,
            download_date TEXT NOT NULL,
            source_email TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            summary TEXT,
            message_id TEXT UNIQUE
          )
        ''');
        await db.execute('''
          CREATE TABLE mail_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            access_token TEXT,
            refresh_token TEXT,
            imap_host TEXT,
            imap_port INTEGER,
            imap_login TEXT,
            imap_password TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_checked TEXT,
            unread_count INTEGER
          )
        ''');
      },
    );
  }

  Future<void> init() async {
    await database;
  }

  // Bulletins
  Future<int> insertBulletin(Bulletin bulletin) async {
    final db = await database;
    return db.insert('bulletins', bulletin.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Bulletin>> getAllBulletins() async {
    final db = await database;
    final result = await db.query('bulletins', orderBy: 'download_date DESC');
    return result.map((map) => Bulletin.fromMap(map)).toList();
  }

  Future<Bulletin?> getBulletinByMessageId(String messageId) async {
    final db = await database;
    final result = await db.query('bulletins',
        where: 'message_id = ?', whereArgs: [messageId]);
    if (result.isEmpty) return null;
    return Bulletin.fromMap(result.first);
  }

  Future<void> deleteBulletin(int id) async {
    final db = await database;
    await db.delete('bulletins', where: 'id = ?', whereArgs: [id]);
  }

  // Mail Configs
  Future<int> saveMailConfig(MailConfig config) async {
    final db = await database;
    return db.insert('mail_configs', config.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<MailConfig>> getMailConfigs() async {
    final db = await database;
    final result = await db.query('mail_configs');
    return result.map((map) => MailConfig.fromMap(map)).toList();
  }

  Future<void> deleteMailConfig(int id) async {
    final db = await database;
    await db.delete('mail_configs', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> clearAllData() async {
    final db = await database;
    await db.delete('bulletins');
    await db.delete('mail_configs');
  }
}