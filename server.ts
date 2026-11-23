import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const MAX_BATCH_PDF_BYTES = 25 * 1024 * 1024; // 25 MB per micro-PDF batch (safe under proxy ceilings)
const MAX_TEXT_CHARS = 180_000;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

const app = express();
app.use(express.json({ limit: '4mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BATCH_PDF_BYTES,
    files: 1,
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isPdfBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 5) return false;
  const header = buf.subarray(0, 1024).toString('latin1');
  return header.includes('%PDF-');
}

const flashcardItemSchema = {
  type: Type.OBJECT,
  properties: {
    format: {
      type: Type.STRING,
      description: 'Must be strictly "clinical_vignette" or "exam_one_liner".',
    },
    topic: {
      type: Type.STRING,
      description: 'Specific medical sub-topic from these pages (2-5 words).',
    },
    pageNumber: {
      type: Type.STRING,
      description: 'Exact original page reference from the provided page list, e.g. "p. 42".',
    },
    front: {
      type: Type.STRING,
      description:
        'For clinical_vignette: a realistic concise patient presentation or clinical stem asking for diagnosis, mechanism, investigation of choice, or drug of choice. For exam_one_liner: a crisp rapid-recall prompt (pathognomonic finding, triad, enzyme defect, DOC, gold standard test, cutoff value).',
    },
    back: {
      type: Type.STRING,
      description:
        'Direct, unambiguous high-yield answer grounded strictly in the uploaded pages.',
    },
    clinicalPearl: {
      type: Type.STRING,
      description:
        'A memorable high-yield exam pearl, differentiating clue, mnemonic, or classic NEET PG trap from these pages.',
    },
  },
  required: ['format', 'topic', 'pageNumber', 'front', 'back', 'clinicalPearl'],
};

const qaItemSchema = {
  type: Type.OBJECT,
  properties: {
    format: {
      type: Type.STRING,
      description: 'Must be strictly "clinical_vignette" or "exam_one_liner".',
    },
    topic: {
      type: Type.STRING,
      description: 'Specific medical sub-topic from these pages.',
    },
    pageNumber: {
      type: Type.STRING,
      description: 'Exact original page reference, e.g. "p. 42".',
    },
    question: {
      type: Type.STRING,
      description: 'Clear, exam-oriented medical question covering a key concept on these pages.',
    },
    answer: {
      type: Type.STRING,
      description:
        'Thorough yet scannable medical answer with key thresholds, drugs, mechanisms, or diagnostic criteria from the pages.',
    },
    highYieldClue: {
      type: Type.STRING,
      description: 'Short high-yield takeaway, buzzword, or exam differentiator.',
    },
  },
  required: ['format', 'topic', 'pageNumber', 'question', 'answer', 'highYieldClue'],
};

const mcqItemSchema = {
  type: Type.OBJECT,
  properties: {
    format: {
      type: Type.STRING,
      description: 'Must be strictly "clinical_vignette" or "exam_one_liner".',
    },
    topic: {
      type: Type.STRING,
      description: 'Specific medical sub-topic.',
    },
    pageNumber: {
      type: Type.STRING,
      description: 'Exact original page reference, e.g. "p. 42".',
    },
    stem: {
      type: Type.STRING,
      description: 'Complete NEET PG style question stem (clinical vignette or direct high-yield stem).',
    },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exactly 4 distinct, plausible medical options without letter prefixes.',
    },
    correctIndex: {
      type: Type.INTEGER,
      description: 'Zero-based index (0, 1, 2, or 3) of the single best answer.',
    },
    explanation: {
      type: Type.STRING,
      description: 'Clear clinical rationale explaining why the correct option is right based on the notes.',
    },
    distractorNotes: {
      type: Type.STRING,
      description: 'Brief explanation ruling out the key distractors to reinforce exam discrimination.',
    },
  },
  required: [
    'format',
    'topic',
    'pageNumber',
    'stem',
    'options',
    'correctIndex',
    'explanation',
    'distractorNotes',
  ],
};

const extractionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Concise, clear medical title for the study deck based on the document.',
    },
    subject: {
      type: Type.STRING,
      description:
        'Primary NEET PG medical subject (e.g., Internal Medicine, Pharmacology, Pathology, Surgery, OBGYN, Pediatrics, Anatomy, Physiology, Biochemistry, Microbiology, PSM, Ophthalmology, ENT, Psychiatry, Dermatology, Orthopedics, Anesthesia, Radiology, Forensic Medicine).',
    },
    summary: {
      type: Type.STRING,
      description:
        'A crisp 2-3 sentence high-yield overview of the core medical themes covered in the notes.',
    },
    keyTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'List of all distinct medical topics and sub-headings appearing on these pages.',
    },
    flashcards: {
      type: Type.ARRAY,
      items: flashcardItemSchema,
    },
    qaItems: {
      type: Type.ARRAY,
      items: qaItemSchema,
    },
    mcqs: {
      type: Type.ARRAY,
      items: mcqItemSchema,
    },
  },
  required: ['title', 'subject', 'summary', 'keyTopics', 'flashcards', 'qaItems', 'mcqs'],
};

const batchResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Concise medical deck title (meaningful on first batch; may repeat on subsequent batches).',
    },
    subject: {
      type: Type.STRING,
      description: 'Primary NEET PG medical subject covered in these pages.',
    },
    summary: {
      type: Type.STRING,
      description: 'Short 1-2 sentence summary of the topics covered in these pages.',
    },
    keyTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Every distinct medical topic/heading covered on these exact pages.',
    },
    flashcards: {
      type: Type.ARRAY,
      items: flashcardItemSchema,
    },
    qaItems: {
      type: Type.ARRAY,
      items: qaItemSchema,
    },
    mcqs: {
      type: Type.ARRAY,
      items: mcqItemSchema,
    },
  },
  required: ['title', 'subject', 'summary', 'keyTopics', 'flashcards', 'qaItems', 'mcqs'],
};

const additionalItemsSchema = {
  type: Type.OBJECT,
  properties: {
    flashcards: { type: Type.ARRAY, items: flashcardItemSchema },
    qaItems: { type: Type.ARRAY, items: qaItemSchema },
    mcqs: { type: Type.ARRAY, items: mcqItemSchema },
  },
  required: ['flashcards', 'qaItems', 'mcqs'],
};

function buildFocusInstruction(focus: string): string {
  switch (focus) {
    case 'clinical_vignettes':
      return 'Prioritize ~70% realistic NEET PG clinical vignettes (age, sex, presenting symptoms, vitals/labs, next best step, investigation or drug of choice) and ~30% sharp exam one-liners.';
    case 'rapid_revision':
      return 'Prioritize ~70% crisp, high-yield exam-style one-liners (buzzwords, triads, pathognomonic signs, drugs of choice, gold-standard investigations, numerical cutoffs) and ~30% short clinical vignettes.';
    default:
      return 'Create a balanced ~50% mix of NEET PG clinical vignettes and ~50% rapid-recall exam-style one-liners.';
  }
}

function buildBatchDensityTargets(density: string, pageCountInBatch: number): string {
  const n = Math.max(1, pageCountInBatch);
  if (density === 'ultra_dense') {
    const fcMin = Math.max(5, Math.min(14, n * 4));
    const fcMax = Math.min(18, n * 5 + 2);
    const qaMin = Math.max(4, Math.min(10, n * 3));
    const qaMax = Math.min(12, n * 3 + 2);
    const mcqMin = Math.max(3, Math.min(8, n * 2));
    const mcqMax = Math.min(10, n * 2 + 2);
    return [
      `ULTRA-DENSE EXTRACTION MODE (${n} page${n > 1 ? 's' : ''} in this batch):`,
      'Extract every key medical fact, drug of choice, side effect, classification, table row, diagnostic cutoff, exception, triad, and clinical scenario on EVERY page in this slice. Keep each answer crisp and high-yield (1-3 sentences) so every page is covered completely without verbosity.',
      `Target: ${fcMin}-${fcMax} flashcards, ${qaMin}-${qaMax} structured Q&As, and ${mcqMin}-${mcqMax} NEET PG 4-option MCQs across these ${n} page(s).`,
    ].join(' ');
  }
  if (density === 'standard') {
    const fcMin = Math.max(4, Math.min(10, Math.round(n * 1.5)));
    const fcMax = Math.min(14, n * 2);
    const qaMin = Math.max(3, Math.min(8, n));
    const qaMax = Math.min(10, Math.round(n * 1.3) + 1);
    const mcqMin = Math.max(2, Math.min(6, Math.round(n * 0.8)));
    const mcqMax = Math.min(8, n + 1);
    return [
      `STANDARD REVISION MODE (${n} page${n > 1 ? 's' : ''} in this batch):`,
      'Ensure EVERY page and every main topic in this slice is covered thoroughly with concise, exam-ready wording.',
      `Target: ${fcMin}-${fcMax} flashcards, ${qaMin}-${qaMax} structured Q&As, and ${mcqMin}-${mcqMax} NEET PG 4-option MCQs across these ${n} page(s).`,
    ].join(' ');
  }
  // Exhaustive (default)
  const fcMin = Math.max(5, Math.min(12, n * 2 + 2));
  const fcMax = Math.min(16, n * 3 + 2);
  const qaMin = Math.max(4, Math.min(9, n * 2));
  const qaMax = Math.min(12, n * 2 + 2);
  const mcqMin = Math.max(3, Math.min(7, Math.round(n * 1.2) + 1));
  const mcqMax = Math.min(9, n * 2);
  return [
    `EXHAUSTIVE COVERAGE MODE (${n} page${n > 1 ? 's' : ''} in this batch):`,
    'Walk systematically through EVERY SINGLE PAGE in this batch from top to bottom. Every heading, table, diagnostic criterion, mechanism, drug of choice, and clinical vignette on every page MUST be represented. Keep each card and explanation concise and high-yield (1-3 sentences).',
    `Target: ${fcMin}-${fcMax} flashcards, ${qaMin}-${qaMax} structured Q&As, and ${mcqMin}-${mcqMax} NEET PG 4-option MCQs across these ${n} page(s).`,
  ].join(' ');
}

