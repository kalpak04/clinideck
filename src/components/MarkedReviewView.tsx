import React, { useState, useMemo } from 'react';
import {
  Star,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  BookOpen,
  HelpCircle,
  FileQuestion,
  Layers,
  ArrowRight,
  Filter,
  Check,
  X,
  Stethoscope,
} from 'lucide-react';
import type { ConceptFormat, ConfidenceLevel, Flashcard, MCQItem, QAItem } from '../types/study';

interface MarkedReviewViewProps {
  flashcards: Flashcard[];
  qaItems: QAItem[];
  mcqs: MCQItem[];
  onToggleStarCard: (cardId: string) => void;
  onToggleStarQA: (qaId: string) => void;
  onToggleStarMCQ: (mcqId: string) => void;
  onRateCard: (cardId: string, confidence: ConfidenceLevel) => void;
  onToggleRevisedQA: (qaId: string) => void;
  onSwitchToFlashcardsMarked: () => void;
  onSwitchToMCQMarked: () => void;
}

type TabCategory = 'all' | 'flashcards' | 'qa' | 'mcq';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export const MarkedReviewView: React.FC<MarkedReviewViewProps> = ({
  flashcards,
  qaItems,
  mcqs,
  onToggleStarCard,
  onToggleStarQA,
  onToggleStarMCQ,
  onRateCard,
  onToggleRevisedQA,
  onSwitchToFlashcardsMarked,
  onSwitchToMCQMarked,
}) => {
  const [activeTab, setActiveTab] = useState<TabCategory>('all');
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | ConceptFormat>('all');

  // Interactive local states for in-place review
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [expandedQA, setExpandedQA] = useState<Record<string, boolean>>({});
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});

  const markedCards = useMemo(() => flashcards.filter((c) => c.starred), [flashcards]);
  const markedQAs = useMemo(() => qaItems.filter((q) => q.starred), [qaItems]);
  const markedMCQs = useMemo(() => mcqs.filter((m) => m.starred), [mcqs]);

  const totalMarkedCount = markedCards.length + markedQAs.length + markedMCQs.length;

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return markedCards.filter((card) => {
      if (formatFilter !== 'all' && card.format !== formatFilter) return false;
      if (q) {
        const text = `${card.front} ${card.back} ${card.clinicalPearl} ${card.topic} ${card.pageNumber || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [markedCards, formatFilter, search]);

  const filteredQAs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return markedQAs.filter((item) => {
      if (formatFilter !== 'all' && item.format !== formatFilter) return false;
      if (q) {
        const text = `${item.question} ${item.answer} ${item.highYieldClue} ${item.topic} ${item.pageNumber || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [markedQAs, formatFilter, search]);

  const filteredMCQs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return markedMCQs.filter((item) => {
      if (formatFilter !== 'all' && item.format !== formatFilter) return false;
      if (q) {
        const text = `${item.stem} ${item.options.join(' ')} ${item.explanation} ${item.distractorNotes} ${item.topic} ${item.pageNumber || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [markedMCQs, formatFilter, search]);

  const toggleFlip = (id: string) => {
    setFlippedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleQA = (id: string) => {
    setExpandedQA((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectMCQOption = (mcqId: string, idx: number) => {
    setMcqAnswers((prev) => ({ ...prev, [mcqId]: idx }));
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 pb-16">
      {/* Sleek Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-6 sm:p-8 dark:border-amber-900/40 dark:from-amber-950/40 dark:via-slate-900/30 dark:to-transparent backdrop-blur-sm shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-100/70 px-3 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/60 dark:text-amber-300">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
              <span>High-Yield Marked Vault</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
              Marked Medical Concepts
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Consolidated high-yield review of every star-marked flashcard, difficult clinical question, and trap MCQ flagged for rapid pre-exam recall.
            </p>
          </div>

          {/* Quick Practice Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {markedCards.length > 0 && (
              <button
                type="button"
                onClick={onSwitchToFlashcardsMarked}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:from-sky-500 hover:to-sky-600 hover:shadow-md active:scale-98 dark:from-sky-500 dark:to-sky-600 dark:text-slate-950"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Drill Flashcards ({markedCards.length})</span>
              </button>
            )}
            {markedMCQs.length > 0 && (
              <button
                type="button"
                onClick={onSwitchToMCQMarked}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-300/80 bg-white/90 px-4 py-2.5 text-xs font-semibold text-sky-800 shadow-sm transition-all duration-200 hover:bg-sky-50 active:scale-98 dark:border-sky-800 dark:bg-slate-900/90 dark:text-sky-300 dark:hover:bg-slate-800"
              >
                <FileQuestion className="h-3.5 w-3.5" />
                <span>Test Marked MCQs ({markedMCQs.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Counters Pill Row */}
        <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-amber-200/50 dark:border-amber-900/30 text-xs text-slate-600 dark:text-slate-300 font-medium">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {totalMarkedCount} total flagged:
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 shadow-xs">
            <Layers className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <strong className="font-mono">{markedCards.length}</strong> Flashcards
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 shadow-xs">
            <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <strong className="font-mono">{markedQAs.length}</strong> Q&amp;As
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 shadow-xs">
            <FileQuestion className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <strong className="font-mono">{markedMCQs.length}</strong> Practice MCQs
          </span>
        </div>
      </div>

      {/* Modern Filter & Search Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Segmented Control */}
        <div className="inline-flex rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
          {(
            [
              { id: 'all', label: 'All Marked', count: totalMarkedCount },
              { id: 'flashcards', label: 'Flashcards', count: markedCards.length },
              { id: 'qa', label: 'Q&A Bank', count: markedQAs.length },
              { id: 'mcq', label: 'MCQs', count: markedMCQs.length },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                      : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Format Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search marked notes & drugs..."
              className="w-full rounded-xl border border-slate-200 bg-white/90 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100"
            />
          </div>

          <div className="inline-flex rounded-xl border border-slate-200/80 bg-white/90 p-0.5 dark:border-slate-800 dark:bg-slate-900/90 text-xs">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'clinical_vignette', label: 'Vignettes' },
                { id: 'exam_one_liner', label: 'One-Liners' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFormatFilter(btn.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  formatFilter === btn.id
                    ? 'bg-amber-100/80 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Zero Marked Empty State */}
      {totalMarkedCount === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4 shadow-xs">
            <Star className="h-7 w-7" />
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            No marked items in this deck yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            While studying in Flashcards, Q&amp;A Bank, or Practice MCQs, click the <Star className="inline h-3.5 w-3.5 text-amber-500 fill-amber-500" /> star icon on any concept to save it here for targeted high-yield revision.
          </p>
        </div>
      )}

      {/* SECTION 1: Marked Flashcards */}
      {(activeTab === 'all' || activeTab === 'flashcards') && markedCards.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Marked Flashcards
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {filteredCards.length}
              </span>
            </div>
            {filteredCards.length > 0 && (
              <button
                type="button"
                onClick={onSwitchToFlashcardsMarked}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:underline"
              >
                <span>Drill Flashcards</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredCards.map((card) => {
              const flipped = flippedCards[card.id] ?? false;
              return (
                <div
                  key={card.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs transition-all duration-200 hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-sky-700/60"
                >
                  <div className="space-y-3">
                    {/* Header tags */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                          {card.topic}
                        </span>
                        {card.pageNumber && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {card.pageNumber}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleStarCard(card.id)}
                        className="rounded-lg p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                        title="Unstar card"
                      >
                        <Star className="h-4 w-4 fill-amber-500" />
                      </button>
                    </div>

                    {/* Question / Front */}
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {flipped ? 'Answer' : 'Prompt / Vignette'}
                      </span>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">
                        {flipped ? card.back : card.front}
                      </p>
                    </div>

                    {/* Back details when revealed */}
                    {flipped && card.clinicalPearl && (
                      <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300 mb-1">
                          <Sparkles className="h-3 w-3" />
                          <span>NEET PG High-Yield Pearl</span>
                        </div>
                        <p className="leading-relaxed">{card.clinicalPearl}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => toggleFlip(card.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{flipped ? 'Show Prompt' : 'Flip to Answer'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'again', label: 'Again', color: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40' },
                          { id: 'review', label: 'Review', color: 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40' },
                          { id: 'mastered', label: 'Mastered', color: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40' },
                        ] as const
                      ).map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => onRateCard(card.id, lvl.id)}
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${lvl.color} ${
                            card.confidence === lvl.id ? 'ring-1 ring-current font-bold' : ''
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 2: Marked Q&As */}
      {(activeTab === 'all' || activeTab === 'qa') && markedQAs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <BookOpen className="h-3.5 w-3.5" />
              </span>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Marked Q&amp;A Bank
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {filteredQAs.length}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {filteredQAs.map((qa) => {
              const isOpen = expandedQA[qa.id] ?? false;
              return (
                <div
                  key={qa.id}
                  className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs transition-all duration-200 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-emerald-700/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {qa.topic}
                      </span>
                      {qa.pageNumber && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {qa.pageNumber}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleRevisedQA(qa.id)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                          qa.revised
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {qa.revised ? 'Revised' : 'Mark Revised'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleStarQA(qa.id)}
                        className="rounded-lg p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        title="Unstar question"
                      >
                        <Star className="h-4 w-4 fill-amber-500" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleQA(qa.id)}
                    className="mt-3 flex w-full items-start justify-between gap-3 text-left focus:outline-none"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {qa.question}
                    </h3>
                    <span className="shrink-0 text-slate-400">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>

                  {/* High Yield Clue Preview */}
                  {qa.highYieldClue && (
                    <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
                      💡 Clue: {qa.highYieldClue}
                    </div>
                  )}

                  {/* Expanded Answer */}
                  {isOpen && (
                    <div className="mt-3.5 space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                      <p>{qa.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 3: Marked MCQs */}
      {(activeTab === 'all' || activeTab === 'mcq') && markedMCQs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                <FileQuestion className="h-3.5 w-3.5" />
              </span>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Marked Practice MCQs
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {filteredMCQs.length}
              </span>
            </div>
            {filteredMCQs.length > 0 && (
              <button
                type="button"
                onClick={onSwitchToMCQMarked}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
              >
                <span>Launch Quiz Drill</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {filteredMCQs.map((mcq, qIdx) => {
              const selectedOpt = mcqAnswers[mcq.id];
              const isAnswered = typeof selectedOpt === 'number';
              const isCorrect = isAnswered && selectedOpt === mcq.correctIndex;

              return (
                <div
                  key={mcq.id}
                  className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs transition-all duration-200 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-indigo-700/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {mcq.topic}
                      </span>
                      {mcq.pageNumber && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {mcq.pageNumber}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleStarMCQ(mcq.id)}
                      className="rounded-lg p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                      title="Unstar MCQ"
                    >
                      <Star className="h-4 w-4 fill-amber-500" />
                    </button>
                  </div>

                  {/* Stem */}
                  <div className="mt-3">
                    <p className="text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                      <span className="text-indigo-600 dark:text-indigo-400 mr-1.5">Q{qIdx + 1}.</span>
                      {mcq.stem}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {mcq.options.map((option, optIdx) => {
                      const isSelected = selectedOpt === optIdx;
                      const isOptionCorrect = optIdx === mcq.correctIndex;

                      let btnStyle =
                        'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800';

                      if (isAnswered) {
                        if (isOptionCorrect) {
                          btnStyle =
                            'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500/30';
                        } else if (isSelected) {
                          btnStyle =
                            'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200';
                        } else {
                          btnStyle = 'opacity-60 border-slate-200 dark:border-slate-800';
                        }
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => selectMCQOption(mcq.id, optIdx)}
                          className={`flex items-start gap-2.5 rounded-xl border p-3 text-left text-xs transition-all ${btnStyle}`}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-[11px] font-bold dark:bg-slate-800">
                            {OPTION_LETTERS[optIdx]}
                          </span>
                          <span className="leading-snug">{option}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Instant Feedback & Rationale */}
                  {isAnswered && (
                    <div className="mt-4 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/90 p-4 text-xs dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="flex items-center gap-2">
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" /> Correct (+4)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                            <X className="h-3.5 w-3.5" /> Incorrect (-1)
                          </span>
                        )}
                        <span className="text-slate-500 dark:text-slate-400">
                          Best Answer: Option {OPTION_LETTERS[mcq.correctIndex]}
                        </span>
                      </div>
                      <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                        {mcq.explanation}
                      </p>
                      {mcq.distractorNotes && (
                        <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <strong>Distractor Analysis:</strong> {mcq.distractorNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
