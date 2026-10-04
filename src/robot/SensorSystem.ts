/**
 * SensorSystem — Virtual Robotics Sensors Module
 *
 * Provides pure, deterministic virtual sensor functions:
 * 1. Front Obstacle Sensor: isObstacleAhead
 * 2. Distance Ahead Sensor: distanceAhead
 * 3. Color Under Robot Sensor: colorUnderRobot
 * 4. Line / Track Sensor: lineSensor
 *
 * Reads robot state, grid dimensions, obstacles, colored cells, and line tracks.
 * Does NOT mutate robot state or execute commands.
 */

import {RobotState, Direction, GridConfig} from './RobotState';
import {Position, ColoredCell, CellColor, LineSensorResult} from './Mission';

/** Check if a position (x,y) is blocked by an obstacle */
export function isBlocked(x: number, y: number, obstacles?: Position[]): boolean {
  if (!obstacles || obstacles.length === 0) return false;
  return obstacles.some((o) => o.x === x && o.y === y);
}

/** Vector deltas for directions */
export function directionDelta(dir: Direction): {dx: number; dy: number} {
  switch (dir) {
    case 'NORTH':
      return {dx: 0, dy: -1};
    case 'SOUTH':
      return {dx: 0, dy: 1};
    case 'EAST':
      return {dx: 1, dy: 0};
    case 'WEST':
      return {dx: -1, dy: 0};
  }
}

/** Relative direction deltas for left and right relative to robot heading */
export function relativeDirectionDeltas(dir: Direction): {
  left: {dx: number; dy: number};
  right: {dx: number; dy: number};
} {
  switch (dir) {
    case 'NORTH':
      return {left: {dx: -1, dy: 0}, right: {dx: 1, dy: 0}};
    case 'SOUTH':
      return {left: {dx: 1, dy: 0}, right: {dx: -1, dy: 0}};
    case 'EAST':
      return {left: {dx: 0, dy: -1}, right: {dx: 0, dy: 1}};
    case 'WEST':
      return {left: {dx: 0, dy: 1}, right: {dx: 0, dy: -1}};
  }
}

/** 1. Front Obstacle Sensor */
export function isObstacleAhead(
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
): boolean {
  const delta = directionDelta(robot.direction);
  const frontX = robot.x + delta.dx;
  const frontY = robot.y + delta.dy;

  if (frontX < 0 || frontX >= grid.width || frontY < 0 || frontY >= grid.height) {
    return true;
  }

  return isBlocked(frontX, frontY, obstacles);
}

/**
 * 2. Distance Ahead Sensor
 * Returns distance (step count) to the nearest obstacle or grid boundary in front of the robot.
 */
export function distanceAhead(
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
): number {
  const delta = directionDelta(robot.direction);
  let distance = 0;
  let curX = robot.x;
  let curY = robot.y;

  while (true) {
    const nextX = curX + delta.dx;
    const nextY = curY + delta.dy;

    // Check boundary
    if (nextX < 0 || nextX >= grid.width || nextY < 0 || nextY >= grid.height) {
      break;
    }

    distance++;

    // Check obstacle
    if (isBlocked(nextX, nextY, obstacles)) {
      break;
    }

    curX = nextX;
    curY = nextY;
  }

  return distance;
}

/**
 * 3. Color Sensor
 * Returns the color of the cell directly underneath the robot (RED, BLUE, GREEN, YELLOW, or NONE).
 */
export function colorUnderRobot(
  robot: RobotState,
  cellColors?: ColoredCell[],
): CellColor {
  if (!cellColors || cellColors.length === 0) return 'NONE';
  const found = cellColors.find((c) => c.x === robot.x && c.y === robot.y);
  return found ? found.color : 'NONE';
}

/**
 * 4. Line / Track Sensor
 * Returns line detection status for LEFT, CENTER, and RIGHT relative to robot position & heading.
 */
export function lineSensor(
  robot: RobotState,
  grid: GridConfig,
  lines?: Position[],
): LineSensorResult {
  if (!lines || lines.length === 0) {
    return {left: false, center: false, right: false};
  }

  const isLineAt = (x: number, y: number): boolean => {
    if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return false;
    return lines.some((l) => l.x === x && l.y === y);
  };

  const center = isLineAt(robot.x, robot.y);
  const relDeltas = relativeDirectionDeltas(robot.direction);
  const left = isLineAt(robot.x + relDeltas.left.dx, robot.y + relDeltas.left.dy);
  const right = isLineAt(robot.x + relDeltas.right.dx, robot.y + relDeltas.right.dy);

  return {left, center, right};
}
