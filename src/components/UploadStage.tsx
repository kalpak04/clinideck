import React, { useMemo, useRef, useState } from 'react';
import {
  FileUp,
  FileText,
  AlertCircle,
  Loader2,
  BookOpen,
  ArrowRight,
  X,
  CheckCircle2,
  Plus,
  Pause,
  Play,
  Square,
  RotateCw,
  ArrowLeft,
} from 'lucide-react';
import type {
  ExtractionDensity,
  ExtractionFocus,
  ExtractionJobProgress,
  MultiPdfMode,
  QueuedPdfInput,
  StudyDeck,
} from '../types/study';
import {
  MAX_SINGLE_PDF_BYTES,
  formatPageNumbersCompact,
  getPagesPerBatch,
  inspectPdfPageCount,
  parsePageRangeInput,
} from '../utils/pdfSlicer';

interface UploadStageProps {
  appendTargetDeck: StudyDeck | null;
  activeJob: ExtractionJobProgress | null;
  hasExistingDecks: boolean;
  onCancelAppend: () => void;
  onStartPdfBatchJob: (params: {
    files: QueuedPdfInput[];
    density: ExtractionDensity;
    focus: ExtractionFocus;
    multiPdfMode: MultiPdfMode;
    customTitle: string;
    appendDeckId: string | null;
  }) => void;
  onDeckCreatedFromText: (deck: StudyDeck, appendDeckId: string | null) => void;
  onLoadSampleDeck: () => void;
  onOpenDeckNow: (deckId: string) => void;
  onPauseJob: () => void;
  onResumeJob: () => void;
  onStopJob: () => void;
  onRetryFailedBatches: () => void;
  onDismissJob: () => void;
}

interface LocalQueueItem {
  id: string;
  file: File;
  totalPages: number | null;
  inspecting: boolean;
  inspectError?: string;
  pageRangeInput: string;
  rangeError?: string;
  selectedPages: number[];
}

const HERO_IMAGE_PATH = '/src/assets/images/clinical_study_hero_1795329826656.jpg';

const DENSITY_OPTIONS: Array<{
  id: ExtractionDensity;
  label: string;
  sublabel: string;
  cardsPerPage: number;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    sublabel: '~2 cards/pg · 8 pp/batch',
    cardsPerPage: 2,
  },
  {
    id: 'exhaustive',
    label: 'Exhaustive',
    sublabel: '~3–4 cards/pg · 5 pp/batch',
    cardsPerPage: 3.5,
  },
  {
    id: 'ultra_dense',
    label: 'Ultra-Dense',
    sublabel: '~5–6 cards/pg · 3 pp/batch',
    cardsPerPage: 5.5,
  },
];

