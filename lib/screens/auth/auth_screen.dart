import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _imapHostController = TextEditingController();
  final _imapPortController = TextEditingController(text: '993');
  final _imapLoginController = TextEditingController();
  final _imapPasswordController = TextEditingController();
  final _pinController = TextEditingController();
  final _pinConfirmController = TextEditingController();
  bool _showImapForm = false;

  @override
  void dispose() {
    _imapHostController.dispose();
    _imapPortController.dispose();
    _imapLoginController.dispose();
    _imapPasswordController.dispose();
    _pinController.dispose();
    _pinConfirmController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: _buildCurrentStep(auth, context),
          ),
        ),
      ),
    );
  }

  Widget _buildCurrentStep(AuthProvider auth, BuildContext context) {
    switch (auth.authStep) {
      case AuthStep.unauthenticated:
        return _buildWelcome(auth);
      case AuthStep.choosingProvider:
        return _buildProviderChoice(auth);
      case AuthStep.signingIn:
        return _buildProviderChoice(auth);
      case AuthStep.settingPin:
        return _buildPinSetup(auth);
      default:
        return _buildWelcome(auth);
    }
  }

  Widget _buildWelcome(AuthProvider auth) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.mail_lock_rounded, size: 80, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 16),
        Text(
          'Nka Bulletin',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          'Gerez vos bulletins scolaires',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 48),
        if (auth.errorMessage != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(auth.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: auth.isLoading
                ? null
                : () => auth.goToProviderChoice(),
            icon: const Icon(Icons.login),
            label: const Text('Commencer'),
          ),
        ),
      ],
    );
  }

  Widget _buildProviderChoice(AuthProvider auth) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Choisissez votre fournisseur',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 32),
        if (auth.isLoading)
          const CircularProgressIndicator()
        else
          ...[
            if (auth.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(auth.errorMessage!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            _buildProviderButton(
              icon: Icons.g_mobiledata_rounded,
              label: 'Google (Gmail)',
              color: const Color(0xFF4285F4),
              onPressed: () => auth.signInWithGoogle(),
            ),
            const SizedBox(height: 12),
            _buildProviderButton(
              icon: Icons.microsoft_rounded,
              label: 'Microsoft (Outlook)',
              color: const Color(0xFF00A4EF),
              onPressed: () => auth.signInWithMicrosoft(),
            ),
            const SizedBox(height: 12),
            _buildProviderButton(
              icon: Icons.email_rounded,
              label: 'IMAP',
              color: Theme.of(context).colorScheme.primary,
              onPressed: () {
                setState(() => _showImapForm = true);
              },
            ),
          ],
        if (_showImapForm) _buildImapForm(auth),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => auth.goToProviderChoice(),
          child: const Text('Retour'),
        ),
      ],
    );
  }

  Widget _buildProviderButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, color: Colors.white),
        label: Text(label, style: const TextStyle(color: Colors.white)),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  Widget _buildImapForm(AuthProvider auth) {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          TextField(
            controller: _imapHostController,
            decoration: const InputDecoration(labelText: 'Serveur IMAP', hintText: 'imap.exemple.com'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _imapPortController,
            decoration: const InputDecoration(labelText: 'Port'),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _imapLoginController,
            decoration: const InputDecoration(labelText: 'Identifiant'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _imapPasswordController,
            decoration: const InputDecoration(labelText: 'Mot de passe'),
            obscureText: true,
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => auth.signInWithImap(
                host: _imapHostController.text,
                port: int.tryParse(_imapPortController.text) ?? 993,
                login: _imapLoginController.text,
                password: _imapPasswordController.text,
              ),
              child: const Text('Se connecter'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPinSetup(AuthProvider auth) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.lock_person, size: 64, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 16),
        Text('Creez votre code PIN',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text('Ce code servira a proteger l\'application',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 32),
        TextField(
          controller: _pinController,
          decoration: const InputDecoration(labelText: 'Code PIN'),
          obscureText: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _pinConfirmController,
          decoration: const InputDecoration(labelText: 'Confirmer le PIN'),
          obscureText: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
        ),
        if (auth.errorMessage != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(auth.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () {
              if (_pinController.text == _pinConfirmController.text) {
                auth.setupPin(_pinController.text);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Les PINs ne correspondent pas')),
                );
              }
            },
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );
  }
}
