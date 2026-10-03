/**
 * Mission — configuration structure for robotics missions.
 *
 * Defines grid dimensions, initial robot state, target location, optional obstacles,
 * phase level, and optimal command counts.
 * Separated into Phase 1 (Novice) and Phase 2 (Proficient).
 */

import {RobotState} from './RobotState';

export interface Position {
  x: number;
  y: number;
}

export type TargetPosition = Position;

export interface Mission {
  id: string;
  title: string;
  description: string;
  gridSize: number;
  start: RobotState;
  target: TargetPosition;
  optimalCommandCount: number;
  obstacles?: Position[];
  phase: number;
}

export interface PhaseCategory {
  id: number;
  name: string;
  label: string;
  missions: Mission[];
}

/** Phase 1 Missions: Novice Level (Basic Navigation, No Obstacles) */
export const PHASE_1_MISSIONS: Mission[] = [
  {
    id: 'reach-the-star-01',
    title: '1. Reach the Star',
    description: 'Program the robot to move from (0,0) to the star at (4,4).',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 4},
    optimalCommandCount: 9,
    phase: 1,
  },
  {
    id: 'return-home-02',
    title: '2. Return Home',
    description: 'Guide the robot from (4,4) back to its home base at (0,0).',
    gridSize: 5,
    start: {x: 4, y: 4, direction: 'WEST'},
    target: {x: 0, y: 0},
    optimalCommandCount: 9,
    phase: 1,
  },
  {
    id: 'visit-blue-cell-03',
    title: '3. Visit the Blue Cell',
    description: 'Drive straight ahead from (2,4) to reach the cell at (2,0).',
    gridSize: 5,
    start: {x: 2, y: 4, direction: 'NORTH'},
    target: {x: 2, y: 0},
    optimalCommandCount: 4,
    phase: 1,
  },
  {
    id: 'cross-the-grid-04',
    title: '4. Cross the Grid',
    description: 'Cross horizontally from (0,2) to (4,2).',
    gridSize: 5,
    start: {x: 0, y: 2, direction: 'EAST'},
    target: {x: 4, y: 2},
    optimalCommandCount: 4,
    phase: 1,
  },
  {
    id: 'find-the-treasure-05',
    title: '5. Find the Treasure',
    description: 'Navigate from (1,1) facing SOUTH to reach the treasure at (3,3).',
    gridSize: 5,
    start: {x: 1, y: 1, direction: 'SOUTH'},
    target: {x: 3, y: 3},
    optimalCommandCount: 5,
    phase: 1,
  },
];

/** Phase 2 Missions: Proficient Level (Obstacles & Autonomous Sensor Challenges) */
export const PHASE_2_MISSIONS: Mission[] = [
  {
    id: 'avoid-the-rocks-06',
    title: '6. Avoid the Rocks',
    description: 'Bypass the rock wall at column 2 to reach the target at (4,0).',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 0},
    optimalCommandCount: 10,
    obstacles: [
      {x: 2, y: 0},
      {x: 2, y: 1},
      {x: 2, y: 2},
    ],
    phase: 2,
  },
  {
    id: 'simple-maze-07',
    title: '7. Simple Maze',
    description: 'Navigate through the obstacle maze to reach the goal at (4,4).',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 4},
    optimalCommandCount: 12,
    obstacles: [
      {x: 1, y: 1},
      {x: 2, y: 1},
      {x: 3, y: 1},
      {x: 3, y: 3},
      {x: 2, y: 3},
      {x: 1, y: 3},
    ],
    phase: 2,
  },
  {
    id: 'obstacle-escape-08',
    title: '8. Obstacle Escape',
    description: 'Program the robot to navigate around obstacles using sensor checks inside a loop to automatically turn whenever a wall or rock is ahead!',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 0, y: 4},
    optimalCommandCount: 12,
    obstacles: [
      {x: 4, y: 0},
      {x: 4, y: 4},
      {x: 0, y: 3},
    ],
    phase: 2,
  },
  {
    id: 'dynamic-corridor-09',
    title: '9. Dynamic Corridor',
    description: 'Guide the robot through a winding corridor! Use obstacle sensor blocks inside a loop so the robot reacts dynamically to walls.',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 2},
    optimalCommandCount: 10,
    obstacles: [
      {x: 3, y: 0},
      {x: 4, y: 0},
      {x: 0, y: 1},
      {x: 1, y: 1},
      {x: 4, y: 1},
      {x: 0, y: 2},
      {x: 1, y: 2},
      {x: 2, y: 2},
      {x: 3, y: 3},
    ],
    phase: 2,
  },
  {
    id: 'treasure-hunter-10',
    title: '10. Treasure Hunter',
    description: 'Program the robot to reach the treasure without hitting any walls. Try to make the robot react to obstacles instead of manually programming every movement.',
    gridSize: 5,
    start: {x: 0, y: 4, direction: 'NORTH'},
    target: {x: 2, y: 2},
    optimalCommandCount: 9,
    obstacles: [
      {x: 0, y: 0},
      {x: 1, y: 0},
      {x: 2, y: 0},
      {x: 3, y: 0},
      {x: 4, y: 0},
      {x: 0, y: 2},
      {x: 1, y: 2},
      {x: 3, y: 2},
      {x: 4, y: 2},
      {x: 2, y: 3},
    ],
    phase: 2,
  },
];

/** Phase definitions for UI categorization */
export const PHASES: PhaseCategory[] = [
  {
    id: 1,
    name: 'Novice',
    label: 'Novice (Phase 1)',
    missions: PHASE_1_MISSIONS,
  },
  {
    id: 2,
    name: 'Proficient',
    label: 'Proficient (Phase 2)',
    missions: PHASE_2_MISSIONS,
  },
];

/** Utility to retrieve missions for a specific Phase ID */
export function getMissionsByPhase(phaseId: number): Mission[] {
  return phaseId === 2 ? PHASE_2_MISSIONS : PHASE_1_MISSIONS;
}

/** All configuration-driven missions across Phase 1 and Phase 2. */
export const MISSIONS: Mission[] = [...PHASE_1_MISSIONS, ...PHASE_2_MISSIONS];
