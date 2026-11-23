import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Shuffle,
  Star,
  Pencil,
  Plus,
  Check,
  X,
  AlertTriangle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import type { ConceptFormat, ConfidenceLevel, Flashcard } from '../types/study';

interface FlashcardsViewProps {
  cards: Flashcard[];
  keyTopics: string[];
  isExpanding: boolean;
  onRateCard: (cardId: string, confidence: ConfidenceLevel) => void;
  onToggleStar: (cardId: string) => void;
  onUpdateCard: (card: Flashcard) => void;
  onAddCard: (card: Omit<Flashcard, 'id' | 'confidence' | 'starred'>) => void;
  onExpandDeck: () => void;
}

type FormatFilter = 'all' | ConceptFormat | 'needs_review' | 'starred';

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  cards,
  keyTopics,
  isExpanding,
  onRateCard,
  onToggleStar,
  onUpdateCard,
  onAddCard,
  onExpandDeck,
}) => {
  const [filter, setFilter] = useState<FormatFilter>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Inline Edit / Add Modal state
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [draftFront, setDraftFront] = useState('');
  const [draftBack, setDraftBack] = useState('');
  const [draftPearl, setDraftPearl] = useState('');
  const [draftTopic, setDraftTopic] = useState('');
  const [draftFormat, setDraftFormat] = useState<ConceptFormat>('clinical_vignette');

  const availableTopics = useMemo(() => {
    const set = new Set<string>(keyTopics);
    cards.forEach((c) => {
      if (c.topic) set.add(c.topic);
    });
    return Array.from(set);
  }, [cards, keyTopics]);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.sourceFile) set.add(c.sourceFile);
    });
    return Array.from(set);
  }, [cards]);

  const filteredCards = useMemo(() => {
    let list = cards.filter((card) => {
      if (filter === 'clinical_vignette' && card.format !== 'clinical_vignette') return false;
      if (filter === 'exam_one_liner' && card.format !== 'exam_one_liner') return false;
      if (
        filter === 'needs_review' &&
        card.confidence !== 'again' &&
        card.confidence !== 'review'
      ) {
        return false;
      }
      if (filter === 'starred' && !card.starred) return false;
      if (topicFilter !== 'all' && card.topic !== topicFilter) return false;
      if (sourceFilter !== 'all' && card.sourceFile !== sourceFilter) return false;
      return true;
    });

    if (shuffleSeed > 0) {
      list = [...list];
      let seed = shuffleSeed;
      for (let i = list.length - 1; i > 0; i--) {
        seed = (seed * 9301 + 49297) % 233280;
        const j = seed % (i + 1);
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    return list;
  }, [cards, filter, topicFilter, sourceFilter, shuffleSeed]);

  const safeIndex = filteredCards.length > 0 ? Math.min(currentIndex, filteredCards.length - 1) : 0;
  const activeCard = filteredCards[safeIndex] ?? null;

  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [filter, topicFilter, sourceFilter, shuffleSeed]);

  // Keyboard shortcuts (Space: flip, Left/Right: navigate, 1/2/3: rate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCard || isAddingCard) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (!activeCard) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsFlipped(false);
        setCurrentIndex((prev) => (prev + 1 < filteredCards.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsFlipped(false);
        setCurrentIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCards.length - 1));
      } else if (isFlipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault();
        const level: ConfidenceLevel =
          e.key === '1' ? 'again' : e.key === '2' ? 'review' : 'mastered';
        handleRateAndAdvance(activeCard.id, level);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleRateAndAdvance = (cardId: string, level: ConfidenceLevel) => {
    onRateCard(cardId, level);
    setIsFlipped(false);
    if (safeIndex + 1 < filteredCards.length) {
      setCurrentIndex(safeIndex + 1);
    }
  };

  const openEditModal = (card: Flashcard) => {
    setEditingCard(card);
    setDraftFront(card.front);
    setDraftBack(card.back);
    setDraftPearl(card.clinicalPearl);
    setDraftTopic(card.topic);
    setDraftFormat(card.format);
  };

  const openAddModal = () => {
    setIsAddingCard(true);
    setDraftFront('');
    setDraftBack('');
    setDraftPearl('');
    setDraftTopic(availableTopics[0] || 'High-Yield Concept');
    setDraftFormat('clinical_vignette');
  };

  const saveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftFront.trim() || !draftBack.trim()) return;

    if (editingCard) {
      onUpdateCard({
        ...editingCard,
        front: draftFront.trim(),
        back: draftBack.trim(),
        clinicalPearl: draftPearl.trim(),
        topic: draftTopic.trim() || 'General',
        format: draftFormat,
      });
      setEditingCard(null);
    } else if (isAddingCard) {
      onAddCard({
        front: draftFront.trim(),
        back: draftBack.trim(),
        clinicalPearl: draftPearl.trim(),
        topic: draftTopic.trim() || 'General',
        format: draftFormat,
      });
      setIsAddingCard(false);
    }
  };

  const masteredCount = cards.filter((c) => c.confidence === 'mastered').length;
  const reviewCount = cards.filter(
    (c) => c.confidence === 'again' || c.confidence === 'review'
  ).length;
  const vignetteCount = cards.filter((c) => c.format === 'clinical_vignette').length;
  const oneLinerCount = cards.filter((c) => c.format === 'exam_one_liner').length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Filter & Utility Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter flashcards"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
        >
          {(
            [
              { id: 'all', label: `All (${cards.length})` },
              { id: 'clinical_vignette', label: `Vignettes (${vignetteCount})` },
              { id: 'exam_one_liner', label: `One-Liners (${oneLinerCount})` },
              { id: 'needs_review', label: `Review (${reviewCount})` },
              { id: 'starred', label: 'Starred' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === item.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availableSources.length > 1 && (
            <select
              aria-label="Filter by source PDF"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="max-w-[180px] truncate rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
            >
              <option value="all">All Source PDFs</option>
              {availableSources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          )}

          {availableTopics.length > 1 && (
            <select
              aria-label="Filter by topic"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="max-w-[180px] truncate rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
            >
              <option value="all">All Topics ({availableTopics.length})</option>
              {availableTopics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShuffleSeed((s) => (s === 0 ? Date.now() : 0))}
            title={shuffleSeed > 0 ? 'Restore original order' : 'Shuffle cards'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              shuffleSeed > 0
                ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span>{shuffleSeed > 0 ? 'Shuffled' : 'Shuffle'}</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Card</span>
          </button>
        </div>
      </div>

      {/* Mastery Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Mastered:{' '}
            <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {masteredCount}/{cards.length}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Needs Review:{' '}
            <strong className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {reviewCount}
            </strong>
          </span>
          {filteredCards.length > 20 && (
            <>
              <span aria-hidden="true">·</span>
              <label className="inline-flex items-center gap-1.5">
                <span>Jump to:</span>
                <input
                  type="number"
                  min={1}
                  max={filteredCards.length}
                  value={safeIndex + 1}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= filteredCards.length) {
                      setIsFlipped(false);
                      setCurrentIndex(n - 1);
                    }
                  }}
                  aria-label="Jump to flashcard number"
                  className="w-16 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onExpandDeck}
          disabled={isExpanding}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 disabled:opacity-50 dark:text-sky-400 dark:hover:text-sky-300 whitespace-nowrap shrink-0"
        >
          {isExpanding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>{isExpanding ? 'Generating more concepts...' : 'Generate Extra Cards'}</span>
        </button>
      </div>

      {/* Main Flashcard Stage */}
      {!activeCard ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-[#111827]">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No flashcards match this filter
          </p>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Switch back to All cards or clear your filters to continue studying.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setTopicFilter('all');
              setSourceFilter('all');
            }}
            className="mt-5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950"
          >
            Show All Flashcards
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Interactive 3D Flip Card */}
          <div className="card-scene">
            <div className={`card-flipper grid min-h-[360px] ${isFlipped ? 'is-flipped' : ''}`}>
              {/* FRONT FACE */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Flashcard front — click or press Space to reveal answer"
                onClick={() => setIsFlipped(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsFlipped(true);
                }}
                className="card-face col-start-1 row-start-1 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-7 transition-colors hover:border-slate-300 cursor-pointer dark:border-slate-800 dark:bg-[#111827] dark:hover:border-slate-700 sm:p-9"
              >
                {/* Top Metadata Line (Zero-Pill Discipline) */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-sky-700 dark:text-sky-400">
                      {activeCard.format === 'clinical_vignette'
                        ? 'Clinical Vignette'
                        : 'Exam One-Liner'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCard.topic}</span>
                    {activeCard.pageNumber && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {activeCard.pageNumber}
                        </span>
                      </>
                    )}
                    {availableSources.length > 1 && activeCard.sourceFile && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="max-w-[160px] truncate">{activeCard.sourceFile}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Card {String(safeIndex + 1).padStart(2, '0')} /{' '}
                      {String(filteredCards.length).padStart(2, '0')}
                    </span>
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleStar(activeCard.id)}
                      aria-label={activeCard.starred ? 'Remove star' : 'Star high-yield card'}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                        activeCard.starred
                          ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Star
                        className="h-4 w-4"
                        fill={activeCard.starred ? 'currentColor' : 'none'}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(activeCard)}
                      aria-label="Edit flashcard"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Question / Clinical Stem */}
                <div className="my-auto py-6">
                  <p className="max-w-[65ch] text-lg font-medium leading-relaxed text-slate-900 dark:text-slate-100 sm:text-[19px]">
                    {activeCard.front}
                  </p>
                </div>

                {/* Bottom Hint */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                  <span>Click card or press Space to reveal answer</span>
                  {activeCard.confidence !== 'unseen' && (
                    <span className="font-medium capitalize text-slate-600 dark:text-slate-300">
                      Status:{' '}
                      {activeCard.confidence === 'again' ? 'Needs Repeat' : activeCard.confidence}
                    </span>
                  )}
                </div>
              </div>

              {/* BACK FACE */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Flashcard back — click to flip back to prompt"
                onClick={() => setIsFlipped(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsFlipped(false);
                }}
                className="card-face card-face-back col-start-1 row-start-1 flex flex-col justify-between rounded-xl border border-sky-200 bg-white p-7 cursor-pointer dark:border-sky-900/70 dark:bg-[#111827] sm:p-9"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      High-Yield Answer
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCard.topic}</span>
                    {activeCard.pageNumber && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{activeCard.pageNumber}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFlipped(false);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Show Prompt</span>
                  </button>
                </div>

                <div className="my-auto space-y-5 py-5">
                  <p className="max-w-[65ch] text-lg font-semibold leading-relaxed text-slate-900 dark:text-slate-100 sm:text-[19px]">
                    {activeCard.back}
                  </p>

                  {activeCard.clinicalPearl && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Clinical Pearl &amp; Exam Differentiator
                      </p>
                      <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {activeCard.clinicalPearl}
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                  Rate recall below (keys 1, 2, 3) to update mastery progress
                </div>
              </div>
            </div>
          </div>

          {/* Navigation & Confidence Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsFlipped(false);
                  setCurrentIndex((prev) =>
                    prev - 1 >= 0 ? prev - 1 : filteredCards.length - 1
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFlipped((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <span>{isFlipped ? 'Show Prompt' : 'Reveal Answer'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsFlipped(false);
                  setCurrentIndex((prev) =>
                    prev + 1 < filteredCards.length ? prev + 1 : 0
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Dual-coded Confidence Rating Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRateAndAdvance(activeCard.id, 'again')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeCard.confidence === 'again'
                    ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:text-red-700 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:border-red-800 dark:hover:text-red-300'
                }`}
              >
                <X className="h-3.5 w-3.5" />
                <span>Again (1)</span>
              </button>

              <button
                type="button"
                onClick={() => handleRateAndAdvance(activeCard.id, 'review')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeCard.confidence === 'review'
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:text-amber-800 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:border-amber-800 dark:hover:text-amber-300'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Review (2)</span>
              </button>

              <button
                type="button"
                onClick={() => handleRateAndAdvance(activeCard.id, 'mastered')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeCard.confidence === 'mastered'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-800 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:border-emerald-800 dark:hover:text-emerald-300'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                <span>Mastered (3)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add Flashcard Modal */}
      {(editingCard || isAddingCard) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={() => {
            setEditingCard(null);
            setIsAddingCard(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111827]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingCard ? 'Edit Flashcard' : 'Add Custom Flashcard'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingCard(null);
                  setIsAddingCard(false);
                }}
                aria-label="Close modal"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveModal} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Format
                  </label>
                  <select
                    value={draftFormat}
                    onChange={(e) => setDraftFormat(e.target.value as ConceptFormat)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="clinical_vignette">Clinical Vignette</option>
                    <option value="exam_one_liner">Exam One-Liner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Topic
                  </label>
                  <input
                    type="text"
                    value={draftTopic}
                    onChange={(e) => setDraftTopic(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Prompt / Clinical Vignette
                </label>
                <textarea
                  rows={3}
                  required
                  value={draftFront}
                  onChange={(e) => setDraftFront(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  High-Yield Answer
                </label>
                <textarea
                  rows={2}
                  required
                  value={draftBack}
                  onChange={(e) => setDraftBack(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Clinical Pearl / Differentiator (optional)
                </label>
                <textarea
                  rows={2}
                  value={draftPearl}
                  onChange={(e) => setDraftPearl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCard(null);
                    setIsAddingCard(false);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950"
                >
                  {editingCard ? 'Save Changes' : 'Add Flashcard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