function parseRetryDelaySeconds(errMessage: string): number | null {
  const secMatch = errMessage.match(/retry\s*(?:in|after)\s*([\d.]+)\s*s/i);
  if (secMatch) {
    const parsed = Math.ceil(Number.parseFloat(secMatch[1]));
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 120) return parsed;
  }
  const jsonDelayMatch = errMessage.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (jsonDelayMatch) {
    const parsed = Number.parseInt(jsonDelayMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 120) return parsed;
  }
  return null;
}

type QuotaScope = 'minute' | 'daily';

interface PooledModelState {
  id: string;
  label: string;
  useLowThinking: boolean;
  cooldownUntil: number;
  dailyExhaustedUntil: number;
  consecutiveRateLimits: number;
}

const MODEL_POOL: PooledModelState[] = [
  {
    id: GEMINI_MODEL,
    label: 'Gemini 2.5 Flash',
    useLowThinking: false,
    cooldownUntil: 0,
    dailyExhaustedUntil: 0,
    consecutiveRateLimits: 0,
  },
  {
    id: GEMINI_FALLBACK_MODEL,
    label: 'Gemini 2.5 Flash Lite',
    useLowThinking: false,
    cooldownUntil: 0,
    dailyExhaustedUntil: 0,
    consecutiveRateLimits: 0,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    useLowThinking: false,
    cooldownUntil: 0,
    dailyExhaustedUntil: 0,
    consecutiveRateLimits: 0,
  },
];

class AllModelsCoolingError extends Error {
  retryAfterSeconds: number;
  quotaScope: QuotaScope;

  constructor(retryAfterSeconds: number, quotaScope: QuotaScope) {
    super(
      quotaScope === 'daily'
        ? 'Daily Gemini API quota reached across all available models.'
        : `API rate limit active across available models — waiting ${retryAfterSeconds}s for quota window reset.`
    );
    this.retryAfterSeconds = retryAfterSeconds;
    this.quotaScope = quotaScope;
  }
}

function detectQuotaScope(errMessage: string): QuotaScope {
  if (/per\s*day|PerDay|RequestsPerDay|GenerateRequestsPerDay|daily\s+limit|RPD/i.test(errMessage)) {
    return 'daily';
  }
  return 'minute';
}

function isRateLimitError(msg: string): boolean {
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('rate limit')
  );
}

function isTransientOverloadError(msg: string): boolean {
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.toLowerCase().includes('overloaded')
  );
}

/**
 * Dual-model quota pool router:
 * - Immediately skips any model currently in cooldown without wasting a round-trip.
 * - Rotates seamlessly between Gemini 4 Flash (ThinkingLevel.LOW) and Flash Lite
 *   whenever either model hits a 429 rate limit or 503 overload.
 * - Throws AllModelsCoolingError with exact minimum wait seconds + quotaScope ONLY
 *   when every model in the pool is cooling down simultaneously.
 */
