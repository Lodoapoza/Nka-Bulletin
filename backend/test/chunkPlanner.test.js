'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planChunks } = require('../src/chunkPlanner.js');

test('les tranches récentes sont décroissantes et commencent dans la fenêtre de 24 mois', () => {
  const { phase, chunks, nextCursor } = planChunks({
    oldestDate: '1990-01-01',
    newestDate: '2024-03-15',
  });

  assert.equal(phase, 'recent');
  // 24 tranches mensuelles : 2024-03 → 2022-04 (fenêtre de 24 mois).
  assert.equal(chunks.length, 24);
  // La première tranche contient newestDate et est tronquée à cette date.
  assert.equal(chunks[0].from, '2024-03-01');
  assert.equal(chunks[0].to, '2024-03-15');
  // Tranches décroissantes (récent → ancien) et contiguës.
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].from < chunks[i - 1].from, `tranche ${i} plus récente que la précédente`);
    assert.ok(chunks[i].to < chunks[i - 1].from, `tranche ${i} chevauche la précédente`);
  }
  // La dernière tranche récente commence au premier jour de la fenêtre.
  assert.equal(chunks[chunks.length - 1].from, '2022-04-01');
  assert.equal(chunks[chunks.length - 1].to, '2022-04-30');
  // Le curseur suivant pointe le début de l'historique (mois précédent).
  assert.deepEqual(nextCursor, { phase: 'history', from: '2022-03-01' });
});

test('un curseur history ne recrée pas les tranches déjà parcourues', () => {
  const { phase, chunks, nextCursor } = planChunks({
    oldestDate: '2021-06-10',
    newestDate: '2024-03-15',
    cursor: { phase: 'history', from: '2022-01-01' },
  });

  assert.equal(phase, 'history');
  // De janvier 2022 à juin 2021 : 8 tranches mensuelles.
  assert.equal(chunks.length, 8);
  assert.equal(chunks[0].from, '2022-01-01');
  assert.equal(chunks[0].to, '2022-01-31');
  // Aucune tranche ne remonte vers la fenêtre récente (>= février 2022).
  for (const c of chunks) {
    assert.ok(c.to <= '2022-01-31', `tranche ${c.from}…${c.to} recrée du récent`);
    assert.ok(c.from <= c.to, `tranche inversée ${c.from}…${c.to}`);
  }
  // La dernière tranche commence à oldestDate (bornée côté ancien).
  assert.equal(chunks[chunks.length - 1].from, '2021-06-10');
  assert.equal(chunks[chunks.length - 1].to, '2021-06-30');
  // Fin de l'historique : plus rien à planifier.
  assert.equal(nextCursor, null);
});

test('aucune tranche from > to et nextCursor final null', () => {
  // Fenêtre entièrement dans le récent : pas de phase history.
  const r = planChunks({ oldestDate: '2023-10-01', newestDate: '2024-03-15' });
  assert.equal(r.phase, 'recent');
  assert.equal(r.nextCursor, null);
  // La phase récente est bornée par oldestDate (pas de tranches vides avant).
  assert.equal(r.chunks.length, 6);
  assert.equal(r.chunks[5].from, '2023-10-01');
  assert.equal(r.chunks[5].to, '2023-10-31');
  for (const c of r.chunks) assert.ok(c.from <= c.to);

  // Curseur pointant avant oldestDate (tout est déjà traité) : le garde
  // from > to s'applique → aucune tranche, nextCursor null.
  const bad = planChunks({
    oldestDate: '2021-06-10',
    newestDate: '2024-03-15',
    cursor: { phase: 'history', from: '2021-05-01' },
  });
  assert.deepEqual(bad.chunks, []);
  assert.equal(bad.nextCursor, null);
});
