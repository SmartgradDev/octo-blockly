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
import {MissionObjectSystem} from './MissionObjectSystem';

export interface WorldMissionEvaluation {
  completed: boolean;
  failed: boolean;
  message: string;
  progressText: string;
  distanceToGoal?: number;
  totalCollectibles?: number;
  collectedCount?: number;
  remainingCount?: number;
}

export function evaluateWorldMission(
  worldMap: WorldMapData,
  worldRobot: WorldRobotState,
  missionObjectSystem?: MissionObjectSystem,
): WorldMissionEvaluation {
  const goal = worldMap.objectives.find((obj) => obj.type === 'GOAL');

  // Evaluate mission collectibles if present
  let totalCollectibles = 0;
  let collectedCount = 0;
  let remainingCount = 0;
  let hasCollectibles = false;

  if (missionObjectSystem) {
    const allObjects = missionObjectSystem.getObjects();
    const collectibles = allObjects.filter((o) => o.type === 'COLLECTIBLE');
    if (collectibles.length > 0) {
      hasCollectibles = true;
      totalCollectibles = collectibles.length;
      collectedCount = collectibles.filter((o) => o.state === 'COLLECTED').length;
      remainingCount = totalCollectibles - collectedCount;
    }
  }

  // Calculate distance to goal if goal objective exists
  let distanceToGoal: number | undefined;
  let isAtGoal = false;
  if (goal) {
    const dx = worldRobot.x - goal.position.x;
    const dy = worldRobot.y - goal.position.y;
    distanceToGoal = Math.round(Math.hypot(dx, dy));
    const goalThreshold = goal.radius + 15; // Within reach of goal
    isAtGoal = distanceToGoal <= goalThreshold;
  }

  // Case 1: Collectibles mission
  if (hasCollectibles) {
    const allCollected = remainingCount === 0;

    if (goal) {
      // Must collect all items AND reach goal
      if (allCollected && isAtGoal) {
        return {
          completed: true,
          failed: false,
          message: `🎉 All ${totalCollectibles} items collected & arrived at ${goal.name}!`,
          progressText: `All items collected! At ${goal.name}`,
          distanceToGoal,
          totalCollectibles,
          collectedCount,
          remainingCount,
        };
      }

      if (allCollected && !isAtGoal) {
        return {
          completed: false,
          failed: false,
          message: `Collected all ${totalCollectibles} items! Proceed to ${goal.name}.`,
          progressText: `All items collected. Head to ${goal.name} (${distanceToGoal} px)`,
          distanceToGoal,
          totalCollectibles,
          collectedCount,
          remainingCount,
        };
      }

      return {
        completed: false,
        failed: false,
        message: `Collected ${collectedCount} of ${totalCollectibles} items (${remainingCount} remaining).`,
        progressText: `Items: ${collectedCount}/${totalCollectibles} | Goal: ${distanceToGoal} px`,
        distanceToGoal,
        totalCollectibles,
        collectedCount,
        remainingCount,
      };
    } else {
      // Pure collectibles mission (no specific goal target)
      if (allCollected) {
        return {
          completed: true,
          failed: false,
          message: `🎉 All ${totalCollectibles} items successfully collected!`,
          progressText: `All items collected! (${collectedCount}/${totalCollectibles})`,
          totalCollectibles,
          collectedCount,
          remainingCount: 0,
        };
      }

      return {
        completed: false,
        failed: false,
        message: `Collected ${collectedCount} of ${totalCollectibles} items.`,
        progressText: `Items collected: ${collectedCount}/${totalCollectibles}`,
        totalCollectibles,
        collectedCount,
        remainingCount,
      };
    }
  }

  // Case 2: Standard target / goal mission
  if (!goal) {
    return {
      completed: false,
      failed: false,
      message: 'Exploration in progress.',
      progressText: `Pose: (${worldRobot.x.toFixed(0)}, ${worldRobot.y.toFixed(0)})`,
    };
  }

  if (isAtGoal) {
    return {
      completed: true,
      failed: false,
      message: `🎉 Goal Reached! Arrived at ${goal.name}.`,
      progressText: `Goal reached! (${goal.name})`,
      distanceToGoal,
    };
  }

  return {
    completed: false,
    failed: false,
    message: `En route to ${goal.name}.`,
    progressText: `Distance to ${goal.name}: ${distanceToGoal} px`,
    distanceToGoal,
  };
}

