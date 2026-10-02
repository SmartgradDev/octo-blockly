/**
 * RobotState — a simple model representing the robot's position
 * and direction on a 2D grid.
 *
 * This file has no side effects and no DOM dependencies.
 */

/** The four cardinal directions the robot can face. */
export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

/** The robot's state on the grid. */
export interface RobotState {
  x: number;
  y: number;
  direction: Direction;
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
): RobotState {
  return {x, y, direction};
}
