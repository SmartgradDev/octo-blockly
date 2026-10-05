/**
 * RobotRenderer — dedicated Phaser 4 robot presentation renderer for Step 2.
 *
 * Architecture Rules:
 * 1. Single source of truth: WorldRobotState (x, y, rotation, speed, state)
 *    is owned and updated strictly by the continuous simulation engine.
 * 2. RobotRenderer never alters or duplicates state.
 * 3. Consumes continuous world coordinates (x, y, rotation) directly.
 * 4. Coordinate convention:
 *    - 0 rad (0°)          -> Facing East (+X axis)
 *    - PI/2 rad (+90°)     -> Facing South (+Y axis)
 *    - PI rad (180°)       -> Facing West (-X axis)
 *    - -PI/2 rad (-90°)    -> Facing North (-Y axis)
 * 5. Animates visual position transitions using Phaser 4 tweens.
 * 6. Animates visual turning rotations smoothly using Phaser 4 rotation tweens,
 *    choosing the shortest/expected angular path.
 * 7. Visual tweens never block or dictate logical simulation correctness.
 */

import * as Phaser from 'phaser';
import {Direction, RobotState} from '../robot/RobotState';

export interface WorldRobotPose {
  /** Continuous world X coordinate (pixels/world units) */
  x: number;
  /** Continuous world Y coordinate (pixels/world units) */
  y: number;
  /** Continuous heading in radians (0 = East, PI/2 = South, etc.) */
  rotation: number;
}

export interface GridCoordinateConverter {
  toWorldPosition(col: number, row: number): {x: number; y: number};
  getCellSize(): number;
}

export interface RobotRendererConfig {
  /** Configurable movement animation duration in milliseconds (default: 250ms) */
  moveDurationMs: number;
  /** Configurable rotation animation duration in milliseconds (default: 200ms) */
  turnDurationMs: number;
  /** Base visual radius of the robot chassis (default: 16px) */
  robotRadius: number;
}

export const DEFAULT_ROBOT_RENDERER_CONFIG: RobotRendererConfig = {
  moveDurationMs: 250,
  turnDurationMs: 200,
  robotRadius: 16,
};

