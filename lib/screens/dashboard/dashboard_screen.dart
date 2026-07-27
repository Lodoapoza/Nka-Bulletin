import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../models/bulletin.dart';
import '../../providers/bulletin_provider.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      if (auth.mailConfigs.isNotEmpty) {
        context
            .read<BulletinProvider>()
            .checkForNewBulletins(auth.mailConfigs);
      }
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
            // Message d'erreur ou info
            if (bulletin.errorMessage != null &&
                !bulletin.isLoading)
              SliverToBoxAdapter(
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: bulletin.errorMessage!.contains('nouveau')
                          ? Colors.green.withAlpha(30)
                          : Theme.of(context)
                              .colorScheme
                              .errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          bulletin.errorMessage!.contains('nouveau')
                              ? Icons.check_circle
                              : Icons.info_outline,
                          color: bulletin.errorMessage!.contains('nouveau')
                              ? Colors.green
                              : Theme.of(context)
                                  .colorScheme
                                  .error,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(bulletin.errorMessage!),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
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
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 16),
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
                          size: 64,
                          color: Theme.of(context).colorScheme.outline),
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
          NavigationDestination(
              icon: Icon(Icons.home), label: 'Accueil'),
          NavigationDestination(
              icon: Icon(Icons.folder), label: 'Explorer'),
          NavigationDestination(
              icon: Icon(Icons.merge), label: 'Fusionner'),
          NavigationDestination(
              icon: Icon(Icons.settings), label: 'Config'),
        ],
        onDestinationSelected: (index) {
          if (index == 1) context.go('/explorer');
          if (index == 2) context.go('/merge');
          if (index == 3) context.go('/settings');
        },
      ),
    );
  }

  Widget _buildStatCard(
      String title, String value, IconData icon, Color color) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 4),
              Text(value,
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
              Text(title, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBulletinCard(
      BuildContext context, Bulletin bulletin, BulletinProvider provider) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: () => provider.openBulletin(bulletin.id!),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.red.withAlpha(20),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.picture_as_pdf,
                    color: Colors.red, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(bulletin.studentName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(
                      '${bulletin.schoolName}',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '${bulletin.downloadDate.day}/${bulletin.downloadDate.month}/${bulletin.downloadDate.year} - ${_formatFileSize(bulletin.fileSize)}',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.outline,
                          fontSize: 12),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'open') provider.openBulletin(bulletin.id!);
                  if (value == 'share') provider.shareBulletin(bulletin.id!);
                  if (value == 'delete') _showDeleteDialog(context, bulletin, provider);
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'open', child: Text('Ouvrir')),
                  const PopupMenuItem(value: 'share', child: Text('Partager')),
                  const PopupMenuItem(
                      value: 'delete',
                      child: Text('Supprimer',
                          style: TextStyle(color: Colors.red))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDeleteDialog(
      BuildContext context, Bulletin bulletin, BulletinProvider provider) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer'),
        content: Text('Supprimer ${bulletin.studentName} ?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Annuler')),
          TextButton(
            onPressed: () {
              provider.deleteBulletin(bulletin.id!);
              Navigator.pop(ctx);
            },
            child: const Text('Supprimer',
                style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes o';
    if (bytes < 1024 * 1024)
      return '${(bytes / 1024).toStringAsFixed(1)} Ko';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
  }
}