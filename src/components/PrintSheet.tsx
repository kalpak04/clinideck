import React from 'react';
import type { StudyDeck } from '../types/study';

interface PrintSheetProps {
  deck: StudyDeck;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export const PrintSheet: React.FC<PrintSheetProps> = ({ deck }) => {
  return (
    <div className="hidden print-only bg-white p-8 text-slate-900">
      <header className="border-b border-slate-300 pb-4">
        <p className="text-xs font-medium text-slate-600">
          CliniDeck Rapid Revision Sheet · {deck.subject} · Source: {deck.fileName}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{deck.title}</h1>
        {deck.summary && (
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{deck.summary}</p>
        )}
      </header>

      {deck.flashcards.length > 0 && (
        <section className="mt-6">
          <h2 className="border-b border-slate-200 pb-1 font-display text-lg font-bold">
            01. High-Yield Flashcards ({deck.flashcards.length})
          </h2>
          <div className="mt-3 space-y-3">
            {deck.flashcards.map((card, i) => (
              <div
                key={card.id}
                className="print-break-avoid border-b border-slate-200 pb-3 text-sm"
              >
                <p className="text-xs text-slate-500">
                  #{i + 1} ·{' '}
                  {card.format === 'clinical_vignette' ? 'Clinical Vignette' : 'Exam One-Liner'} ·{' '}
                  {card.topic}
                  {card.pageNumber ? ` · ${card.pageNumber}` : ''}
                </p>
                <p className="mt-1 font-semibold">{card.front}</p>
                <p className="mt-1 text-slate-800">
                  <strong>Answer:</strong> {card.back}
                </p>
                {card.clinicalPearl && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    <strong>Pearl:</strong> {card.clinicalPearl}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {deck.qaItems.length > 0 && (
        <section className="mt-8">
          <h2 className="border-b border-slate-200 pb-1 font-display text-lg font-bold">
            02. Comprehensive Q&amp;A Bank ({deck.qaItems.length})
          </h2>
          <div className="mt-3 space-y-3">
            {deck.qaItems.map((qa, i) => (
              <div
                key={qa.id}
                className="print-break-avoid border-b border-slate-200 pb-3 text-sm"
              >
                <p className="font-semibold">
                  Q{i + 1}. {qa.question}
                </p>
                <p className="mt-1 text-slate-800">{qa.answer}</p>
                {qa.highYieldClue && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    <strong>Key Clue:</strong> {qa.highYieldClue}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {deck.mcqs.length > 0 && (
        <section className="mt-8">
          <h2 className="border-b border-slate-200 pb-1 font-display text-lg font-bold">
            03. Practice MCQs &amp; Answer Key ({deck.mcqs.length})
          </h2>
          <div className="mt-3 space-y-4">
            {deck.mcqs.map((mcq, i) => (
              <div
                key={mcq.id}
                className="print-break-avoid border-b border-slate-200 pb-3 text-sm"
              >
                <p className="font-semibold">
                  {i + 1}. {mcq.stem}
                </p>
                <ul className="mt-1.5 space-y-0.5 pl-4 text-xs">
                  {mcq.options.map((opt, idx) => (
                    <li key={idx}>
                      {LETTERS[idx]}. {opt}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs">
                  <strong>Answer: {LETTERS[mcq.correctIndex]}</strong> — {mcq.explanation}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
