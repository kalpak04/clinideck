import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Flag,
  Star,
} from 'lucide-react';
import type { ConceptFormat, MCQItem, QuizAttempt } from '../types/study';

interface MCQQuizViewProps {
  mcqs: MCQItem[];
  quizHistory: QuizAttempt[];
  isExpanding: boolean;
  onRecordAttempt: (attempt: QuizAttempt) => void;
  onExpandDeck: () => void;
  onToggleStarMCQ: (mcqId: string) => void;
  initialMarkedOnly?: boolean;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const NAV_BLOCK_SIZE = 25;

function formatDuration(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MCQQuizView: React.FC<MCQQuizViewProps> = ({
  mcqs,
  quizHistory,
  isExpanding,
  onRecordAttempt,
  onExpandDeck,
  onToggleStarMCQ,
  initialMarkedOnly = false,
}) => {
  const [quizMode, setQuizMode] = useState<'practice' | 'exam'>('practice');
  const [formatFilter, setFormatFilter] = useState<'all' | ConceptFormat>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [onlyStarred, setOnlyStarred] = useState<boolean>(initialMarkedOnly);
  const [retryIds, setRetryIds] = useState<string[] | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    mcqs.forEach((m) => {
      if (m.sourceFile) set.add(m.sourceFile);
    });
    return Array.from(set);
  }, [mcqs]);

  const activeQuestions = useMemo(() => {
    let list = mcqs.filter((m) => {
      if (formatFilter !== 'all' && m.format !== formatFilter) return false;
      if (sourceFilter !== 'all' && m.sourceFile !== sourceFilter) return false;
      if (onlyStarred && !m.starred) return false;
      return true;
    });
    if (retryIds && retryIds.length > 0) {
      const idSet = new Set(retryIds);
      list = list.filter((m) => idSet.has(m.id));
    }
    return list;
  }, [mcqs, formatFilter, sourceFilter, onlyStarred, retryIds]);

  const safeIndex =
    activeQuestions.length > 0 ? Math.min(currentIndex, activeQuestions.length - 1) : 0;
  const currentQ = activeQuestions[safeIndex] ?? null;

  // Paged question navigator block so 300+ MCQs stay tidy
  const navBlockIndex = Math.floor(safeIndex / NAV_BLOCK_SIZE);
  const totalNavBlocks = Math.max(1, Math.ceil(activeQuestions.length / NAV_BLOCK_SIZE));
  const navBlockStart = navBlockIndex * NAV_BLOCK_SIZE;
  const navBlockEnd = Math.min(activeQuestions.length, navBlockStart + NAV_BLOCK_SIZE);

