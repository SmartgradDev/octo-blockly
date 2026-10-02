/**
 * ScoringEngine — pure calculation module for local mission scores.
 *
 * Deterministic and standalone — easy to test without DOM or state dependencies.
 */

export interface ScoreParams {
  completed: boolean;
  commandCount: number;
  timeMs: number;
  optimalCommandCount?: number;
}

export interface ScoreResult {
  completed: boolean;
  score: number;
  stars: number; // 0 to 3
  starDisplay: string; // "⭐⭐⭐", "⭐⭐", "⭐", or ""
  commandCount: number;
  timeSeconds: number; // formatted to 1 decimal place, e.g. 12.4
}

const BASE_SCORE = 1000;
const EXTRA_COMMAND_PENALTY = 20; // -20 points per command above optimal
const TIME_PENALTY_PER_SEC = 5; // -5 points per second elapsed

/**
 * Calculate the mission score based on completion status, command count, and execution time.
 */
export function calculateScore(params: ScoreParams): ScoreResult {
  const {
    completed,
    commandCount,
    timeMs,
    optimalCommandCount = 9,
  } = params;

  const timeSeconds = Math.round((timeMs / 1000) * 10) / 10;

  if (!completed) {
    return {
      completed: false,
      score: 0,
      stars: 0,
      starDisplay: '',
      commandCount,
      timeSeconds,
    };
  }

  const extraCommands = Math.max(0, commandCount - optimalCommandCount);
  const commandPenalty = extraCommands * EXTRA_COMMAND_PENALTY;
  const timePenalty = Math.floor(timeSeconds * TIME_PENALTY_PER_SEC);

  const score = Math.max(0, BASE_SCORE - commandPenalty - timePenalty);

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
    commandCount,
    timeSeconds,
  };
}
