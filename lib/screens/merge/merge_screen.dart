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
  bool _selectAll = false;

  @override
  Widget build(BuildContext context) {
    final bulletin = context.watch<BulletinProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Fusionner les bulletins'),
        actions: [
          if (bulletin.bulletins.isNotEmpty)
            TextButton(
              onPressed: _toggleSelectAll,
              child: Text(
                _selectAll ? 'Tout deselectionner' : 'Tout selectionner',
              ),
            ),
        ],
      ),
      body: bulletin.bulletins.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.merge_type,
                      size: 64, color: Theme.of(context).colorScheme.outline),
                  const SizedBox(height: 16),
                  Text('Aucun bulletin a fusionner',
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('Telechargez d\'abord des bulletins depuis l\'accueil',
                      style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            )
          : Column(
              children: [
                if (_selectedIds.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    color: Theme.of(context).colorScheme.primaryContainer,
                    child: Row(
                      children: [
                        Text('${_selectedIds.length} selectionne(s)'),
                        const Spacer(),
                        FilledButton.icon(
                          onPressed: _selectedIds.length < 2
                              ? null
                              : () => _doMerge(context),
                          icon: const Icon(Icons.merge_type),
                          label: const Text('Fusionner'),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: ListView.builder(
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
                            _selectAll =
                                _selectedIds.length == bulletin.bulletins.length;
                          });
                        },
                        secondary: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.red.withAlpha(20),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Icon(Icons.picture_as_pdf,
                              color: Colors.red, size: 20),
                        ),
                        title: Text(b.studentName),
                        subtitle: Text('${b.schoolName} - ${b.sourceEmail}'),
                        activeColor: Theme.of(context).colorScheme.primary,
                      );
                    },
                  ),
                ),
              ],
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 2,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Accueil'),
          NavigationDestination(icon: Icon(Icons.folder), label: 'Explorer'),
          NavigationDestination(icon: Icon(Icons.merge), label: 'Fusionner'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Config'),
        ],
        onDestinationSelected: (index) {
          if (index == 0) context.go('/dashboard');
          if (index == 1) context.go('/explorer');
          if (index == 3) context.go('/settings');
        },
      ),
    );
  }

  void _toggleSelectAll() {
    final bulletin = context.read<BulletinProvider>();
    setState(() {
      if (_selectAll) {
        _selectedIds.clear();
        _selectAll = false;
      } else {
        _selectedIds.clear();
        for (final b in bulletin.bulletins) {
          _selectedIds.add(b.id!);
        }
        _selectAll = true;
      }
    });
  }

  void _doMerge(BuildContext context) {
    final provider = context.read<BulletinProvider>();
    provider.mergeBulletins(_selectedIds.toList());
    setState(() => _selectedIds.clear());
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(provider.errorMessage ?? 'Fusion terminee'),
        backgroundColor: provider.errorMessage != null &&
                !provider.errorMessage!.contains('fusionnes')
            ? Theme.of(context).colorScheme.error
            : Colors.green,
      ),
    );
  }
}