import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getBulletinById } from '../db.js';

/**
 * Merge multiple PDF files into one
 *
 * @param {string[]} filePaths - Array of PDF file paths
 * @param {string} outputPath - Destination path for merged PDF
 * @returns {Promise<string>} The output path
 */
export async function mergePDFs(filePaths, outputPath) {
  const mergedPdf = await PDFDocument.create();

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found, skipping: ${filePath}`);
      continue;
    }

    const fileBytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
    const pageIndices = pdf.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);

    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  const mergedBytes = await mergedPdf.save();
  fs.writeFileSync(outputPath, mergedBytes);

  return outputPath;
}

/**
 * Merge bulletins by their IDs
 *
 * @param {string[]} ids - Array of bulletin IDs
 * @returns {Promise<{filePath: string, count: number}>}
 */
export async function mergeSelection(ids) {
  const mergeDir = path.join('data', 'merges');
  fs.mkdirSync(mergeDir, { recursive: true });

  const outputFilename = `merge-${uuidv4()}.pdf`;
  const outputPath = path.join(mergeDir, outputFilename);

  const filePaths = [];
  for (const id of ids) {
    const bulletin = getBulletinById(id);
    if (bulletin && fs.existsSync(bulletin.file_path)) {
      filePaths.push(bulletin.file_path);
    }
  }

  if (filePaths.length === 0) {
    throw new Error('Aucun bulletin valide à fusionner');
  }

  await mergePDFs(filePaths, outputPath);

  return { filePath: outputPath, count: filePaths.length };
}
