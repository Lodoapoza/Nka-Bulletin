import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:open_file/open_file.dart';
import 'dart:io';
import '../../providers/bulletin_provider.dart';
import '../../models/bulletin.dart';

class ExplorerScreen extends StatefulWidget {
  const ExplorerScreen({super.key});

  @override
  State<ExplorerScreen> createState() => _ExplorerScreenState();
}

class _ExplorerScreenState extends State<ExplorerScreen> {
  String _sortBy = 'date';
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final bulletin = context.watch<BulletinProvider>();
    final filtered = _applyFilter(bulletin.bulletins);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Explorer'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) => setState(() => _sortBy = value),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'date', child: Text('Trier par date')),
              const PopupMenuItem(value: 'name', child: Text('Trier par nom')),
              const PopupMenuItem(value: 'school', child: Text('Trier par ecole')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                _buildFilterChip('Tous', 'all'),
                const SizedBox(width: 8),
                _buildFilterChip('Aujourd\'hui', 'today'),
                const SizedBox(width: 8),
                _buildFilterChip('Cette semaine', 'week'),
                const SizedBox(width: 8),
                _buildFilterChip('Ce mois', 'month'),
              ],
            ),
          ),
          // List
          Expanded(
            child: filtered.isEmpty
                ? const Center(child: Text('Aucun bulletin'))
                : ListView.builder(
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final b = filtered[index];
                      return _buildExplorerCard(context, b);
                    },
                  ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 1,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Accueil'),
          NavigationDestination(icon: Icon(Icons.folder), label: 'Explorer'),
          NavigationDestination(icon: Icon(Icons.merge), label: 'Fusionner'),
        ],
        onDestinationSelected: (index) {
          if (index == 0) context.go('/dashboard');
          if (index == 2) context.go('/merge');
        },
      ),
    );
  }

  List<Bulletin> _applyFilter(List<Bulletin> bulletins) {
    final now = DateTime.now();
    List<Bulletin> filtered = bulletins;

    switch (_filter) {
      case 'today':
        filtered = bulletins.where((b) =>
          b.downloadDate.year == now.year &&
          b.downloadDate.month == now.month &&
          b.downloadDate.day == now.day).toList();
        break;
      case 'week':
        final weekAgo = now.subtract(const Duration(days: 7));
        filtered = bulletins.where((b) => b.downloadDate.isAfter(weekAgo)).toList();
        break;
      case 'month':
        filtered = bulletins.where((b) =>
          b.downloadDate.month == now.month && b.downloadDate.year == now.year).toList();
        break;
    }

    switch (_sortBy) {
      case 'name':
        filtered.sort((a, b) => a.studentName.compareTo(b.studentName));
        break;
      case 'school':
        filtered.sort((a, b) => a.schoolName.compareTo(b.schoolName));
        break;
      default:
        filtered.sort((a, b) => b.downloadDate.compareTo(a.downloadDate));
    }

    return filtered;
  }

  Widget _buildFilterChip(String label, String value) {
    return FilterChip(
      label: Text(label),
      selected: _filter == value,
      onSelected: (_) => setState(() => _filter = value),
    );
  }

  Widget _buildExplorerCard(BuildContext context, Bulletin b) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        leading: const Icon(Icons.picture_as_pdf, color: Colors.red, size: 36),
        title: Text(b.studentName, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(b.schoolName),
            Text('${b.downloadDate.day}/${b.downloadDate.month}/${b.downloadDate.year} - ${b.sourceEmail}'),
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.open_in_new),
          onPressed: () async {
            final file = File(b.filePath);
            if (await file.exists()) {
              await OpenFile.open(b.filePath);
            }
          },
        ),
      ),
    );
  }
}