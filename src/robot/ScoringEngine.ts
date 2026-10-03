/**
 * ScoringEngine — pure calculation module for local mission scores.
 *
 * Deterministic and standalone — easy to test without DOM or state dependencies.
 * Tracks executed robot actions, workspace block count, and execution time.
 */

export interface ScoreParams {
  completed: boolean;
  executedActionCount: number;
  blockCount: number;
  timeMs: number;
  optimalActionCount?: number;
}

export interface ScoreResult {
  completed: boolean;
  score: number;
  stars: number; // 0 to 3
  starDisplay: string; // "⭐⭐⭐", "⭐⭐", "⭐", or ""
  executedActionCount: number;
  blockCount: number;
  timeSeconds: number; // formatted to 2 decimal places, e.g. 9.42
}

const BASE_SCORE = 1000;
const EXTRA_ACTION_PENALTY = 20; // -20 points per executed action above optimal
const TIME_PENALTY_PER_SEC = 5; // -5 points per second elapsed

/**
 * Calculate the mission score based on completion status, executed actions, workspace block count, and execution time.
 */
export function calculateScore(params: ScoreParams): ScoreResult {
  const {
    completed,
    executedActionCount,
    blockCount,
    timeMs,
    optimalActionCount = 9,
  } = params;

  const timeSeconds = Math.round((timeMs / 1000) * 100) / 100;

  if (!completed) {
    return {
      completed: false,
      score: 0,
      stars: 0,
      starDisplay: '',
      executedActionCount,
      blockCount,
      timeSeconds,
    };
  }

  const extraActions = Math.max(0, executedActionCount - optimalActionCount);
  const actionPenalty = extraActions * EXTRA_ACTION_PENALTY;
  const timePenalty = Math.floor(timeSeconds * TIME_PENALTY_PER_SEC);

  const score = Math.max(0, BASE_SCORE - actionPenalty - timePenalty);

  let stars = 1;
  if (score >= 850) {
    stars = 3;
  } else if (score >= 600) {
    stars = 2;
  }

  const starDisplay = '⭐'.repeat(stars);

  return {
    completed: true,
    score,
    stars,
    starDisplay,
    executedActionCount,
    blockCount,
    timeSeconds,
  };
}
