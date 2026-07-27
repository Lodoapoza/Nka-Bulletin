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
        // Logo
        Container(
          width: 100,
          height: 100,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary,
            borderRadius: BorderRadius.circular(24),
          ),
          child: const Icon(
            Icons.mail_lock_rounded,
            size: 56,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 20),
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
        const SizedBox(height: 40),
        if (auth.errorMessage != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(auth.errorMessage!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onErrorContainer)),
            ),
          ),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed:
                auth.isLoading ? null : () => auth.goToProviderChoice(),
            icon: const Icon(Icons.login),
            label: const Text('Commencer'),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
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
          'Connecter votre compte',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        Text(
          'Choisissez une methode de connexion',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 24),
        if (auth.isLoading)
          const Column(
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Connexion en cours...'),
            ],
          )
        else
          ...[
            if (auth.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline,
                          color:
                              Theme.of(context).colorScheme.onErrorContainer),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(auth.errorMessage!,
                            style: TextStyle(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onErrorContainer)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 16),
                        onPressed: () => auth.clearError(),
                      ),
                    ],
                  ),
                ),
              ),
            // IMAP en premier (fonctionne sans config externe)
            _buildProviderButton(
              icon: Icons.email_rounded,
              label: 'IMAP (recommande)',
              subtitle: 'Connexion directe a votre serveur',
              color: const Color(0xFF1976D2),
              onPressed: () {
                setState(() => _showImapForm = true);
              },
            ),
            const SizedBox(height: 12),
            _buildProviderButton(
              icon: Icons.g_mobiledata_rounded,
              label: 'Google (Gmail)',
              subtitle: 'Necessite Google Cloud Console',
              color: const Color(0xFF4285F4),
              onPressed: () => auth.signInWithGoogle(),
            ),
            const SizedBox(height: 12),
            _buildProviderButton(
              icon: Icons.microsoft_rounded,
              label: 'Microsoft (Outlook)',
              subtitle: 'Necessite Azure AD',
              color: const Color(0xFF00A4EF),
              onPressed: () => auth.signInWithMicrosoft(),
            ),
          ],
        if (_showImapForm && !auth.isLoading)
          _buildImapForm(auth)
        else
          const SizedBox(height: 16),
        TextButton.icon(
          onPressed: () {
            setState(() => _showImapForm = false);
            auth.clearError();
          },
          icon: const Icon(Icons.arrow_back, size: 16),
          label: const Text('Retour'),
        ),
      ],
    );
  }

  Widget _buildProviderButton({
    required IconData icon,
    required String label,
    required String subtitle,
    required Color color,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, color: Colors.white),
        label: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 16)),
            Text(subtitle,
                style: TextStyle(
                    color: Colors.white.withAlpha(200), fontSize: 12)),
          ],
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          padding:
              const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          alignment: Alignment.centerLeft,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Configuration IMAP',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _imapHostController,
            decoration: const InputDecoration(
              labelText: 'Serveur IMAP',
              hintText: 'imap.exemple.com',
              prefixIcon: Icon(Icons.dns),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _imapPortController,
            decoration: const InputDecoration(
              labelText: 'Port',
              prefixIcon: Icon(Icons.numbers),
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _imapLoginController,
            decoration: const InputDecoration(
              labelText: 'Identifiant',
              prefixIcon: Icon(Icons.person),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _imapPasswordController,
            decoration: const InputDecoration(
              labelText: 'Mot de passe',
              prefixIcon: Icon(Icons.lock),
              border: OutlineInputBorder(),
            ),
            obscureText: true,
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => auth.signInWithImap(
                host: _imapHostController.text,
                port: int.tryParse(_imapPortController.text) ?? 993,
                login: _imapLoginController.text,
                password: _imapPasswordController.text,
              ),
              icon: const Icon(Icons.check),
              label: const Text('Se connecter'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
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
        Icon(Icons.lock_person,
            size: 64, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 16),
        Text('Creez votre code PIN',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
            'Ce code servira a proteger l\'application',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 32),
        TextField(
          controller: _pinController,
          decoration: const InputDecoration(
            labelText: 'Code PIN',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.pin),
          ),
          obscureText: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _pinConfirmController,
          decoration: const InputDecoration(
            labelText: 'Confirmer le PIN',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.pin),
          ),
          obscureText: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
        ),
        if (auth.errorMessage != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(auth.errorMessage!,
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error)),
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
                  const SnackBar(
                      content: Text('Les PINs ne correspondent pas')),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Confirmer'),
          ),
        ),
      ],
    );
  }
}
