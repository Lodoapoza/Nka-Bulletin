'use strict';

// Compatibilité : depuis l'architecture cron o2switch, le serveur ne fork plus
// ce fichier. Une exécution manuelle de `node worker.js` traite désormais un
// seul job comme le lanceur cron, sans boucle infinie ni connexion héritée.
console.warn('[worker] worker.js est déprécié : utilisez worker-once.js ou cron-worker.sh');
require('./worker-once');
