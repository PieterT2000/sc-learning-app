import seedQuestions from './seed.json';

const STORAGE_KEY = 'catechism-voice-progress-v1';
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

export interface CatechismQuestion {
  id: number;
  question: string;
  answer: string;
}

const allQuestions = seedQuestions as CatechismQuestion[];

/**
 * Picks the next batch of questions for a session: starts at the first
 * not-yet-mastered question (by id order) so sessions roughly continue
 * where the last one left off, and wraps back to the start once everything
 * is mastered (for ongoing review). This is a simple sequential picker, not
 * real spaced repetition - deliberately out of scope for this stage.
 */
export function getSessionQuestions(sessionSize: number): CatechismQuestion[] {
  const state = loadProgress();
  const total = allQuestions.length;
  if (total === 0) return [];

  const startIndex = allQuestions.findIndex(
    (q) => (state.bestScores[q.id] ?? 0) < MASTERY_THRESHOLD
  );
  const start = startIndex === -1 ? 0 : startIndex;

  const batch: CatechismQuestion[] = [];
  const size = Math.min(sessionSize, total);
  for (let i = 0; i < size; i++) {
    batch.push(allQuestions[(start + i) % total]);
  }
  return batch;
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
