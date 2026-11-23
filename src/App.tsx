import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocument } from 'pdf-lib';
import { Menu, CheckCircle2, AlertCircle, FilePlus2, Star } from 'lucide-react';
import type {
  ConfidenceLevel,
  ExtractionDensity,
  ExtractionFocus,
  ExtractionJobProgress,
  FailedBatchInfo,
  Flashcard,
  MCQItem,
  MultiPdfMode,
  QAItem,
  QueuedPdfInput,
  QuizAttempt,
  SourceFileCoverage,
  StudyDeck,
  StudyMode,
} from './types/study';
import {
  deleteDeckFromDb,
  loadDecksFromDb,
  loadThemePreference,
  parseImportedDeckJson,
  saveDeckToDb,
  saveThemePreference,
} from './utils/storage';
import {
  chunkPages,
  formatPageNumbersCompact,
  getPagesPerBatch,
  loadPdfDocument,
  slicePdfBatchAdaptive,
} from './utils/pdfSlicer';
import { createSampleNeetPgDeck } from './data/sampleDeck';
import { Sidebar } from './components/Sidebar';
import { UploadStage } from './components/UploadStage';
import { ExtractionBanner } from './components/ExtractionBanner';
import { FlashcardsView } from './components/FlashcardsView';
import { QABankView } from './components/QABankView';
import { MCQQuizView } from './components/MCQQuizView';
import { MarkedReviewView } from './components/MarkedReviewView';
import { ExportMenu } from './components/ExportMenu';
import { PrintSheet } from './components/PrintSheet';

interface ToastState {
  type: 'info' | 'error';
  message: string;
}

interface BatchTask {
  batchId: string;
  fileId: string;
  fileName: string;
  totalFilePages: number;
  pages: number[];
  targetDeckId: string;
  customTitle: string;
}

const MIN_PACING_MS = 4500; // Initial adaptive inter-batch breather (4.5s)
const MAX_PACING_MS = 28_000; // Ceiling adaptive inter-batch breather (28s)
const PACING_LADDER_MS = [4500, 9000, 14_000, 20_000, 28_000];
const CLEAN_STREAK_TO_SPEED_UP = 4;
const FETCH_TIMEOUT_MS = 120_000; // 2-minute timeout per micro-PDF slice
const MAX_TRANSIENT_RETRIES = 4; // Non-429 transient retries; per-minute 429s never skip pages

interface SliceExtractResult {
  flashcards: Flashcard[];
  qaItems: QAItem[];
  mcqs: MCQItem[];
  keyTopics: string[];
  title: string;
  subject: string;
  summary: string;
  modelLabel?: string;
}

class BatchFetchError extends Error {
  status: number;
  retryable: boolean;
  retryAfterSeconds?: number;
  quotaScope?: 'minute' | 'daily';
  splitRecommended: boolean;
  authRedirect: boolean;

  constructor(
    message: string,
    opts: {
      status: number;
      retryable?: boolean;
      retryAfterSeconds?: number;
      quotaScope?: 'minute' | 'daily';
      splitRecommended?: boolean;
      authRedirect?: boolean;
    }
  ) {
    super(message);
    this.status = opts.status;
    this.retryable = Boolean(opts.retryable);
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.quotaScope = opts.quotaScope;
    this.splitRecommended = Boolean(opts.splitRecommended);
    this.authRedirect = Boolean(opts.authRedirect);
  }
}

