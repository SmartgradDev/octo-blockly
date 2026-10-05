/**
 * WorldMissionEvaluator.ts — Continuous World Mission Objective Evaluator for Step 2.
 *
 * Responsibilities:
 * - Checks distance between continuous WorldRobotState and WorldMapData objectives (GOAL, CHECKPOINTS).
 * - Generates clear status messages and progress banner text (e.g. "Distance to goal: 120 px").
 * - Operates strictly on continuous coordinates (no grid rows/columns).
 */

import {WorldMapData} from './WorldData';
import {WorldRobotState} from './WorldRobotState';

export interface WorldMissionEvaluation {
  completed: boolean;
  failed: boolean;
  message: string;
  progressText: string;
  distanceToGoal?: number;
}

export function evaluateWorldMission(
  worldMap: WorldMapData,
  worldRobot: WorldRobotState,
): WorldMissionEvaluation {
  const goal = worldMap.objectives.find((obj) => obj.type === 'GOAL');
  if (!goal) {
    return {
      completed: false,
      failed: false,
      message: 'Exploration in progress.',
      progressText: `Pose: (${worldRobot.x.toFixed(0)}, ${worldRobot.y.toFixed(0)})`,
    };
  }

  const dx = worldRobot.x - goal.position.x;
  const dy = worldRobot.y - goal.position.y;
  const distance = Math.hypot(dx, dy);
  const goalThreshold = goal.radius + 15; // Within reach of goal

  if (distance <= goalThreshold) {
    return {
      completed: true,
      failed: false,
      message: `🎉 Goal Reached! Arrived at ${goal.name}.`,
      progressText: `Goal reached! (${goal.name})`,
      distanceToGoal: Math.round(distance),
    };
  }

  return {
    completed: false,
    failed: false,
    message: `En route to ${goal.name}.`,
    progressText: `Distance to ${goal.name}: ${Math.round(distance)} px`,
    distanceToGoal: Math.round(distance),
  };
}

