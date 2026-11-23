import React, { useState } from 'react';
import {
  Loader2,
  Pause,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ExtractionJobProgress } from '../types/study';
import { formatPageNumbersCompact } from '../utils/pdfSlicer';

interface ExtractionBannerProps {
  job: ExtractionJobProgress;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onDismiss: () => void;
}

export const ExtractionBanner: React.FC<ExtractionBannerProps> = ({
  job,
  onPause,
  onResume,
  onStop,
  onRetryFailed,
  onDismiss,
}) => {
  const [showErrors, setShowErrors] = useState(false);

  const pct =
    job.totalPages > 0
      ? Math.min(100, Math.round((job.completedPages / job.totalPages) * 100))
      : 0;

  const isRunning = job.status === 'running';
  const isPaused = job.status === 'paused';
  const isDone = job.status === 'completed' || job.status === 'stopped';
  const hasFailures = job.failedBatches.length > 0;

  // Group duplicate failure messages cleanly for readability
  const uniqueErrorMessages = Array.from(
    new Set(job.failedBatches.map((fb) => fb.error))
  );

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#111827] lg:px-8 no-print">
      <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 text-xs">
            {isRunning && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
            )}
            {isPaused && (
              <Pause className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            {isDone && !hasFailures && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            {isDone && hasFailures && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {isRunning
                  ? 'Extracting Pages Live'
                  : isPaused
                    ? 'Extraction Paused'
                    : job.status === 'stopped'
                      ? 'Extraction Stopped (Extracted Cards Saved)'
                      : hasFailures
                        ? `Completed with ${job.failedBatches.length} Failed Batch${job.failedBatches.length > 1 ? 'es' : ''}`
                        : 'Exhaustive Extraction Complete'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {job.completedPages}/{job.totalPages} pages ({pct}%)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                +{job.cardsAdded} cards · +{job.qaAdded} Q&amp;As · +{job.mcqsAdded} MCQs
              </span>
              {typeof job.currentPacingSeconds === 'number' && (isRunning || isPaused) && (
                <>
                  <span aria-hidden="true" className="hidden md:inline">
                    ·
                  </span>
                  <span className="hidden md:inline font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {job.currentPacingSeconds}s/batch
                    {job.activeModelLabel ? ` · ${job.activeModelLabel}` : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRunning && (
              <>
                <button
                  type="button"
                  onClick={onPause}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Pause className="h-3 w-3" />
                  <span>Pause</span>
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Square className="h-3 w-3" />
                  <span>Stop &amp; Keep</span>
                </button>
              </>
            )}

            {isPaused && (
              <>
                <button
                  type="button"
                  onClick={onResume}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 whitespace-nowrap"
                >
                  <Play className="h-3 w-3" />
                  <span>Resume</span>
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Square className="h-3 w-3" />
                  <span>Stop &amp; Keep</span>
                </button>
              </>
            )}

            {hasFailures && (
              <button
                type="button"
                onClick={() => setShowErrors((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <span>Details</span>
                {showErrors ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}

            {isDone && hasFailures && (
              <button
                type="button"
                onClick={onRetryFailed}
                className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 whitespace-nowrap"
              >
                <RotateCw className="h-3 w-3" />
                <span>Retry Failed ({job.failedBatches.length})</span>
              </button>
            )}

            {isDone && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss extraction summary"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar + Current Batch Label */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                hasFailures && isDone
                  ? 'bg-amber-500'
                  : isDone
                    ? 'bg-emerald-600 dark:bg-emerald-500'
                    : 'bg-sky-600 dark:bg-sky-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {job.currentLabel && (
            <span className="hidden sm:inline max-w-[340px] truncate text-[11px] text-slate-500 dark:text-slate-400">
              {job.currentLabel}
            </span>
          )}
        </div>

        {/* Paused Guidance Alert (daily quota or preview auth redirect) */}
        {job.sessionAlert && (
          <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Extraction Paused Safely</p>
            <p className="mt-0.5">{job.sessionAlert}</p>
          </div>
        )}

        {/* Expandable Failure Diagnostics */}
        {showErrors && hasFailures && (
          <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">
              Reason{uniqueErrorMessages.length > 1 ? 's' : ''}: {uniqueErrorMessages.join(' · ')}
            </p>
            <p className="mt-1 font-mono text-[11px] text-amber-800/90 dark:text-amber-300/90">
              Skipped pages:{' '}
              {formatPageNumbersCompact(job.failedBatches.flatMap((fb) => fb.pages))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
