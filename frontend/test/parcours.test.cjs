const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveJourneyState } = require('../js/parcours.js');

// Forme commune attendue pour chaque état : action présente, textes non vides.
function assertStateShape(state, kind) {
  assert.equal(state.kind, kind);
  assert.ok(typeof state.title === 'string' && state.title.trim().length > 0, 'title non vide');
  assert.ok(typeof state.body === 'string' && state.body.trim().length > 0, 'body non vide');
  assert.ok(state.action, 'action présente');
  assert.ok(typeof state.action.id === 'string' && state.action.id.trim().length > 0, 'action.id non vide');
  assert.ok(typeof state.action.label === 'string' && state.action.label.trim().length > 0, 'action.label non vide');
}

test('offline-cache : prime sur running et no-account', () => {
  const s = resolveJourneyState({
    accountCount: 0,
    syncStatus: 'running',
    newBulletins: 0,
    online: false,
    hasCachedBulletins: true,
  });
  assertStateShape(s, 'offline-cache');
  assert.equal(s.title, 'Données disponibles hors connexion');
  assert.equal(s.action.label, 'Voir mes bulletins');
});

test('no-account : prime sur done-with-results', () => {
  const s = resolveJourneyState({
    accountCount: 0,
    syncStatus: 'done',
    newBulletins: 3,
    online: true,
    hasCachedBulletins: false,
  });
  assertStateShape(s, 'no-account');
  assert.equal(s.title, 'Connectons votre boîte mail');
  assert.equal(s.action.label, 'Connecter ma boîte mail');
});

test('running : job pending ou running', () => {
  for (const syncStatus of ['pending', 'running']) {
    const s = resolveJourneyState({
      accountCount: 1,
      syncStatus,
      newBulletins: 0,
      online: true,
      hasCachedBulletins: false,
    });
    assertStateShape(s, 'running');
    assert.equal(s.title, 'Recherche des bulletins en cours');
    assert.equal(s.action.label, 'Voir mes bulletins');
  }
});

test('done-with-results : comptage des nouveaux bulletins', () => {
  const s = resolveJourneyState({
    accountCount: 1,
    syncStatus: 'done',
    newBulletins: 3,
    online: true,
    hasCachedBulletins: false,
  });
  assertStateShape(s, 'done-with-results');
  assert.equal(s.title, '3 nouveau(x) bulletin(s) trouvé(s)');
  assert.equal(s.action.label, 'Voir mes bulletins');
});

test('done-empty : aucun nouveau bulletin', () => {
  const s = resolveJourneyState({
    accountCount: 1,
    syncStatus: 'done',
    newBulletins: 0,
    online: true,
    hasCachedBulletins: false,
  });
  assertStateShape(s, 'done-empty');
  assert.equal(s.title, 'Aucun nouveau bulletin');
  assert.equal(s.action.label, 'Rechercher à nouveau');
});

test('failed : la recherche n’a pas abouti', () => {
  const s = resolveJourneyState({
    accountCount: 1,
    syncStatus: 'failed',
    newBulletins: 0,
    online: true,
    hasCachedBulletins: false,
  });
  assertStateShape(s, 'failed');
  assert.equal(s.title, 'La recherche n’a pas abouti');
  assert.equal(s.action.label, 'Réessayer');
});

test('ready-to-scan : compte connecté, aucun job actif', () => {
  const s = resolveJourneyState({
    accountCount: 1,
    syncStatus: null,
    newBulletins: 0,
    online: true,
    hasCachedBulletins: false,
  });
  assertStateShape(s, 'ready-to-scan');
  assert.equal(s.title, 'Votre boîte mail est connectée');
  assert.equal(s.action.label, 'Rechercher mes bulletins');
});

test('aucun libellé ne contient « messagerie » ni « synchronisation »', () => {
  const snapshots = [
    { accountCount: 0, syncStatus: 'done', newBulletins: 3, online: true, hasCachedBulletins: false },
    { accountCount: 1, syncStatus: null, newBulletins: 0, online: true, hasCachedBulletins: false },
    { accountCount: 1, syncStatus: 'running', newBulletins: 0, online: true, hasCachedBulletins: false },
    { accountCount: 1, syncStatus: 'done', newBulletins: 3, online: true, hasCachedBulletins: false },
    { accountCount: 1, syncStatus: 'done', newBulletins: 0, online: true, hasCachedBulletins: false },
    { accountCount: 1, syncStatus: 'failed', newBulletins: 0, online: true, hasCachedBulletins: false },
    { accountCount: 1, syncStatus: 'running', newBulletins: 0, online: false, hasCachedBulletins: true },
  ];
  for (const snapshot of snapshots) {
    const s = resolveJourneyState(snapshot);
    const texts = [s.title, s.body, s.action ? s.action.label : ''];
    for (const text of texts) {
      const lower = text.toLowerCase();
      assert.ok(!lower.includes('messagerie'), `jargon « messagerie » dans : ${text}`);
      assert.ok(!lower.includes('synchronisation'), `jargon « synchronisation » dans : ${text}`);
    }
  }
});
