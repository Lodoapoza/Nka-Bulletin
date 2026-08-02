// Runner OCR isolé (ESM). Usage : node scripts/ocr-runner.mjs <fichier.pdf>
// Imprime sur stdout un unique objet JSON : {"text": "…"}. Ne doit jamais crasher
// l'appelant : toute erreur interne est convertie en {"text": ""}.
import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import { createWorker } from "tesseract.js";

const MAX_IMAGES = 3;

function toRGBA(img) {
  const { data, width: w, height: h, kind } = img;
  if (kind === 3) return data.subarray(0, w * h * 4);
  const out = Buffer.alloc(w * h * 4);
  switch (kind) {
    case 2: {
      for (let i = 0, j = 0; i < w * h * 3; i += 3, j += 4) { out[j] = data[i]; out[j + 1] = data[i + 1]; out[j + 2] = data[i + 2]; out[j + 3] = 255; }
      return out;
    }
    case 4: {
      for (let i = 0, j = 0; i < w * h; i++, j += 4) { out[j] = data[i]; out[j + 1] = data[i]; out[j + 2] = data[i]; out[j + 3] = 255; }
      return out;
    }
    case 1: {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const bit = (data[(y * w + x) >> 3] >> (7 - (x & 7))) & 1;
        const v = bit ? 0 : 255;
        const j = (y * w + x) * 4; out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
      }
      return out;
    }
    default: throw new Error("kind inconnu " + kind);
  }
}

async function waitResolved(page, objId, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (page.objs.has(objId)) return page.objs.get(objId);
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

async function extractPageImages(page) {
  const ops = await page.getOperatorList();
  const images = [];
  for (let i = 0; i < ops.fnArray.length && images.length < MAX_IMAGES; i++) {
    if (ops.fnArray[i] !== OPS.paintImageXObject) continue;
    const img = await waitResolved(page, ops.argsArray[i][0]);
    if (!img || !img.data || !img.width || !img.height) continue;
    const rgba = toRGBA(img);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    const im = ctx.createImageData(img.width, img.height);
    im.data.set(rgba);
    ctx.putImageData(im, 0, 0);
    images.push(c.toBuffer("image/png"));
  }
  return images;
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.log(JSON.stringify({ text: "" })); return; }
  let pngs = [];
  try {
    const data = new Uint8Array(fs.readFileSync(file));
    const pdf = await getDocument({ data }).promise;
    for (let p = 1; p <= pdf.numPages && pngs.length < MAX_IMAGES; p++) {
      const page = await pdf.getPage(p);
      const imgs = await extractPageImages(page);
      pngs.push(...imgs);
    }
  } catch (_) {
    console.log(JSON.stringify({ text: "" }));
    return;
  }
  if (!pngs.length) { console.log(JSON.stringify({ text: "" })); return; }

  let worker = null;
  try {
    worker = await createWorker("fra", 1, { logger: () => {} });
    let parts = [];
    for (const png of pngs) {
      const { data } = await worker.recognize(png);
      if (data && data.text) parts.push(data.text);
    }
    console.log(JSON.stringify({ text: parts.join(" ") }));
  } catch (_) {
    console.log(JSON.stringify({ text: "" }));
  } finally {
    try { if (worker) await worker.terminate(); } catch (_) {}
  }
}

main();
