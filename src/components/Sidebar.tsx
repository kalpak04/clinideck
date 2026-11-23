import React, { useRef, useState } from 'react';
import {
  FileUp,
  Sun,
  Moon,
  Trash2,
  Pencil,
  Check,
  X,
  Upload,
  Stethoscope,
  PanelLeftClose,
  Star,
} from 'lucide-react';
import type { StudyDeck } from '../types/study';

interface SidebarProps {
  decks: StudyDeck[];
  activeDeckId: string | null;
  theme: 'light' | 'dark';
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSelectDeck: (id: string) => void;
  onNewUpload: () => void;
  onDeleteDeck: (id: string) => void;
  onRenameDeck: (id: string, newTitle: string) => void;
  onImportJson: (file: File) => void;
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  decks,
  activeDeckId,
  theme,
  isOpenMobile,
  onCloseMobile,
  onSelectDeck,
  onNewUpload,
  onDeleteDeck,
  onRenameDeck,
  onImportJson,
  onToggleTheme,
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startRename = (deck: StudyDeck, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(deck.id);
    setEditValue(deck.title);
    setConfirmDeleteId(null);
  };

  const commitRename = (id: string) => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onRenameDeck(id, trimmed);
    }
    setEditingId(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = '';
    }
  };

  const content = (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827] no-print">
      {/* Brand Wordmark */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
        <button
          type="button"
          onClick={onNewUpload}
          className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-md"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950">
            <Stethoscope className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            CliniDeck
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close library sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:hidden"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Upload Action */}
      <div className="p-4">
        <button
          type="button"
          onClick={() => {
            onNewUpload();
            onCloseMobile();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 dark:focus-visible:ring-offset-[#111827] whitespace-nowrap"
        >
          <FileUp className="h-4 w-4 shrink-0" />
          <span>Upload PDF Notes</span>
        </button>
      </div>

      {/* Saved Study Decks List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-2 flex items-center justify-between px-2 pt-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Saved Decks
          </span>
          <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
            {decks.length}
          </span>
        </div>

        {decks.length === 0 ? (
          <div className="px-2 py-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Your generated NEET PG decks will be stored locally in this browser for instant offline revision.
          </div>
        ) : (
          <ul className="space-y-1">
            {decks.map((deck) => {
              const isActive = deck.id === activeDeckId;
              const masteredCount = deck.flashcards.filter(
                (c) => c.confidence === 'mastered'
              ).length;
              const totalCards = deck.flashcards.length;
              const pct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

              return (
                <li key={deck.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (editingId !== deck.id) {
                        onSelectDeck(deck.id);
                        onCloseMobile();
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && editingId !== deck.id) {
                        e.preventDefault();
                        onSelectDeck(deck.id);
                        onCloseMobile();
                      }
                    }}
                    className={`group relative rounded-lg px-3 py-2.5 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      isActive
                        ? 'bg-sky-50/90 text-slate-900 dark:bg-sky-950/50 dark:text-slate-100'
                        : 'text-slate-700 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {editingId === deck.id ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(deck.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          aria-label="Rename deck"
                          className="w-full rounded border border-sky-400 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none dark:border-sky-500 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => commitRename(deck.id)}
                          aria-label="Save deck name"
                          className="p-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel rename"
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm leading-snug line-clamp-2 ${
                              isActive ? 'font-semibold' : 'font-medium'
                            }`}
                          >
                            {deck.title}
                          </p>

                          <div
                            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {confirmDeleteId === deck.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteDeck(deck.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  aria-label="Confirm delete deck"
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  aria-label="Cancel delete"
                                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => startRename(deck, e)}
                                  aria-label={`Rename ${deck.title}`}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(deck.id)}
                                  aria-label={`Delete ${deck.title}`}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Clean unboxed inline metadata */}
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="truncate">{deck.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums whitespace-nowrap">
                            {totalCards} cards
                          </span>
                          {(() => {
                            const markedCount =
                              deck.flashcards.filter((c) => c.starred).length +
                              deck.qaItems.filter((q) => q.starred).length +
                              deck.mcqs.filter((m) => m.starred).length;
                            return markedCount > 0 ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-mono text-[11px] font-semibold">
                                  <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                                  {markedCount}
                                </span>
                              </>
                            ) : null;
                          })()}
                          {deck.sourceFiles && deck.sourceFiles.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums whitespace-nowrap">
                                {deck.sourceFiles.reduce(
                                  (sum, sf) => sum + sf.coveredPages.length,
                                  0
                                )}{' '}
                                pp
                              </span>
                            </>
                          )}
                        </div>

                        {/* Subtle mastery bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-emerald-600 transition-transform duration-300 dark:bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                            {pct}%
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sidebar Footer: Import JSON & Theme Toggle */}
      <div className="border-t border-slate-200 p-3 dark:border-slate-800 space-y-1.5">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 whitespace-nowrap"
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          <span>Import Deck JSON</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 whitespace-nowrap"
        >
          <span className="flex items-center gap-2.5">
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            )}
            <span>{theme === 'dark' ? 'Switch to Daylight' : 'Switch to Dark Mode'}</span>
          </span>
          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block lg:h-screen lg:sticky lg:top-0">{content}</div>

      {/* Mobile slide-over drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
