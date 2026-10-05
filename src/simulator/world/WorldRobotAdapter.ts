/**
 * WorldRobotAdapter.ts — Adapter bridging program execution to WorldRobotState.
 *
 * Translates robot commands into continuous world coordinate mutations:
 * - MOVE_FORWARD: advances position along current heading angle by step distance
 * - MOVE_BACKWARD: moves reverse along current heading angle
 * - TURN_LEFT: rotates heading counter-clockwise by -PI/2 (-90°)
 * - TURN_RIGHT: rotates heading clockwise by +PI/2 (+90°)
 *
 * All coordinates are continuous floating-point numbers.
 * No grid rows/columns or cell-based logic are used.
 */

import {RobotCommand} from '../../robot/RobotState';
import {Point2D} from './WorldData';
import {WorldRobotState, normalizeAngle} from './WorldRobotState';

export interface WorldAdapterConfig {
  /** Distance in world units per movement command (default: 45) */
  stepDistance: number;
  /** Turn angle delta in radians (default: PI / 2 = 90 deg) */
  turnAngleRad: number;
}

export const DEFAULT_ADAPTER_CONFIG: WorldAdapterConfig = {
  stepDistance: 45,
  turnAngleRad: Math.PI / 2,
};

export class WorldRobotAdapter {
  private config: WorldAdapterConfig;

  constructor(config: Partial<WorldAdapterConfig> = {}) {
    this.config = {...DEFAULT_ADAPTER_CONFIG, ...config};
  }

  /**
   * Executes a command on the continuous WorldRobotState.
   *
   * @param worldRobot Authoritative continuous robot state
   * @param command Command type from program execution
   * @returns Updated WorldRobotState
   */
  public executeCommand(
    worldRobot: WorldRobotState,
    command: RobotCommand,
  ): WorldRobotState {
    switch (command) {
      case 'MOVE_FORWARD': {
        const dx = Math.cos(worldRobot.rotation) * this.config.stepDistance;
        const dy = Math.sin(worldRobot.rotation) * this.config.stepDistance;
        worldRobot.x += dx;
        worldRobot.y += dy;
        worldRobot.state = 'moving';
        break;
      }
      case 'MOVE_BACKWARD': {
        const dx = Math.cos(worldRobot.rotation) * this.config.stepDistance;
        const dy = Math.sin(worldRobot.rotation) * this.config.stepDistance;
        worldRobot.x -= dx;
        worldRobot.y -= dy;
        worldRobot.state = 'moving';
        break;
      }
      case 'TURN_RIGHT': {
        worldRobot.rotation = normalizeAngle(
          worldRobot.rotation + this.config.turnAngleRad,
        );
        worldRobot.state = 'turning';
        break;
      }
      case 'TURN_LEFT': {
        worldRobot.rotation = normalizeAngle(
          worldRobot.rotation - this.config.turnAngleRad,
        );
        worldRobot.state = 'turning';
        break;
      }
    }
    return worldRobot;
  }

  /**
   * Resets robot state cleanly to the world map spawn point.
   */
  public resetToSpawn(
    worldRobot: WorldRobotState,
    spawn: {position: Point2D; rotation: number},
  ): void {
    worldRobot.x = spawn.position.x;
    worldRobot.y = spawn.position.y;
    worldRobot.rotation = normalizeAngle(spawn.rotation);
    worldRobot.speed = 0;
    worldRobot.state = 'idle';
  }

  /**
   * Allows setting arbitrary continuous floating-point coordinates.
   * Useful for testing and validation.
   */
  public setPose(
    worldRobot: WorldRobotState,
    x: number,
    y: number,
    rotation: number,
  ): void {
    worldRobot.x = x;
    worldRobot.y = y;
    worldRobot.rotation = normalizeAngle(rotation);
  }
}

