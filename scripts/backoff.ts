// scripts/backoff.ts
// Shared exponential backoff constants and function for runner scripts.

/** Initial pause between iterations, in seconds. */
export const MIN_PAUSE_SEC = 30;
/** Upper cap for backoff pause, in seconds (4 hours). */
export const MAX_PAUSE_SEC = 4 * 60 * 60;
/** Multiplier applied to the current pause on each empty iteration. */
export const BACKOFF_FACTOR = 2;

/** Compute next pause with exponential backoff capped at MAX. */
export function nextPause(current: number): number {
  return Math.min(current * BACKOFF_FACTOR, MAX_PAUSE_SEC);
}
