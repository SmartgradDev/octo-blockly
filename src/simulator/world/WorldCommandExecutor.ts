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
import {Size2D, Point2D, WorldMapData} from './WorldData';
import {WorldRobotState, RobotPose2D, radiansToDegrees} from './WorldRobotState';
import {WorldRobotAdapter} from './WorldRobotAdapter';
import {
  WorldCollisionSystem,
  WorldCollider,
  PathCollisionResult,
} from './WorldCollisionSystem';
import {
  WorldMovementPolicy,
  MovementPolicyConfig,
  MovementPolicyResult,
  WorldMovementPolicyEvaluator,
} from './WorldMovementPolicy';

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
  | 'WORLD_COLLISION'
  | 'OFF_ROAD'
  | 'RESTRICTED_ZONE'
  | 'POLICY_VIOLATION'
  | 'BATTERY_DEPLETED'
  | 'UNKNOWN_COMMAND';

export interface WorldCommandResult {
  ok: boolean;
  command: RobotCommand;
  message: string;
  reason: WorldExecutionFailureReason;
  previousPose: RobotPose2D;
  currentPose: RobotPose2D;
  colliderId?: string;
  colliderType?: string;
  collisionPoint?: Point2D;
  /** Ratio of path actually traveled (0..1) for scaling partial animation duration */
  partialTravelRatio?: number;
}

export class WorldCommandExecutor {
  private worldBounds: Size2D;
  private config: WorldMovementConfig;
  private adapter: WorldRobotAdapter;
  private collisionSystem: WorldCollisionSystem;
  private policyEvaluator: WorldMovementPolicyEvaluator;

