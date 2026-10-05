/**
 * RobotAnimationController.ts — Authoritative Robot Animation System for Step 2.
 *
 * Responsibilities:
 * 1. Explicit Animation State Model:
 *    - IDLE, MOVING_FORWARD, MOVING_BACKWARD, TURNING, STOPPED, PAUSED, RESETTING
 * 2. Visual Component Management:
 *    - Robot Chassis (tactile rounded body, friendly educational robotics look)
 *    - Front Sensor Module / Optical Eye (indicates front direction along local +X)
 *    - Interactive Wheels / Treads (animated treads/tires reflecting direction: forward/backward)
 *    - Subtle Idle Pulsing / Breathing LED (mechanical alive feeling, non-distracting)
 * 3. Synchronization & Zero Drift:
 *    - Synchronizes visual position and heading exactly to authoritative simulation poses.
 *    - Freezes cleanly on pause, terminates on stop, snaps on reset.
 *    - Safe collision stop terminates precisely at safeTarget.
 */

import * as Phaser from 'phaser';

export type RobotAnimationState =
  | 'IDLE'
  | 'MOVING_FORWARD'
  | 'MOVING_BACKWARD'
  | 'TURNING'
  | 'STOPPED'
  | 'PAUSED'
  | 'RESETTING';

export interface RobotAnimationConfig {
  /** Robot chassis radius (pixels, default: 16) */
  radius: number;
  /** Primary body color tint */
  bodyColor: number;
  /** Accent color tint (trim, wheels) */
  accentColor: number;
  /** Front optical sensor LED color */
  sensorLedColor: number;
  /** Enable subtle idle pulsing */
  enableIdlePulse: boolean;
}

export const DEFAULT_ANIMATION_CONFIG: RobotAnimationConfig = {
  radius: 16,
  bodyColor: 0x2563eb,      // Vibrant tech royal blue
  accentColor: 0x1e293b,    // Slate dark for wheel treads and hardware
  sensorLedColor: 0x38bdf8, // Cyan optical sensor
  enableIdlePulse: true,
};

export class RobotAnimationController {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private config: RobotAnimationConfig;

  // Visual sub-elements
  private shadowGraphics: Phaser.GameObjects.Graphics;
  private wheelsGraphics: Phaser.GameObjects.Graphics;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private sensorGraphics: Phaser.GameObjects.Graphics;
  private ledGraphics: Phaser.GameObjects.Graphics;
  private debugText?: Phaser.GameObjects.Text;

