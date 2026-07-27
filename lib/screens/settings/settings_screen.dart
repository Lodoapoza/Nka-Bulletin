import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/settings_provider.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _oldPinController = TextEditingController();
  final _newPinController = TextEditingController();
  final _confirmPinController = TextEditingController();
  bool _showChangePin = false;

  @override
  void dispose() {
    _oldPinController.dispose();
    _newPinController.dispose();
    _confirmPinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final settings = context.watch<SettingsProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Configuration'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/dashboard'),
        ),
      ),
      body: ListView(
        children: [
          // User info
          _buildSectionHeader('Compte'),
          ListTile(
            leading: const Icon(Icons.person),
            title: Text(auth.currentUserDisplayName ?? 'Non defini'),
            subtitle: Text(auth.currentUserEmail ?? ''),
          ),

          // Change PIN
          _buildSectionHeader('Securite'),
          ListTile(
            leading: const Icon(Icons.lock),
            title: const Text('Changer le code PIN'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => setState(() => _showChangePin = !_showChangePin),
          ),
          if (_showChangePin) _buildChangePinForm(auth),

          // Biometrics
          SwitchListTile(
            secondary: const Icon(Icons.fingerprint),
            title: const Text('Empreinte digitale'),
            subtitle: const Text('Utiliser la biometrie pour debloquer'),
            value: auth.isBiometricEnabled,
            onChanged: (val) => auth.setBiometricEnabled(val),
          ),

          // Mail accounts
          _buildSectionHeader('Comptes de messagerie'),
          ...auth.mailConfigs.map((config) => ListTile(
                leading: Icon(
                  config.providerType == MailProviderType.google
                      ? Icons.g_mobiledata_rounded
                      : config.providerType == MailProviderType.microsoft
                          ? Icons.microsoft_rounded
                          : Icons.email,
                ),
                title: Text(config.email),
                subtitle: Text(config.providerType.name.toUpperCase()),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  onPressed: () => _confirmDeleteAccount(context, auth, config.id!),
                ),
              )),
          ListTile(
            leading: const Icon(Icons.add),
            title: const Text('Ajouter un compte'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => auth.signOut(),
          ),

          // Notifications
          _buildSectionHeader('Notifications'),
          SwitchListTile(
            secondary: const Icon(Icons.notifications),
            title: const Text('Notifications'),
            subtitle: const Text('Recevoir des alertes pour les nouveaux bulletins'),
            value: settings.notificationsEnabled,
            onChanged: (val) => settings.setNotifications(val),
          ),
          ListTile(
            leading: const Icon(Icons.schedule),
            title: const Text('Frequence de verification'),
            subtitle: Text('${settings.checkFrequencyMinutes} minutes'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showFrequencyDialog(context, settings),
          ),

          // Appearance
          _buildSectionHeader('Apparence'),
          SwitchListTile(
            secondary: const Icon(Icons.dark_mode),
            title: const Text('Mode sombre'),
            value: settings.isDarkMode,
            onChanged: (val) => settings.setDarkMode(val),
          ),

          // Danger zone
          _buildSectionHeader('Donnees'),
          ListTile(
            leading: const Icon(Icons.delete_forever, color: Colors.red),
            title: const Text('Reinitialiser tout',
                style: TextStyle(color: Colors.red)),
            subtitle: const Text('Supprimer toutes les donnees et reinitialiser'),
            onTap: () => _confirmReset(context, auth, settings),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }

  Widget _buildChangePinForm(AuthProvider auth) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              TextField(
                controller: _oldPinController,
                decoration: const InputDecoration(
                  labelText: 'Ancien PIN',
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _newPinController,
                decoration: const InputDecoration(
                  labelText: 'Nouveau PIN',
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _confirmPinController,
                decoration: const InputDecoration(
                  labelText: 'Confirmer le nouveau PIN',
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
                keyboardType: TextInputType.number,
              ),
              if (auth.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(auth.errorMessage!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    if (_newPinController.text != _confirmPinController.text) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Les PINs ne correspondent pas')),
                      );
                      return;
                    }
                    auth.changePin(
                      _oldPinController.text,
                      _newPinController.text,
                    );
                    if (auth.errorMessage == null) {
                      setState(() => _showChangePin = false);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('PIN modifie avec succes')),
                      );
                    }
                  },
                  child: const Text('Enregistrer'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showFrequencyDialog(BuildContext context, SettingsProvider settings) {
    showDialog(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Frequence de verification'),
        children: [15, 30, 60, 120, 240].map((minutes) {
          return RadioListTile<int>(
            title: Text(minutes < 60 ? '$minutes minutes' : '${minutes ~/ 60} heure(s)'),
            value: minutes,
            groupValue: settings.checkFrequencyMinutes,
            onChanged: (val) {
              if (val != null) settings.setCheckFrequency(val);
              Navigator.pop(ctx);
            },
          );
        }).toList(),
      ),
    );
  }

  void _confirmDeleteAccount(BuildContext context, AuthProvider auth, int configId) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer ce compte ?'),
        content: const Text('Cette action est irreversible.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          TextButton(
            onPressed: () {
              auth.removeMailConfig(configId);
              Navigator.pop(ctx);
            },
            child: const Text('Supprimer', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _confirmReset(BuildContext context, AuthProvider auth, SettingsProvider settings) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reinitialiser ?'),
        content: const Text('Toutes vos donnees seront supprimees.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          TextButton(
            onPressed: () {
              auth.signOut();
              settings.resetAllSettings();
              Navigator.pop(ctx);
            },
            child: const Text('Reinitialiser', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}