  constructor(
    worldBoundsOrMap: Size2D | WorldMapData,
    config: Partial<WorldMovementConfig> = {},
    adapter?: WorldRobotAdapter,
    collisionSystem?: WorldCollisionSystem,
    policyEvaluator?: WorldMovementPolicyEvaluator,
  ) {
    if ('bounds' in worldBoundsOrMap) {
      this.worldBounds = worldBoundsOrMap.bounds;
      this.collisionSystem =
        collisionSystem || new WorldCollisionSystem(worldBoundsOrMap);
      this.policyEvaluator =
        policyEvaluator ||
        new WorldMovementPolicyEvaluator(
          worldBoundsOrMap,
          worldBoundsOrMap.movementPolicy || 'FREE_WORLD',
        );
    } else {
      this.worldBounds = worldBoundsOrMap;
      this.collisionSystem = collisionSystem || new WorldCollisionSystem();
      this.policyEvaluator = policyEvaluator || new WorldMovementPolicyEvaluator();
    }

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

  public getCollisionSystem(): WorldCollisionSystem {
    return this.collisionSystem;
  }

  public getMovementPolicy(): MovementPolicyConfig {
    return this.policyEvaluator.getPolicy();
  }

  public getMovementPolicyEvaluator(): WorldMovementPolicyEvaluator {
    return this.policyEvaluator;
  }

  public setMovementPolicy(policy: WorldMovementPolicy | Partial<MovementPolicyConfig>): void {
    this.policyEvaluator.setPolicy(policy);
  }

  public setWorldMap(map: WorldMapData): void {
    this.worldBounds = map.bounds;
    this.collisionSystem.loadFromWorldMap(map);
    this.policyEvaluator.setWorldMap(map);
    if (map.movementPolicy) {
      this.policyEvaluator.setPolicy(map.movementPolicy);
    }
  }

  /**
   * Executes a single command on the continuous WorldRobotState.
   * Validates continuous world boundaries and solid object collisions with zero grid-cell logic.
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

        const startPt: Point2D = {x: worldRobot.x, y: worldRobot.y};
        const targetPt: Point2D = {x: targetX, y: targetY};
        const dx = targetX - startPt.x;
        const dy = targetY - startPt.y;

        // 1. Continuous World Boundary exit check
        const minX = this.config.boundaryMargin;
        const maxX = this.worldBounds.width - this.config.boundaryMargin;
        const minY = this.config.boundaryMargin;
        const maxY = this.worldBounds.height - this.config.boundaryMargin;

        let tBoundary = Infinity;
        if (dx > 0 && targetX > maxX) {
          tBoundary = Math.min(tBoundary, (maxX - startPt.x) / dx);
        } else if (dx < 0 && targetX < minX) {
          tBoundary = Math.min(tBoundary, (minX - startPt.x) / dx);
        }
        if (dy > 0 && targetY > maxY) {
          tBoundary = Math.min(tBoundary, (maxY - startPt.y) / dy);
        } else if (dy < 0 && targetY < minY) {
          tBoundary = Math.min(tBoundary, (minY - startPt.y) / dy);
        }
        if (tBoundary < Infinity) {
          tBoundary = Math.max(0, tBoundary);
        }

        // 2. Swept continuous collision check against solid world objects (buildings, trees)
        const colResult = this.collisionSystem.checkSweptPath(startPt, targetPt);
        let tCollision = Infinity;
        if (colResult.collided && colResult.totalDistance > 0) {
          tCollision = colResult.collisionDistance / colResult.totalDistance;
        }

        // 3. Movement Policy Evaluation (FREE_WORLD, ROAD_ONLY, RESTRICTED_ZONE)
        const policyResult = this.policyEvaluator.evaluatePath(startPt, targetPt);
        let tPolicy = Infinity;
        if (!policyResult.allowed && policyResult.totalDistance > 0) {
          tPolicy = (policyResult.violationDistance ?? 0) / policyResult.totalDistance;
        }

        // 4. Earliest blocking condition priority resolution
        const tMin = Math.min(tBoundary, tCollision, tPolicy);

        // Case A: Movement policy boundary breached earliest
        if (tPolicy === tMin && tPolicy < Infinity && !policyResult.allowed) {
          const safeTarget = policyResult.safeTarget || startPt;
          const partialRatio =
            policyResult.totalDistance > 0
              ? (policyResult.safeDistance ?? 0) / policyResult.totalDistance
              : 0;

          this.adapter.setPose(
            worldRobot,
            safeTarget.x,
            safeTarget.y,
            worldRobot.rotation,
          );
          worldRobot.state = 'stopped';

          const currentPose: RobotPose2D = {
            x: worldRobot.x,
            y: worldRobot.y,
            rotation: worldRobot.rotation,
          };

          return {
            ok: false,
            command,
            reason: (policyResult.reason === 'ALLOWED'
              ? 'POLICY_VIOLATION'
              : policyResult.reason) as WorldExecutionFailureReason,
            message: policyResult.message || 'Cannot move — movement policy violation.',
            previousPose,
            currentPose,
            collisionPoint: policyResult.violationPoint,
            partialTravelRatio: partialRatio,
          };
        }

        // Case B: Solid physical obstacle collision occurs earliest
        if (tCollision === tMin && tCollision < Infinity && colResult.collided && colResult.collider) {
          const safeTarget = colResult.safeTarget || startPt;
          const partialRatio =
            colResult.totalDistance > 0
              ? colResult.safeDistance / colResult.totalDistance
              : 0;

          // Commit robot pose to closest safe point immediately before obstacle
          this.adapter.setPose(
            worldRobot,
            safeTarget.x,
            safeTarget.y,
            worldRobot.rotation,
          );
          worldRobot.state = 'stopped';

          const currentPose: RobotPose2D = {
            x: worldRobot.x,
            y: worldRobot.y,
            rotation: worldRobot.rotation,
          };

          return {
            ok: false,
            command,
            reason: 'WORLD_COLLISION',
            message: `Cannot move — blocked by ${colResult.collider.name}.`,
            previousPose,
            currentPose,
            colliderId: colResult.collider.id,
            colliderType: colResult.collider.type.toUpperCase() as 'BUILDING' | 'TREE' | 'OBSTACLE',
            collisionPoint: colResult.collisionPoint,
            partialTravelRatio: partialRatio,
          };
        }

        // Case C: World boundary reached earliest
        if (tBoundary === tMin && tBoundary < Infinity) {
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

        // Case C: Clear traversable path (open ground / grass / road)
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
          partialTravelRatio: 1,
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

