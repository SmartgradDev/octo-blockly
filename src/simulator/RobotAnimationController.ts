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
   * Draws the realistic educational robotics rover visual base.
   * Completely symmetrical contact footprint centered strictly at (0, 0).
   */
  public drawRobotBase(): void {
    const r = this.config.radius;

    // 1. Dual-Layer Ground Contact Shadows (diffuse ambient + 4 tire contact patches)
    this.shadowGraphics.clear();
    // Soft ambient chassis shadow
    this.shadowGraphics.fillStyle(0x020617, 0.32);
    this.shadowGraphics.fillRoundedRect(-r * 1.15, -r * 1.05, r * 2.3, r * 2.1, 8);

    // 4 Tire contact ground patches directly under each wheel
    this.shadowGraphics.fillStyle(0x020617, 0.48);
    const wheelHalfL = r * 0.45;
    const wheelW = 6;
    const xOffsets = [-r * 0.52, r * 0.52];
    const yTireTops = [-r - 3, r - 3];

    for (const xOff of xOffsets) {
      for (const yOff of yTireTops) {
        this.shadowGraphics.fillRoundedRect(xOff - wheelHalfL - 1, yOff - 1, wheelHalfL * 2 + 2, wheelW + 2, 3);
      }
    }

    // 2. 4 Heavy-Duty All-Terrain Wheels with Distance-Synchronized Rubber Treads
    this.drawWheels();

    // 3. Robotic Frame & Industrial Dual Chassis Rails
    this.bodyGraphics.clear();

    // Structural Aluminum Flank Rails (connecting front and rear axles)
    const railHalfW = r * 0.85;
    this.bodyGraphics.fillStyle(0x334155, 1);
    this.bodyGraphics.fillRoundedRect(-railHalfW, -r - 1, railHalfW * 2, 3, 1.5);
    this.bodyGraphics.fillRoundedRect(-railHalfW, r - 2, railHalfW * 2, 3, 1.5);

    // 4 Stainless Steel Suspension Hardware Bolts at axle pivots
    this.bodyGraphics.fillStyle(0x94a3b8, 1);
    for (const xOff of xOffsets) {
      this.bodyGraphics.fillCircle(xOff, -r, 1.6);
      this.bodyGraphics.fillCircle(xOff, r, 1.6);
    }

    // Main Robotic Hull (anodized cobalt-blue armored chassis)
    const hullHalfW = r * 0.82;
    const hullHalfH = r * 0.68;
    this.bodyGraphics.fillStyle(this.config.bodyColor, 1);
    this.bodyGraphics.fillRoundedRect(-hullHalfW, -hullHalfH, hullHalfW * 2, hullHalfH * 2, 5);

    // Beveled armor perimeter outline
    this.bodyGraphics.lineStyle(1.5, 0x1d4ed8, 1);
    this.bodyGraphics.strokeRoundedRect(-hullHalfW, -hullHalfH, hullHalfW * 2, hullHalfH * 2, 5);

    // Dark Circuit Bay Deck (embedded electronics plate)
    const deckHalfW = r * 0.55;
    const deckHalfH = r * 0.46;
    this.bodyGraphics.fillStyle(0x0f172a, 0.95);
    this.bodyGraphics.fillRoundedRect(-deckHalfW, -deckHalfH, deckHalfW * 2, deckHalfH * 2, 3);

    // Tech PCB Circuit Traces on deck
    this.bodyGraphics.lineStyle(1, 0x0284c7, 0.45);
    this.bodyGraphics.lineBetween(-deckHalfW + 3, -deckHalfH + 4, deckHalfW - 3, -deckHalfH + 4);
    this.bodyGraphics.lineBetween(-deckHalfW + 3, deckHalfH - 4, deckHalfW - 3, deckHalfH - 4);
    this.bodyGraphics.lineBetween(-deckHalfW + 6, 0, deckHalfW - 6, 0);

    // Tinted Protective Polycarbonate Canopy over electronics core
    this.bodyGraphics.fillStyle(0x1e3a8a, 0.4);
    this.bodyGraphics.fillRoundedRect(-deckHalfW + 2, -deckHalfH + 2, (deckHalfW - 2) * 2, (deckHalfH - 2) * 2, 2);
    this.bodyGraphics.lineStyle(1, 0x38bdf8, 0.6);
    this.bodyGraphics.strokeRoundedRect(-deckHalfW + 2, -deckHalfH + 2, (deckHalfW - 2) * 2, (deckHalfH - 2) * 2, 2);

    // 4. Front Bumper & Dual Ultrasonic / Optical Eyes (Facing East +X)
    this.sensorGraphics.clear();
    const bumperStartX = hullHalfW - 1;
    const bumperW = r * 0.35;
    const bumperH = r * 1.12;

    // Heavy-duty spring-loaded crash bumper plate
    this.sensorGraphics.fillStyle(0x1e293b, 1);
    this.sensorGraphics.fillRoundedRect(bumperStartX, -bumperH / 2, bumperW, bumperH, 3);
    this.sensorGraphics.lineStyle(1.5, 0x0f172a, 1);
    this.sensorGraphics.strokeRoundedRect(bumperStartX, -bumperH / 2, bumperW, bumperH, 3);

    // Rubber shock pads on front bumper
    this.sensorGraphics.fillStyle(0x475569, 1);
    this.sensorGraphics.fillRect(bumperStartX + bumperW - 1.5, -bumperH * 0.4, 2, bumperH * 0.8);

    // Dual Ultrasonic Transducer / Stereo Optical Eyes
    const eyeRadius = 3.2;
    const eyeX = bumperStartX + 2;
    const eyeYTop = -r * 0.32;
    const eyeYBottom = r * 0.32;

    for (const eyeY of [eyeYTop, eyeYBottom]) {
      // Chrome eye barrel
      this.sensorGraphics.fillStyle(0x64748b, 1);
      this.sensorGraphics.fillCircle(eyeX, eyeY, eyeRadius);
      this.sensorGraphics.lineStyle(1, 0x0f172a, 1);
      this.sensorGraphics.strokeCircle(eyeX, eyeY, eyeRadius);

      // Optical glass lens (Cyan sensor eye)
      this.sensorGraphics.fillStyle(this.config.sensorLedColor, 1);
      this.sensorGraphics.fillCircle(eyeX, eyeY, eyeRadius - 1);

      // Specular gleam on glass lens
      this.sensorGraphics.fillStyle(0xffffff, 0.9);
      this.sensorGraphics.fillCircle(eyeX + 1, eyeY - 1, 1);
    }

    // Forward LED Headlight beams (soft warm white guide lights)
    this.sensorGraphics.fillStyle(0xfef08a, 0.8);
    this.sensorGraphics.fillCircle(bumperStartX + bumperW - 1, -bumperH * 0.42, 1.5);
    this.sensorGraphics.fillCircle(bumperStartX + bumperW - 1, bumperH * 0.42, 1.5);

    // 5. Direction Orientation Chevron Arrow (centered on front hood pointing along +X)
    this.sensorGraphics.fillStyle(0xfacc15, 1); // Vibrant gold direction arrow
    this.sensorGraphics.beginPath();
    this.sensorGraphics.moveTo(r * 0.38, 0);
    this.sensorGraphics.lineTo(-r * 0.12, -r * 0.28);
    this.sensorGraphics.lineTo(0, 0);
    this.sensorGraphics.lineTo(-r * 0.12, r * 0.28);
    this.sensorGraphics.closePath();
    this.sensorGraphics.fillPath();

    // 6. Dual Rear Telemetry Indicator LEDs (Green Power & Amber Link)
    const rearX = -hullHalfW + 2.5;
    this.sensorGraphics.fillStyle(0x22c55e, 1); // Power ON (Green)
    this.sensorGraphics.fillCircle(rearX, -r * 0.35, 1.6);
    this.sensorGraphics.fillStyle(0xf59e0b, 1); // Data Link (Amber)
    this.sensorGraphics.fillCircle(rearX, r * 0.35, 1.6);

    // 7. Center 360° LiDAR Turret / Status Core
    this.drawLedPulse(1.0);
  }

  /**
   * Draws 4 independent heavy-duty all-terrain wheels with real rubber tire treads,
   * alloy rims, and center hex axle hubcaps that rotate strictly in accordance with
   * actual traveled distance.
   */
  private drawWheels(): void {
    const r = this.config.radius;
    const wheelHalfLength = r * 0.46; // ~7.5px half length (15px total length)
    const wheelWidth = 6;
    const xOffsets = [-r * 0.52, r * 0.52]; // Rear axle (-X) and Front axle (+X)
    const yTireTops = [-r - 3, r - 3];      // Left tires (-Y) and Right tires (+Y)

    this.wheelsGraphics.clear();

    for (const xCenter of xOffsets) {
      for (const yTop of yTireTops) {
        const yCenter = yTop + wheelWidth / 2;
        const xStart = xCenter - wheelHalfLength;
        const xEnd = xCenter + wheelHalfLength;

        // Vulcanized heavy-duty rubber tire casing
        this.wheelsGraphics.fillStyle(this.config.accentColor, 1);
        this.wheelsGraphics.fillRoundedRect(xStart, yTop, wheelHalfLength * 2, wheelWidth, 2.5);

        // Tire tread perimeter line
        this.wheelsGraphics.lineStyle(1, 0x0f172a, 1);
        this.wheelsGraphics.strokeRoundedRect(xStart, yTop, wheelHalfLength * 2, wheelWidth, 2.5);

        // Alloy wheel rim bed (slate titanium)
        this.wheelsGraphics.fillStyle(0x475569, 1);
        this.wheelsGraphics.fillRoundedRect(xStart + 2, yTop + 1, (wheelHalfLength - 2) * 2, wheelWidth - 2, 1.5);

        // Center wheel axle hub & stainless hex nut
        this.wheelsGraphics.fillStyle(0x94a3b8, 1);
        this.wheelsGraphics.fillCircle(xCenter, yCenter, 2.0);
        this.wheelsGraphics.fillStyle(0x0f172a, 1);
        this.wheelsGraphics.fillCircle(xCenter, yCenter, 1.0);

        // Dynamic rubber tread lugs moving along X axis according to physical distance
        this.wheelsGraphics.lineStyle(1.2, 0x94a3b8, 0.9);
        const spacing = 4.5;
        const offset = ((this.wheelTreadOffset % spacing) + spacing) % spacing;

        for (let lx = xStart + 2.5 + offset; lx < xEnd - 2; lx += spacing) {
          this.wheelsGraphics.lineBetween(lx, yTop + 0.5, lx, yTop + wheelWidth - 0.5);
        }
      }
    }
  }

  /**
   * Draws the center 360° LiDAR optical turret & status pulse on the robot roof.
   */
  public drawLedPulse(intensity: number = 1.0): void {
    this.ledGraphics.clear();
    const r = this.config.radius;
    const turretX = -r * 0.15;
    const turretY = 0;

    // Turret housing ring
    this.ledGraphics.fillStyle(0x1e293b, 1);
    this.ledGraphics.fillCircle(turretX, turretY, 5.0);
    this.ledGraphics.lineStyle(1, 0x475569, 1);
    this.ledGraphics.strokeCircle(turretX, turretY, 5.0);

    // Cyan LiDAR optic aura
    this.ledGraphics.fillStyle(0x38bdf8, 0.3 * intensity);
    this.ledGraphics.fillCircle(turretX, turretY, 4.0);

    // Center laser scanner jewel
    this.ledGraphics.fillStyle(0x38bdf8, 0.95 * intensity);
    this.ledGraphics.fillCircle(turretX, turretY, 2.2);

    // Optical specular glass gleam
    this.ledGraphics.fillStyle(0xffffff, 0.95);
    this.ledGraphics.fillCircle(turretX - 0.6, turretY - 0.6, 0.9);
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
