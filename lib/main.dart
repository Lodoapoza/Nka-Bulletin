import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:workmanager/workmanager.dart';
import 'app.dart';
import 'providers/auth_provider.dart';
import 'providers/bulletin_provider.dart';
import 'providers/settings_provider.dart';
import 'services/storage/database_service.dart';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    final db = DatabaseService();
    await db.init();
    // Background bulletin check would go here
    return true;
  });
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Workmanager().initialize(callbackDispatcher, isInDebugMode: false);

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
