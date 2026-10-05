/**
 * WorldCommandExecutor.ts — Step 2 World-Native Command Execution Engine.
 *
 * Responsibilities:
 * - Coordinates robot command execution in continuous 2D world space.
 * - Validates movement against continuous WorldMapData bounds (e.g. 800 x 600).
 * - Delegates actual mathematical position/rotation updates to WorldRobotAdapter.
 * - Produces clean, world-native execution results (WorldCommandResult).
 * - Enforces continuous world boundaries with ZERO grid-cell logic.
 */

import {RobotCommand} from '../../robot/RobotState';
import {Size2D} from './WorldData';
import {WorldRobotState, RobotPose2D, radiansToDegrees} from './WorldRobotState';
import {WorldRobotAdapter} from './WorldRobotAdapter';

export interface WorldMovementConfig {
  /**
   * Distance in world units (pixels) traveled per MOVE_FORWARD / MOVE_BACKWARD command.
   *
   * Rationale:
   * Campus Town total width is 800px with 60px wide roadways.
   * Default vehicle spawn is at X=120, Y=300 facing East.
   * Science Plaza Goal is at X=640, Y=300 (total travel delta = 520px).
   * A move distance of 65px per command allows the robot to advance approximately
   * one full roadway vehicle length per command, and exactly 8 commands (520 / 65 = 8)
   * navigate cleanly from spawn to the goal.
   */
  moveDistance: number;
  /** Turn angle in radians applied per TURN_LEFT / TURN_RIGHT command (default: PI / 2 = 90°) */
  turnAngleRad: number;
  /** Margin from world canvas boundary to keep robot visually inside borders */
  boundaryMargin: number;
  /** Base movement animation duration in ms at 50% motor speed */
  baseMoveDurationMs: number;
  /** Base turn animation duration in ms at 50% motor speed */
  baseTurnDurationMs: number;
}

export const DEFAULT_WORLD_MOVEMENT_CONFIG: WorldMovementConfig = {
  moveDistance: 65,
  turnAngleRad: Math.PI / 2,
  boundaryMargin: 16,
  baseMoveDurationMs: 280,
  baseTurnDurationMs: 200,
};

/**
 * Calculates deterministic animation duration in milliseconds based on motor speed (1-100%).
 * 50% speed -> baseDuration (e.g. 280ms move, 200ms turn)
 * 100% speed -> 0.5x duration (e.g. 140ms move, 100ms turn)
 * 20% speed -> 2.5x duration (e.g. 700ms move, 500ms turn)
 */
export function calculateStepDurationMs(
  motorSpeedSetting: number = 50,
  isTurn: boolean = false,
  config: WorldMovementConfig = DEFAULT_WORLD_MOVEMENT_CONFIG,
): number {
  const base = isTurn ? config.baseTurnDurationMs : config.baseMoveDurationMs;
  const clampedSpeed = Math.max(10, Math.min(100, motorSpeedSetting));
  const factor = 50 / clampedSpeed;
  return Math.round(Math.max(100, Math.min(800, base * factor)));
}

export type WorldExecutionFailureReason =
  | 'OK'
  | 'WORLD_BOUNDARY'
  | 'BATTERY_DEPLETED'
  | 'UNKNOWN_COMMAND';

export interface WorldCommandResult {
  ok: boolean;
  command: RobotCommand;
  message: string;
  reason: WorldExecutionFailureReason;
  previousPose: RobotPose2D;
  currentPose: RobotPose2D;
}

export class WorldCommandExecutor {
  private worldBounds: Size2D;
  private config: WorldMovementConfig;
  private adapter: WorldRobotAdapter;

  constructor(
    worldBounds: Size2D,
    config: Partial<WorldMovementConfig> = {},
    adapter?: WorldRobotAdapter,
  ) {
    this.worldBounds = worldBounds;
    this.config = {...DEFAULT_WORLD_MOVEMENT_CONFIG, ...config};
    this.adapter =
      adapter ||
      new WorldRobotAdapter({
        stepDistance: this.config.moveDistance,
        turnAngleRad: this.config.turnAngleRad,
      });
  }

