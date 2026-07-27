import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class UnlockScreen extends StatefulWidget {
  const UnlockScreen({super.key});

  @override
  State<UnlockScreen> createState() => _UnlockScreenState();
}

class _UnlockScreenState extends State<UnlockScreen> {
  final _pinController = TextEditingController();
  String _enteredPin = '';

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  void _addDigit(String digit) {
    if (_enteredPin.length < 6) {
      setState(() => _enteredPin += digit);
      if (_enteredPin.length == 4 || _enteredPin.length == 6) {
        final auth = context.read<AuthProvider>();
        Future.delayed(const Duration(milliseconds: 100), () {
          auth.unlockWithPin(_enteredPin);
          if (auth.authStep == AuthStep.authenticated) {
            // Navigation handled by GoRouter
          } else {
            setState(() => _enteredPin = '');
          }
        });
      }
    }
  }

  void _deleteDigit() {
    if (_enteredPin.isNotEmpty) {
      setState(() => _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 40),
            Text(
              'Nka Bulletin',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              auth.currentUserDisplayName ?? auth.currentUserEmail ?? '',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const Spacer(flex: 1),
            // Biometric button ABOVE the keypad
            if (auth.isBiometricEnabled)
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: IconButton(
                  onPressed: () => auth.unlockWithBiometrics(),
                  icon: Icon(
                    Icons.fingerprint,
                    size: 48,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  style: IconButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                    padding: const EdgeInsets.all(16),
                  ),
                  tooltip: 'Empreinte digitale',
                ),
              ),
            // PIN dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                4,
                (index) => Container(
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: index < _enteredPin.length
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.outline.withOpacity(0.3),
                  ),
                ),
              ),
            ),
            if (auth.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  auth.errorMessage!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 14),
                ),
              ),
            const Spacer(flex: 2),
            // Numeric keypad
            _buildKeypad(),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildKeypad() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
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
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                child: Text(digit,
                                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
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
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('0', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
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
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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