import { PDFDocument } from 'pdf-lib';
import type { ExtractionDensity } from '../types/study';

export const MAX_SINGLE_PDF_BYTES = 250 * 1024 * 1024; // 250 MB per PDF
export const TARGET_BATCH_MAX_BYTES = 2 * 1024 * 1024; // 2.0 MB fast, proxy-safe & TPM-friendly target per batch
export const HARD_SINGLE_PAGE_MAX_BYTES = 24 * 1024 * 1024; // 24 MB hard server cap

export function getPagesPerBatch(density: ExtractionDensity): number {
  switch (density) {
    case 'ultra_dense':
      return 3;
    case 'exhaustive':
      return 5;
    case 'standard':
    default:
      return 8;
  }
}

export function getDensityLabel(density: ExtractionDensity): string {
  switch (density) {
    case 'ultra_dense':
      return 'Ultra-Dense (3 pp/batch)';
    case 'exhaustive':
      return 'Exhaustive (5 pp/batch)';
    case 'standard':
    default:
      return 'Standard (8 pp/batch)';
  }
}

export async function inspectPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return pdfDoc.getPageCount();
}

export async function loadPdfDocument(file: File): Promise<PDFDocument> {
  const arrayBuffer = await file.arrayBuffer();
  return PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
}

/**
 * Parses human-friendly page ranges like "All", "1-50", "1-25, 40-60, 188"
 * into sorted, deduplicated 1-based page numbers.
 */
export function parsePageRangeInput(
  rawInput: string,
  totalPages: number
): { pages: number[]; error?: string } {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return {
      pages: Array.from({ length: totalPages }, (_, idx) => idx + 1),
    };
  }

  const pageSet = new Set<number>();
  const tokens = trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { pages: [], error: 'Enter "All" or a page range like 1-50.' };
  }

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const p = Number.parseInt(token, 10);
      if (p < 1 || p > totalPages) {
        return {
          pages: [],
          error: `Page ${p} is out of bounds (document has ${totalPages} pages).`,
        };
      }
      pageSet.add(p);
    } else if (/^\d+\s*-\s*\d+$/.test(token)) {
      const [startStr, endStr] = token.split('-').map((s) => s.trim());
      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);
      if (start < 1 || end > totalPages || start > end) {
        return {
          pages: [],
          error: `Range "${token}" is invalid for a ${totalPages}-page PDF.`,
        };
      }
      for (let p = start; p <= end; p++) {
        pageSet.add(p);
      }
    } else {
      return {
        pages: [],
        error: `Could not understand "${token}". Use formats like "1-50" or "1-20, 45-60".`,
      };
    }
  }

  const pages = Array.from(pageSet).sort((a, b) => a - b);
  return { pages };
}

/**
 * Groups sorted 1-based page numbers into compact readable ranges, e.g. "1-50, 80-95".
 */
export function formatPageNumbersCompact(pages: number[]): string {
  if (!pages || pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

/**
 * Splits an ordered list of 1-based page numbers into initial fixed-size chunks.
 */
export function chunkPages(pages: number[], pagesPerBatch: number): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < pages.length; i += pagesPerBatch) {
    chunks.push(pages.slice(i, i + pagesPerBatch));
  }
  return chunks;
}

async function buildSubPdfBytes(
  srcDoc: PDFDocument,
  pages1Based: number[]
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();
  const indices0Based = pages1Based.map((p) => p - 1);
  const copiedPages = await outDoc.copyPages(srcDoc, indices0Based);
  for (const page of copiedPages) {
    outDoc.addPage(page);
  }
  return outDoc.save({ useObjectStreams: true });
}

/**
 * Adaptively slices a batch of pages into one or more micro-PDFs, ensuring
 * every slice stays below TARGET_BATCH_MAX_BYTES (2 MB) for reliable HTTP upload.
 */
export async function slicePdfBatchAdaptive(
  srcDoc: PDFDocument,
  pages1Based: number[],
  maxBytes = TARGET_BATCH_MAX_BYTES
): Promise<Array<{ pages: number[]; bytes: Uint8Array }>> {
  const bytes = await buildSubPdfBytes(srcDoc, pages1Based);

  if (bytes.byteLength <= maxBytes) {
    return [{ pages: pages1Based, bytes }];
  }

  if (pages1Based.length === 1) {
    if (bytes.byteLength > HARD_SINGLE_PAGE_MAX_BYTES) {
      throw new Error(
        `Page ${pages1Based[0]} alone is ${(bytes.byteLength / (1024 * 1024)).toFixed(1)} MB (exceeds 24 MB single-page limit). Consider compressing scanned images in this PDF.`
      );
    }
    return [{ pages: pages1Based, bytes }];
  }

  const mid = Math.ceil(pages1Based.length / 2);
  const left = await slicePdfBatchAdaptive(srcDoc, pages1Based.slice(0, mid), maxBytes);
  const right = await slicePdfBatchAdaptive(srcDoc, pages1Based.slice(mid), maxBytes);
  return [...left, ...right];
}
