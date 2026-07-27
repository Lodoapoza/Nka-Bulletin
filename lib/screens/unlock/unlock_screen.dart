import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class UnlockScreen extends StatefulWidget {
  const UnlockScreen({super.key});

  @override
  State<UnlockScreen> createState() => _UnlockScreenState();
}

class _UnlockScreenState extends State<UnlockScreen> {
  String _enteredPin = '';
  bool _biometricTried = false;

  @override
  void initState() {
    super.initState();
    // Auto-trigger biometric after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _tryAutoBiometric();
    });
  }

  Future<void> _tryAutoBiometric() async {
    if (_biometricTried) return;
    final auth = context.read<AuthProvider>();
    if (!auth.isBiometricEnabled) return;
    _biometricTried = true;
    await auth.unlockWithBiometrics();
  }

  void _addDigit(String digit) {
    if (_enteredPin.length < 4) {
      setState(() => _enteredPin += digit);
      if (_enteredPin.length == 4) {
        final auth = context.read<AuthProvider>();
        Future.delayed(const Duration(milliseconds: 100), () {
          if (!mounted) return;
          auth.unlockWithPin(_enteredPin);
          if (auth.authStep != AuthStep.authenticated) {
            setState(() => _enteredPin = '');
          }
        });
      }
    }
  }

  void _deleteDigit() {
    if (_enteredPin.isNotEmpty) {
      setState(
          () => _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 60),
            // Logo
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(Icons.mail_lock_rounded,
                  size: 40, color: Colors.white),
            ),
            const SizedBox(height: 16),
            Text(
              'Nka Bulletin',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              auth.currentUserDisplayName ?? auth.currentUserEmail ?? '',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const Spacer(),
            // PIN dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (index) {
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 10),
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: index < _enteredPin.length
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.outline.withAlpha(80),
                  ),
                );
              }),
            ),
            if (auth.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  auth.errorMessage!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontSize: 14),
                ),
              ),
            // Biometric button BELOW PIN dots, ABOVE keypad
            if (auth.isBiometricEnabled)
              Padding(
                padding: const EdgeInsets.only(top: 24, bottom: 8),
                child: TextButton.icon(
                  onPressed: _tryAutoBiometric,
                  icon: Icon(
                    Icons.fingerprint,
                    size: 22,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  label: Text(
                    'Utiliser l\'empreinte',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.primary),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            // Numeric keypad
            _buildKeypad(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildKeypad() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 48),
      child: Column(
        children: [
          for (final row in [
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: row
                    .map((digit) => Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: SizedBox(
                              height: 60,
                              child: ElevatedButton(
                                onPressed: () => _addDigit(digit),
                                style: ElevatedButton.styleFrom(
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12)),
                                ),
                                child: Text(digit,
                                    style: const TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                const Expanded(child: SizedBox(height: 60)),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: SizedBox(
                      height: 60,
                      child: ElevatedButton(
                        onPressed: () => _addDigit('0'),
                        style: ElevatedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('0',
                            style: TextStyle(
                                fontSize: 24, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: SizedBox(
                      height: 60,
                      child: ElevatedButton(
                        onPressed: _deleteDigit,
                        style: ElevatedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Icon(Icons.backspace_outlined, size: 24),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
