import type { StudyDeck, ConceptFormat, ConfidenceLevel } from '../types/study';

const LEGACY_LOCALSTORAGE_KEY = 'clinideck_decks_v1';
const THEME_STORAGE_KEY = 'clinideck_theme';
const IDB_NAME = 'clinideck_db';
const IDB_VERSION = 1;
const IDB_STORE = 'decks';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDeckDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

function loadLegacyLocalStorageDecks(): StudyDeck[] {
  try {
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StudyDeck[]) : [];
  } catch {
    return [];
  }
}

export async function loadDecksFromDb(): Promise<StudyDeck[]> {
  try {
    const db = await openDeckDatabase();
    const existing = await new Promise<StudyDeck[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve((req.result as StudyDeck[]) || []);
      req.onerror = () => reject(req.error);
    });

    // Seamless one-time migration from legacy localStorage
    const legacy = loadLegacyLocalStorageDecks();
    if (legacy.length > 0) {
      const existingIds = new Set(existing.map((d) => d.id));
      const toMigrate = legacy.filter((d) => !existingIds.has(d.id));
      if (toMigrate.length > 0) {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        for (const deck of toMigrate) {
          store.put(deck);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        existing.push(...toMigrate);
      }
      try {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      } catch {
        // Ignore
      }
    }

    return existing.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    // Graceful fallback if IndexedDB is blocked
    return loadLegacyLocalStorageDecks();
  }
}

export async function saveDeckToDb(deck: StudyDeck): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await openDeckDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(deck);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return { ok: true };
  } catch {
    try {
      const existing = loadLegacyLocalStorageDecks();
      const next = [deck, ...existing.filter((d) => d.id !== deck.id)];
      localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, JSON.stringify(next));
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Could not persist study deck to local browser storage.',
      };
    }
  }
}

export async function deleteDeckFromDb(deckId: string): Promise<void> {
  try {
    const db = await openDeckDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(deckId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      const existing = loadLegacyLocalStorageDecks();
      localStorage.setItem(
        LEGACY_LOCALSTORAGE_KEY,
        JSON.stringify(existing.filter((d) => d.id !== deckId))
      );
    } catch {
      // Ignore
    }
  }
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors in restricted contexts
  }
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

/**
 * Prevents spreadsheet formula injection (CSV injection) when exporting to Excel/Google Sheets/Anki.
 */
function sanitizeCsvCell(value: string): string {
  const clean = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const needsFormulaGuard = /^[=+\-@\t]/.test(clean);
  const safe = needsFormulaGuard ? `'${clean}` : clean;
  return `"${safe.replace(/"/g, '""')}"`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'clinideck'
  );
}

