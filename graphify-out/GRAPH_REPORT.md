# Graph Report - Nka Bulletin  (2026-07-26)

## Corpus Check
- 57 files · ~15,380 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 416 nodes · 590 edges · 26 communities (24 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- MailConfig
- MailProviderType
- Bulletin
- BulletinDao
- SecureStorageManager
- AuthViewModel
- UnlockViewModel
- MergeViewModel
- PdfProcessor
- NavGraph
- ExplorerViewModel
- DashboardViewModel
- BulletinCheckWorker
- .invoke
- MicrosoftAuthManager
- SearchQuery
- VerifyPasswordUseCase
- SearchViewModel
- NkaApplication
- MailModule.kt
- Nka Bulletin

## God Nodes (most connected - your core abstractions)
1. `MailConfig` - 30 edges
2. `Bulletin` - 23 edges
3. `SecureStorageManager` - 21 edges
4. `AuthViewModel` - 21 edges
5. `BulletinDao` - 18 edges
6. `MailProviderType` - 18 edges
7. `AuthRepositoryImpl` - 16 edges
8. `AuthRepository` - 16 edges
9. `BulletinRepositoryImpl` - 15 edges
10. `BulletinRepository` - 15 edges

## Surprising Connections (you probably didn't know these)
- `AuthScreen()` --calls--> `PinSetupScreen()`  [INFERRED]
  app/src/main/java/com/nka/bulletin/presentation/auth/AuthScreen.kt → app/src/main/java/com/nka/bulletin/presentation/unlock/UnlockScreen.kt
- `NavGraph()` --calls--> `AuthScreen()`  [INFERRED]
  app/src/main/java/com/nka/bulletin/presentation/navigation/NavGraph.kt → app/src/main/java/com/nka/bulletin/presentation/auth/AuthScreen.kt
- `NavGraph()` --calls--> `DashboardScreen()`  [INFERRED]
  app/src/main/java/com/nka/bulletin/presentation/navigation/NavGraph.kt → app/src/main/java/com/nka/bulletin/presentation/dashboard/DashboardScreen.kt
- `NavGraph()` --calls--> `MergeScreen()`  [INFERRED]
  app/src/main/java/com/nka/bulletin/presentation/navigation/NavGraph.kt → app/src/main/java/com/nka/bulletin/presentation/merge/MergeScreen.kt
- `NavGraph()` --calls--> `UnlockScreen()`  [INFERRED]
  app/src/main/java/com/nka/bulletin/presentation/navigation/NavGraph.kt → app/src/main/java/com/nka/bulletin/presentation/unlock/UnlockScreen.kt

## Import Cycles
- None detected.

## Communities (26 total, 2 thin omitted)

### Community 0 - "MailConfig"
Cohesion: 0.08
Nodes (17): GmailProvider, Result, ImapProvider, Result, Result, MailProvider, Result, OutlookProvider (+9 more)

### Community 1 - "MailProviderType"
Cohesion: 0.06
Nodes (8): AuthRepositoryImpl, RepositoryModule, MailProviderType, GMAIL, IMAP, OUTLOOK, AuthRepository, com

### Community 2 - "Bulletin"
Cohesion: 0.09
Nodes (7): BulletinRepositoryImpl, Flow, Bulletin, BulletinRepository, Flow, DownloadBulletinUseCase, Result

### Community 3 - "BulletinDao"
Cohesion: 0.09
Nodes (10): BulletinDao, Flow, BulletinEntity, fromDomainModel(), create(), Context, NkaDatabase, DatabaseModule (+2 more)

### Community 4 - "SecureStorageManager"
Cohesion: 0.16
Nodes (3): SecureStorageManager, MasterKey, SharedPreferences

### Community 5 - "AuthViewModel"
Cohesion: 0.09
Nodes (18): AuthScreen(), ChooseProviderView(), GoogleAuthView(), ImapConfigView(), LoadingView(), MicrosoftAuthView(), AuthStep, CHOOSE_PROVIDER (+10 more)

### Community 6 - "UnlockViewModel"
Cohesion: 0.10
Nodes (13): StateFlow, ViewModel, PinSetupUiState, PinSetupViewModel, KeyButton(), Modifier, NumericKeypad(), PinSetupScreen() (+5 more)

### Community 7 - "MergeViewModel"
Cohesion: 0.12
Nodes (10): ExportType, PDF_MERGE, ZIP_ARCHIVE, Result, MergeBulletinsUseCase, MergeScreen(), StateFlow, ViewModel (+2 more)

### Community 8 - "PdfProcessor"
Cohesion: 0.15
Nodes (7): Result, PdfProcessor, AppModule, Context, ExtractBulletinInfoUseCase, ExtractedBulletinInfo, Result

### Community 9 - "NavGraph"
Cohesion: 0.12
Nodes (12): com, MainActivity, ExplorerBulletinItem(), ExplorerScreen(), NavGraph(), Routes, Modifier, SearchBar() (+4 more)

### Community 10 - "ExplorerViewModel"
Cohesion: 0.16
Nodes (5): ExplorerUiState, ExplorerViewModel, Job, StateFlow, ViewModel

### Community 11 - "DashboardViewModel"
Cohesion: 0.20
Nodes (9): androidx, BulletinCard(), DashboardScreen(), Modifier, StatCard(), DashboardUiState, DashboardViewModel, StateFlow (+1 more)

### Community 12 - "BulletinCheckWorker"
Cohesion: 0.24
Nodes (6): BulletinCheckWorker, cancel(), Context, Result, schedule(), CoroutineWorker

### Community 13 - ".invoke"
Cohesion: 0.40
Nodes (7): CheckNewBulletinsUseCase, CheckResult, Found, Result, NoResults, Skipped, Stopped

### Community 14 - "MicrosoftAuthManager"
Cohesion: 0.12
Nodes (7): GoogleAuthManager, Result, MicrosoftAuthManager, AuthModule, Context, GoogleAccountCredential, IMultipleAccountPublicClientApplication

### Community 15 - "SearchQuery"
Cohesion: 0.29
Nodes (4): parse(), SearchQuery, Flow, SearchBulletinsUseCase

### Community 17 - "SearchViewModel"
Cohesion: 0.36
Nodes (5): Job, StateFlow, ViewModel, SearchUiState, SearchViewModel

### Community 18 - "NkaApplication"
Cohesion: 0.33
Nodes (4): NkaApplication, Application, Configuration, HiltWorkerFactory

### Community 25 - "Nka Bulletin"
Cohesion: 0.18
Nodes (10): Avant de compiler, Build de l'APK, Ce que ça fait, Licence, Nka Bulletin, Pas de serveur, pas de cloud, Pour faire tourner le projet, Pourquoi cette app (+2 more)

## Knowledge Gaps
- **21 isolated node(s):** `MailModule`, `GMAIL`, `OUTLOOK`, `IMAP`, `PDF_MERGE` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MailConfig` connect `MailConfig` to `MailProviderType`, `Bulletin`, `SecureStorageManager`, `AuthViewModel`, `.invoke`, `MicrosoftAuthManager`?**
  _High betweenness centrality (0.410) - this node is a cross-community bridge._
- **Why does `Bulletin` connect `Bulletin` to `DashboardViewModel`, `NavGraph`, `BulletinDao`, `SearchQuery`?**
  _High betweenness centrality (0.314) - this node is a cross-community bridge._
- **Why does `NavGraph()` connect `NavGraph` to `DashboardViewModel`, `AuthViewModel`, `UnlockViewModel`, `MergeViewModel`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `MailConfig` (e.g. with `.acquireToken()` and `.configureImap()`) actually correct?**
  _`MailConfig` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `MailModule`, `GMAIL`, `OUTLOOK` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MailConfig` be split into smaller, more focused modules?**
  _Cohesion score 0.07510204081632653 - nodes in this community are weakly interconnected._
- **Should `MailProviderType` be split into smaller, more focused modules?**
  _Cohesion score 0.05647840531561462 - nodes in this community are weakly interconnected._