  public getMovementConfig(): WorldMovementConfig {
    return this.config;
  }

  public getAdapter(): WorldRobotAdapter {
    return this.adapter;
  }

  /**
   * Executes a single command on the continuous WorldRobotState.
   * Validates against continuous world boundaries with ZERO grid-cell logic.
   */
  public execute(
    worldRobot: WorldRobotState,
    command: RobotCommand,
  ): WorldCommandResult {
    const previousPose: RobotPose2D = {
      x: worldRobot.x,
      y: worldRobot.y,
      rotation: worldRobot.rotation,
    };

    // 1. Battery check if enabled
    if (worldRobot.battery !== undefined) {
      const isMove = command === 'MOVE_FORWARD' || command === 'MOVE_BACKWARD';
      const energyCost = isMove ? 1.0 : 0.5;
      if (worldRobot.battery <= 0 || worldRobot.battery < energyCost) {
        worldRobot.battery = 0;
        return {
          ok: false,
          command,
          reason: 'BATTERY_DEPLETED',
          message: '⚠️ Battery depleted! Robot ran out of energy.',
          previousPose,
          currentPose: {...previousPose},
        };
      }
      worldRobot.battery =
        Math.max(0, Math.round((worldRobot.battery - energyCost) * 10) / 10);
    }

    // 2. Process command
    switch (command) {
      case 'MOVE_FORWARD':
      case 'MOVE_BACKWARD': {
        const stepMultiplier = command === 'MOVE_FORWARD' ? 1 : -1;
        const dist = this.config.moveDistance * stepMultiplier;
        const targetX = worldRobot.x + Math.cos(worldRobot.rotation) * dist;
        const targetY = worldRobot.y + Math.sin(worldRobot.rotation) * dist;

        // Continuous World Boundary check (no rows, columns, or cell conversions)
        const minX = this.config.boundaryMargin;
        const maxX = this.worldBounds.width - this.config.boundaryMargin;
        const minY = this.config.boundaryMargin;
        const maxY = this.worldBounds.height - this.config.boundaryMargin;

        if (targetX < minX || targetX > maxX || targetY < minY || targetY > maxY) {
          worldRobot.state = 'stopped';
          return {
            ok: false,
            command,
            reason: 'WORLD_BOUNDARY',
            message: `Cannot move outside the world boundary (Target: X=${targetX.toFixed(1)}, Y=${targetY.toFixed(1)}).`,
            previousPose,
            currentPose: {...previousPose},
          };
        }

        // Apply movement update via adapter
        this.adapter.setPose(worldRobot, targetX, targetY, worldRobot.rotation);
        worldRobot.state = 'moving';

        const currentPose: RobotPose2D = {
          x: worldRobot.x,
          y: worldRobot.y,
          rotation: worldRobot.rotation,
        };

        return {
          ok: true,
          command,
          reason: 'OK',
          message: `Moved to (X:${targetX.toFixed(1)}, Y:${targetY.toFixed(1)})`,
          previousPose,
          currentPose,
        };
      }

      case 'TURN_LEFT':
      case 'TURN_RIGHT': {
        this.adapter.executeCommand(worldRobot, command);
        const headingDeg = Math.round(radiansToDegrees(worldRobot.rotation));
        const currentPose: RobotPose2D = {
          x: worldRobot.x,
          y: worldRobot.y,
          rotation: worldRobot.rotation,
        };
        return {
          ok: true,
          command,
          reason: 'OK',
          message: `Turned to face ${headingDeg}°`,
          previousPose,
          currentPose,
        };
      }

      default: {
        return {
          ok: false,
          command,
          reason: 'UNKNOWN_COMMAND',
          message: `Unknown command: ${command}`,
          previousPose,
          currentPose: {...previousPose},
        };
      }
    }
  }
}

