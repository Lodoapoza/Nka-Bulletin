const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Exécute l'OCR dans un PROCESSUS SÉPARÉ et isolé : même si le code natif
// (pdfjs / canvas / tesseract) crashe, le worker principal n'est pas affecté.
const RUNNER = path.join(__dirname, '..', 'scripts', 'ocr-runner.mjs');
const OCR_TIMEOUT = Number(process.env.OCR_TIMEOUT) || 90000;

/**
 * OCR d'un PDF scanné/fax. Retourne le texte reconnu, ou null en cas d'échec
 * (jamais de rejet — l'OCR est best-effort).
 * @param {Buffer} buffer
 * @returns {Promise<string|null>}
 */
function ocrPdf(buffer) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `nka-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    try {
      fs.writeFileSync(tmpFile, buffer);
    } catch (_) {
      return resolve(null);
    }

    const child = spawn(process.execPath, [RUNNER, tmpFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', () => {});

    const timer = setTimeout(() => child.kill('SIGKILL'), OCR_TIMEOUT);

    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };

    child.on('error', () => { clearTimeout(timer); cleanup(); resolve(null); });
    child.on('close', () => {
      clearTimeout(timer);
      cleanup();
      try {
        const lines = out.trim().split('\n').filter(l => l.trim());
        const parsed = JSON.parse(lines[lines.length - 1]);
        resolve(typeof parsed.text === 'string' ? parsed.text : null);
      } catch (_) {
        resolve(null);
      }
    });
  });
}

module.exports = { ocrPdf };
