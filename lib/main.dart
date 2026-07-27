import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'providers/auth_provider.dart';
import 'providers/bulletin_provider.dart';
import 'providers/settings_provider.dart';
import 'services/storage/database_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final databaseService = DatabaseService();
  await databaseService.init();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => BulletinProvider()),
        ChangeNotifierProvider(create: (_) => SettingsProvider()),
      ],
      child: const NkaBulletinApp(),
    ),
  );
}