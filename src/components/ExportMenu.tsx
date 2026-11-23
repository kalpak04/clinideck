import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileJson, Printer, ChevronDown } from 'lucide-react';
import type { StudyDeck } from '../types/study';
import { exportDeckToAnkiCsv, exportDeckToJson } from '../utils/storage';

interface ExportMenuProps {
  deck: StudyDeck;
  onNotify: (message: string) => void;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ deck, onNotify }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Export</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-[#111827]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              exportDeckToAnkiCsv(deck);
              setOpen(false);
              onNotify('Exported Anki-ready flashcards CSV.');
            }}
            className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Export Anki CSV
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Front, Back, Pearls &amp; Tags
              </p>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              exportDeckToJson(deck);
              setOpen(false);
              onNotify('Downloaded full JSON deck backup.');
            }}
            className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Export Deck Backup (JSON)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                All cards, Q&amp;As, MCQs &amp; progress
              </p>
            </div>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.setTimeout(() => window.print(), 100);
            }}
            className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" />
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Print Rapid Revision Sheet
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Save clean printable PDF handout
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
