import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/bulletin_provider.dart';
import '../../models/bulletin.dart';

class MergeScreen extends StatefulWidget {
  const MergeScreen({super.key});

  @override
  State<MergeScreen> createState() => _MergeScreenState();
}

class _MergeScreenState extends State<MergeScreen> {
  final Set<int> _selectedIds = {};
  bool _isMerging = false;

  @override
  Widget build(BuildContext context) {
    final bulletin = context.watch<BulletinProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Fusionner les bulletins'),
        actions: [
          if (_selectedIds.isNotEmpty)
            TextButton.icon(
              onPressed: _selectedIds.length < 2
                  ? null
                  : () => _mergeBulletins(context),
              icon: const Icon(Icons.merge_type),
              label: Text('Fusionner (${_selectedIds.length})'),
              style: TextButton.styleFrom(foregroundColor: Colors.white),
            ),
        ],
      ),
      body: _isMerging
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Fusion en cours...'),
                ],
              ),
            )
          : bulletin.bulletins.isEmpty
              ? const Center(child: Text('Aucun bulletin a fusionner'))
              : ListView.builder(
                  itemCount: bulletin.bulletins.length,
                  itemBuilder: (context, index) {
                    final b = bulletin.bulletins[index];
                    final selected = _selectedIds.contains(b.id);
                    return CheckboxListTile(
                      value: selected,
                      onChanged: (val) {
                        setState(() {
                          if (val == true) {
                            _selectedIds.add(b.id!);
                          } else {
                            _selectedIds.remove(b.id);
                          }
                        });
                      },
                      secondary: const Icon(Icons.picture_as_pdf, color: Colors.red),
                      title: Text(b.studentName),
                      subtitle: Text('${b.schoolName} - ${b.sourceEmail}'),
                      activeColor: Theme.of(context).colorScheme.primary,
                    );
                  },
                ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 2,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Accueil'),
          NavigationDestination(icon: Icon(Icons.folder), label: 'Explorer'),
          NavigationDestination(icon: Icon(Icons.merge), label: 'Fusionner'),
        ],
        onDestinationSelected: (index) {
          if (index == 0) context.go('/dashboard');
          if (index == 1) context.go('/explorer');
        },
      ),
    );
  }

  void _mergeBulletins(BuildContext context) {
    setState(() => _isMerging = true);
    // Simulate merge operation
    Future.delayed(const Duration(seconds: 2), () {
      setState(() {
        _isMerging = false;
        _selectedIds.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bulletins fusionnes avec succes!')),
      );
    });
  }
}