export function exportDeckToAnkiCsv(deck: StudyDeck): void {
  const header = ['Front', 'Back', 'Tags'];
  const rows = deck.flashcards.map((card) => {
    const formatLabel =
      card.format === 'clinical_vignette' ? 'Clinical_Vignette' : 'Exam_One_Liner';
    const backParts = [card.back];
    if (card.clinicalPearl) {
      backParts.push(`Clinical Pearl: ${card.clinicalPearl}`);
    }
    if (card.sourceFile || card.pageNumber) {
      const ref = [card.sourceFile, card.pageNumber].filter(Boolean).join(' · ');
      backParts.push(`Source: ${ref}`);
    }
    const tags = [
      deck.subject.replace(/\s+/g, '_'),
      formatLabel,
      card.topic.replace(/\s+/g, '_'),
      card.pageNumber ? card.pageNumber.replace(/\s+/g, '_') : '',
    ]
      .filter(Boolean)
      .join(' ');
    return [
      sanitizeCsvCell(card.front),
      sanitizeCsvCell(backParts.join('\n\n')),
      sanitizeCsvCell(tags),
    ].join(',');
  });

  const csvContent = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${slugify(deck.title)}-anki-flashcards.csv`);
}

export function exportDeckToJson(deck: StudyDeck): void {
  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    deck,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  triggerDownload(blob, `${slugify(deck.title)}-clinideck.json`);
}

const VALID_FORMATS: ConceptFormat[] = ['clinical_vignette', 'exam_one_liner'];
const VALID_CONFIDENCE: ConfidenceLevel[] = ['unseen', 'again', 'review', 'mastered'];

export function parseImportedDeckJson(rawText: string): StudyDeck {
  const parsed = JSON.parse(rawText);
  const candidate = parsed?.deck && typeof parsed.deck === 'object' ? parsed.deck : parsed;

  if (!candidate || typeof candidate !== 'object' || typeof candidate.title !== 'string') {
    throw new Error('This JSON file is not a valid CliniDeck export.');
  }

  const flashcards = Array.isArray(candidate.flashcards)
    ? candidate.flashcards
        .filter((c: unknown): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c: Record<string, unknown>, idx: number) => ({
          id: typeof c.id === 'string' ? c.id : `fc_imp_${Date.now()}_${idx}`,
          format: VALID_FORMATS.includes(c.format as ConceptFormat)
            ? (c.format as ConceptFormat)
            : 'exam_one_liner',
          topic: String(c.topic || 'General').trim(),
          front: String(c.front || '').trim(),
          back: String(c.back || '').trim(),
          clinicalPearl: String(c.clinicalPearl || '').trim(),
          confidence: VALID_CONFIDENCE.includes(c.confidence as ConfidenceLevel)
            ? (c.confidence as ConfidenceLevel)
            : 'unseen',
          starred: Boolean(c.starred),
          sourceFile: typeof c.sourceFile === 'string' ? c.sourceFile : undefined,
          pageNumber: typeof c.pageNumber === 'string' ? c.pageNumber : undefined,
        }))
        .filter((c: { front: string; back: string }) => c.front && c.back)
    : [];

  const qaItems = Array.isArray(candidate.qaItems)
    ? candidate.qaItems
        .filter((q: unknown): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
        .map((q: Record<string, unknown>, idx: number) => ({
          id: typeof q.id === 'string' ? q.id : `qa_imp_${Date.now()}_${idx}`,
          format: VALID_FORMATS.includes(q.format as ConceptFormat)
            ? (q.format as ConceptFormat)
            : 'exam_one_liner',
          topic: String(q.topic || 'General').trim(),
          question: String(q.question || '').trim(),
          answer: String(q.answer || '').trim(),
          highYieldClue: String(q.highYieldClue || '').trim(),
          revised: Boolean(q.revised),
          starred: Boolean(q.starred),
          sourceFile: typeof q.sourceFile === 'string' ? q.sourceFile : undefined,
          pageNumber: typeof q.pageNumber === 'string' ? q.pageNumber : undefined,
        }))
        .filter((q: { question: string; answer: string }) => q.question && q.answer)
    : [];

  const mcqs = Array.isArray(candidate.mcqs)
    ? candidate.mcqs
        .filter((m: unknown): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
        .map((m: Record<string, unknown>, idx: number) => {
          const opts = Array.isArray(m.options)
            ? m.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
            : [];
          const ci =
            typeof m.correctIndex === 'number' && m.correctIndex >= 0 && m.correctIndex < opts.length
              ? m.correctIndex
              : 0;
          return {
            id: typeof m.id === 'string' ? m.id : `mcq_imp_${Date.now()}_${idx}`,
            format: VALID_FORMATS.includes(m.format as ConceptFormat)
              ? (m.format as ConceptFormat)
              : 'clinical_vignette',
            topic: String(m.topic || 'General').trim(),
            stem: String(m.stem || '').trim(),
            options: opts,
            correctIndex: ci,
            explanation: String(m.explanation || '').trim(),
            distractorNotes: String(m.distractorNotes || '').trim(),
            starred: Boolean(m.starred),
            sourceFile: typeof m.sourceFile === 'string' ? m.sourceFile : undefined,
            pageNumber: typeof m.pageNumber === 'string' ? m.pageNumber : undefined,
          };
        })
        .filter((m: { stem: string; options: string[] }) => m.stem && m.options.length === 4)
    : [];

  if (flashcards.length === 0 && qaItems.length === 0 && mcqs.length === 0) {
    throw new Error('The imported JSON file contains no flashcards, Q&A items, or MCQs.');
  }

  return {
    id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(candidate.title).trim(),
    fileName: String(candidate.fileName || 'Imported Deck.json'),
    subject: String(candidate.subject || 'Medical Sciences'),
    createdAt: new Date().toISOString(),
    summary: String(candidate.summary || ''),
    keyTopics: Array.isArray(candidate.keyTopics)
      ? candidate.keyTopics.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [],
    flashcards,
    qaItems,
    mcqs,
    quizHistory: Array.isArray(candidate.quizHistory) ? candidate.quizHistory : [],
    sourceFiles: Array.isArray(candidate.sourceFiles) ? candidate.sourceFiles : undefined,
    extractionDensity: candidate.extractionDensity,
  };
}
