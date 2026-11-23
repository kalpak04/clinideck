import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
  Star,
} from 'lucide-react';
import type { ConceptFormat, QAItem } from '../types/study';

interface QABankViewProps {
  items: QAItem[];
  keyTopics: string[];
  isExpanding: boolean;
  onToggleRevised: (qaId: string) => void;
  onToggleStar: (qaId: string) => void;
  onExpandDeck: () => void;
}

const ITEMS_PER_PAGE = 25;

export const QABankView: React.FC<QABankViewProps> = ({
  items,
  keyTopics,
  isExpanding,
  onToggleRevised,
  onToggleStar,
  onExpandDeck,
}) => {
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | ConceptFormat>('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [hideRevised, setHideRevised] = useState(false);
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);
  const [page, setPage] = useState(1);

  const availableTopics = useMemo(() => {
    const set = new Set<string>(keyTopics);
    items.forEach((item) => {
      if (item.topic) set.add(item.topic);
    });
    return Array.from(set);
  }, [items, keyTopics]);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.sourceFile) set.add(item.sourceFile);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (formatFilter !== 'all' && item.format !== formatFilter) return false;
      if (topicFilter !== 'all' && item.topic !== topicFilter) return false;
      if (sourceFilter !== 'all' && item.sourceFile !== sourceFilter) return false;
      if (hideRevised && item.revised) return false;
      if (onlyStarred && !item.starred) return false;
      if (q) {
        const haystack =
          `${item.question} ${item.answer} ${item.highYieldClue} ${item.topic} ${item.pageNumber || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, formatFilter, topicFilter, sourceFilter, hideRevised, search]);

  useEffect(() => {
    setPage(1);
  }, [search, formatFilter, topicFilter, sourceFilter, hideRevised, onlyStarred]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * ITEMS_PER_PAGE;
  const pageItems = filteredItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const isItemOpen = (id: string): boolean => {
    if (id in expandedIds) return expandedIds[id];
    return allExpanded;
  };

  const toggleItem = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !isItemOpen(id) }));
  };

  const toggleAllAnswers = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    setExpandedIds({});
  };

  const revisedCount = items.filter((i) => i.revised).length;
  const vignetteCount = items.filter((i) => i.format === 'clinical_vignette').length;
  const oneLinerCount = items.filter((i) => i.format === 'exam_one_liner').length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search concepts, drugs, signs, or page (e.g. p. 42)..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter Q&A format"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80"
          >
            {(
              [
                { id: 'all', label: `All (${items.length})` },
                { id: 'clinical_vignette', label: `Vignettes (${vignetteCount})` },
                { id: 'exam_one_liner', label: `One-Liners (${oneLinerCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormatFilter(opt.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  formatFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {availableSources.length > 1 && (
            <select
              aria-label="Filter Q&A by source PDF"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
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

          {availableTopics.length > 1 && (
            <select
              aria-label="Filter Q&A by topic"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="max-w-[170px] truncate rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
            >
              <option value="all">All Topics ({availableTopics.length})</option>
              {availableTopics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Sub-toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Revised:{' '}
            <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {revisedCount}/{items.length}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setHideRevised((prev) => !prev)}
            className={`font-medium transition-colors ${
              hideRevised
                ? 'text-sky-700 dark:text-sky-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {hideRevised ? 'Showing Unrevised Only' : 'Hide Revised'}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setOnlyStarred((prev) => !prev)}
            className={`inline-flex items-center gap-1 font-medium transition-colors ${
              onlyStarred
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <Star className={`h-3 w-3 ${onlyStarred ? 'fill-amber-500 text-amber-500' : ''}`} />
            <span>Marked ({items.filter((i) => i.starred).length})</span>
          </button>
          {filteredItems.length > ITEMS_PER_PAGE && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Showing {startIdx + 1}–{Math.min(startIdx + ITEMS_PER_PAGE, filteredItems.length)}{' '}
                of {filteredItems.length}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleAllAnswers}
            className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 whitespace-nowrap"
          >
            {allExpanded ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{allExpanded ? 'Hide All Answers' : 'Reveal All Answers'}</span>
          </button>

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
            <span>{isExpanding ? 'Expanding...' : 'Generate Extra Q&A'}</span>
          </button>
        </div>
      </div>

      {/* Q&A List */}
      {pageItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-[#111827]">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No Q&amp;A entries match your search
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Try clearing your search term or switching back to all concepts.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setFormatFilter('all');
              setTopicFilter('all');
              setSourceFilter('all');
              setHideRevised(false);
            }}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-slate-800 dark:bg-[#111827] dark:divide-slate-800">
            {pageItems.map((item, idx) => {
              const open = isItemOpen(item.id);
              const globalIdx = startIdx + idx + 1;
              return (
                <article key={item.id} className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-md"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500">
                          Q{String(globalIdx).padStart(2, '0')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-sky-700 dark:text-sky-400">
                          {item.format === 'clinical_vignette'
                            ? 'Clinical Vignette'
                            : 'Exam One-Liner'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.topic}</span>
                        {item.pageNumber && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {item.pageNumber}
                            </span>
                          </>
                        )}
                        {availableSources.length > 1 && item.sourceFile && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="max-w-[160px] truncate">{item.sourceFile}</span>
                          </>
                        )}
                      </div>

                      <h3 className="mt-2 max-w-[70ch] font-sans text-[15px] font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                        {item.question}
                      </h3>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onToggleRevised(item.id)}
                        aria-label={item.revised ? 'Mark as unrevised' : 'Mark as revised'}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          item.revised
                            ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {item.revised ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0" />
                        )}
                        <span className="hidden sm:inline">
                          {item.revised ? 'Revised' : 'Mark Revised'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleStar(item.id)}
                        aria-label={item.starred ? 'Unstar question' : 'Star high-yield question'}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                          item.starred
                            ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800'
                        }`}
                        title={item.starred ? 'Starred for review' : 'Star question'}
                      >
                        <Star className={`h-4 w-4 ${item.starred ? 'fill-amber-500' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleItem(item.id)}
                        aria-label={open ? 'Hide answer' : 'Reveal answer'}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        {open ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/80">
                      <p className="max-w-[70ch] text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                        {item.answer}
                      </p>
                      {item.highYieldClue && (
                        <p className="mt-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                          <span className="font-semibold">High-Yield Clue:</span>{' '}
                          {item.highYieldClue}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Pagination Bar for Large Decks */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous Page</span>
              </button>

              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                Page {safePage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span>Next Page</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