async function generateStructuredWithPool(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    responseSchema: Record<string, unknown>;
  }
): Promise<{
  response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>;
  modelUsed: string;
  modelLabel: string;
}> {
  const now = Date.now();

  // Order available models: prefer primary when ready, otherwise any unblocked model
  const candidates = MODEL_POOL.filter(
    (m) => m.cooldownUntil <= now && m.dailyExhaustedUntil <= now
  );

  if (candidates.length === 0) {
    const allDaily = MODEL_POOL.every((m) => m.dailyExhaustedUntil > now);
    const soonest = Math.min(
      ...MODEL_POOL.map((m) => Math.max(m.cooldownUntil, m.dailyExhaustedUntil))
    );
    const waitSec = Math.max(5, Math.min(65, Math.ceil((soonest - now) / 1000)));
    throw new AllModelsCoolingError(waitSec, allDaily ? 'daily' : 'minute');
  }

  let lastNonQuotaError: unknown = null;

  for (const model of candidates) {
    try {
      const config: Record<string, unknown> = {
        systemInstruction: params.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: params.responseSchema,
      };
      if (model.useLowThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const response = await ai.models.generateContent({
        model: model.id,
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config,
      });

      // Success clears any prior cooldown streak on this model
      model.cooldownUntil = 0;
      model.dailyExhaustedUntil = 0;
      model.consecutiveRateLimits = 0;

      return {
        response,
        modelUsed: model.id,
        modelLabel: model.label,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errNow = Date.now();

      if (isRateLimitError(msg)) {
        const scope = detectQuotaScope(msg);
        model.consecutiveRateLimits += 1;

        if (scope === 'daily') {
          model.dailyExhaustedUntil = errNow + 15 * 60 * 1000;
          console.warn(
            `[CliniDeck] ${model.id} hit daily quota; rotating to remaining pool models.`
          );
        } else {
          const parsedDelay = parseRetryDelaySeconds(msg);
          const cooldownSec = parsedDelay
            ? Math.min(65, parsedDelay + 3)
            : model.consecutiveRateLimits >= 2
              ? 64
              : 35;
          model.cooldownUntil = errNow + cooldownSec * 1000;
          console.warn(
            `[CliniDeck] ${model.id} hit per-minute 429 (cooling ${cooldownSec}s); rotating to alternate model if ready.`
          );
        }
        continue;
      }

      if (isTransientOverloadError(msg)) {
        model.cooldownUntil = errNow + 15_000;
        lastNonQuotaError = err;
        console.warn(
          `[CliniDeck] ${model.id} returned transient 503/overload (cooling 15s); trying alternate model.`
        );
        continue;
      }

      // Non-quota, non-overload error (e.g., 400 invalid argument, 403 bad key) — fail immediately
      throw err;
    }
  }

  // Every candidate we tried either hit quota or transient overload
  const checkNow = Date.now();
  const anyCooling = MODEL_POOL.some(
    (m) => m.cooldownUntil > checkNow || m.dailyExhaustedUntil > checkNow
  );
  if (anyCooling) {
    const allDaily = MODEL_POOL.every((m) => m.dailyExhaustedUntil > checkNow);
    const soonest = Math.min(
      ...MODEL_POOL.map((m) => Math.max(m.cooldownUntil, m.dailyExhaustedUntil))
    );
    const waitSec = Math.max(5, Math.min(65, Math.ceil((soonest - checkNow) / 1000)));
    throw new AllModelsCoolingError(waitSec, allDaily ? 'daily' : 'minute');
  }

  throw lastNonQuotaError ?? new AllModelsCoolingError(25, 'minute');
}

function normalizeFormat(val: unknown): 'clinical_vignette' | 'exam_one_liner' {
  return val === 'clinical_vignette' ? 'clinical_vignette' : 'exam_one_liner';
}

function sanitizeExtractedPayload(
  raw: Record<string, unknown>,
  fallbackTitle: string,
  options?: { sourceFile?: string; fallbackPageLabel?: string; idSuffix?: string }
) {
  const flashcardsRaw = Array.isArray(raw.flashcards) ? raw.flashcards : [];
  const qaRaw = Array.isArray(raw.qaItems) ? raw.qaItems : [];
  const mcqsRaw = Array.isArray(raw.mcqs) ? raw.mcqs : [];
  const suffix = options?.idSuffix || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const sourceFile = options?.sourceFile;
  const fallbackPage = options?.fallbackPageLabel;

  const flashcards = flashcardsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: `fc_${suffix}_${idx}`,
      format: normalizeFormat(item.format),
      topic: String(item.topic || 'General Concept').trim(),
      front: String(item.front || '').trim(),
      back: String(item.back || '').trim(),
      clinicalPearl: String(item.clinicalPearl || '').trim(),
      confidence: 'unseen' as const,
      starred: false,
      sourceFile,
      pageNumber: String(item.pageNumber || fallbackPage || '').trim() || undefined,
    }))
    .filter((c) => c.front.length > 0 && c.back.length > 0);

  const qaItems = qaRaw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: `qa_${suffix}_${idx}`,
      format: normalizeFormat(item.format),
      topic: String(item.topic || 'General Concept').trim(),
      question: String(item.question || '').trim(),
      answer: String(item.answer || '').trim(),
      highYieldClue: String(item.highYieldClue || '').trim(),
      revised: false,
      sourceFile,
      pageNumber: String(item.pageNumber || fallbackPage || '').trim() || undefined,
    }))
    .filter((q) => q.question.length > 0 && q.answer.length > 0);

  const mcqs = mcqsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => {
      const opts = Array.isArray(item.options)
        ? item.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
        : [];
      const correctIdx =
        typeof item.correctIndex === 'number' &&
        Number.isInteger(item.correctIndex) &&
        item.correctIndex >= 0 &&
        item.correctIndex < opts.length
          ? item.correctIndex
          : 0;
      return {
        id: `mcq_${suffix}_${idx}`,
        format: normalizeFormat(item.format),
        topic: String(item.topic || 'General Concept').trim(),
        stem: String(item.stem || '').trim(),
        options: opts,
        correctIndex: correctIdx,
        explanation: String(item.explanation || '').trim(),
        distractorNotes: String(item.distractorNotes || '').trim(),
        sourceFile,
        pageNumber: String(item.pageNumber || fallbackPage || '').trim() || undefined,
      };
    })
    .filter((m) => m.stem.length > 0 && m.options.length === 4);

  const keyTopics = Array.isArray(raw.keyTopics)
    ? raw.keyTopics.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return {
    title: String(raw.title || fallbackTitle || 'Medical Study Deck').trim(),
    subject: String(raw.subject || 'Medical Sciences').trim(),
    summary: String(raw.summary || '').trim(),
    keyTopics,
    flashcards,
    qaItems,
    mcqs,
  };
}

