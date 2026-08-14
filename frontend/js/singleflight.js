/**
 * singleFlight(fn) — mémoïse la promesse en cours d'une fonction asynchrone.
 *
 * La première invocation lance `fn(...args)` et devient la promesse active ;
 * les appels concurrents reçoivent cette même promesse. Une fois la promesse
 * réglée (résolution OU rejet), l'état actif est remis à `null` dans `finally`,
 * ce qui permet une nouvelle exécution ultérieure.
 *
 * Export UMD :
 *  - Node (CommonJS)  : `const { singleFlight } = require('./singleflight.js')`
 *  - Navigateur        : `window.singleFlight(fn)`
 *
 * @param {(...args: unknown[]) => Promise<unknown>} fn fonction asynchrone à protéger
 * @returns {(...args: unknown[]) => Promise<unknown>} wrapper single-flight
 */
(function (root) {
  'use strict';

  function singleFlight(fn) {
    let active = null;
    return function (...args) {
      if (active) return active;
      active = fn.apply(this, args);
      return active.finally(() => {
        active = null;
      });
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { singleFlight };
  } else {
    root.singleFlight = singleFlight;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