export class RobotRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private pointerGraphics: Phaser.GameObjects.Graphics;
  private directionBadge: Phaser.GameObjects.Text;
  private coordinateConverter?: GridCoordinateConverter;
  private config: RobotRendererConfig;

  // Visual tween tracking
  private activeMoveTween: Phaser.Tweens.Tween | null = null;
  private activeTurnTween: Phaser.Tweens.Tween | null = null;
  private lastTargetAngle: number | null = null;
  private isInitialized: boolean = false;
  private currentRadius: number = 0;
  private pendingResolvers: Set<() => void> = new Set();

  constructor(
    scene: Phaser.Scene,
    coordinateConverter?: GridCoordinateConverter,
    config: Partial<RobotRendererConfig> = {},
  ) {
    this.scene = scene;
    this.coordinateConverter = coordinateConverter;
    this.config = {...DEFAULT_ROBOT_RENDERER_CONFIG, ...config};

    // Create container for grouping all robot sub-elements (depth 100 on top of world layers)
    this.container = this.scene.add.container(0, 0).setDepth(100);

    // Body graphics (chassis, visor, treads/pads)
    this.bodyGraphics = this.scene.add.graphics();
    this.container.add(this.bodyGraphics);

    // Pointer graphics (directional front arrow pointing along local +X)
    this.pointerGraphics = this.scene.add.graphics();
    this.container.add(this.pointerGraphics);

    // Direction symbol badge
    this.directionBadge = this.scene.add.text(0, 0, '▶', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.directionBadge.setOrigin(0.5, 0.5);
    this.container.add(this.directionBadge);
  }

  /**
   * Resolves and unblocks all pending animation Promises cleanly.
   */
  private notifyPendingResolved(): void {
    if (this.pendingResolvers.size > 0) {
      for (const resolve of this.pendingResolvers) {
        resolve();
      }
      this.pendingResolvers.clear();
    }
  }

  /**
   * Updates the coordinate converter if grid bounds or canvas resize occurred.
   */
  public setCoordinateConverter(converter: GridCoordinateConverter): void {
    this.coordinateConverter = converter;
  }

  /**
   * Configure movement animation duration in one central place.
   */
  public setMoveDuration(durationMs: number): void {
    this.config.moveDurationMs = Math.max(0, durationMs);
  }

  /**
   * Configure turn animation duration in one central place.
   */
  public setTurnDuration(durationMs: number): void {
    this.config.turnDurationMs = Math.max(0, durationMs);
  }

  /**
   * Returns current continuous visual pose from Phaser Container.
   */
  public getCurrentVisualPose(): WorldRobotPose {
    return {
      x: this.container ? this.container.x : 0,
      y: this.container ? this.container.y : 0,
      rotation: this.container ? this.container.rotation : 0,
    };
  }

  /**
   * Returns true if visual movement or rotation tween is currently in progress.
   */
  public isAnimating(): boolean {
    return (
      (this.activeMoveTween !== null && this.activeMoveTween.isPlaying()) ||
      (this.activeTurnTween !== null && this.activeTurnTween.isPlaying())
    );
  }

  /**
   * Halts any in-flight move tween and optionally snaps robot immediately to target position.
   */
  public stopMovementTween(snapToTarget: boolean = true): void {
    if (this.activeMoveTween) {
      if (snapToTarget && this.activeMoveTween.isPlaying()) {
        const targets = this.activeMoveTween.targets as any[];
        if (targets && targets.length > 0) {
          const targetObj = targets[0];
          const tweenData = (this.activeMoveTween as any).data;
          if (tweenData) {
            for (const d of tweenData) {
              if (d.key && d.end !== undefined) {
                targetObj[d.key] = d.end;
              }
            }
          }
        }
      }
      this.activeMoveTween.stop();
      this.activeMoveTween.remove();
      this.activeMoveTween = null;
    }
    this.notifyPendingResolved();
  }

  /**
   * Halts any in-flight turn tween and optionally snaps robot immediately to target rotation.
   */
  public stopTurnTween(snapToTarget: boolean = true): void {
    if (this.activeTurnTween) {
      if (snapToTarget && this.activeTurnTween.isPlaying()) {
        const targets = this.activeTurnTween.targets as any[];
        if (targets && targets.length > 0) {
          const targetObj = targets[0];
          const tweenData = (this.activeTurnTween as any).data;
          if (tweenData) {
            for (const d of tweenData) {
              if (d.key && d.end !== undefined) {
                targetObj[d.key] = d.end;
              }
            }
          }
        }
      }
      this.activeTurnTween.stop();
      this.activeTurnTween.remove();
      this.activeTurnTween = null;
    }
    this.notifyPendingResolved();
  }

  /**
   * Pauses active visual tweens safely.
   */
  public pauseVisuals(): void {
    if (this.activeMoveTween && this.activeMoveTween.isPlaying()) {
      this.activeMoveTween.pause();
    }
    if (this.activeTurnTween && this.activeTurnTween.isPlaying()) {
      this.activeTurnTween.pause();
    }
  }

  /**
   * Resumes active visual tweens safely.
   */
  public resumeVisuals(): void {
    if (this.activeMoveTween && this.activeMoveTween.isPaused()) {
      this.activeMoveTween.resume();
    }
    if (this.activeTurnTween && this.activeTurnTween.isPaused()) {
      this.activeTurnTween.resume();
    }
  }

  /**
   * Immediately stops all in-flight animations and snaps visual elements to their target.
   */
  public stopVisuals(snapToTarget: boolean = true): void {
    this.stopMovementTween(snapToTarget);
    this.stopTurnTween(snapToTarget);
    this.notifyPendingResolved();
  }

  /**
   * Maps cardinal direction to continuous angle in radians (East is 0 radians).
   */
  public directionToAngle(dir: Direction): number {
    switch (dir) {
      case 'EAST':
        return 0;
      case 'SOUTH':
        return Math.PI / 2; // +90 deg
      case 'WEST':
        return Math.PI; // +180 deg
      case 'NORTH':
        return -Math.PI / 2; // -90 deg
    }
  }

  /**
   * Calculates the shortest angular delta (in radians) between current angle and target angle.
   */
  private getShortestAngleDelta(currentAngle: number, targetAngle: number): number {
    const twoPi = Math.PI * 2;
    // Normalize difference into (-PI, +PI]
    let diff = (targetAngle - currentAngle) % twoPi;
    if (diff > Math.PI) {
      diff -= twoPi;
    } else if (diff <= -Math.PI) {
      diff += twoPi;
    }
    return diff;
  }

  /**
   * Primary Step 2 render method: takes continuous WorldRobotPose (x, y, rotation)
   * and renders directly to Phaser without grid conversion.
   *
   * @param pose Continuous world coordinates and heading in radians
   * @param immediate If true, snaps immediately without tweens
   * @param durationMs Optional duration override in milliseconds (scales with motor speed)
   * @param onProgress Optional progress callback receiving interpolated pose on each tween frame
   * @returns Promise that resolves when visual interpolation completes
   */
  public renderWorld(
    pose: WorldRobotPose,
    immediate: boolean = false,
    durationMs?: number,
    onProgress?: (pose: WorldRobotPose) => void,
  ): Promise<void> {
    const radius = this.config.robotRadius;

    // Draw robot graphics if not initialized or radius changed
    if (!this.isInitialized || this.currentRadius !== radius) {
      this.drawRobotGraphics(radius);
      this.currentRadius = radius;
    }

    const targetX = pose.x;
    const targetY = pose.y;
    const targetAngle = pose.rotation;

    // Initial placement or explicit reset/snap
    if (!this.isInitialized || immediate) {
      this.stopMovementTween(false);
      this.stopTurnTween(false);
      this.container.setPosition(targetX, targetY);
      this.container.setRotation(targetAngle);
      this.lastTargetAngle = targetAngle;
      this.isInitialized = true;
      if (onProgress) {
        onProgress({x: targetX, y: targetY, rotation: targetAngle});
      }
      return Promise.resolve();
    }

    // ── Position Handling ──────────────────────────────────────────────
    const currentX = this.container.x;
    const currentY = this.container.y;
    const dx = Math.abs(currentX - targetX);
    const dy = Math.abs(currentY - targetY);
    const hasMoved = dx > 0.5 || dy > 0.5;

    // ── Rotation Handling ──────────────────────────────────────────────
    const hasTurned =
      this.lastTargetAngle === null ||
      Math.abs(this.getShortestAngleDelta(this.lastTargetAngle, targetAngle)) > 0.001;

    if (!hasMoved && !hasTurned) {
      if (onProgress) {
        onProgress({x: currentX, y: currentY, rotation: this.container.rotation});
      }
      return Promise.resolve();
    }

    // Stop previous tweens and flush prior awaiting resolvers before starting new step
    if (hasMoved) {
      this.stopMovementTween(false);
    }
    if (hasTurned) {
      this.stopTurnTween(false);
    }

    return new Promise<void>((resolve) => {
      let pendingAnimations = 0;
      const onAnimFinished = () => {
        pendingAnimations--;
        if (pendingAnimations <= 0) {
          this.pendingResolvers.delete(resolve);
          resolve();
        }
      };

      this.pendingResolvers.add(resolve);

      if (hasMoved) {
        pendingAnimations++;
        const moveDur = durationMs !== undefined ? durationMs : this.config.moveDurationMs;
        this.activeMoveTween = this.scene.tweens.add({
          targets: this.container,
          x: targetX,
          y: targetY,
          duration: moveDur,
          ease: 'Cubic.easeOut',
          onUpdate: () => {
            if (onProgress) {
              onProgress({
                x: this.container.x,
                y: this.container.y,
                rotation: this.container.rotation,
              });
            }
          },
          onComplete: () => {
            this.activeMoveTween = null;
            onAnimFinished();
          },
        });
      }

      if (hasTurned) {
        pendingAnimations++;
        this.lastTargetAngle = targetAngle;

        const currentRotation = this.container.rotation;
        const angleDelta = this.getShortestAngleDelta(currentRotation, targetAngle);
        const destinationAngle = currentRotation + angleDelta;
        const turnDur = durationMs !== undefined ? durationMs : this.config.turnDurationMs;

        this.activeTurnTween = this.scene.tweens.add({
          targets: this.container,
          rotation: destinationAngle,
          duration: turnDur,
          ease: 'Cubic.easeOut',
          onUpdate: () => {
            if (onProgress) {
              onProgress({
                x: this.container.x,
                y: this.container.y,
                rotation: this.container.rotation,
              });
            }
          },
          onComplete: () => {
            this.activeTurnTween = null;
            // Normalize rotation within (-PI, +PI]
            const twoPi = Math.PI * 2;
            let norm = destinationAngle % twoPi;
            if (norm > Math.PI) norm -= twoPi;
            else if (norm <= -Math.PI) norm += twoPi;
            this.container.setRotation(norm);
            this.lastTargetAngle = norm;
            onAnimFinished();
          },
        });
      }

      if (pendingAnimations === 0) {
        this.pendingResolvers.delete(resolve);
        resolve();
      }
    });
  }

  /**
   * Backward-compatible render method for discrete grid RobotState.
   * Converts grid (col, row, direction) to world pose and delegates to renderWorld.
   */
  public render(robot: RobotState, immediate: boolean = false): Promise<void> {
    if (this.coordinateConverter) {
      const targetPos = this.coordinateConverter.toWorldPosition(robot.x, robot.y);
      const targetAngle = this.directionToAngle(robot.direction);
      const cellSize = this.coordinateConverter.getCellSize();
      this.config.robotRadius = Math.max(12, Math.floor((cellSize - 12) / 2));
      return this.renderWorld({x: targetPos.x, y: targetPos.y, rotation: targetAngle}, immediate);
    } else {
      const targetAngle = this.directionToAngle(robot.direction);
      return this.renderWorld({x: robot.x, y: robot.y, rotation: targetAngle}, immediate);
    }
  }

  /**
   * Resets the robot visually immediately (no animation).
   */
  public reset(pose: WorldRobotPose | RobotState): Promise<void> {
    this.stopMovementTween(false);
    this.stopTurnTween(false);
    if ('rotation' in pose) {
      return this.renderWorld(pose, true);
    } else {
      return this.render(pose, true);
    }
  }

  /**
   * Draws robot visual shape in local container space facing East (+X axis).
   * Rotation of the container then orientates the robot seamlessly without angular offset.
   */
  private drawRobotGraphics(radius: number): void {
    this.bodyGraphics.clear();
    this.pointerGraphics.clear();

    // 1. Robot chassis / contact shadow
    this.bodyGraphics.fillStyle(0x1e3a8a, 0.25);
    this.bodyGraphics.fillCircle(0, 2, radius + 1);

    // 2. Robot body (cheerful robotic blue)
    this.bodyGraphics.fillStyle(0x2563eb, 1);
    this.bodyGraphics.fillCircle(0, 0, radius);

    // 3. Robot chassis border
    this.bodyGraphics.lineStyle(2, 0x1d4ed8, 1);
    this.bodyGraphics.strokeCircle(0, 0, radius);

    // 4. Robot visor / optical scanner (cyan) facing forward along +X
    const visorSpanY = radius * 1.1;
    const visorThicknessX = radius * 0.55;
    this.bodyGraphics.fillStyle(0x67e8f9, 1);
    this.bodyGraphics.fillRoundedRect(
      radius * 0.15,
      -visorSpanY / 2,
      visorThicknessX,
      visorSpanY,
      3,
    );

    // 5. Visor inner border
    this.bodyGraphics.lineStyle(1, 0x06b6d4, 0.8);
    this.bodyGraphics.strokeRoundedRect(
      radius * 0.15,
      -visorSpanY / 2,
      visorThicknessX,
      visorSpanY,
      3,
    );

    // 6. Directional Front Pointer (amber orientation triangle pointing along +X)
    const tipDistance = radius + 6;
    const baseDistance = radius - 2;
    const halfWidth = 5;

    this.pointerGraphics.fillStyle(0xf59e0b, 1);
    this.pointerGraphics.fillTriangle(
      tipDistance, 0,
      baseDistance, -halfWidth,
      baseDistance, halfWidth,
    );
    this.pointerGraphics.lineStyle(1.5, 0xd97706, 1);
    this.pointerGraphics.strokeTriangle(
      tipDistance, 0,
      baseDistance, -halfWidth,
      baseDistance, halfWidth,
    );

    // 7. Direction Symbol Badge
    this.directionBadge.setText('▶');
    this.directionBadge.setPosition(-radius * 0.25, 0);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public destroy(): void {
    this.stopMovementTween(false);
    this.stopTurnTween(false);
    this.notifyPendingResolved();
    this.container.destroy(true);
  }
}