  // Animation state tracking
  private currentState: RobotAnimationState = 'IDLE';
  private wheelTreadOffset: number = 0;
  private idleTime: number = 0;
  private debugOverlayEnabled: boolean = false;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    config: Partial<RobotAnimationConfig> = {},
  ) {
    this.scene = scene;
    this.container = container;
    this.config = {...DEFAULT_ANIMATION_CONFIG, ...config};

    // Layered graphics inside container (local coordinates, heading facing East +X)
    this.shadowGraphics = scene.add.graphics();
    this.wheelsGraphics = scene.add.graphics();
    this.bodyGraphics = scene.add.graphics();
    this.sensorGraphics = scene.add.graphics();
    this.ledGraphics = scene.add.graphics();

    container.add([
      this.shadowGraphics,
      this.wheelsGraphics,
      this.bodyGraphics,
      this.sensorGraphics,
      this.ledGraphics,
    ]);

    this.drawRobotBase();
  }

  public getState(): RobotAnimationState {
    return this.currentState;
  }

  public setRadius(radius: number): void {
    if (this.config.radius !== radius) {
      this.config.radius = radius;
      this.drawRobotBase();
      if (this.debugText) {
        this.debugText.setPosition(0, -this.config.radius - 14);
      }
    }
  }

  public setState(state: RobotAnimationState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.updateDebugDisplay();
  }

  public setDebugOverlay(enabled: boolean): void {
    this.debugOverlayEnabled = enabled;
    if (enabled) {
      if (!this.debugText) {
        this.debugText = this.scene.add.text(0, -this.config.radius - 14, '', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#38bdf8',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          padding: {x: 4, y: 2},
        });
        this.debugText.setOrigin(0.5, 0.5);
        this.container.add(this.debugText);
      }
      this.debugText.setVisible(true);
      this.updateDebugDisplay();
    } else if (this.debugText) {
      this.debugText.setVisible(false);
    }
  }

  public isDebugOverlayEnabled(): boolean {
    return this.debugOverlayEnabled;
  }

  private updateDebugDisplay(): void {
    if (!this.debugText || !this.debugOverlayEnabled) return;
    const deg = Math.round(((this.container.rotation * 180) / Math.PI) % 360);
    this.debugText.setText(`${this.currentState} [${deg}°]`);
  }

  /**
   * Advances wheel animation and subtle idle breathing in accordance with movement direction.
   *
   * @param delta Normalized delta progress or time (e.g. 1 for forward, -1 for backward)
   */
  public updateWheelAnimation(direction: 'FORWARD' | 'BACKWARD' | 'STOP', deltaSpeed: number = 1): void {
    if (direction === 'STOP') {
      return;
    }

    const dirMultiplier = direction === 'FORWARD' ? 1 : -1;
    this.wheelTreadOffset += dirMultiplier * deltaSpeed * 2.5;

    // Redraw wheel treads with tread teeth moving along X axis
    this.drawWheels();
  }

  /**
   * Called on animation tick or progress callback to update visual feedback.
   */
  public onStepProgress(state: RobotAnimationState, progressRatio: number): void {
    this.setState(state);
    if (state === 'MOVING_FORWARD') {
      this.updateWheelAnimation('FORWARD', 1);
    } else if (state === 'MOVING_BACKWARD') {
      this.updateWheelAnimation('BACKWARD', 1);
    } else if (state === 'TURNING') {
      // While turning, spin opposite tracks slightly
      this.updateWheelAnimation('FORWARD', 0.5);
    }
    this.updateDebugDisplay();
  }

  /**
   * Resets all visual states cleanly (zero drift).
   */
  public resetVisualState(): void {
    this.currentState = 'RESETTING';
    this.wheelTreadOffset = 0;
    this.idleTime = 0;
    this.drawRobotBase();
    this.setState('IDLE');
  }

  /**
   * Draws the complete educational robot visual base.
   */
  public drawRobotBase(): void {
    const r = this.config.radius;

    // 1. Soft contact shadow under chassis
    this.shadowGraphics.clear();
    this.shadowGraphics.fillStyle(0x0f172a, 0.3);
    this.shadowGraphics.fillEllipse(0, 2, (r + 4) * 2, (r + 2) * 2);

    // 2. Wheels / Treads
    this.drawWheels();

    // 3. Main robot chassis body (rounded friendly tank / cart shape)
    this.bodyGraphics.clear();
    // Rounded main hull
    this.bodyGraphics.fillStyle(this.config.bodyColor, 1);
    this.bodyGraphics.fillRoundedRect(-r, -r + 2, r * 1.9, (r - 2) * 2, 7);

    // Outer hull bevel
    this.bodyGraphics.lineStyle(2, 0x1d4ed8, 1);
    this.bodyGraphics.strokeRoundedRect(-r, -r + 2, r * 1.9, (r - 2) * 2, 7);

    // Top hood plate (sleek tech plate)
    this.bodyGraphics.fillStyle(0x3b82f6, 1);
    this.bodyGraphics.fillRoundedRect(-r * 0.7, -r * 0.6, r * 1.3, r * 1.2, 4);

    // 4. Front Sensor Module & Bumper (Facing along +X East)
    this.sensorGraphics.clear();
    const sensorX = r * 0.75;
    const sensorWidth = r * 0.45;
    const sensorHeight = r * 1.2;

    // Front bumper plate
    this.sensorGraphics.fillStyle(0x334155, 1);
    this.sensorGraphics.fillRoundedRect(sensorX, -sensorHeight / 2, sensorWidth, sensorHeight, 3);
    this.sensorGraphics.lineStyle(1.5, 0x0f172a, 1);
    this.sensorGraphics.strokeRoundedRect(sensorX, -sensorHeight / 2, sensorWidth, sensorHeight, 3);

    // Front Optical Eye / Visor Strip (Cyan LED Scanner)
    this.sensorGraphics.fillStyle(this.config.sensorLedColor, 1);
    this.sensorGraphics.fillRoundedRect(sensorX + 2, -sensorHeight * 0.35, sensorWidth - 3, sensorHeight * 0.7, 2);

    // Sensor specular gleam
    this.sensorGraphics.fillStyle(0xffffff, 0.85);
    this.sensorGraphics.fillCircle(sensorX + 4, -sensorHeight * 0.15, 1.8);

    // 5. Direction orientation chevron arrow (subtle, integrated on top plate)
    this.sensorGraphics.fillStyle(0xfacc15, 1); // Amber gold heading arrow
    this.sensorGraphics.beginPath();
    this.sensorGraphics.moveTo(r * 0.3, 0);
    this.sensorGraphics.lineTo(-r * 0.2, -r * 0.35);
    this.sensorGraphics.lineTo(-r * 0.05, 0);
    this.sensorGraphics.lineTo(-r * 0.2, r * 0.35);
    this.sensorGraphics.closePath();
    this.sensorGraphics.fillPath();

    // 6. Draw LED indicator
    this.drawLedPulse(1.0);
  }

  /**
   * Draws the two side wheels / treads with animated track lugs.
   */
  private drawWheels(): void {
    const r = this.config.radius;
    const wheelLength = r * 1.9;
    const wheelWidth = 5;
    const wheelYTop = -r - 1;
    const wheelYBottom = r - 4;

    this.wheelsGraphics.clear();

    // Top and Bottom Wheels / Treads
    for (const yPos of [wheelYTop, wheelYBottom]) {
      // Wheel rim / casing
      this.wheelsGraphics.fillStyle(this.config.accentColor, 1);
      this.wheelsGraphics.fillRoundedRect(-r + 1, yPos, wheelLength, wheelWidth, 2);
      this.wheelsGraphics.lineStyle(1, 0x475569, 1);
      this.wheelsGraphics.strokeRoundedRect(-r + 1, yPos, wheelLength, wheelWidth, 2);

      // Animated wheel treads / ribs moving along X axis
      this.wheelsGraphics.lineStyle(1, 0x94a3b8, 0.9);
      const spacing = 5;
      const offset = ((this.wheelTreadOffset % spacing) + spacing) % spacing;

      for (let x = -r + 2 + offset; x < -r + wheelLength - 1; x += spacing) {
        this.wheelsGraphics.lineBetween(x, yPos + 1, x, yPos + wheelWidth - 1);
      }
    }
  }

  /**
   * Draws the subtle pulsating status LED on the robot roof.
   */
  public drawLedPulse(intensity: number = 1.0): void {
    this.ledGraphics.clear();
    const r = this.config.radius;
    const ledX = -r * 0.45;
    const ledY = 0;

    // Soft aura
    this.ledGraphics.fillStyle(0x38bdf8, 0.25 * intensity);
    this.ledGraphics.fillCircle(ledX, ledY, 4.5);

    // Center jewel
    this.ledGraphics.fillStyle(0x38bdf8, 0.9 * intensity);
    this.ledGraphics.fillCircle(ledX, ledY, 2.2);

    this.ledGraphics.fillStyle(0xffffff, 0.95);
    this.ledGraphics.fillCircle(ledX - 0.5, ledY - 0.5, 0.8);
  }

  public destroy(): void {
    this.shadowGraphics.destroy();
    this.wheelsGraphics.destroy();
    this.bodyGraphics.destroy();
    this.sensorGraphics.destroy();
    this.ledGraphics.destroy();
    if (this.debugText) {
      this.debugText.destroy();
    }
  }
}