export const UploadStage: React.FC<UploadStageProps> = ({
  appendTargetDeck,
  activeJob,
  hasExistingDecks,
  onCancelAppend,
  onStartPdfBatchJob,
  onDeckCreatedFromText,
  onLoadSampleDeck,
  onOpenDeckNow,
  onPauseJob,
  onResumeJob,
  onStopJob,
  onRetryFailedBatches,
  onDismissJob,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<'pdf' | 'text'>('pdf');
  const [queue, setQueue] = useState<LocalQueueItem[]>([]);
  const [notesText, setNotesText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [density, setDensity] = useState<ExtractionDensity>('exhaustive');
  const [focus, setFocus] = useState<ExtractionFocus>('balanced');
  const [multiPdfMode, setMultiPdfMode] = useState<MultiPdfMode>('merge');
  const [isDragging, setIsDragging] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const isJobActive =
    activeJob !== null &&
    (activeJob.status === 'running' || activeJob.status === 'paused');

  const addPdfFiles = async (fileList: FileList | File[]) => {
    setError(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const errors: string[] = [];
    const newItems: LocalQueueItem[] = [];

    for (const file of incoming) {
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        errors.push(`"${file.name}" is not a PDF file.`);
        continue;
      }
      if (file.size > MAX_SINGLE_PDF_BYTES) {
        errors.push(`"${file.name}" exceeds the 250 MB per-PDF browser limit.`);
        continue;
      }
      newItems.push({
        id: `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        totalPages: null,
        inspecting: true,
        pageRangeInput: 'All',
        selectedPages: [],
      });
    }

    if (errors.length > 0) {
      setError(errors.join(' '));
    }
    if (newItems.length === 0) return;

    setQueue((prev) => [...prev, ...newItems]);

    if (!appendTargetDeck && !customTitle && queue.length === 0) {
      const baseName = newItems[0].file.name
        .replace(/\.pdf$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      setCustomTitle(baseName);
    }

    // Inspect page counts in parallel locally via pdf-lib
    await Promise.all(
      newItems.map(async (item) => {
        try {
          const totalPages = await inspectPdfPageCount(item.file);
          const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);

          // If appending to a deck that already partially covered this exact PDF, default to uncovered pages!
          let defaultPages = allPages;
          let defaultInput = 'All';
          if (appendTargetDeck?.sourceFiles) {
            const match = appendTargetDeck.sourceFiles.find(
              (sf) => sf.name === item.file.name
            );
            if (match && match.coveredPages.length > 0 && match.coveredPages.length < totalPages) {
              const coveredSet = new Set(match.coveredPages);
              const missing = allPages.filter((p) => !coveredSet.has(p));
              if (missing.length > 0) {
                defaultPages = missing;
                defaultInput = formatPageNumbersCompact(missing);
              }
            }
          }

          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    totalPages,
                    inspecting: false,
                    selectedPages: defaultPages,
                    pageRangeInput: defaultInput,
                  }
                : q
            )
          );
        } catch {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    inspecting: false,
                    inspectError:
                      'Could not read PDF structure. Make sure the file is not password-locked or corrupted.',
                  }
                : q
            )
          );
        }
      })
    );
  };

  const updateRangeForItem = (id: string, rawValue: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (!item.totalPages) return { ...item, pageRangeInput: rawValue };
        const parsed = parsePageRangeInput(rawValue, item.totalPages);
        return {
          ...item,
          pageRangeInput: rawValue,
          selectedPages: parsed.pages,
          rangeError: parsed.error,
        };
      })
    );
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setInputMode('pdf');
      void addPdfFiles(e.dataTransfer.files);
    }
  };

  const summaryStats = useMemo(() => {
    const validItems = queue.filter(
      (q) => !q.inspecting && !q.inspectError && !q.rangeError && q.selectedPages.length > 0
    );
    const totalSelectedPages = validItems.reduce((sum, q) => sum + q.selectedPages.length, 0);
    const pagesPerBatch = getPagesPerBatch(density);
    const estimatedBatches = validItems.reduce(
      (sum, q) => sum + Math.ceil(q.selectedPages.length / pagesPerBatch),
      0
    );
    const densityMeta = DENSITY_OPTIONS.find((d) => d.id === density) ?? DENSITY_OPTIONS[1];
    const estimatedCards = Math.round(totalSelectedPages * densityMeta.cardsPerPage);
    const totalSizeMb = queue.reduce((sum, q) => sum + q.file.size / (1024 * 1024), 0);
    return {
      validCount: validItems.length,
      totalSelectedPages,
      estimatedBatches,
      estimatedCards,
      totalSizeMb,
      hasInspecting: queue.some((q) => q.inspecting),
      hasErrors: queue.some((q) => Boolean(q.inspectError || q.rangeError)),
    };
  }, [queue, density]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (inputMode === 'pdf') {
      if (queue.length === 0) {
        setError('Please drop or browse for at least one PDF file.');
        return;
      }
      if (summaryStats.hasInspecting) {
        setError('Please wait a moment while CliniDeck finishes reading PDF page counts.');
        return;
      }
      if (summaryStats.hasErrors || summaryStats.totalSelectedPages === 0) {
        setError('Please fix any invalid page ranges or unreadable PDFs before starting.');
        return;
      }

      const preparedFiles: QueuedPdfInput[] = queue.map((q) => ({
        id: q.id,
        file: q.file,
        totalPages: q.totalPages ?? q.selectedPages.length,
        selectedPages: q.selectedPages,
        pageRangeInput: q.pageRangeInput,
      }));

      onStartPdfBatchJob({
        files: preparedFiles,
        density,
        focus,
        multiPdfMode: appendTargetDeck ? 'merge' : multiPdfMode,
        customTitle: customTitle.trim(),
        appendDeckId: appendTargetDeck ? appendTargetDeck.id : null,
      });
      return;
    }

    // Paste text fallback workflow
    if (notesText.trim().length < 40) {
      setError('Please paste at least a short paragraph of medical notes.');
      return;
    }

    setIsExtractingText(true);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notesText: notesText.trim(),
          focus,
          density,
          customTitle: customTitle.trim(),
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (
        response.type === 'opaqueredirect' ||
        response.redirected ||
        !contentType.includes('application/json')
      ) {
        throw new Error(
          'Preview session expired (302 redirect). Please refresh the preview or open in a new tab and try again.'
        );
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : `Extraction failed (${response.status}).`
        );
      }

      const newDeck: StudyDeck = {
        id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: data.title || customTitle || 'Medical Study Deck',
        fileName: data.fileName || 'Pasted Medical Notes',
        subject: data.subject || 'Medical Sciences',
        createdAt: new Date().toISOString(),
        summary: data.summary || '',
        keyTopics: Array.isArray(data.keyTopics) ? data.keyTopics : [],
        flashcards: Array.isArray(data.flashcards) ? data.flashcards : [],
        qaItems: Array.isArray(data.qaItems) ? data.qaItems : [],
        mcqs: Array.isArray(data.mcqs) ? data.mcqs : [],
        quizHistory: [],
        extractionDensity: density,
      };
      onDeckCreatedFromText(newDeck, appendTargetDeck ? appendTargetDeck.id : null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error extracting pasted notes.'
      );
    } finally {
      setIsExtractingText(false);
    }
  };

  const jobPct =
    activeJob && activeJob.totalPages > 0
      ? Math.min(100, Math.round((activeJob.completedPages / activeJob.totalPages) * 100))
      : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
      {/* Append Mode Header Banner */}
      {appendTargetDeck && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-3.5 dark:border-sky-900/70 dark:bg-sky-950/30">
          <div className="text-sm text-slate-800 dark:text-slate-200">
            <span className="font-semibold text-sky-800 dark:text-sky-300">
              Appending to existing deck:
            </span>{' '}
            {appendTargetDeck.title}{' '}
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              ({appendTargetDeck.flashcards.length} cards currently)
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelAppend}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200 whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Deck</span>
          </button>
        </div>
      )}

      {/* Live Extraction Monitor Panel (when a batch job is running, paused, or just finished) */}
      {activeJob && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                {activeJob.status === 'running' && (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                )}
                {activeJob.status === 'paused' && (
                  <Pause className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
                {(activeJob.status === 'completed' || activeJob.status === 'stopped') && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                )}
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {activeJob.status === 'running'
                    ? 'Extracting Every Page in Batches'
                    : activeJob.status === 'paused'
                      ? 'Batch Extraction Paused'
                      : activeJob.status === 'stopped'
                        ? 'Extraction Stopped — Extracted Items Preserved'
                        : 'Page-by-Page Extraction Complete'}
                </h2>
              </div>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {activeJob.currentLabel || 'Processing medical concepts page by page.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeJob.primaryDeckId && activeJob.completedBatches > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDeckNow(activeJob.primaryDeckId!)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
                >
                  <span>
                    {isJobActive ? 'Study Extracted Cards Now' : 'Open Study Deck'}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}

              {activeJob.status === 'running' && (
                <button
                  type="button"
                  onClick={onPauseJob}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pause</span>
                </button>
              )}

              {activeJob.status === 'paused' && (
                <button
                  type="button"
                  onClick={onResumeJob}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-300 whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Resume</span>
                </button>
              )}

              {isJobActive && (
                <button
                  type="button"
                  onClick={onStopJob}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Square className="h-3.5 w-3.5" />
                  <span>Stop &amp; Keep</span>
                </button>
              )}

              {!isJobActive && activeJob.failedBatches.length > 0 && (
                <button
                  type="button"
                  onClick={onRetryFailedBatches}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 whitespace-nowrap"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Retry Failed ({activeJob.failedBatches.length})</span>
                </button>
              )}

              {!isJobActive && (
                <button
                  type="button"
                  onClick={onDismissJob}
                  aria-label="Close job monitor"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Live Progress Bar & Tabular Metrics */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span className="font-mono tabular-nums">
                Pages {activeJob.completedPages} / {activeJob.totalPages} · Batch{' '}
                {activeJob.completedBatches} / {activeJob.totalBatches}
              </span>
              <span className="font-mono font-semibold tabular-nums">{jobPct}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  activeJob.status === 'completed'
                    ? 'bg-emerald-600 dark:bg-emerald-500'
                    : 'bg-sky-600 dark:bg-sky-500'
                }`}
                style={{ width: `${jobPct}%` }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Flashcards extracted:{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {activeJob.cardsAdded}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Q&amp;As extracted:{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {activeJob.qaAdded}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                MCQs extracted:{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {activeJob.mcqsAdded}
                </strong>
              </span>
              {typeof activeJob.currentPacingSeconds === 'number' && isJobActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Pacing {activeJob.currentPacingSeconds}s/batch
                    {activeJob.activeModelLabel ? ` · ${activeJob.activeModelLabel}` : ''}
                  </span>
                </>
              )}
              {activeJob.failedBatches.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {activeJob.failedBatches.length} batch
                    {activeJob.failedBatches.length > 1 ? 'es' : ''} need retry
                  </span>
                </>
              )}
            </div>

            {activeJob.sessionAlert && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">Extraction Paused Safely</p>
                <p className="mt-1">{activeJob.sessionAlert}</p>
              </div>
            )}

            {activeJob.failedBatches.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">
                  Error:{' '}
                  {Array.from(new Set(activeJob.failedBatches.map((fb) => fb.error))).join(' · ')}
                </p>
                <p className="mt-1 font-mono text-[11px]">
                  Skipped pages:{' '}
                  {formatPageNumbersCompact(activeJob.failedBatches.flatMap((fb) => fb.pages))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main 2-Column Editorial Hero & Upload Queue */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
        {/* Left: Multi-PDF Upload & Page-Range Controls */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
              NEET PG · INI-CET · Full-Book Page-by-Page Extraction
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
              {appendTargetDeck
                ? 'Add more PDFs or remaining pages'
                : 'Turn full medical books into exhaustive study decks'}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Upload massive 188+ page PDFs (up to 250 MB each) or queue multiple PDFs at once. CliniDeck slices pages locally and extracts every single page into clinical vignettes, exam one-liners, Q&amp;As, and MCQs.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Input Source Segmented Switch */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Input method"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'pdf'}
                  onClick={() => {
                    setInputMode('pdf');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    inputMode === 'pdf'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  Upload PDF Files (Multi-PDF)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'text'}
                  onClick={() => {
                    setInputMode('text');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    inputMode === 'text'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  Paste Medical Notes
                </button>
              </div>

              <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {inputMode === 'pdf' ? 'Up to 250 MB / PDF · Multi-file' : 'Plain text notes'}
              </span>
            </div>

            {inputMode === 'pdf' ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      void addPdfFiles(e.target.files);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {/* Dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`rounded-xl border border-dashed transition-colors duration-150 ${
                    isDragging
                      ? 'border-sky-500 bg-sky-50/60 dark:border-sky-400 dark:bg-sky-950/30'
                      : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-[#111827] dark:hover:border-slate-600'
                  } ${queue.length > 0 ? 'p-4' : 'p-6'}`}
                >
                  {queue.length === 0 ? (
                    <div className="flex flex-col items-center py-3 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <FileUp className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Drop one or multiple medical PDFs here
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Handles 120+ MB, 188+ page rapid revision books or multiple split parts together
                      </p>
                      <button
                        type="button"
                        disabled={isJobActive}
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        Browse PDF Files
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Queued PDFs ({queue.length}) ·{' '}
                          <span className="font-mono font-normal tabular-nums text-slate-500 dark:text-slate-400">
                            {summaryStats.totalSizeMb.toFixed(1)} MB total
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={isJobActive}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add More PDFs</span>
                        </button>
                      </div>

                      {/* File Queue Rows with Per-File Page Range Input */}
                      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                        {queue.map((item) => (
                          <div key={item.id} className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                    {item.file.name}
                                  </p>
                                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                                    {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                                    {' · '}
                                    {item.inspecting
                                      ? 'Reading pages...'
                                      : item.totalPages
                                        ? `${item.totalPages} pages`
                                        : 'Unreadable'}
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={isJobActive}
                                onClick={() => removeQueueItem(item.id)}
                                aria-label={`Remove ${item.file.name}`}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Page Range Selector Row */}
                            {item.totalPages && !item.inspectError && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                                <label
                                  htmlFor={`range-${item.id}`}
                                  className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                                >
                                  Pages to extract:
                                </label>
                                <input
                                  id={`range-${item.id}`}
                                  type="text"
                                  disabled={isJobActive}
                                  value={item.pageRangeInput}
                                  onChange={(e) => updateRangeForItem(item.id, e.target.value)}
                                  placeholder={`All (1-${item.totalPages})`}
                                  className="w-40 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                                {item.totalPages > 40 && (
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                    <button
                                      type="button"
                                      disabled={isJobActive}
                                      onClick={() => updateRangeForItem(item.id, 'All')}
                                      className="text-sky-700 hover:underline dark:text-sky-400 whitespace-nowrap"
                                    >
                                      All (1-{item.totalPages})
                                    </button>
                                    <span className="text-slate-300 dark:text-slate-700">·</span>
                                    <button
                                      type="button"
                                      disabled={isJobActive}
                                      onClick={() => updateRangeForItem(item.id, '1-50')}
                                      className="text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-200 whitespace-nowrap"
                                    >
                                      First 50
                                    </button>
                                  </div>
                                )}
                                {!item.rangeError && (
                                  <span className="ml-auto font-mono text-[11px] tabular-nums text-emerald-700 dark:text-emerald-400">
                                    {item.selectedPages.length} pp selected
                                  </span>
                                )}
                              </div>
                            )}

                            {(item.inspectError || item.rangeError) && (
                              <p className="mt-1.5 pl-6 text-xs text-red-600 dark:text-red-400">
                                {item.inspectError || item.rangeError}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Multi-PDF Organization Toggle (appears when 2+ PDFs queued and not appending) */}
                {queue.length >= 2 && !appendTargetDeck && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#111827]">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Multi-PDF Output
                    </span>
                    <div
                      role="group"
                      aria-label="Multi-PDF deck organization"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
                    >
                      <button
                        type="button"
                        disabled={isJobActive}
                        onClick={() => setMultiPdfMode('merge')}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          multiPdfMode === 'merge'
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                      >
                        Merge into One Deck
                      </button>
                      <button
                        type="button"
                        disabled={isJobActive}
                        onClick={() => setMultiPdfMode('separate')}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          multiPdfMode === 'separate'
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                      >
                        Separate Deck per PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  disabled={isExtractingText || isJobActive}
                  rows={6}
                  placeholder="Paste your medical or NEET PG rapid revision notes here..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            )}

            {/* Extraction Density Selector */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Extraction Density (Coverage Depth)
                </span>
                {inputMode === 'pdf' && summaryStats.totalSelectedPages > 0 && (
                  <span className="font-mono text-xs tabular-nums text-sky-700 dark:text-sky-400">
                    ~{summaryStats.estimatedCards} flashcards across {summaryStats.estimatedBatches}{' '}
                    batch{summaryStats.estimatedBatches > 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {DENSITY_OPTIONS.map((opt) => {
                  const selected = density === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isJobActive || isExtractingText}
                      onClick={() => setDensity(opt.id)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-sky-500 bg-sky-50/70 dark:border-sky-500 dark:bg-sky-950/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-[#111827] dark:hover:border-slate-700'
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold ${
                          selected
                            ? 'text-sky-800 dark:text-sky-300'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {opt.sublabel}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deck Title + Concept Emphasis */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!appendTargetDeck && (
                <div>
                  <label
                    htmlFor="deck-title-input"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    {multiPdfMode === 'separate' && queue.length >= 2
                      ? 'Deck Prefix (optional)'
                      : 'Deck Title (optional)'}
                  </label>
                  <input
                    id="deck-title-input"
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    disabled={isJobActive || isExtractingText}
                    placeholder="Auto-detected from PDF"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              )}

              <div className={appendTargetDeck ? 'sm:col-span-2' : ''}>
                <label
                  htmlFor="extraction-focus-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Concept Emphasis
                </label>
                <select
                  id="extraction-focus-select"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value as ExtractionFocus)}
                  disabled={isJobActive || isExtractingText}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100"
                >
                  <option value="balanced">Balanced Vignettes &amp; One-Liners</option>
                  <option value="clinical_vignettes">Clinical Vignettes Focus (70/30)</option>
                  <option value="rapid_revision">Exam One-Liners Focus (70/30)</option>
                </select>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Primary CTA + Sample Deck Button */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isJobActive || isExtractingText || summaryStats.hasInspecting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 dark:focus-visible:ring-offset-[#0B1120] whitespace-nowrap shrink-0"
              >
                {isExtractingText ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extracting Notes...</span>
                  </>
                ) : isJobActive ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extraction Running...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {appendTargetDeck
                        ? `Extract & Append (${summaryStats.totalSelectedPages || 0} Pages)`
                        : inputMode === 'pdf' && summaryStats.totalSelectedPages > 0
                          ? `Extract ${summaryStats.totalSelectedPages} Page${summaryStats.totalSelectedPages > 1 ? 's' : ''}`
                          : 'Generate Study Deck'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {!isJobActive && !isExtractingText && !appendTargetDeck && (
                <button
                  type="button"
                  onClick={onLoadSampleDeck}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 whitespace-nowrap shrink-0"
                >
                  <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span>
                    {hasExistingDecks ? 'Load Sample Cardiology Deck' : 'Try Sample NEET PG Deck'}
                  </span>
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right: Editorial Clinical Visual & Full-Book Architecture Guide */}
        <div className="lg:col-span-5 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]">
          <div className="relative h-52 w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-900">
            {!heroImgFailed ? (
              <img
                src={HERO_IMAGE_PATH}
                alt="Minimalist medical study sheets with anatomical sketches, ECG trace, and stethoscope on cool alabaster stone"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-sky-50 px-6 text-center dark:from-slate-900 dark:to-sky-950/40">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Clinical Rapid Revision Engine
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between p-6">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Built for 188+ page NEET PG books
              </h2>
              <div className="mt-4 divide-y divide-slate-200/80 dark:divide-slate-800">
                <div className="pb-3.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    01. Adaptive Page-Batch Slicing
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    120+ MB PDFs are sliced locally into compact 3–8 page batches so every single page and clinical table is extracted without upload limits.
                  </p>
                </div>
                <div className="py-3.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    02. Page-Tagged Exhaustive Volume
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Every flashcard, Q&amp;A item, and practice MCQ carries its exact source PDF and page reference for fast verification.
                  </p>
                </div>
                <div className="pt-3.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    03. Study Live &amp; Pause Anytime
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Start studying finished pages right after Batch 1 while remaining pages stream into high-capacity browser IndexedDB storage.
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              High-capacity local IndexedDB · Export anytime to Anki CSV, JSON, or printable revision sheets.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
