/**
 * Mission — configuration structure for robotics missions.
 *
 * Defines grid dimensions, initial robot state, target location, and optimal commands.
 * Allows creating multiple configuration-driven missions using the exact same engine.
 */

import {RobotState} from './RobotState';

export interface TargetPosition {
  x: number;
  y: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  gridSize: number;
  start: RobotState;
  target: TargetPosition;
  optimalCommandCount: number;
}

/** 5 Configuration-driven missions. */
export const MISSIONS: Mission[] = [
  {
    id: 'reach-the-star-01',
    title: '1. Reach the Star',
    description: 'Program the robot to move from (0,0) to the star at (4,4).',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 4},
    optimalCommandCount: 9,
  },
  {
    id: 'return-home-02',
    title: '2. Return Home',
    description: 'Guide the robot from (4,4) back to its home base at (0,0).',
    gridSize: 5,
    start: {x: 4, y: 4, direction: 'WEST'},
    target: {x: 0, y: 0},
    optimalCommandCount: 9,
  },
  {
    id: 'visit-blue-cell-03',
    title: '3. Visit the Blue Cell',
    description: 'Drive straight ahead from (2,4) to reach the cell at (2,0).',
    gridSize: 5,
    start: {x: 2, y: 4, direction: 'NORTH'},
    target: {x: 2, y: 0},
    optimalCommandCount: 4,
  },
  {
    id: 'cross-the-grid-04',
    title: '4. Cross the Grid',
    description: 'Cross horizontally from (0,2) to (4,2).',
    gridSize: 5,
    start: {x: 0, y: 2, direction: 'EAST'},
    target: {x: 4, y: 2},
    optimalCommandCount: 4,
  },
  {
    id: 'find-the-treasure-05',
    title: '5. Find the Treasure',
    description: 'Navigate from (1,1) facing SOUTH to reach the treasure at (3,3).',
    gridSize: 5,
    start: {x: 1, y: 1, direction: 'SOUTH'},
    target: {x: 3, y: 3},
    optimalCommandCount: 5,
  },
];
