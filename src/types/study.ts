export type ConceptFormat = 'clinical_vignette' | 'exam_one_liner';

export type ConfidenceLevel = 'unseen' | 'again' | 'review' | 'mastered';

export type ExtractionFocus = 'balanced' | 'clinical_vignettes' | 'rapid_revision';

export type ExtractionDensity = 'standard' | 'exhaustive' | 'ultra_dense';

export type MultiPdfMode = 'merge' | 'separate';

export type StudyMode = 'flashcards' | 'qa' | 'mcq' | 'marked';

export interface SourceFileCoverage {
  name: string;
  totalPages: number;
  coveredPages: number[];
}

export interface Flashcard {
  id: string;
  format: ConceptFormat;
  topic: string;
  front: string;
  back: string;
  clinicalPearl: string;
  confidence: ConfidenceLevel;
  starred: boolean;
  sourceFile?: string;
  pageNumber?: string;
}

export interface QAItem {
  id: string;
  format: ConceptFormat;
  topic: string;
  question: string;
  answer: string;
  highYieldClue: string;
  revised: boolean;
  starred?: boolean;
  sourceFile?: string;
  pageNumber?: string;
}

export interface MCQItem {
  id: string;
  format: ConceptFormat;
  topic: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  distractorNotes: string;
  starred?: boolean;
  sourceFile?: string;
  pageNumber?: string;
}

export interface QuizAttempt {
  id: string;
  completedAt: string;
  mode: 'practice' | 'exam';
  correctCount: number;
  totalCount: number;
  durationSeconds: number;
}

export interface StudyDeck {
  id: string;
  title: string;
  fileName: string;
  subject: string;
  createdAt: string;
  summary: string;
  keyTopics: string[];
  flashcards: Flashcard[];
  qaItems: QAItem[];
  mcqs: MCQItem[];
  quizHistory: QuizAttempt[];
  sourceFiles?: SourceFileCoverage[];
  extractionDensity?: ExtractionDensity;
  isSample?: boolean;
}

export interface QueuedPdfInput {
  id: string;
  file: File;
  totalPages: number;
  selectedPages: number[];
  pageRangeInput: string;
}

export interface FailedBatchInfo {
  batchId: string;
  fileId: string;
  fileName: string;
  pages: number[];
  targetDeckId: string;
  error: string;
}

export interface ExtractionJobProgress {
  status: 'running' | 'paused' | 'completed' | 'stopped';
  density: ExtractionDensity;
  focus: ExtractionFocus;
  multiPdfMode: MultiPdfMode;
  totalBatches: number;
  completedBatches: number;
  failedBatches: FailedBatchInfo[];
  totalPages: number;
  completedPages: number;
  cardsAdded: number;
  qaAdded: number;
  mcqsAdded: number;
  currentLabel: string;
  sessionAlert?: string;
  currentPacingSeconds?: number;
  activeModelLabel?: string;
  primaryDeckId: string | null;
  createdDeckIds: string[];
}
