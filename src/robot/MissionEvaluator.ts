/**
 * MissionEvaluator — Configurable Mission Objective Evaluator.
 *
 * Inspects robot state, mission configuration, runtime items/colors state,
 * and execution statistics to evaluate mission progress, completion, and failure.
 *
 * Pure logic module with zero DOM dependencies.
 */

import {RobotState} from './RobotState';
import {Mission, Position, CellColor, ObjectiveConfig} from './Mission';

export interface MissionRuntimeState {
  collectedItems: Position[];
  visitedColors: Set<CellColor>;
  executedActions: number;
  batteryDepleted: boolean;
}

export interface EvaluationResult {
  completed: boolean;
  failed: boolean;
  progressText: string;
  message: string;
}

/**
 * Evaluates the mission status against current robot and runtime state.
 */
export function evaluateMission(
  mission: Mission,
  robot: RobotState,
  runtimeState: MissionRuntimeState,
): EvaluationResult {
  const objective: ObjectiveConfig = mission.objective || {type: 'REACH_TARGET'};
  const isAtTarget = robot.x === mission.target.x && robot.y === mission.target.y;

  // Immediate failure check if battery depleted when battery is active
  if (runtimeState.batteryDepleted) {
    return {
      completed: false,
      failed: true,
      progressText: 'Battery Depleted',
      message: '⚠️ Battery depleted! Mission failed.',
    };
  }

  switch (objective.type) {
    case 'REACH_TARGET': {
      if (isAtTarget) {
        return {
          completed: true,
          failed: false,
          progressText: 'Target Reached (1/1)',
          message: 'Target reached!',
        };
      }
      return {
        completed: false,
        failed: false,
        progressText: `Navigating to (${mission.target.x}, ${mission.target.y})`,
        message: 'Robot is moving towards the target...',
      };
    }

    case 'COLLECT_ITEMS': {
      const totalItems = mission.items ? mission.items.length : 0;
      const required = objective.requiredItemCount ?? totalItems;
      const collected = runtimeState.collectedItems.length;
      const progressText = `Items Collected: ${collected} / ${required}`;

      if (collected >= required && isAtTarget) {
        return {
          completed: true,
          failed: false,
          progressText,
          message: `All ${required} items collected and target reached!`,
        };
      } else if (collected >= required && !isAtTarget) {
        return {
          completed: false,
          failed: false,
          progressText: `${progressText} (Head to Star!)`,
          message: 'Items collected! Now reach the star target.',
        };
      }

      return {
        completed: false,
        failed: false,
        progressText,
        message: `Collect ${required - collected} more item(s)...`,
      };
    }

    case 'VISIT_COLORS': {
      const requiredColors = objective.requiredColors || [];
      const visitedCount = requiredColors.filter((c) =>
        runtimeState.visitedColors.has(c),
      ).length;
      const totalRequired = requiredColors.length;
      const progressText = `Colors Visited: ${visitedCount} / ${totalRequired}`;

      if (visitedCount >= totalRequired && isAtTarget) {
        return {
          completed: true,
          failed: false,
          progressText,
          message: 'All required colored tiles visited and target reached!',
        };
      }

      return {
        completed: false,
        failed: false,
        progressText,
        message: `Visit required colors: ${requiredColors.join(', ')}`,
      };
    }

    case 'SURVIVE_WITH_BATTERY': {
      const minBattery = objective.minRemainingBattery ?? 1;
      const curBattery = robot.battery ?? 0;
      const progressText = `Battery: ${curBattery.toFixed(1)} (Min: ${minBattery})`;

      if (isAtTarget && curBattery >= minBattery) {
        return {
          completed: true,
          failed: false,
          progressText,
          message: `Reached target with ${curBattery.toFixed(1)} battery remaining!`,
        };
      } else if (isAtTarget && curBattery < minBattery) {
        return {
          completed: false,
          failed: true,
          progressText,
          message: `Reached target but battery level (${curBattery.toFixed(1)}) fell below minimum required (${minBattery}).`,
        };
      }

      return {
        completed: false,
        failed: false,
        progressText,
        message: 'Survive with battery remaining...',
      };
    }

    case 'ACTION_LIMIT': {
      const maxActions = objective.maxActions ?? 15;
      const currentActions = runtimeState.executedActions;
      const progressText = `Actions: ${currentActions} / ${maxActions}`;

      if (isAtTarget && currentActions <= maxActions) {
        return {
          completed: true,
          failed: false,
          progressText,
          message: `Target reached in ${currentActions} actions!`,
        };
      }

      if (currentActions > maxActions) {
        return {
          completed: false,
          failed: true,
          progressText,
          message: `⚠️ Action limit exceeded! Used ${currentActions} actions (Max: ${maxActions}).`,
        };
      }

      return {
        completed: false,
        failed: false,
        progressText,
        message: `Complete in ${maxActions - currentActions} or fewer actions...`,
      };
    }
  }
}
