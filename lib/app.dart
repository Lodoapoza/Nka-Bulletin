import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/settings_provider.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/unlock/unlock_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'screens/explorer/explorer_screen.dart';
import 'screens/merge/merge_screen.dart';
import 'screens/settings/settings_screen.dart';

class NkaBulletinApp extends StatelessWidget {
  const NkaBulletinApp({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final settingsProvider = context.watch<SettingsProvider>();

    final router = GoRouter(
      refreshListenable: authProvider,
      redirect: (context, state) {
        final authState = authProvider.authStep;
        final isAuthRoute = state.matchedLocation == '/auth';
        final isUnlockRoute = state.matchedLocation == '/unlock';

        if (authState == AuthStep.unauthenticated && !isAuthRoute) {
          return '/auth';
        }
        if (authState == AuthStep.needsUnlock && !isUnlockRoute) {
          return '/unlock';
        }
        if (authState == AuthStep.authenticated &&
            (isAuthRoute || isUnlockRoute)) {
          return '/dashboard';
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/auth',
          builder: (context, state) => const AuthScreen(),
        ),
        GoRoute(
          path: '/unlock',
          builder: (context, state) => const UnlockScreen(),
        ),
        GoRoute(
          path: '/dashboard',
          builder: (context, state) => const DashboardScreen(),
        ),
        GoRoute(
          path: '/explorer',
          builder: (context, state) => const ExplorerScreen(),
        ),
        GoRoute(
          path: '/merge',
          builder: (context, state) => const MergeScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
      initialLocation: '/auth',
    );

    return MaterialApp.router(
      title: 'Nka Bulletin',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
        brightness: settingsProvider.isDarkMode ? Brightness.dark : Brightness.light,
      ),
      routerConfig: router,
    );
  }
}
