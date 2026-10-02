/**
 * Rendu initial de l'écran PIN.
 *
 * Ce fichier est référencé dans index.html juste après #pin-screen, donc il
 * s'exécute pendant le parsing du document — bien avant DOMContentLoaded.
 *
 * Pourquoi : le HTML statique écrit en dur l'état « création de PIN »
 * (titre « Définissez votre code PIN », clavier et points vides). Pin.start(),
 * qui lit l'état réel puis reconstruit tout, ne s'exécute qu'à
 * DOMContentLoaded, c'est-à-dire après le téléchargement des ~93 Ko de JS
 * inlinés en fin de document. Sans ce rendu précoce, un utilisateur déjà
 * enregistré voit donc l'écran « Définissez… » puis l'écran PIN une seconde
 * plus tard.
 *
 * Ce module reproduit strictement la partie statuelle de Pin.start() (pin.js) :
 * mêmes chaînes, même balisage. Il ne porte aucune logique — aucun listener,
 * aucun état. Pin.start() reconstruit le même DOM à DOMContentLoaded ; le
 * résultat visuel est identique, seul le moment diffère.
 *
 * Il est inliné par build.mjs, qui calcule au passage le hash sha256 exigé
 * par la CSP (script-src 'self' + hashes) : ce fichier doit rester référencé
 * en <script src="js/boot.js">, jamais écrit en dur dans index.html.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'nka_pin_record'; // doit rester aligné sur pin.js
  var PIN_LENGTH = 4;                 // doit rester aligné sur pin.js

  var configured;
  try {
    configured = !!localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    configured = false; // localStorage indisponible : on laisse l'état par défaut
  }

  var title = document.getElementById('pin-title');
  if (title) {
    title.textContent = configured
      ? 'Entrez votre code PIN'
      : 'Définissez votre code PIN';
  }

  var subtitle = document.getElementById('pin-subtitle');
  if (subtitle) {
    subtitle.textContent = configured
      ? 'Bienvenue de retour sur Nka Bulletin.'
      : "Ce code protège l'accès à vos bulletins sur cet appareil.";
  }

  var forgot = document.getElementById('pin-forgot-btn');
  if (forgot) forgot.style.display = configured ? 'block' : 'none';

  // Clavier : balisage identique à renderKeypad() (pin.js). Les écouteurs sont
  // posés par Pin.start() à DOMContentLoaded, qui remplace ces boutons par des
  // exemplaires strictement équivalents mais cliquables.
  var keypad = document.getElementById('pin-keypad');
  if (keypad && !keypad.childElementCount) {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      html += '<button class="pin-key" style="visibility:' +
        (keys[i] === '' ? 'hidden' : 'visible') + '">' + keys[i] + '</button>';
    }
    keypad.innerHTML = html;
  }

  // Points : balisage identique à renderDots() (pin.js), aucun n'est rempli
  // tant que la saisie n'a pas commencé.
  var dots = document.getElementById('pin-dots');
  if (dots && !dots.childElementCount) {
    var dotsHtml = '';
    for (var j = 0; j < PIN_LENGTH; j++) dotsHtml += '<div class="pin-dot"></div>';
    dots.innerHTML = dotsHtml;
  }
})();
