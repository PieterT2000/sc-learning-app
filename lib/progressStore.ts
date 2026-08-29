import seedQuestions from './seed.json';
import { DEFAULT_FEEDBACK_LEVEL, type FeedbackLevel } from './feedbackLevels';
import { ALL_SET_ID } from './questionSets';

const STORAGE_KEY = 'catechism-voice-progress-v1';
const SETTINGS_KEY = 'catechism-voice-settings-v1';
const MASTERY_THRESHOLD = 90; // score percent at/above which a question counts as "mastered"

export interface ProgressState {
  streak: number;
  lastCompletedDate: string | null; // YYYY-MM-DD, local date of last full session
  bestScores: Record<number, number>; // question id -> best score percent ever recorded
}

const DEFAULT_STATE: ProgressState = {
  streak: 0,
  lastCompletedDate: null,
  bestScores: {},
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

export function loadProgress(): ProgressState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function save(state: ProgressState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Call after every scored answer, regardless of session outcome. */
export function recordAnswer(questionId: number, scorePercent: number): ProgressState {
  const state = loadProgress();
  const prevBest = state.bestScores[questionId] ?? 0;
  if (scorePercent > prevBest) {
    state.bestScores = { ...state.bestScores, [questionId]: scorePercent };
    save(state);
  }
  return state;
}

/** Call once when a full session (all questions in the batch) finishes. */
export function recordSessionComplete(): ProgressState {
  const state = loadProgress();
  const today = todayKey();

  if (state.lastCompletedDate === today) {
    // Already logged today - don't double-count a streak for a second session same day.
    return state;
  }

  if (state.lastCompletedDate && daysBetween(state.lastCompletedDate, today) === 1) {
    state.streak += 1;
  } else {
    state.streak = 1; // first session ever, or the streak lapsed
  }
  state.lastCompletedDate = today;
  save(state);
  return state;
}

export function getMasteredCount(state: ProgressState): number {
  return Object.values(state.bestScores).filter((score) => score >= MASTERY_THRESHOLD).length;
}

// --- settings (kept separate from progress) -----------------------------

export interface Settings {
  feedbackLevel: FeedbackLevel;
  /** id of the chosen question set (see lib/questionSets.ts). */
  questionSetId: string;
}

const DEFAULT_SETTINGS: Settings = {
  feedbackLevel: DEFAULT_FEEDBACK_LEVEL,
  questionSetId: ALL_SET_ID,
};

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
  return next;
}

export interface CatechismQuestion {
  id: number;
  question: string;
  answer: string;
}

const allQuestions = seedQuestions as CatechismQuestion[];

/**
 * Returns the questions for a session: every question in the chosen set,
 * rotated to start at the first not-yet-mastered one so you resume roughly
 * where you left off. A session is the whole set now - no fixed cap.
 *
 * `allowedIds`, when given, restricts the pool to those question ids (the
 * user's chosen question set - see lib/questionSets.ts).
 */
export function getSessionQuestions(allowedIds?: number[]): CatechismQuestion[] {
  const state = loadProgress();
  const allow = allowedIds && allowedIds.length > 0 ? new Set(allowedIds) : null;
  const pool = allow ? allQuestions.filter((q) => allow.has(q.id)) : allQuestions;
  const total = pool.length;
  if (total === 0) return [];

  const startIndex = pool.findIndex((q) => (state.bestScores[q.id] ?? 0) < MASTERY_THRESHOLD);
  const start = startIndex === -1 ? 0 : startIndex;

  return pool.map((_, i) => pool[(start + i) % total]);
}

export function getTotalQuestions(): number {
  return allQuestions.length;
}

export interface Badge {
  emoji: string;
  label: string;
  earned: boolean;
}

/**
 * Badge thresholds are placeholder values to match the wireframe's visual
 * density (a handful earned, a handful not) - not tuned against any real
 * pacing data. Worth revisiting once there's actual usage to look at.
 */
export function getBadges(state: ProgressState): Badge[] {
  const mastered = getMasteredCount(state);
  const total = getTotalQuestions();
  return [
    { emoji: '🔥', label: '3-day streak', earned: state.streak >= 3 },
    { emoji: '📖', label: 'First question mastered', earned: mastered >= 1 },
    { emoji: '⭐', label: '10 mastered', earned: mastered >= 10 },
    { emoji: '🏆', label: '25 mastered', earned: mastered >= 25 },
    { emoji: '👑', label: '50 mastered', earned: mastered >= 50 },
    { emoji: '💎', label: 'All mastered', earned: total > 0 && mastered >= total },
  ];
}
