/**
 * WorldRobotState.ts — Continuous World-Coordinate Robot State for Step 2.
 *
 * Coordinate Convention:
 * - World Origin: (0, 0) is the top-left corner of the world map.
 * - Positive X axis: Extends East (to the right).
 * - Positive Y axis: Extends South (downwards in screen coordinates).
 * - Continuous Rotation (Heading) in Radians:
 *     0 rad (0°)          -> Facing East (+X axis)
 *     PI/2 rad (+1.5708)  -> Facing South (+Y axis)
 *     PI rad (±3.1416)    -> Facing West (-X axis)
 *     -PI/2 rad (-1.5708) -> Facing North (-Y axis)
 * - Units: World coordinates are floating-point numbers (pixels/world units).
 *          Speed is in world units per second.
 *          Rotation is in radians normalized to [-PI, +PI].
 *
 * This file is strictly decoupled from discrete integer grid cells (col, row)
 * and cardinal direction strings (NORTH, EAST, SOUTH, WEST).
 */

export type RobotMotionState = 'idle' | 'moving' | 'turning' | 'stopped';

export interface RobotPose2D {
  /** Continuous world X coordinate (pixels/world units) */
  x: number;
  /** Continuous world Y coordinate (pixels/world units) */
  y: number;
  /** Continuous orientation heading in radians (0 = East, PI/2 = South, etc.) */
  rotation: number;
}

export interface WorldRobotState extends RobotPose2D {
  /** Current movement speed in world units per second */
  speed: number;
  /** Motor speed setting (0..100) */
  motorSpeedSetting: number;
  /** Motion activity lifecycle */
  state: RobotMotionState;
  /** Optional energy / battery capacity */
  battery?: number;
  maxBattery?: number;
}

/**
 * Creates a fresh continuous world robot state.
 */
export function createWorldRobotState(
  x: number,
  y: number,
  rotation: number = 0,
  motorSpeedSetting: number = 50,
  initialBattery?: number,
): WorldRobotState {
  return {
    x,
    y,
    rotation: normalizeAngle(rotation),
    speed: 0,
    motorSpeedSetting: Math.min(100, Math.max(0, motorSpeedSetting)),
    state: 'idle',
    battery: initialBattery !== undefined ? Math.max(0, initialBattery) : undefined,
    maxBattery: initialBattery !== undefined ? Math.max(0, initialBattery) : undefined,
  };
}

/**
 * Normalizes an angle in radians into the range [-PI, +PI].
 */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let normalized = angle % twoPi;
  if (normalized > Math.PI) {
    normalized -= twoPi;
  } else if (normalized <= -Math.PI) {
    normalized += twoPi;
  }
  return normalized;
}

/**
 * Converts radians to human-readable degrees [0°, 360°).
 */
export function radiansToDegrees(radians: number): number {
  let deg = ((radians * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return deg;
}

