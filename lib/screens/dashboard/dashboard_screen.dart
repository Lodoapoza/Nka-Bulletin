import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/bulletin_provider.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      context.read<BulletinProvider>().checkForNewBulletins(auth.mailConfigs);
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final bulletin = context.watch<BulletinProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Nka Bulletin'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.go('/settings'),
            tooltip: 'Configuration',
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => auth.signOut(),
            tooltip: 'Deconnexion',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await bulletin.checkForNewBulletins(auth.mailConfigs);
        },
        child: CustomScrollView(
          slivers: [
            // Stats section
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    _buildStatCard(
                      'Bulletins',
                      '${bulletin.totalBulletins}',
                      Icons.description,
                      Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(width: 12),
                    _buildStatCard(
                      'Nouveaux',
                      '${bulletin.unreadBulletins}',
                      Icons.new_releases,
                      Colors.orange,
                    ),
                    const SizedBox(width: 12),
                    _buildStatCard(
                      'Comptes',
                      '${auth.mailConfigs.length}',
                      Icons.email,
                      Colors.green,
                    ),
                  ],
                ),
              ),
            ),
            // Search
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Rechercher un bulletin...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  onChanged: (value) => bulletin.setSearchQuery(value),
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 16)),
            // Bulletin list
            if (bulletin.isLoading && bulletin.bulletins.isEmpty)
              const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator()),
              )
            else if (bulletin.bulletins.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.inbox_outlined,
                          size: 64, color: Theme.of(context).colorScheme.outline),
                      const SizedBox(height: 16),
                      Text(
                        'Aucun bulletin trouve',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Tirez vers le bas pour verifier vos emails',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final b = bulletin.bulletins[index];
                    return _buildBulletinCard(context, b, bulletin);
                  },
                  childCount: bulletin.bulletins.length,
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Accueil'),
          NavigationDestination(icon: Icon(Icons.folder), label: 'Explorer'),
          NavigationDestination(icon: Icon(Icons.merge), label: 'Fusionner'),
        ],
        onDestinationSelected: (index) {
          if (index == 1) context.go('/explorer');
          if (index == 2) context.go('/merge');
        },
      ),
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 4),
              Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              )),
              Text(title, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBulletinCard(BuildContext context, bulletin, BulletinProvider provider) {
    return ListTile(
      leading: const Icon(Icons.picture_as_pdf, color: Colors.red, size: 36),
      title: Text(bulletin.studentName),
      subtitle: Text('${bulletin.schoolName} - ${bulletin.downloadDate.day}/${bulletin.downloadDate.month}/${bulletin.downloadDate.year}'),
      trailing: Text(_formatFileSize(bulletin.fileSize)),
      onTap: () => provider.openBulletin(bulletin.id!),
      onLongPress: () => _showDeleteDialog(context, bulletin, provider),
    );
  }

  void _showDeleteDialog(BuildContext context, bulletin, BulletinProvider provider) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer'),
        content: Text('Supprimer ${bulletin.studentName} ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Annuler')),
          TextButton(
            onPressed: () {
              provider.deleteBulletin(bulletin.id!);
              Navigator.pop(ctx);
            },
            child: const Text('Supprimer', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes o';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} Ko';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
  }
}