function parseGeminiJsonSafe(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function formatApiError(err: unknown): {
  status: number;
  message: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  quotaScope?: QuotaScope;
  splitRecommended?: boolean;
} {
  if (err instanceof AllModelsCoolingError) {
    return {
      status: 429,
      message: err.message,
      retryable: err.quotaScope !== 'daily',
      retryAfterSeconds: err.retryAfterSeconds,
      quotaScope: err.quotaScope,
    };
  }
  const msg = err instanceof Error ? err.message : 'Unexpected server error';
  if (err instanceof SyntaxError || msg.includes('JSON')) {
    return {
      status: 502,
      message: 'Page slice was too dense for one response — splitting into smaller pages.',
      retryable: true,
      splitRecommended: true,
    };
  }
  if (msg.includes('GEMINI_API_KEY')) {
    return { status: 500, message: msg, retryable: false };
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return {
      status: 403,
      message:
        'Gemini API key was rejected. Please verify your API key in Settings > Secrets and retry.',
      retryable: false,
    };
  }
  if (isRateLimitError(msg)) {
    const scope = detectQuotaScope(msg);
    const retrySec = parseRetryDelaySeconds(msg) ?? 35;
    return {
      status: 429,
      message:
        scope === 'daily'
          ? 'Daily Gemini API quota limit reached.'
          : `API rate limit reached — waiting ${retrySec}s for quota reset.`,
      retryable: scope !== 'daily',
      retryAfterSeconds: retrySec,
      quotaScope: scope,
    };
  }
  if (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('timeout')
  ) {
    return {
      status: 503,
      message: 'Temporary AI service slowdown — retrying automatically.',
      retryable: true,
      retryAfterSeconds: 12,
      splitRecommended: msg.includes('DEADLINE_EXCEEDED') || msg.includes('timeout'),
    };
  }
  if (msg.includes('INVALID_ARGUMENT') || msg.includes('too large') || msg.includes('413')) {
    return {
      status: 413,
      message: 'PDF page slice exceeded model payload size — splitting into fewer pages.',
      retryable: true,
      splitRecommended: true,
    };
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return {
      status: 502,
      message: 'The configured AI model was unavailable. Please retry shortly.',
      retryable: false,
    };
  }
  return {
    status: 500,
    message: `Could not process medical notes: ${msg.slice(0, 220)}`,
    retryable: true,
    retryAfterSeconds: 10,
  };
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

/**
 * Exhaustive page-batch extraction endpoint used by the client-side PDF slicer.
 * Handles micro-PDF slices (typically 1-8 pages, <= 25 MB) and returns dense
 * flashcards, Q&A items, and MCQs tagged with exact source file & page numbers.
 */
app.post(
  '/api/extract-batch',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Missing PDF batch payload.' });
        return;
      }

      const isPdfMime =
        file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf');
      if (!isPdfMime || !isPdfBuffer(file.buffer)) {
        res.status(400).json({
          error: 'Invalid PDF batch signature. Please upload a valid PDF file.',
        });
        return;
      }

      const focus = typeof req.body?.focus === 'string' ? req.body.focus : 'balanced';
      const density = typeof req.body?.density === 'string' ? req.body.density : 'exhaustive';
      const sourceFile =
        typeof req.body?.sourceFile === 'string' && req.body.sourceFile.trim()
          ? req.body.sourceFile.trim()
          : file.originalname;
      const customTitle =
        typeof req.body?.customTitle === 'string' ? req.body.customTitle.trim() : '';

      const pageListRaw = typeof req.body?.pageList === 'string' ? req.body.pageList : '';
      const parsedPages = pageListRaw
        .split(',')
        .map((s: string) => Number.parseInt(s.trim(), 10))
        .filter((n: number) => Number.isFinite(n) && n > 0);

      const pageCountInBatch = Math.max(1, parsedPages.length);
      const fallbackPageLabel =
        parsedPages.length === 1
          ? `p. ${parsedPages[0]}`
          : parsedPages.length > 1
            ? `pp. ${parsedPages[0]}-${parsedPages[parsedPages.length - 1]}`
            : 'p. 1';

      const pageMappingLine =
        parsedPages.length > 0
          ? `This uploaded micro-PDF contains ${parsedPages.length} page(s) from "${sourceFile}" corresponding strictly to original document page numbers: ${parsedPages.map((p: number, i: number) => `Slide/Page ${i + 1} = p. ${p}`).join(', ')}. Tag every flashcard, Q&A item, and MCQ with its exact original pageNumber (e.g., "p. ${parsedPages[0]}").`
          : `Source document: "${sourceFile}".`;

      const ai = getGeminiClient();
      const focusGuidance = buildFocusInstruction(focus);
      const densityGuidance = buildBatchDensityTargets(density, pageCountInBatch);

      const systemInstruction = [
        'You are an expert NEET PG, INI-CET, and USMLE medical educator performing exhaustive page-by-page extraction from medical notes.',
        'Never skip any page in the provided PDF slice. Cover every topic, heading, clinical table, drug of choice, mechanism, triad, diagnostic criterion, and numerical value appearing on these pages.',
        'Strictly stay faithful to the medical content in the attached PDF pages.',
        'Classify every flashcard, Q&A item, and MCQ accurately as either "clinical_vignette" or "exam_one_liner".',
        focusGuidance,
        'Use clean plain medical prose inside JSON strings with zero markdown syntax clutter.',
      ].join(' ');

      const userPrompt = [
        pageMappingLine,
        densityGuidance,
        'If a page is purely a cover page, blank divider, or table of contents with no clinical facts, you may skip that page, otherwise extract ALL medical concepts on every content page.',
        customTitle ? `Preferred overall deck title: "${customTitle}".` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const { response, modelUsed, modelLabel } = await generateStructuredWithPool(ai, {
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: file.buffer.toString('base64'),
              },
            },
            { text: userPrompt },
          ],
        },
        systemInstruction,
        responseSchema: batchResponseSchema,
      });

      res.setHeader('Cache-Control', 'no-store');
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.json({
          title: customTitle || sourceFile.replace(/\.pdf$/i, ''),
          subject: 'Medical Sciences',
          summary: '',
          keyTopics: [],
          flashcards: [],
          qaItems: [],
          mcqs: [],
          modelUsed,
          modelLabel,
        });
        return;
      }

      const parsed = parseGeminiJsonSafe(rawText);
      const fallbackTitle =
        customTitle || sourceFile.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
      const sanitized = sanitizeExtractedPayload(parsed, fallbackTitle, {
        sourceFile,
        fallbackPageLabel,
      });

      res.json({
        ...sanitized,
        modelUsed,
        modelLabel,
      });
    } catch (err: unknown) {
      console.error('[CliniDeck extract-batch error]:', err);
      const formatted = formatApiError(err);
      res.setHeader('Cache-Control', 'no-store');
      res.status(formatted.status).json({
        error: formatted.message,
        retryable: formatted.retryable ?? false,
        retryAfterSeconds: formatted.retryAfterSeconds,
        quotaScope: formatted.quotaScope,
        splitRecommended: formatted.splitRecommended ?? false,
      });
    }
  }
);