  // Exam timer ticks while in Timed Exam mode prior to submission
  useEffect(() => {
    if (quizMode !== 'exam' || examSubmitted || activeQuestions.length === 0) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [quizMode, examSubmitted, activeQuestions.length]);

  const resetSession = (nextMode?: 'practice' | 'exam', nextRetryIds: string[] | null = null) => {
    if (nextMode) setQuizMode(nextMode);
    setRetryIds(nextRetryIds);
    setAnswers({});
    setCurrentIndex(0);
    setExamSubmitted(false);
    setElapsedSeconds(0);
  };

  const selectOption = (mcqId: string, optionIdx: number) => {
    if (quizMode === 'practice' && mcqId in answers) return;
    if (quizMode === 'exam' && examSubmitted) return;
    setAnswers((prev) => ({ ...prev, [mcqId]: optionIdx }));
  };

  const submitExam = () => {
    if (examSubmitted || activeQuestions.length === 0) return;
    const correctCount = activeQuestions.filter(
      (q) => answers[q.id] === q.correctIndex
    ).length;
    setExamSubmitted(true);
    setCurrentIndex(0);
    onRecordAttempt({
      id: `attempt_${Date.now()}`,
      completedAt: new Date().toISOString(),
      mode: 'exam',
      correctCount,
      totalCount: activeQuestions.length,
      durationSeconds: elapsedSeconds,
    });
  };

  const answeredCount = activeQuestions.filter((q) => q.id in answers).length;
  const correctSoFar = activeQuestions.filter(
    (q) => answers[q.id] === q.correctIndex
  ).length;
  const incorrectQuestions = activeQuestions.filter(
    (q) => !(q.id in answers) || answers[q.id] !== q.correctIndex
  );

  // NEET PG scoring convention: +4 correct, -1 incorrect, 0 unattempted
  const neetPgScore = activeQuestions.reduce((acc, q) => {
    if (!(q.id in answers)) return acc;
    return acc + (answers[q.id] === q.correctIndex ? 4 : -1);
  }, 0);
  const maxNeetPgScore = activeQuestions.length * 4;

  const vignetteCount = mcqs.filter((m) => m.format === 'clinical_vignette').length;
  const oneLinerCount = mcqs.filter((m) => m.format === 'exam_one_liner').length;

  const showRevealForCurrent =
    currentQ !== null &&
    ((quizMode === 'practice' && currentQ.id in answers) ||
      (quizMode === 'exam' && examSubmitted));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Mode & Format Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Quiz mode"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
          >
            <button
              type="button"
              onClick={() => resetSession('practice', null)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                quizMode === 'practice'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Practice Mode
            </button>
            <button
              type="button"
              onClick={() => resetSession('exam', null)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                quizMode === 'exam'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Timed Exam Mode
            </button>
          </div>

          <div
            role="group"
            aria-label="Filter MCQ format"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
          >
            {(
              [
                { id: 'all', label: `All (${mcqs.length})` },
                { id: 'clinical_vignette', label: `Vignettes (${vignetteCount})` },
                { id: 'exam_one_liner', label: `One-Liners (${oneLinerCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setFormatFilter(opt.id);
                  setRetryIds(null);
                  setCurrentIndex(0);
                  setAnswers({});
                  setExamSubmitted(false);
                  setElapsedSeconds(0);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  formatFilter === opt.id && !retryIds && !onlyStarred
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setOnlyStarred((prev) => !prev);
              setRetryIds(null);
              setCurrentIndex(0);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              onlyStarred
                ? 'bg-amber-100 text-amber-900 shadow-xs dark:bg-amber-950/70 dark:text-amber-300 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${onlyStarred ? 'fill-amber-500 text-amber-500' : ''}`} />
            <span>Marked ({mcqs.filter((m) => m.starred).length})</span>
          </button>

          {availableSources.length > 1 && (
            <select
              aria-label="Filter MCQs by source PDF"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setRetryIds(null);
                setCurrentIndex(0);
              }}
              className="max-w-[170px] truncate rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
            >
              <option value="all">All Source PDFs</option>
              {availableSources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3">
          {quizMode === 'exam' && (
            <div className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => resetSession(quizMode, null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Status Summary Line */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Attempted:{' '}
            <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {answeredCount}/{activeQuestions.length}
            </strong>
          </span>
          {(quizMode === 'practice' || examSubmitted) && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Correct:{' '}
                <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {correctSoFar}/{activeQuestions.length}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                NEET PG Score (+4/-1):{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {neetPgScore}/{maxNeetPgScore}
                </strong>
              </span>
            </>
          )}
          {retryIds && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Retrying Missed Questions
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onExpandDeck}
          disabled={isExpanding}
          className="inline-flex items-center gap-1.5 font-medium text-sky-700 hover:text-sky-800 disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300 whitespace-nowrap"
        >
          {isExpanding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>{isExpanding ? 'Generating more MCQs...' : 'Generate Extra MCQs'}</span>
        </button>
      </div>

      {/* Exam Results Banner */}
      {quizMode === 'exam' && examSubmitted && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                Exam Session Completed · {formatDuration(elapsedSeconds)}
              </p>
              <h3 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                <span className="font-mono tabular-nums">
                  {correctSoFar} / {activeQuestions.length}
                </span>{' '}
                correct ({Math.round((correctSoFar / Math.max(activeQuestions.length, 1)) * 100)}%)
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                NEET PG Pattern Score (+4 correct, -1 wrong):{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {neetPgScore} / {maxNeetPgScore}
                </strong>
                . Review every question rationale below.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {incorrectQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    resetSession(
                      'practice',
                      incorrectQuestions.map((q) => q.id)
                    )
                  }
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 whitespace-nowrap"
                >
                  Retry Missed ({incorrectQuestions.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => resetSession('exam', null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Retake Full Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paged Question Navigator Strip (scales cleanly to 400+ MCQs) */}
      {activeQuestions.length > 1 && (
        <div className="space-y-2">
          {totalNavBlocks > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Questions {navBlockStart + 1}–{navBlockEnd} of {activeQuestions.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={navBlockIndex === 0}
                  onClick={() =>
                    setCurrentIndex(Math.max(0, (navBlockIndex - 1) * NAV_BLOCK_SIZE))
                  }
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300"
                >
                  Prev {NAV_BLOCK_SIZE}
                </button>
                <button
                  type="button"
                  disabled={navBlockIndex >= totalNavBlocks - 1}
                  onClick={() =>
                    setCurrentIndex(
                      Math.min(activeQuestions.length - 1, (navBlockIndex + 1) * NAV_BLOCK_SIZE)
                    )
                  }
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300"
                >
                  Next {NAV_BLOCK_SIZE}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {activeQuestions.slice(navBlockStart, navBlockEnd).map((q, offset) => {
              const idx = navBlockStart + offset;
              const picked = answers[q.id];
              const isCurrent = idx === safeIndex;
              const reveal =
                (quizMode === 'practice' && picked !== undefined) ||
                (quizMode === 'exam' && examSubmitted);
              const isCorrect = picked === q.correctIndex;

              let style =
                'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-400 dark:hover:bg-slate-800';
              if (reveal && picked !== undefined) {
                style = isCorrect
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300';
              } else if (picked !== undefined) {
                style =
                  'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Question ${idx + 1}`}
                  className={`h-8 min-w-8 px-1.5 rounded-lg border font-mono text-xs font-medium tabular-nums transition-colors ${style} ${
                    isCurrent ? 'ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-[#0B1120]' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Question Stage */}
      {!currentQ ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-[#111827]">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No MCQs match this filter
          </p>
          <button
            type="button"
            onClick={() => {
              setFormatFilter('all');
              setSourceFilter('all');
              setRetryIds(null);
            }}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950"
          >
            Show All MCQs
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111827] sm:p-8">
          {/* Question Metadata & Star Action */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500">
                Question {String(safeIndex + 1).padStart(2, '0')} /{' '}
                {String(activeQuestions.length).padStart(2, '0')}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-sky-700 dark:text-sky-400">
                {currentQ.format === 'clinical_vignette' ? 'Clinical Vignette' : 'Exam One-Liner'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentQ.topic}</span>
              {currentQ.pageNumber && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {currentQ.pageNumber}
                  </span>
                </>
              )}
              {availableSources.length > 1 && currentQ.sourceFile && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="max-w-[160px] truncate">{currentQ.sourceFile}</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onToggleStarMCQ(currentQ.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                currentQ.starred
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-800'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800'
              }`}
              title={currentQ.starred ? 'Marked for review' : 'Star MCQ'}
            >
              <Star className={`h-3.5 w-3.5 ${currentQ.starred ? 'fill-amber-500 text-amber-500' : ''}`} />
              <span className="hidden sm:inline">{currentQ.starred ? 'Marked' : 'Mark'}</span>
            </button>
          </div>

          {/* Question Stem */}
          <h3 className="mt-4 max-w-[68ch] font-sans text-base font-medium leading-relaxed text-slate-900 dark:text-slate-100 sm:text-[17px]">
            {currentQ.stem}
          </h3>

          {/* 4 Single-Best-Answer Options */}
          <div className="mt-6 space-y-2.5">
            {currentQ.options.map((optionText, idx) => {
              const selectedIdx = answers[currentQ.id];
              const isSelected = selectedIdx === idx;
              const isCorrectOption = idx === currentQ.correctIndex;

              let buttonClasses =
                'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800/60';
              let statusText: string | null = null;

              if (showRevealForCurrent) {
                if (isCorrectOption) {
                  buttonClasses =
                    'border-emerald-400 bg-emerald-50/70 text-slate-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-slate-100';
                  statusText = 'Correct';
                } else if (isSelected && !isCorrectOption) {
                  buttonClasses =
                    'border-red-400 bg-red-50/70 text-slate-900 dark:border-red-800 dark:bg-red-950/40 dark:text-slate-100';
                  statusText = 'Incorrect';
                } else {
                  buttonClasses =
                    'border-slate-200/70 bg-white/60 text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/20 dark:text-slate-500';
                }
              } else if (isSelected) {
                buttonClasses =
                  'border-sky-500 bg-sky-50/80 text-slate-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-slate-100';
                statusText = 'Selected';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectOption(currentQ.id, idx)}
                  disabled={
                    (quizMode === 'practice' && currentQ.id in answers) ||
                    (quizMode === 'exam' && examSubmitted)
                  }
                  className={`flex w-full items-start justify-between gap-4 rounded-lg border px-4 py-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${buttonClasses}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {OPTION_LETTERS[idx]}.
                    </span>
                    <span className="text-sm leading-relaxed">{optionText}</span>
                  </div>

                  {statusText && (
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap ${
                        statusText === 'Correct'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : statusText === 'Incorrect'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-sky-700 dark:text-sky-400'
                      }`}
                    >
                      {statusText === 'Correct' && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {statusText === 'Incorrect' && <XCircle className="h-3.5 w-3.5" />}
                      <span>{statusText}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Clinical Explanation & Distractor Notes */}
          {showRevealForCurrent && (
            <div className="mt-6 space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Clinical Explanation
                </p>
                <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {currentQ.explanation}
                </p>
              </div>

              {currentQ.distractorNotes && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Why Other Options Are Ruled Out
                  </p>
                  <p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {currentQ.distractorNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer Navigation / Submit Exam */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800/80">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>

            <div className="flex items-center gap-2">
              {quizMode === 'exam' && !examSubmitted && (
                <button
                  type="button"
                  onClick={submitExam}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>Submit Exam ({answeredCount}/{activeQuestions.length})</span>
                </button>
              )}

              {safeIndex + 1 < activeQuestions.length ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(activeQuestions.length - 1, i + 1))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <span>Next Question</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                quizMode === 'practice' &&
                incorrectQuestions.length > 0 &&
                answeredCount === activeQuestions.length && (
                  <button
                    type="button"
                    onClick={() =>
                      resetSession(
                        'practice',
                        incorrectQuestions.map((q) => q.id)
                      )
                    }
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 whitespace-nowrap"
                  >
                    Retry Missed ({incorrectQuestions.length})
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Past Exam History */}
      {quizHistory.length > 0 && (
        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Recent Timed Exam Attempts
          </h4>
          <div className="mt-2.5 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-[#111827]">
            {quizHistory.slice(0, 5).map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center justify-between px-4 py-2.5 text-slate-600 dark:text-slate-300"
              >
                <span>
                  {new Date(attempt.completedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div className="flex items-center gap-4 font-mono tabular-nums">
                  <span>{formatDuration(attempt.durationSeconds)}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {attempt.correctCount}/{attempt.totalCount} (
                    {Math.round((attempt.correctCount / Math.max(attempt.totalCount, 1)) * 100)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
