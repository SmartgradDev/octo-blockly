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
   * Advances wheel/tread animation strictly based on actual continuous distance traveled (in pixels).
   *
   * @param signedDistance Signed linear distance in world pixels (positive = forward, negative = backward)
   */
  public advanceTreadsByDistance(signedDistance: number): void {
    if (Math.abs(signedDistance) < 0.0001) {
      return;
    }
    // Tread phase accumulates proportionally to actual distance traveled
    const treadScale = 0.75;
    this.wheelTreadOffset += signedDistance * treadScale;
    this.drawWheels();
    this.updateDebugDisplay();
  }

  /**
   * Advances wheel/tread animation based on actual angular rotation delta (in radians).
   * Differential track rotation during turns.
   *
   * @param deltaRadians Signed angular delta in radians
   */
  public advanceTreadsByAngularDelta(deltaRadians: number): void {
    if (Math.abs(deltaRadians) < 0.0001) {
      return;
    }
    const trackRadius = this.config.radius;
    this.wheelTreadOffset += deltaRadians * (trackRadius * 0.4);
    this.drawWheels();
    this.updateDebugDisplay();
  }

  /**
   * Backward-compatible helper for explicit directional updates.
   */
  public updateWheelAnimation(direction: 'FORWARD' | 'BACKWARD' | 'STOP', deltaSpeed: number = 1): void {
    if (direction === 'STOP') {
      return;
    }
    const dirMultiplier = direction === 'FORWARD' ? 1 : -1;
    this.advanceTreadsByDistance(dirMultiplier * deltaSpeed * 2.0);
  }

  /**
   * Called on animation tick or progress callback to update visual feedback.
   */
  public onStepProgress(state: RobotAnimationState, progressRatio: number): void {
    this.setState(state);
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
   * Draws the grounded, symmetrical educational robot visual base.
   * Geometric center of mass and contact footprint are centered at (0, 0).
   */
  public drawRobotBase(): void {
    const r = this.config.radius;

    // 1. Ground Contact Shadow (centered at (0, 0) on the ground plane, zero angular wobble)
    this.shadowGraphics.clear();
    this.shadowGraphics.fillStyle(0x0f172a, 0.35);
    this.shadowGraphics.fillRoundedRect(-r * 1.15, -r * 1.05, r * 2.3, r * 2.1, 8);

    // 2. Symmetrical Tracks / Wheels
    this.drawWheels();

    // 3. Main Chassis Hull (symmetrically centered at (0, 0))
    this.bodyGraphics.clear();
    const hullHalfW = r * 0.85;
    const hullHalfH = r * 0.7;

    // Rounded main hull
    this.bodyGraphics.fillStyle(this.config.bodyColor, 1);
    this.bodyGraphics.fillRoundedRect(-hullHalfW, -hullHalfH, hullHalfW * 2, hullHalfH * 2, 5);

    // Outer hull bevel
    this.bodyGraphics.lineStyle(1.5, 0x1d4ed8, 1);
    this.bodyGraphics.strokeRoundedRect(-hullHalfW, -hullHalfH, hullHalfW * 2, hullHalfH * 2, 5);

    // Top hood tech plate (symmetrically centered)
    const deckHalfW = r * 0.55;
    const deckHalfH = r * 0.45;
    this.bodyGraphics.fillStyle(0x3b82f6, 1);
    this.bodyGraphics.fillRoundedRect(-deckHalfW, -deckHalfH, deckHalfW * 2, deckHalfH * 2, 3);
    this.bodyGraphics.lineStyle(1, 0x60a5fa, 0.7);
    this.bodyGraphics.strokeRoundedRect(-deckHalfW, -deckHalfH, deckHalfW * 2, deckHalfH * 2, 3);

    // 4. Front Sensor Module & Bumper (Facing forward along +X East)
    this.sensorGraphics.clear();
    const bumperStartX = hullHalfW - 2;
    const bumperW = r * 0.38;
    const bumperH = r * 1.1;

    // Front bumper plate
    this.sensorGraphics.fillStyle(0x334155, 1);
    this.sensorGraphics.fillRoundedRect(bumperStartX, -bumperH / 2, bumperW, bumperH, 3);
    this.sensorGraphics.lineStyle(1.5, 0x0f172a, 1);
    this.sensorGraphics.strokeRoundedRect(bumperStartX, -bumperH / 2, bumperW, bumperH, 3);

    // Front Optical Eye / Visor Strip (Cyan LED Scanner lens)
    const lensX = bumperStartX + 2;
    const lensW = bumperW - 3;
    const lensH = bumperH * 0.65;
    this.sensorGraphics.fillStyle(this.config.sensorLedColor, 1);
    this.sensorGraphics.fillRoundedRect(lensX, -lensH / 2, lensW, lensH, 2);

    // Specular gleam on scanner lens
    this.sensorGraphics.fillStyle(0xffffff, 0.9);
    this.sensorGraphics.fillCircle(lensX + lensW * 0.5, -lensH * 0.2, 1.5);

    // 5. Direction Orientation Chevron Arrow (centered on hood pointing along +X)
    this.sensorGraphics.fillStyle(0xfacc15, 1); // Amber gold heading arrow
    this.sensorGraphics.beginPath();
    this.sensorGraphics.moveTo(r * 0.35, 0);
    this.sensorGraphics.lineTo(-r * 0.15, -r * 0.3);
    this.sensorGraphics.lineTo(-r * 0.02, 0);
    this.sensorGraphics.lineTo(-r * 0.15, r * 0.3);
    this.sensorGraphics.closePath();
    this.sensorGraphics.fillPath();

    // 6. Center Status LED
    this.drawLedPulse(1.0);
  }

  /**
   * Draws the two side tracks / wheels with distance-synchronized tread lugs and wheel hubs.
   * Symmetrically placed on top (-Y) and bottom (+Y) of the chassis.
   */
  private drawWheels(): void {
    const r = this.config.radius;
    const trackHalfLength = r * 1.05;
    const trackWidth = 6;
    const trackYTop = -r - 2;
    const trackYBottom = r - 4;

    this.wheelsGraphics.clear();

    // Top and Bottom Tracks (symmetrical about Y = 0)
    for (const yPos of [trackYTop, trackYBottom]) {
      const centerY = yPos + trackWidth / 2;

      // Track casing / rim
      this.wheelsGraphics.fillStyle(this.config.accentColor, 1);
      this.wheelsGraphics.fillRoundedRect(-trackHalfLength, yPos, trackHalfLength * 2, trackWidth, 2);
      this.wheelsGraphics.lineStyle(1, 0x475569, 1);
      this.wheelsGraphics.strokeRoundedRect(-trackHalfLength, yPos, trackHalfLength * 2, trackWidth, 2);

      // Sprocket / Pulley hubs at both ends
      const hubRadius = 2.2;
      this.wheelsGraphics.fillStyle(0x64748b, 1);
      this.wheelsGraphics.fillCircle(-trackHalfLength + 3, centerY, hubRadius);
      this.wheelsGraphics.fillCircle(trackHalfLength - 3, centerY, hubRadius);
      this.wheelsGraphics.fillStyle(0x0f172a, 1);
      this.wheelsGraphics.fillCircle(-trackHalfLength + 3, centerY, 1);
      this.wheelsGraphics.fillCircle(trackHalfLength - 3, centerY, 1);

      // Animated wheel treads / ribs moving along X axis according to wheelTreadOffset
      this.wheelsGraphics.lineStyle(1.2, 0x94a3b8, 0.95);
      const spacing = 5;
      const offset = ((this.wheelTreadOffset % spacing) + spacing) % spacing;

      for (let x = -trackHalfLength + 4 + offset; x < trackHalfLength - 3; x += spacing) {
        this.wheelsGraphics.lineBetween(x, yPos + 1, x, yPos + trackWidth - 1);
      }
    }
  }

  /**
   * Draws the subtle pulsating status LED on the robot roof.
   */
  public drawLedPulse(intensity: number = 1.0): void {
    this.ledGraphics.clear();
    const r = this.config.radius;
    const ledX = -r * 0.25;
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
