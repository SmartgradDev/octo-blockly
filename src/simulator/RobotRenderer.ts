/**
 * RobotRenderer — dedicated Phaser 4 robot presentation renderer.
 *
 * Architecture Rules:
 * 1. Single source of truth: RobotState (x, y, direction, motorSpeed, battery)
 *    is owned and updated strictly by the shared Robot Engine.
 * 2. RobotRenderer never alters or duplicates state.
 * 3. It converts logical grid coordinates (col, row) into Phaser world coordinates (px, py).
 * 4. It animates visual position transitions using Phaser 4 tweens.
 * 5. It animates visual turning rotations smoothly using Phaser 4 rotation tweens,
 *    choosing the shortest/expected angular path.
 * 6. Visual tweens never block or dictate logical simulation correctness.
 */

import * as Phaser from 'phaser';
import {Direction, RobotState} from '../robot/RobotState';

export interface GridCoordinateConverter {
  toWorldPosition(col: number, row: number): {x: number; y: number};
  getCellSize(): number;
}

export interface RobotRendererConfig {
  /** Configurable movement animation duration in milliseconds (default: 250ms) */
  moveDurationMs: number;
  /** Configurable rotation animation duration in milliseconds (default: 200ms) */
  turnDurationMs: number;
}

export const DEFAULT_ROBOT_RENDERER_CONFIG: RobotRendererConfig = {
  moveDurationMs: 250,
  turnDurationMs: 200,
};

export class RobotRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private pointerGraphics: Phaser.GameObjects.Graphics;
  private directionBadge: Phaser.GameObjects.Text;
  private coordinateConverter: GridCoordinateConverter;
  private config: RobotRendererConfig;

  // Visual tween tracking
  private activeMoveTween: Phaser.Tweens.Tween | null = null;
  private activeTurnTween: Phaser.Tweens.Tween | null = null;
  private lastRenderedDirection: Direction | null = null;
  private isInitialized: boolean = false;
  private lastDrawnCellSize: number = 0;

  constructor(
    scene: Phaser.Scene,
    coordinateConverter: GridCoordinateConverter,
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

    // Pointer graphics (directional front arrow pointing along local NORTH = -Y)
    this.pointerGraphics = this.scene.add.graphics();
    this.container.add(this.pointerGraphics);

    // Direction symbol badge
    this.directionBadge = this.scene.add.text(0, 0, '▲', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.directionBadge.setOrigin(0.5, 0.5);
    this.container.add(this.directionBadge);
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
  }

  /**
   * Maps cardinal direction to continuous angle in radians (local NORTH is 0 radians).
   */
  private directionToAngle(dir: Direction): number {
    switch (dir) {
      case 'NORTH':
        return 0;
      case 'EAST':
        return Math.PI / 2; // +90 deg
      case 'SOUTH':
        return Math.PI; // +180 deg
      case 'WEST':
        return (3 * Math.PI) / 2; // +270 deg (or -90 deg)
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
   * Main render method: takes authoritative RobotState and positions/orients Phaser GameObjects.
   *
   * @param robot Authoritative RobotState from Robot Engine
   * @param immediate If true (e.g. on reset or initial load), snaps position & rotation immediately
   */
  public render(robot: RobotState, immediate: boolean = false): void {
    const targetWorldPos = this.coordinateConverter.toWorldPosition(robot.x, robot.y);
    const cellSize = this.coordinateConverter.getCellSize();
    const radius = Math.floor((cellSize - 12) / 2);

    // Redraw chassis graphics if cell size changed or not initialized
    if (!this.isInitialized || this.lastDrawnCellSize !== cellSize) {
      this.drawRobotGraphics(radius);
      this.lastDrawnCellSize = cellSize;
    }

    const targetAngle = this.directionToAngle(robot.direction);

    // Initial placement or explicit reset/snap
    if (!this.isInitialized || immediate) {
      this.stopMovementTween(false);
      this.stopTurnTween(false);
      this.container.setPosition(targetWorldPos.x, targetWorldPos.y);
      this.container.setRotation(targetAngle);
      this.lastRenderedDirection = robot.direction;
      this.isInitialized = true;
      return;
    }

    // ── Position Handling ──────────────────────────────────────────────
    const currentX = this.container.x;
    const currentY = this.container.y;
    const dx = Math.abs(currentX - targetWorldPos.x);
    const dy = Math.abs(currentY - targetWorldPos.y);
    const hasMoved = dx > 0.5 || dy > 0.5;

    if (hasMoved) {
      this.stopMovementTween(false);
      this.activeMoveTween = this.scene.tweens.add({
        targets: this.container,
        x: targetWorldPos.x,
        y: targetWorldPos.y,
        duration: this.config.moveDurationMs,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.activeMoveTween = null;
        },
      });
    }

    // ── Rotation Handling ──────────────────────────────────────────────
    const hasTurned = this.lastRenderedDirection !== robot.direction;
    if (hasTurned) {
      this.lastRenderedDirection = robot.direction;
      this.stopTurnTween(false);

      const currentRotation = this.container.rotation;
      const angleDelta = this.getShortestAngleDelta(currentRotation, targetAngle);
      const destinationAngle = currentRotation + angleDelta;

      this.activeTurnTween = this.scene.tweens.add({
        targets: this.container,
        rotation: destinationAngle,
        duration: this.config.turnDurationMs,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.activeTurnTween = null;
          // Keep rotation normalized within [0, 2*PI)
          this.container.setRotation(((destinationAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
        },
      });
    }
  }

  /**
   * Resets the robot visually to logical grid position & direction immediately (no animation).
   */
  public reset(robot: RobotState): void {
    this.stopMovementTween(false);
    this.stopTurnTween(false);
    this.render(robot, true);
  }

  /**
   * Draws robot visual shape once in local container space facing forward (along -Y).
   * Rotation of the container then orientates the robot seamlessly.
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

    // 4. Robot visor / optical scanner (cyan) facing forward (-Y)
    const visorWidth = radius * 1.1;
    const visorHeight = radius * 0.65;
    this.bodyGraphics.fillStyle(0x67e8f9, 1);
    this.bodyGraphics.fillRoundedRect(
      -visorWidth / 2,
      -radius * 0.65,
      visorWidth,
      visorHeight,
      3,
    );

    // 5. Visor inner border
    this.bodyGraphics.lineStyle(1, 0x06b6d4, 0.8);
    this.bodyGraphics.strokeRoundedRect(
      -visorWidth / 2,
      -radius * 0.65,
      visorWidth,
      visorHeight,
      3,
    );

    // 6. Directional Front Pointer (amber/orange orientation triangle pointing along -Y)
    const tipDistance = radius + 6;
    const baseDistance = radius - 2;
    const halfWidth = 5;

    this.pointerGraphics.fillStyle(0xf59e0b, 1);
    this.pointerGraphics.fillTriangle(0, -tipDistance, -halfWidth, -baseDistance, halfWidth, -baseDistance);
    this.pointerGraphics.lineStyle(1.5, 0xd97706, 1);
    this.pointerGraphics.strokeTriangle(0, -tipDistance, -halfWidth, -baseDistance, halfWidth, -baseDistance);

    // 7. Direction Symbol Badge
    this.directionBadge.setText('▲');
    this.directionBadge.setPosition(0, radius * 0.25);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public destroy(): void {
    this.stopMovementTween(false);
    this.stopTurnTween(false);
    this.container.destroy(true);
  }
}