/**
 * Direct extraction endpoint for pasted plain-text medical notes (or legacy single PDF uploads).
 */
app.post(
  '/api/extract',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const focus = typeof req.body?.focus === 'string' ? req.body.focus : 'balanced';
      const density = typeof req.body?.density === 'string' ? req.body.density : 'exhaustive';
      const customTitle =
        typeof req.body?.customTitle === 'string' ? req.body.customTitle.trim() : '';
      const notesText =
        typeof req.body?.notesText === 'string' ? req.body.notesText.trim() : '';

      const file = req.file;
      if (!file && !notesText) {
        res.status(400).json({
          error: 'Please upload a PDF file or paste medical notes text to generate a study deck.',
        });
        return;
      }

      if (file) {
        const isPdfMime =
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf');
        if (!isPdfMime || !isPdfBuffer(file.buffer)) {
          res.status(400).json({
            error: 'Invalid file format. Please upload a valid PDF (.pdf) document.',
          });
          return;
        }
      }

      if (notesText && notesText.length > MAX_TEXT_CHARS) {
        res.status(400).json({
          error: `Pasted notes exceed the ${MAX_TEXT_CHARS.toLocaleString()} character limit. Please upload as a PDF or split into sections.`,
        });
        return;
      }

      const ai = getGeminiClient();
      const focusGuidance = buildFocusInstruction(focus);
      const countTarget =
        density === 'ultra_dense'
          ? 'Generate 24-35 flashcards, 18-26 structured Q&As, and 14-20 practice MCQs covering every fact thoroughly.'
          : density === 'standard'
            ? 'Generate 14-20 flashcards, 10-15 structured Q&As, and 8-12 practice MCQs.'
            : 'Generate 20-30 flashcards, 14-22 structured Q&As, and 12-16 practice MCQs covering all key concepts.';

      const systemInstruction = [
        'You are an expert NEET PG, INI-CET, and USMLE medical educator specializing in rapid-revision active recall.',
        'Thoroughly analyze the provided medical/NEET PG notes and extract EVERY important medical concept into structured flashcards, a comprehensive Q&A bank, and exam-pattern 4-option MCQs.',
        'Strictly stay faithful to the medical facts, values, classifications, drugs of choice, investigations of choice, and clinical presentations in the notes.',
        'Classify every flashcard, Q&A item, and MCQ accurately as either "clinical_vignette" or "exam_one_liner".',
        focusGuidance,
        'Ensure zero markdown clutter inside JSON fields—use clean plain medical prose.',
      ].join(' ');

      const userPrompt = [
        'Analyze these medical / NEET PG notes thoroughly and generate a complete study deck.',
        countTarget,
        customTitle ? `Use "${customTitle}" as the preferred deck title if appropriate.` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> =
        [];

      if (file) {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: file.buffer.toString('base64'),
          },
        });
        parts.push({ text: userPrompt });
      } else {
        parts.push({
          text: `${userPrompt}\n\n--- MEDICAL NOTES ---\n${notesText}`,
        });
      }

      const { response } = await generateStructuredWithPool(ai, {
        contents: { parts },
        systemInstruction,
        responseSchema: extractionResponseSchema,
      });

      res.setHeader('Cache-Control', 'no-store');
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'No structured study content could be extracted from these notes.',
        });
        return;
      }

      const parsed = parseGeminiJsonSafe(rawText);
      const sourceName = file ? file.originalname : 'Pasted Medical Notes';
      const fallbackTitle =
        customTitle ||
        (file ? file.originalname.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ') : 'Medical Notes');

      const sanitized = sanitizeExtractedPayload(parsed, fallbackTitle, {
        sourceFile: sourceName,
      });

      if (
        sanitized.flashcards.length === 0 &&
        sanitized.qaItems.length === 0 &&
        sanitized.mcqs.length === 0
      ) {
        res.status(422).json({
          error:
            'Could not find enough medical content to generate study cards. Please provide readable NEET PG or medical notes.',
        });
        return;
      }

      res.json({
        ...sanitized,
        fileName: sourceName,
      });
    } catch (err: unknown) {
      console.error('[CliniDeck extract error]:', err);
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  }
);