async function checkApiSessionHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`/api/health?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      redirect: 'manual',
    });
    if (res.type === 'opaqueredirect' || res.redirected || !res.ok) {
      return false;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return false;
    }
    const body = await res.json().catch(() => null);
    return Boolean(body && body.ok === true);
  } catch {
    return false;
  }
}

/**
 * Attempts to silently refresh the preview proxy auth cookie by loading a
 * hidden same-origin iframe (which can execute __cookie_check.html scripts
 * that fetch() cannot), then verifies /api/health returns JSON.
 */
async function trySilentSessionRefresh(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  await new Promise<void>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      iframe.remove();
      resolve();
    };
    const timer = window.setTimeout(finish, 3500);
    iframe.onload = () => {
      // Allow any inline cookie-check redirect script a short beat to run
      window.setTimeout(finish, 900);
    };
    iframe.onerror = finish;
    iframe.src = `/api/health?auth_refresh=${Date.now()}`;
    document.body.appendChild(iframe);
  });
  return checkApiSessionHealthy();
}

function mergeSourceCoverage(
  existing: SourceFileCoverage[] | undefined,
  fileName: string,
  totalPages: number,
  newlyCovered: number[]
): SourceFileCoverage[] {
  const list = existing ? [...existing] : [];
  const idx = list.findIndex((s) => s.name === fileName);
  if (idx === -1) {
    list.push({
      name: fileName,
      totalPages,
      coveredPages: Array.from(new Set(newlyCovered)).sort((a, b) => a - b),
    });
  } else {
    const merged = Array.from(
      new Set([...list[idx].coveredPages, ...newlyCovered])
    ).sort((a, b) => a - b);
    list[idx] = {
      ...list[idx],
      totalPages: Math.max(list[idx].totalPages, totalPages),
      coveredPages: merged,
    };
  }
  return list;
}

export default function App() {
  const [decks, setDecks] = useState<StudyDeck[]>([]);
  const [decksLoaded, setDecksLoaded] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [appendTargetDeckId, setAppendTargetDeckId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>('flashcards');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeJob, setActiveJob] = useState<ExtractionJobProgress | null>(null);

  // Refs for race-free background batch execution
  const decksRef = useRef<StudyDeck[]>([]);
  const jobControlRef = useRef<{
    paused: boolean;
    stopped: boolean;
    runId: number;
    abortController: AbortController | null;
  }>({
    paused: false,
    stopped: false,
    runId: 0,
    abortController: null,
  });
  const jobFilesRef = useRef<Map<string, { file: File; totalPages: number }>>(new Map());
  const jobMetaRef = useRef<{
    density: ExtractionDensity;
    focus: ExtractionFocus;
    customTitle: string;
  }>({ density: 'exhaustive', focus: 'balanced', customTitle: '' });
  const pacingStateRef = useRef<{
    delayMs: number;
    cleanStreak: number;
  }>({ delayMs: MIN_PACING_MS, cleanStreak: 0 });

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  // Initial load from IndexedDB (with automatic localStorage migration)
  useEffect(() => {
    let mounted = true;
    void loadDecksFromDb().then((loaded) => {
      if (!mounted) return;
      setDecks(loaded);
      decksRef.current = loaded;
      if (loaded.length > 0) {
        setActiveDeckId(loaded[0].id);
      }
      setDecksLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) ?? null,
    [decks, activeDeckId]
  );

  const appendTargetDeck = useMemo(
    () => decks.find((d) => d.id === appendTargetDeckId) ?? null,
    [decks, appendTargetDeckId]
  );

  useEffect(() => {
    saveThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const notify = (message: string, type: 'info' | 'error' = 'info') => {
    setToast({ message, type });
  };

  const upsertDeck = (updatedDeck: StudyDeck) => {
    setDecks((prev) => {
      const exists = prev.some((d) => d.id === updatedDeck.id);
      const next = exists
        ? prev.map((d) => (d.id === updatedDeck.id ? updatedDeck : d))
        : [updatedDeck, ...prev];
      decksRef.current = next;
      return next;
    });
    void saveDeckToDb(updatedDeck).then((res) => {
      if (!res.ok && res.error) notify(res.error, 'error');
    });
  };

  const updateDeckById = (deckId: string, updater: (deck: StudyDeck) => StudyDeck) => {
    setDecks((prev) => {
      let changedDeck: StudyDeck | null = null;
      const next = prev.map((d) => {
        if (d.id !== deckId) return d;
        changedDeck = updater(d);
        return changedDeck;
      });
      decksRef.current = next;
      if (changedDeck) {
        void saveDeckToDb(changedDeck);
      }
      return next;
    });
  };

  const waitWhilePaused = async (runId: number): Promise<boolean> => {
    while (jobControlRef.current.paused && !jobControlRef.current.stopped) {
      if (jobControlRef.current.runId !== runId) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return !jobControlRef.current.stopped && jobControlRef.current.runId === runId;
  };

  const sleepInterruptible = async (ms: number, runId: number): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (jobControlRef.current.stopped || jobControlRef.current.runId !== runId) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(250, end - Date.now())));
    }
    return !jobControlRef.current.stopped && jobControlRef.current.runId === runId;
  };

  const waitWithCountdown = async (
    seconds: number,
    reasonPrefix: string,
    runId: number
  ): Promise<boolean> => {
    for (let rem = seconds; rem > 0; rem--) {
      if (jobControlRef.current.stopped || jobControlRef.current.runId !== runId) {
        return false;
      }
      setActiveJob((prev) =>
        prev ? { ...prev, currentLabel: `${reasonPrefix} — retrying in ${rem}s...` } : prev
      );
      const ok = await sleepInterruptible(1000, runId);
      if (!ok) return false;
    }
    return true;
  };

  const getCurrentPacingSeconds = (): number =>
    Math.round((pacingStateRef.current.delayMs / 1000) * 10) / 10;

  const recordCleanBatchSuccess = (modelLabel?: string) => {
    pacingStateRef.current.cleanStreak += 1;
    if (
      pacingStateRef.current.cleanStreak >= CLEAN_STREAK_TO_SPEED_UP &&
      pacingStateRef.current.delayMs > MIN_PACING_MS
    ) {
      const reduced = Math.round((pacingStateRef.current.delayMs * 0.8) / 500) * 500;
      pacingStateRef.current.delayMs = Math.max(MIN_PACING_MS, reduced);
      pacingStateRef.current.cleanStreak = 0;
    }
    const nextSec = getCurrentPacingSeconds();
    setActiveJob((prev) =>
      prev
        ? {
            ...prev,
            currentPacingSeconds: nextSec,
            activeModelLabel: modelLabel || prev.activeModelLabel,
          }
        : prev
    );
  };

  const recordRateLimitBackoff = () => {
    pacingStateRef.current.cleanStreak = 0;
    const current = pacingStateRef.current.delayMs;
    const nextRung = PACING_LADDER_MS.find((ms) => ms > current) ?? MAX_PACING_MS;
    pacingStateRef.current.delayMs = Math.min(MAX_PACING_MS, nextRung);
    const nextSec = getCurrentPacingSeconds();
    setActiveJob((prev) => (prev ? { ...prev, currentPacingSeconds: nextSec } : prev));
  };

  const waitAdaptivePacingGap = async (runId: number): Promise<boolean> => {
    const ms = pacingStateRef.current.delayMs;
    if (ms >= 7000) {
      const totalSec = Math.ceil(ms / 1000);
      for (let rem = totalSec; rem > 0; rem--) {
        if (jobControlRef.current.stopped || jobControlRef.current.runId !== runId) {
          return false;
        }
        const canContinue = await waitWhilePaused(runId);
        if (!canContinue) return false;
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                currentLabel: `Adaptive pacing breather (${rem}s) to stay under API rate limits...`,
              }
            : prev
        );
        const ok = await sleepInterruptible(1000, runId);
        if (!ok) return false;
      }
      return true;
    }
    return sleepInterruptible(ms, runId);
  };

  const uploadSingleSliceOnce = async (
    bytes: Uint8Array,
    pages: number[],
    task: BatchTask,
    density: ExtractionDensity,
    focus: ExtractionFocus
  ): Promise<SliceExtractResult> => {
    const controller = new AbortController();
    jobControlRef.current.abortController = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const sliceBlob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', sliceBlob, task.fileName);
      formData.append('sourceFile', task.fileName);
      formData.append('density', density);
      formData.append('focus', focus);
      formData.append('pageList', pages.join(','));
      if (task.customTitle) {
        formData.append('customTitle', task.customTitle);
      }

      const response = await fetch('/api/extract-batch', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        redirect: 'manual',
        signal: controller.signal,
      });

      // Detect proxy 302 auth redirects (e.g. __cookie_check.html / applet-auth-bridge)
      // BEFORE attempting to parse HTML as JSON so pages are NEVER silently skipped!
      const contentType = response.headers.get('content-type') || '';
      if (
        response.type === 'opaqueredirect' ||
        response.redirected ||
        (response.status >= 300 && response.status < 400) ||
        (response.ok && !contentType.includes('application/json'))
      ) {
        throw new BatchFetchError(
          'Preview proxy redirected this upload for session verification (302).',
          {
            status: 302,
            retryable: false,
            authRedirect: true,
          }
        );
      }

      if (!response.ok) {
        const errData = contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : {};
        if (response.status === 401 || response.status === 403) {
          // Distinguish Gemini API key error JSON vs proxy HTML 403
          if (!contentType.includes('application/json')) {
            throw new BatchFetchError(
              'Preview session authorization expired (403).',
              {
                status: response.status,
                retryable: false,
                authRedirect: true,
              }
            );
          }
        }
        throw new BatchFetchError(
          typeof errData?.error === 'string'
            ? errData.error
            : `Server error (${response.status})`,
          {
            status: response.status,
            retryable:
              Boolean(errData?.retryable) ||
              response.status === 429 ||
              response.status === 502 ||
              response.status === 503 ||
              response.status === 504,
            retryAfterSeconds:
              typeof errData?.retryAfterSeconds === 'number'
                ? errData.retryAfterSeconds
                : response.status === 429
                  ? 35
                  : undefined,
            quotaScope:
              errData?.quotaScope === 'daily' || errData?.quotaScope === 'minute'
                ? errData.quotaScope
                : response.status === 429
                  ? 'minute'
                  : undefined,
            splitRecommended:
              Boolean(errData?.splitRecommended) ||
              response.status === 413 ||
              response.status === 504,
          }
        );
      }

      const data = await response.json();
      return {
        flashcards: Array.isArray(data.flashcards) ? data.flashcards : [],
        qaItems: Array.isArray(data.qaItems) ? data.qaItems : [],
        mcqs: Array.isArray(data.mcqs) ? data.mcqs : [],
        keyTopics: Array.isArray(data.keyTopics) ? data.keyTopics : [],
        title: typeof data.title === 'string' ? data.title : '',
        subject: typeof data.subject === 'string' ? data.subject : '',
        summary: typeof data.summary === 'string' ? data.summary : '',
        modelLabel: typeof data.modelLabel === 'string' ? data.modelLabel : undefined,
      };
    } catch (err: unknown) {
      if (err instanceof BatchFetchError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (jobControlRef.current.stopped) {
          throw new BatchFetchError('Extraction stopped by user.', {
            status: 499,
            retryable: false,
          });
        }
        throw new BatchFetchError(
          'Page slice took too long — splitting into smaller pages.',
          {
            status: 504,
            retryable: true,
            splitRecommended: true,
          }
        );
      }
      throw new BatchFetchError(
        err instanceof Error ? err.message : 'Network error during batch upload.',
        {
          status: 0,
          retryable: true,
          retryAfterSeconds: 8,
        }
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (jobControlRef.current.abortController === controller) {
        jobControlRef.current.abortController = null;
      }
    }
  };

  /**
   * Uploads a page slice with automatic rate-limit cooldown retries AND automatic
   * halving if a slice is too dense (JSON truncation / timeout / payload cap).
   */
  const extractSliceResilient = async (
    srcDoc: PDFDocument,
    pages: number[],
    task: BatchTask,
    density: ExtractionDensity,
    focus: ExtractionFocus,
    runId: number
  ): Promise<SliceExtractResult> => {
    const rangeText = formatPageNumbersCompact(pages);
    const adaptiveSlices = await slicePdfBatchAdaptive(srcDoc, pages);

    // If adaptive byte sizing split this batch into smaller sub-slices, process each cleanly
    if (adaptiveSlices.length > 1) {
      const combined: SliceExtractResult = {
        flashcards: [],
        qaItems: [],
        mcqs: [],
        keyTopics: [],
        title: '',
        subject: '',
        summary: '',
      };
      for (let sIdx = 0; sIdx < adaptiveSlices.length; sIdx++) {
        const sub = adaptiveSlices[sIdx];
        const canContinue = await waitWhilePaused(runId);
        if (!canContinue) throw new BatchFetchError('Stopped', { status: 499, retryable: false });
        const part = await extractSliceResilient(
          srcDoc,
          sub.pages,
          task,
          density,
          focus,
          runId
        );
        combined.flashcards.push(...part.flashcards);
        combined.qaItems.push(...part.qaItems);
        combined.mcqs.push(...part.mcqs);
        combined.keyTopics.push(...part.keyTopics);
        if (!combined.title && part.title) combined.title = part.title;
        if (!combined.subject && part.subject) combined.subject = part.subject;
        if (!combined.summary && part.summary) combined.summary = part.summary;
        if (part.modelLabel) combined.modelLabel = part.modelLabel;
        if (sIdx + 1 < adaptiveSlices.length) {
          const ok = await waitAdaptivePacingGap(runId);
          if (!ok) throw new BatchFetchError('Stopped', { status: 499, retryable: false });
        }
      }
      return combined;
    }

    const { bytes } = adaptiveSlices[0];
    let authRecoveryAttempts = 0;
    let transientAttempts = 0;
    let rateLimitWaits = 0;

    while (true) {
      const canContinue = await waitWhilePaused(runId);
      if (!canContinue) throw new BatchFetchError('Stopped', { status: 499, retryable: false });

      const retrySuffix =
        rateLimitWaits > 0
          ? ` · Resuming after cooldown #${rateLimitWaits}`
          : transientAttempts > 0
            ? ` · Retry ${transientAttempts}`
            : '';

      setActiveJob((prev) =>
        prev
          ? {
              ...prev,
              sessionAlert: undefined,
              currentLabel: `Extracting ${task.fileName} (pp. ${rangeText})${retrySuffix}`,
            }
          : prev
      );

      try {
        const result = await uploadSingleSliceOnce(bytes, pages, task, density, focus);
        recordCleanBatchSuccess(result.modelLabel);
        return result;
      } catch (err: unknown) {
        const batchErr =
          err instanceof BatchFetchError
            ? err
            : new BatchFetchError(
                err instanceof Error ? err.message : 'Batch extraction failed',
                { status: 500, retryable: true, retryAfterSeconds: 10 }
              );

        if (jobControlRef.current.stopped || batchErr.status === 499) {
          throw batchErr;
        }

        // Handle AI Studio preview proxy 302 auth redirects cleanly without looping or skipping pages
        if (batchErr.authRedirect) {
          setActiveJob((prev) =>
            prev
              ? {
                  ...prev,
                  currentLabel: `Verifying preview session before retrying pp. ${rangeText}...`,
                }
              : prev
          );

          const sessionAlive = await checkApiSessionHealthy();
          if (sessionAlive && pages.length > 1) {
            const mid = Math.ceil(pages.length / 2);
            const leftRes = await extractSliceResilient(
              srcDoc,
              pages.slice(0, mid),
              task,
              density,
              focus,
              runId
            );
            const ok = await waitAdaptivePacingGap(runId);
            if (!ok) throw new BatchFetchError('Stopped', { status: 499, retryable: false });
            const rightRes = await extractSliceResilient(
              srcDoc,
              pages.slice(mid),
              task,
              density,
              focus,
              runId
            );
            return {
              flashcards: [...leftRes.flashcards, ...rightRes.flashcards],
              qaItems: [...leftRes.qaItems, ...rightRes.qaItems],
              mcqs: [...leftRes.mcqs, ...rightRes.mcqs],
              keyTopics: [...leftRes.keyTopics, ...rightRes.keyTopics],
              title: leftRes.title || rightRes.title,
              subject: leftRes.subject || rightRes.subject,
              summary: leftRes.summary || rightRes.summary,
              modelLabel: rightRes.modelLabel || leftRes.modelLabel,
            };
          }

          if (!sessionAlive && authRecoveryAttempts < 1) {
            authRecoveryAttempts++;
            const refreshed = await trySilentSessionRefresh();
            if (refreshed) {
              continue;
            }
          }

          // Pause cleanly so the user can refresh preview / open in a full tab without losing any cards
          jobControlRef.current.paused = true;
          setActiveJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'paused',
                  currentLabel: `Paused safely at pp. ${rangeText} — preview session requires refresh.`,
                  sessionAlert:
                    'Your browser blocked or expired the preview iframe auth cookie (302 redirect). All cards extracted so far are safely saved. Open the app in a new tab (top-right icon) or click Refresh Preview (↻), then click "Add PDF / Pages" on your deck — CliniDeck will automatically pick up from the remaining uncovered pages.',
                }
              : prev
          );
          const resumedAfterPause = await waitWhilePaused(runId);
          if (!resumedAfterPause) {
            throw new BatchFetchError('Stopped', { status: 499, retryable: false });
          }
          authRecoveryAttempts = 0;
          continue;
        }

        // Handle 429 API rate limits:
        // - Daily quota exhausted across all models -> pause safely with clear guidance.
        // - Per-minute quota (RPM/TPM) -> adapt pacing slower, wait out full cooldown, NEVER skip pages!
        if (batchErr.status === 429) {
          recordRateLimitBackoff();

          if (batchErr.quotaScope === 'daily') {
            jobControlRef.current.paused = true;
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'paused',
                    currentLabel: `Paused safely at pp. ${rangeText} — daily API quota reached.`,
                    sessionAlert:
                      'Your Gemini API key reached its daily request limit across both primary and fast-lite models. All cards extracted so far are safely saved in your browser. Click Resume once your daily quota resets, or return later and click "Add PDF / Pages" to continue automatically from the remaining uncovered pages.',
                  }
                : prev
            );
            const resumedAfterDaily = await waitWhilePaused(runId);
            if (!resumedAfterDaily) {
              throw new BatchFetchError('Stopped', { status: 499, retryable: false });
            }
            rateLimitWaits = 0;
            continue;
          }

          rateLimitWaits += 1;
          const serverWait = batchErr.retryAfterSeconds ?? 35;
          // On a second consecutive 429 on the same slice, wait a full 64s rolling minute window
          const waitSec =
            rateLimitWaits >= 2 ? Math.max(64, serverWait) : Math.max(25, serverWait);
          const resumed = await waitWithCountdown(
            waitSec,
            `Quota window cooling down on pp. ${rangeText}`,
            runId
          );
          if (!resumed) {
            throw new BatchFetchError('Stopped', { status: 499, retryable: false });
          }
          continue;
        }

        // If the slice was too dense/large and contains >1 page, split it in half immediately!
        if (batchErr.splitRecommended && pages.length > 1) {
          const mid = Math.ceil(pages.length / 2);
          const leftPages = pages.slice(0, mid);
          const rightPages = pages.slice(mid);
          setActiveJob((prev) =>
            prev
              ? {
                  ...prev,
                  currentLabel: `Dense pages (${rangeText}) — splitting into smaller slices...`,
                }
              : prev
          );
          const leftRes = await extractSliceResilient(
            srcDoc,
            leftPages,
            task,
            density,
            focus,
            runId
          );
          const ok = await waitAdaptivePacingGap(runId);
          if (!ok) throw new BatchFetchError('Stopped', { status: 499, retryable: false });
          const rightRes = await extractSliceResilient(
            srcDoc,
            rightPages,
            task,
            density,
            focus,
            runId
          );
          return {
            flashcards: [...leftRes.flashcards, ...rightRes.flashcards],
            qaItems: [...leftRes.qaItems, ...rightRes.qaItems],
            mcqs: [...leftRes.mcqs, ...rightRes.mcqs],
            keyTopics: [...leftRes.keyTopics, ...rightRes.keyTopics],
            title: leftRes.title || rightRes.title,
            subject: leftRes.subject || rightRes.subject,
            summary: leftRes.summary || rightRes.summary,
            modelLabel: rightRes.modelLabel || leftRes.modelLabel,
          };
        }

        // Non-429 transient errors (503 / 500 / network blip)
        if (batchErr.retryable && transientAttempts < MAX_TRANSIENT_RETRIES) {
          transientAttempts += 1;
          const baseWait = batchErr.retryAfterSeconds ?? 12;
          const waitSec = Math.min(60, baseWait + (transientAttempts - 1) * 10);
          const resumed = await waitWithCountdown(
            waitSec,
            `Temporary delay on pp. ${rangeText}`,
            runId
          );
          if (!resumed) {
            throw new BatchFetchError('Stopped', { status: 499, retryable: false });
          }
          continue;
        }

        throw batchErr;
      }
    }
  };

  const executeBatchTasks = async (
    tasks: BatchTask[],
    runId: number,
    density: ExtractionDensity,
    focus: ExtractionFocus
  ) => {
    // Cache parsed PDFDocument per fileId for this run so a 120 MB PDF is parsed only once
    const loadedPdfDocs = new Map<string, Promise<PDFDocument>>();

    const getPdfDoc = (fileId: string): Promise<PDFDocument> => {
      let existing = loadedPdfDocs.get(fileId);
      if (!existing) {
        const entry = jobFilesRef.current.get(fileId);
        if (!entry) {
          return Promise.reject(new Error('Original PDF handle is no longer in memory.'));
        }
        existing = loadPdfDocument(entry.file);
        loadedPdfDocs.set(fileId, existing);
      }
      return existing;
    };

    // Paced sequential processing prevents 429 rate-limit cascades on 100-200+ page books
    for (let idx = 0; idx < tasks.length; idx++) {
      const canContinue = await waitWhilePaused(runId);
      if (!canContinue) break;

      const task = tasks[idx];

      try {
        const srcDoc = await getPdfDoc(task.fileId);
        const result = await extractSliceResilient(
          srcDoc,
          task.pages,
          task,
          density,
          focus,
          runId
        );

        // Stream extracted items directly into the target deck & persist atomically to IndexedDB
        updateDeckById(task.targetDeckId, (deck) => {
          const mergedTopics = Array.from(
            new Set([...deck.keyTopics, ...result.keyTopics])
          ).filter(Boolean);

          const shouldUpdateTitle =
            !task.customTitle &&
            deck.flashcards.length === 0 &&
            Boolean(result.title) &&
            !deck.isSample;

          const shouldUpdateSubject =
            (deck.subject === 'Extracting...' || deck.subject === 'Medical Sciences') &&
            Boolean(result.subject);

          const shouldUpdateSummary = !deck.summary && Boolean(result.summary);

          return {
            ...deck,
            title: shouldUpdateTitle ? result.title : deck.title,
            subject: shouldUpdateSubject ? result.subject : deck.subject,
            summary: shouldUpdateSummary ? result.summary : deck.summary,
            keyTopics: mergedTopics,
            flashcards: [...deck.flashcards, ...result.flashcards],
            qaItems: [...deck.qaItems, ...result.qaItems],
            mcqs: [...deck.mcqs, ...result.mcqs],
            sourceFiles: mergeSourceCoverage(
              deck.sourceFiles,
              task.fileName,
              task.totalFilePages,
              task.pages
            ),
          };
        });

        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                completedBatches: prev.completedBatches + 1,
                completedPages: prev.completedPages + task.pages.length,
                cardsAdded: prev.cardsAdded + result.flashcards.length,
                qaAdded: prev.qaAdded + result.qaItems.length,
                mcqsAdded: prev.mcqsAdded + result.mcqs.length,
              }
            : prev
        );

        // Adaptive breather between batches so multi-hundred-page books stay under RPM/TPM limits
        if (idx + 1 < tasks.length) {
          const ok = await waitAdaptivePacingGap(runId);
          if (!ok) break;
        }
      } catch (err: unknown) {
        if (jobControlRef.current.stopped || jobControlRef.current.runId !== runId) {
          break;
        }
        const message = err instanceof Error ? err.message : 'Batch extraction failed.';
        const failure: FailedBatchInfo = {
          batchId: task.batchId,
          fileId: task.fileId,
          fileName: task.fileName,
          pages: task.pages,
          targetDeckId: task.targetDeckId,
          error: message,
        };
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                failedBatches: [...prev.failedBatches, failure],
              }
            : prev
        );
      }
    }

    if (jobControlRef.current.runId !== runId) return;

    const wasStopped = jobControlRef.current.stopped;
    setActiveJob((prev) => {
      if (!prev) return prev;
      const finalStatus = wasStopped ? 'stopped' : 'completed';
      return {
        ...prev,
        status: finalStatus,
        currentLabel: wasStopped
          ? `Stopped at ${prev.completedPages}/${prev.totalPages} pages. All extracted content has been saved.`
          : prev.failedBatches.length > 0
            ? `Finished with ${prev.failedBatches.length} failed batch(es) available to retry.`
            : `All ${prev.completedPages} pages covered — ${prev.cardsAdded} flashcards, ${prev.qaAdded} Q&As, ${prev.mcqsAdded} MCQs.`,
      };
    });

    if (!wasStopped) {
      notify('Page-by-page extraction complete! Your study deck is saved locally.');
    } else {
      notify('Extraction stopped. All completed pages were saved to your deck.');
    }
  };

  const handleStartPdfBatchJob = ({
    files,
    density,
    focus,
    multiPdfMode,
    customTitle,
    appendDeckId,
  }: {
    files: QueuedPdfInput[];
    density: ExtractionDensity;
    focus: ExtractionFocus;
    multiPdfMode: MultiPdfMode;
    customTitle: string;
    appendDeckId: string | null;
  }) => {
    const runId = Date.now();
    jobControlRef.current.abortController?.abort();
    jobControlRef.current = {
      paused: false,
      stopped: false,
      runId,
      abortController: null,
    };
    jobMetaRef.current = { density, focus, customTitle };
    pacingStateRef.current = { delayMs: MIN_PACING_MS, cleanStreak: 0 };

    const nextFileMap = new Map<string, { file: File; totalPages: number }>();
    files.forEach((f) => nextFileMap.set(f.id, { file: f.file, totalPages: f.totalPages }));
    jobFilesRef.current = nextFileMap;

    const pagesPerBatch = getPagesPerBatch(density);
    const createdDeckIds: string[] = [];
    const tasks: BatchTask[] = [];
    let primaryDeckId: string | null = appendDeckId;

    if (appendDeckId) {
      for (const f of files) {
        const chunks = chunkPages(f.selectedPages, pagesPerBatch);
        chunks.forEach((pages, cIdx) => {
          tasks.push({
            batchId: `b_${runId}_${f.id}_${cIdx}`,
            fileId: f.id,
            fileName: f.file.name,
            totalFilePages: f.totalPages,
            pages,
            targetDeckId: appendDeckId,
            customTitle: '',
          });
        });
      }
      setAppendTargetDeckId(null);
    } else if (multiPdfMode === 'separate' && files.length >= 2) {
      for (const f of files) {
        const deckId = `deck_${runId}_${Math.random().toString(36).slice(2, 7)}`;
        const cleanName = f.file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
        const title = customTitle ? `${customTitle} — ${cleanName}` : cleanName;
        const shellDeck: StudyDeck = {
          id: deckId,
          title,
          fileName: f.file.name,
          subject: 'Extracting...',
          createdAt: new Date().toISOString(),
          summary: '',
          keyTopics: [],
          flashcards: [],
          qaItems: [],
          mcqs: [],
          quizHistory: [],
          sourceFiles: [{ name: f.file.name, totalPages: f.totalPages, coveredPages: [] }],
          extractionDensity: density,
        };
        upsertDeck(shellDeck);
        createdDeckIds.push(deckId);
        if (!primaryDeckId) primaryDeckId = deckId;

        const chunks = chunkPages(f.selectedPages, pagesPerBatch);
        chunks.forEach((pages, cIdx) => {
          tasks.push({
            batchId: `b_${runId}_${f.id}_${cIdx}`,
            fileId: f.id,
            fileName: f.file.name,
            totalFilePages: f.totalPages,
            pages,
            targetDeckId: deckId,
            customTitle: title,
          });
        });
      }
    } else {
      const deckId = `deck_${runId}_${Math.random().toString(36).slice(2, 7)}`;
      const fallbackTitle =
        customTitle ||
        (files.length === 1
          ? files[0].file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
          : `${files[0].file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()} (+${files.length - 1} PDFs)`);

      const shellDeck: StudyDeck = {
        id: deckId,
        title: fallbackTitle,
        fileName: files.length === 1 ? files[0].file.name : `${files.length} merged PDFs`,
        subject: 'Extracting...',
        createdAt: new Date().toISOString(),
        summary: '',
        keyTopics: [],
        flashcards: [],
        qaItems: [],
        mcqs: [],
        quizHistory: [],
        sourceFiles: files.map((f) => ({
          name: f.file.name,
          totalPages: f.totalPages,
          coveredPages: [],
        })),
        extractionDensity: density,
      };
      upsertDeck(shellDeck);
      createdDeckIds.push(deckId);
      primaryDeckId = deckId;

      for (const f of files) {
        const chunks = chunkPages(f.selectedPages, pagesPerBatch);
        chunks.forEach((pages, cIdx) => {
          tasks.push({
            batchId: `b_${runId}_${f.id}_${cIdx}`,
            fileId: f.id,
            fileName: f.file.name,
            totalFilePages: f.totalPages,
            pages,
            targetDeckId: deckId,
            customTitle,
          });
        });
      }
    }

    const totalPages = files.reduce((sum, f) => sum + f.selectedPages.length, 0);

    setActiveJob({
      status: 'running',
      density,
      focus,
      multiPdfMode,
      totalBatches: tasks.length,
      completedBatches: 0,
      failedBatches: [],
      totalPages,
      completedPages: 0,
      cardsAdded: 0,
      qaAdded: 0,
      mcqsAdded: 0,
      currentLabel: `Starting ${tasks.length} page batch${tasks.length > 1 ? 'es' : ''} across ${totalPages} pages...`,
      currentPacingSeconds: MIN_PACING_MS / 1000,
      primaryDeckId,
      createdDeckIds,
    });

    void executeBatchTasks(tasks, runId, density, focus);
  };

  const handleRetryFailedBatches = () => {
    if (!activeJob || activeJob.failedBatches.length === 0) return;
    const runId = Date.now();
    jobControlRef.current.abortController?.abort();
    jobControlRef.current = {
      paused: false,
      stopped: false,
      runId,
      abortController: null,
    };

    const retryTasks: BatchTask[] = activeJob.failedBatches
      .filter((fb) => jobFilesRef.current.has(fb.fileId))
      .map((fb, idx) => ({
        batchId: `retry_${runId}_${idx}`,
        fileId: fb.fileId,
        fileName: fb.fileName,
        totalFilePages: jobFilesRef.current.get(fb.fileId)?.totalPages ?? fb.pages.length,
        pages: fb.pages,
        targetDeckId: fb.targetDeckId,
        customTitle: jobMetaRef.current.customTitle,
      }));

    if (retryTasks.length === 0) {
      notify(
        'Original PDF files are no longer in browser memory — use "Add PDF / Pages" to re-select skipped pages.',
        'error'
      );
      return;
    }

    const failedPageCount = retryTasks.reduce((sum, t) => sum + t.pages.length, 0);
    setActiveJob((prev) =>
      prev
        ? {
            ...prev,
            status: 'running',
            totalBatches: prev.completedBatches + retryTasks.length,
            failedBatches: [],
            currentLabel: `Retrying ${retryTasks.length} batch(es) (${failedPageCount} pages)...`,
          }
        : prev
    );

    void executeBatchTasks(
      retryTasks,
      runId,
      jobMetaRef.current.density,
      jobMetaRef.current.focus
    );
  };

  const handlePauseJob = () => {
    jobControlRef.current.paused = true;
    setActiveJob((prev) => (prev ? { ...prev, status: 'paused' } : prev));
  };

  const handleResumeJob = () => {
    jobControlRef.current.paused = false;
    setActiveJob((prev) =>
      prev ? { ...prev, status: 'running', sessionAlert: undefined } : prev
    );
  };

  const handleStopJob = () => {
    jobControlRef.current.stopped = true;
    jobControlRef.current.paused = false;
    jobControlRef.current.abortController?.abort();
  };

  const handleDeckCreatedFromText = (newDeck: StudyDeck, appendDeckId: string | null) => {
    if (appendDeckId) {
      updateDeckById(appendDeckId, (deck) => ({
        ...deck,
        keyTopics: Array.from(new Set([...deck.keyTopics, ...newDeck.keyTopics])),
        flashcards: [...deck.flashcards, ...newDeck.flashcards],
        qaItems: [...deck.qaItems, ...newDeck.qaItems],
        mcqs: [...deck.mcqs, ...newDeck.mcqs],
      }));
      setAppendTargetDeckId(null);
      setActiveDeckId(appendDeckId);
      setStudyMode('flashcards');
      notify(
        `Appended ${newDeck.flashcards.length} flashcards, ${newDeck.qaItems.length} Q&As, and ${newDeck.mcqs.length} MCQs.`
      );
      return;
    }

    upsertDeck(newDeck);
    setActiveDeckId(newDeck.id);
    setStudyMode('flashcards');
    notify(
      `Generated ${newDeck.flashcards.length} flashcards, ${newDeck.qaItems.length} Q&As, and ${newDeck.mcqs.length} MCQs.`
    );
  };

  const handleLoadSampleDeck = () => {
    const existingSample = decks.find((d) => d.isSample);
    if (existingSample) {
      setActiveDeckId(existingSample.id);
      setAppendTargetDeckId(null);
      setStudyMode('flashcards');
      notify('Opened the sample Cardiology & ECG Rapid Revision deck.');
      return;
    }
    const sample = createSampleNeetPgDeck();
    upsertDeck(sample);
    setActiveDeckId(sample.id);
    setAppendTargetDeckId(null);
    setStudyMode('flashcards');
    notify('Loaded sample NEET PG Cardiology & ECG deck.');
  };

  const handleDeleteDeck = (id: string) => {
    setDecks((prev) => {
      const next = prev.filter((d) => d.id !== id);
      decksRef.current = next;
      return next;
    });
    void deleteDeckFromDb(id);
    if (activeDeckId === id) {
      const remaining = decks.filter((d) => d.id !== id);
      setActiveDeckId(remaining.length > 0 ? remaining[0].id : null);
    }
    if (appendTargetDeckId === id) {
      setAppendTargetDeckId(null);
    }
    notify('Deck deleted from local storage.');
  };

  const handleRenameDeck = (id: string, newTitle: string) => {
    updateDeckById(id, (d) => ({ ...d, title: newTitle }));
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImportedDeckJson(text);
      upsertDeck(imported);
      setActiveDeckId(imported.id);
      setAppendTargetDeckId(null);
      setStudyMode('flashcards');
      notify(`Imported "${imported.title}" (${imported.flashcards.length} flashcards).`);
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : 'Could not import JSON deck file.',
        'error'
      );
    }
  };

  const handleRateCard = (cardId: string, confidence: ConfidenceLevel) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      flashcards: deck.flashcards.map((c) => (c.id === cardId ? { ...c, confidence } : c)),
    }));
  };

  const handleToggleStar = (cardId: string) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      flashcards: deck.flashcards.map((c) =>
        c.id === cardId ? { ...c, starred: !c.starred } : c
      ),
    }));
  };

  const handleUpdateCard = (updated: Flashcard) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      flashcards: deck.flashcards.map((c) => (c.id === updated.id ? updated : c)),
    }));
    notify('Flashcard updated.');
  };

  const handleAddCard = (cardData: Omit<Flashcard, 'id' | 'confidence' | 'starred'>) => {
    if (!activeDeck) return;
    const newCard: Flashcard = {
      ...cardData,
      id: `fc_custom_${Date.now()}`,
      confidence: 'unseen',
      starred: false,
    };
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      flashcards: [newCard, ...deck.flashcards],
    }));
    notify('Added custom flashcard to deck.');
  };

  const handleToggleRevised = (qaId: string) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      qaItems: deck.qaItems.map((q) => (q.id === qaId ? { ...q, revised: !q.revised } : q)),
    }));
  };

  const handleToggleStarQA = (qaId: string) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      qaItems: deck.qaItems.map((q) => (q.id === qaId ? { ...q, starred: !q.starred } : q)),
    }));
  };

  const handleToggleStarMCQ = (mcqId: string) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      mcqs: deck.mcqs.map((m) => (m.id === mcqId ? { ...m, starred: !m.starred } : m)),
    }));
  };

  const handleRecordQuizAttempt = (attempt: QuizAttempt) => {
    if (!activeDeck) return;
    updateDeckById(activeDeck.id, (deck) => ({
      ...deck,
      quizHistory: [attempt, ...deck.quizHistory].slice(0, 20),
    }));
  };

  const handleExpandDeck = async () => {
    if (!activeDeck || isExpanding) return;
    setIsExpanding(true);
    try {
      const response = await fetch('/api/generate-more', {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeDeck.title,
          subject: activeDeck.subject,
          summary: activeDeck.summary,
          topics:
            activeDeck.keyTopics.length > 0
              ? activeDeck.keyTopics
              : [activeDeck.subject, activeDeck.title],
          existingPrompts: activeDeck.flashcards.slice(0, 30).map((c) => c.front),
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.type === 'opaqueredirect' || response.redirected || !contentType.includes('application/json')) {
        throw new Error(
          'Preview session expired. Please refresh the preview or open in a new tab and try again.'
        );
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Could not generate additional concepts.');
      }

      const addedFc = Array.isArray(data.flashcards) ? data.flashcards : [];
      const addedQa = Array.isArray(data.qaItems) ? data.qaItems : [];
      const addedMcq = Array.isArray(data.mcqs) ? data.mcqs : [];

      updateDeckById(activeDeck.id, (deck) => ({
        ...deck,
        flashcards: [...deck.flashcards, ...addedFc],
        qaItems: [...deck.qaItems, ...addedQa],
        mcqs: [...deck.mcqs, ...addedMcq],
      }));
      notify(
        `Added ${addedFc.length} flashcards, ${addedQa.length} Q&As, and ${addedMcq.length} MCQs.`
      );
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to expand study deck.', 'error');
    } finally {
      setIsExpanding(false);
    }
  };

  const showingUploadScreen = !activeDeck || appendTargetDeckId !== null;

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A] dark:bg-[#0B1120] dark:text-[#F1F5F9]">
      {/* Left Deck Library Sidebar */}
      <Sidebar
        decks={decks}
        activeDeckId={showingUploadScreen ? null : activeDeckId}
        theme={theme}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectDeck={(id) => {
          setAppendTargetDeckId(null);
          setActiveDeckId(id);
        }}
        onNewUpload={() => {
          setAppendTargetDeckId(null);
          setActiveDeckId(null);
        }}
        onDeleteDeck={handleDeleteDeck}
        onRenameDeck={handleRenameDeck}
        onImportJson={handleImportJson}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />

      {/* Main Workspace Column */}
      <div className="flex min-w-0 flex-1 flex-col no-print">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-6 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs dark:border-slate-800 dark:bg-[#111827]/95 lg:px-8">
          {/* Zone 1: Menu toggle (mobile) + Active Deck Title or Workspace Heading */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open saved decks sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">
              {!showingUploadScreen && activeDeck
                ? activeDeck.title
                : appendTargetDeck
                  ? `Add Pages to ${appendTargetDeck.title}`
                  : 'Upload Medical PDFs'}
            </span>
          </div>

          {/* Zone 2: Study Mode Navigation (when viewing a deck) */}
          {!showingUploadScreen && activeDeck && (() => {
            const markedCount =
              activeDeck.flashcards.filter((c) => c.starred).length +
              activeDeck.qaItems.filter((q) => q.starred).length +
              activeDeck.mcqs.filter((m) => m.starred).length;

            return (
              <nav aria-label="Study modes" className="hidden md:flex items-center gap-6">
                {(
                  [
                    { id: 'flashcards', label: 'Flashcards', count: activeDeck.flashcards.length },
                    { id: 'qa', label: 'Q&A Bank', count: activeDeck.qaItems.length },
                    { id: 'mcq', label: 'Practice MCQs', count: activeDeck.mcqs.length },
                    { id: 'marked', label: '★ Marked Vault', count: markedCount, isMarked: true },
                  ] as const
                ).map((tab) => {
                  const isActive = studyMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStudyMode(tab.id)}
                      className={`relative flex h-16 items-center gap-1.5 text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'text-sky-700 dark:text-sky-400 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {'isMarked' in tab && tab.isMarked && (
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                      )}
                      <span>{tab.label}</span>
                      <span
                        className={`font-mono text-xs tabular-nums px-1.5 py-0.5 rounded-full ${
                          'isMarked' in tab && tab.isMarked && tab.count > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-semibold'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {tab.count}
                      </span>
                      {isActive && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-600 dark:bg-sky-400 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </nav>
            );
          })()}

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {!showingUploadScreen && activeDeck ? (
              <ExportMenu deck={activeDeck} onNotify={(msg) => notify(msg)} />
            ) : (
              <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                IndexedDB Local Library
              </span>
            )}
          </div>
        </header>

        {/* Live Background Extraction Banner when studying a deck while pages keep streaming */}
        {!showingUploadScreen && activeJob && (
          <ExtractionBanner
            job={activeJob}
            onPause={handlePauseJob}
            onResume={handleResumeJob}
            onStop={handleStopJob}
            onRetryFailed={handleRetryFailedBatches}
            onDismiss={() => setActiveJob(null)}
          />
        )}

        {/* Mobile Mode Switcher */}
        {!showingUploadScreen && activeDeck && (() => {
          const markedCount =
            activeDeck.flashcards.filter((c) => c.starred).length +
            activeDeck.qaItems.filter((q) => q.starred).length +
            activeDeck.mcqs.filter((m) => m.starred).length;

          return (
            <div className="flex items-center gap-1 border-b border-slate-200 bg-white/90 backdrop-blur-xs px-2 py-2 dark:border-slate-800 dark:bg-[#111827]/90 md:hidden overflow-x-auto">
              {(
                [
                  { id: 'flashcards', label: `Flashcards (${activeDeck.flashcards.length})` },
                  { id: 'qa', label: `Q&A (${activeDeck.qaItems.length})` },
                  { id: 'mcq', label: `MCQs (${activeDeck.mcqs.length})` },
                  { id: 'marked', label: `★ Marked (${markedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudyMode(tab.id)}
                  className={`flex-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    studyMode === tab.id
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Main Content Viewport */}
        <main className="flex-1">
          {!decksLoaded ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Loading saved study decks...
            </div>
          ) : showingUploadScreen ? (
            <UploadStage
              appendTargetDeck={appendTargetDeck}
              activeJob={activeJob}
              hasExistingDecks={decks.length > 0}
              onCancelAppend={() => setAppendTargetDeckId(null)}
              onStartPdfBatchJob={handleStartPdfBatchJob}
              onDeckCreatedFromText={handleDeckCreatedFromText}
              onLoadSampleDeck={handleLoadSampleDeck}
              onOpenDeckNow={(deckId) => {
                setAppendTargetDeckId(null);
                setActiveDeckId(deckId);
                setStudyMode('flashcards');
              }}
              onPauseJob={handlePauseJob}
              onResumeJob={handleResumeJob}
              onStopJob={handleStopJob}
              onRetryFailedBatches={handleRetryFailedBatches}
              onDismissJob={() => setActiveJob(null)}
            />
          ) : (
            <div className="px-4 py-7 sm:px-8 lg:px-10">
              {/* Concise Deck Context Summary + Page Coverage + Append PDF/Pages */}
              <div className="mx-auto mb-7 max-w-5xl rounded-3xl border border-slate-200/80 bg-white/70 p-5 sm:p-6 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/50 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {activeDeck.subject}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[260px]">{activeDeck.fileName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {activeDeck.flashcards.length} flashcards
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {activeDeck.qaItems.length} Q&amp;As
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {activeDeck.mcqs.length} MCQs
                      </span>
                      {(() => {
                        const markedCount =
                          activeDeck.flashcards.filter((c) => c.starred).length +
                          activeDeck.qaItems.filter((q) => q.starred).length +
                          activeDeck.mcqs.filter((m) => m.starred).length;
                        return markedCount > 0 ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => setStudyMode('marked')}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-900 transition-all hover:bg-amber-200 dark:bg-amber-950/70 dark:text-amber-300"
                            >
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              <span>{markedCount} marked</span>
                            </button>
                          </>
                        ) : null;
                      })()}
                    </div>

                    {activeDeck.sourceFiles && activeDeck.sourceFiles.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {activeDeck.sourceFiles.map((sf) => (
                          <span key={sf.name} className="inline-flex items-center gap-1.5">
                            <span className="max-w-[200px] truncate font-medium text-slate-700 dark:text-slate-300">
                              {sf.name}
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-emerald-700 dark:text-emerald-400">
                              {sf.coveredPages.length > 0
                                ? `pp. ${formatPageNumbersCompact(sf.coveredPages)} (${sf.coveredPages.length}/${sf.totalPages} pp)`
                                : `0/${sf.totalPages} pp`}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {activeDeck.summary && (
                      <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {activeDeck.summary}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAppendTargetDeckId(activeDeck.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 active:scale-98"
                  >
                    <FilePlus2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                    <span>Add PDF / Pages</span>
                  </button>
                </div>
              </div>

              {studyMode === 'flashcards' && (
                <FlashcardsView
                  key={activeDeck.id}
                  cards={activeDeck.flashcards}
                  keyTopics={activeDeck.keyTopics}
                  isExpanding={isExpanding}
                  onRateCard={handleRateCard}
                  onToggleStar={handleToggleStar}
                  onUpdateCard={handleUpdateCard}
                  onAddCard={handleAddCard}
                  onExpandDeck={handleExpandDeck}
                />
              )}

              {studyMode === 'qa' && (
                <QABankView
                  key={activeDeck.id}
                  items={activeDeck.qaItems}
                  keyTopics={activeDeck.keyTopics}
                  isExpanding={isExpanding}
                  onToggleRevised={handleToggleRevised}
                  onToggleStar={handleToggleStarQA}
                  onExpandDeck={handleExpandDeck}
                />
              )}

              {studyMode === 'mcq' && (
                <MCQQuizView
                  key={activeDeck.id}
                  mcqs={activeDeck.mcqs}
                  quizHistory={activeDeck.quizHistory}
                  isExpanding={isExpanding}
                  onRecordAttempt={handleRecordQuizAttempt}
                  onExpandDeck={handleExpandDeck}
                  onToggleStarMCQ={handleToggleStarMCQ}
                />
              )}

              {studyMode === 'marked' && (
                <MarkedReviewView
                  key={activeDeck.id}
                  flashcards={activeDeck.flashcards}
                  qaItems={activeDeck.qaItems}
                  mcqs={activeDeck.mcqs}
                  onToggleStarCard={handleToggleStar}
                  onToggleStarQA={handleToggleStarQA}
                  onToggleStarMCQ={handleToggleStarMCQ}
                  onRateCard={handleRateCard}
                  onToggleRevisedQA={handleToggleRevised}
                  onSwitchToFlashcardsMarked={() => {
                    setStudyMode('flashcards');
                  }}
                  onSwitchToMCQMarked={() => {
                    setStudyMode('mcq');
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Print-only Rapid Revision Handout */}
      {!showingUploadScreen && activeDeck && <PrintSheet deck={activeDeck} />}

      {/* Non-intrusive Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium shadow-md no-print ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
              : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
