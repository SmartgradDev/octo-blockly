/**
 * RobotState — a model representing the robot's position,
 * direction, motor speed, and battery/energy on a 2D grid.
 *
 * This file has no side effects and no DOM dependencies.
 */

/** The four cardinal directions the robot can face. */
export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

/** Valid robot commands. */
export type RobotCommand = 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'TURN_LEFT' | 'TURN_RIGHT';

/** The robot's state on the grid. */
export interface RobotState {
  x: number;
  y: number;
  direction: Direction;
  motorSpeed?: number; // 0..100, default 50
  battery?: number;    // current battery energy
  maxBattery?: number; // max battery capacity
}

/** Grid dimensions. */
export interface GridConfig {
  width: number;
  height: number;
}

/**
 * Create a fresh robot state with the given initial values.
 */
export function createRobotState(
  x: number,
  y: number,
  direction: Direction,
  motorSpeed: number = 50,
  initialBattery?: number,
): RobotState {
  return {
    x,
    y,
    direction,
    motorSpeed: Math.min(100, Math.max(0, motorSpeed)),
    battery: initialBattery !== undefined ? Math.max(0, initialBattery) : undefined,
    maxBattery: initialBattery !== undefined ? Math.max(0, initialBattery) : undefined,
  };
}
