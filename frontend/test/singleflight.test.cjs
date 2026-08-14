const test = require('node:test');
const assert = require('node:assert/strict');
const { singleFlight } = require('../js/singleflight.js');

test('les appels concurrents partagent une exécution', async () => {
  let executions = 0;
  const run = singleFlight(async (value) => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return value * 2;
  });
  const [a, b] = await Promise.all([run(21), run(99)]);
  assert.equal(a, 42);
  assert.equal(b, 42);
  assert.equal(executions, 1);
});

test('une nouvelle exécution est possible après résolution', async () => {
  let executions = 0;
  const run = singleFlight(async () => ++executions);
  assert.equal(await run(), 1);
  assert.equal(await run(), 2);
});