app.post('/api/generate-more', async (req: Request, res: Response) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const summary = typeof req.body?.summary === 'string' ? req.body.summary.trim() : '';
    const focusFormat =
      req.body?.focusFormat === 'clinical_vignette' || req.body?.focusFormat === 'exam_one_liner'
        ? req.body.focusFormat
        : 'balanced';
    const topics = Array.isArray(req.body?.topics)
      ? req.body.topics.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 16)
      : [];
    const existingPrompts = Array.isArray(req.body?.existingPrompts)
      ? req.body.existingPrompts.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 35)
      : [];

    if (!title || topics.length === 0) {
      res.status(400).json({ error: 'Deck title and topics are required to expand this deck.' });
      return;
    }

    const ai = getGeminiClient();

    const formatRule =
      focusFormat === 'clinical_vignette'
        ? 'Generate strictly "clinical_vignette" format items.'
        : focusFormat === 'exam_one_liner'
          ? 'Generate strictly "exam_one_liner" format items.'
          : 'Mix both "clinical_vignette" and "exam_one_liner" items evenly.';

    const prompt = [
      `Expand the NEET PG study deck "${title}" (${subject}).`,
      summary ? `Deck Context: ${summary}` : '',
      `Core Topics: ${topics.join(', ')}`,
      formatRule,
      'Create 8 brand-new high-yield Flashcards, 6 new Q&A Bank entries, and 6 new NEET PG-style 4-option MCQs that test distinct high-yield angles, differentials, or clinical traps NOT already duplicated below.',
      existingPrompts.length > 0
        ? `Avoid duplicating these existing concepts:\n- ${existingPrompts.join('\n- ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const { response } = await generateStructuredWithPool(ai, {
      contents: prompt,
      systemInstruction:
        'You are a senior NEET PG faculty educator. Return strictly valid JSON matching the schema with accurate, exam-tested clinical medicine and zero markdown formatting inside fields.',
      responseSchema: additionalItemsSchema,
    });

    res.setHeader('Cache-Control', 'no-store');
    const rawText = (response.text ?? '').trim();
    const parsed = rawText ? parseGeminiJsonSafe(rawText) : {};
    const sanitized = sanitizeExtractedPayload(parsed, title, {
      fallbackPageLabel: 'Supplemental',
    });

    res.json({
      flashcards: sanitized.flashcards,
      qaItems: sanitized.qaItems,
      mcqs: sanitized.mcqs,
    });
  } catch (err: unknown) {
    const { status, message } = formatApiError(err);
    res.status(status).json({ error: message });
  }
});

// Multer error handler
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: 'A single PDF page slice exceeded the 25 MB per-batch transfer cap.',
      });
      return;
    }
    res.status(400).json({ error: `File upload error: ${err.message}` });
    return;
  }
  next(err);
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // When HMR/WebSocket is disabled in dev middleware mode, Vite still injects
    // `/@vite/client` into index.html and imports style helpers from it in CSS modules.
    // Serving a WebSocket-free ES module shim preserves dev CSS injection while
    // eliminating browser WebSocket connection errors.
    const noWsViteClientShim = `
const sheetsMap = new Map();

export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  }
  style.textContent = content;
}

export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}

export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}

export function injectQuery(url, queryToInject) {
  if (!url || (!url.startsWith('.') && !url.startsWith('/'))) return url;
  const [pathname, search] = url.split('?');
  const [cleanSearch, hash] = (search || '').split('#');
  const nextSearch = cleanSearch ? queryToInject + '&' + cleanSearch : queryToInject;
  return pathname + '?' + nextSearch + (hash ? '#' + hash : '');
}

export class ErrorOverlay {}
`.trim();

    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(noWsViteClientShim);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CliniDeck server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
