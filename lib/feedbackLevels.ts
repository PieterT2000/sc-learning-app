/**
 * How much the app tells you after each attempt, chosen on the Home screen
 * and remembered in localStorage (see progressStore.ts). This only changes
 * what's *spoken* in hands-free mode and whether the correct answer is read
 * back - the on-screen result (verdict + green/red diff) is always shown.
 *
 * In hands-free mode any of these can be cut short by saying "next question"
 * (or tapping Next) while it's playing.
 */
export type FeedbackLevel = 'brief' | 'full' | 'repeat' | 'full-repeat';

export const DEFAULT_FEEDBACK_LEVEL: FeedbackLevel = 'full';

export const FEEDBACK_LEVELS: ReadonlyArray<{
  id: FeedbackLevel;
  label: string;
  blurb: string;
}> = [
  { id: 'brief', label: 'Brief', blurb: 'One-line summary, no word list' },
  { id: 'full', label: 'Full', blurb: 'What you missed and how to fix it' },
  { id: 'repeat', label: 'Say answer', blurb: 'Short summary, then the answer read back' },
  { id: 'full-repeat', label: 'Full + answer', blurb: 'Full feedback, then the answer read back' },
];

export function feedbackLevelIsFull(level: FeedbackLevel): boolean {
  return level === 'full' || level === 'full-repeat';
}

export function feedbackLevelReadsAnswer(level: FeedbackLevel): boolean {
  return level === 'repeat' || level === 'full-repeat';
}
