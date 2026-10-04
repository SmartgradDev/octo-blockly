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

export type CellColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW' | 'NONE';

export interface ColoredCell extends Position {
  color: CellColor;
}

export interface LineSensorResult {
  left: boolean;
  center: boolean;
  right: boolean;
}

export type MissionDifficulty =
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'EXPERT';

export type ObjectiveType =
  | 'REACH_TARGET'
  | 'COLLECT_ITEMS'
  | 'VISIT_COLORS'
  | 'SURVIVE_WITH_BATTERY'
  | 'ACTION_LIMIT';

export interface ObjectiveConfig {
  type: ObjectiveType;
  requiredItemCount?: number;
  requiredColors?: CellColor[];
  minRemainingBattery?: number;
  maxActions?: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  gridSize: number;
  start: RobotState;
  target: TargetPosition;
  optimalCommandCount: number;
  obstacles?: Position[];
  cellColors?: ColoredCell[];
  lines?: Position[];
  items?: Position[];
  initialBattery?: number;
  objective?: ObjectiveConfig;
  difficulty?: MissionDifficulty;
  concepts?: string[];
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
    difficulty: 'BEGINNER',
    concepts: ['movement', 'navigation'],
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
    difficulty: 'BEGINNER',
    concepts: ['movement', 'turning'],
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
    difficulty: 'BEGINNER',
    concepts: ['movement'],
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
    difficulty: 'BEGINNER',
    concepts: ['movement'],
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
    difficulty: 'BEGINNER',
    concepts: ['movement', 'turning', 'navigation'],
    phase: 1,
  },
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
    difficulty: 'INTERMEDIATE',
    concepts: ['obstacles', 'pathfinding'],
    phase: 1,
  },
];

/** Phase 2 Missions: Logic (Obstacles, Sensors, Conditions, Loops) */
export const PHASE_2_MISSIONS: Mission[] = [
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
    difficulty: 'INTERMEDIATE',
    concepts: ['obstacles', 'loops'],
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
    difficulty: 'INTERMEDIATE',
    concepts: ['sensors', 'conditions', 'loops'],
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
    difficulty: 'ADVANCED',
    concepts: ['sensors', 'conditions', 'loops'],
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
    difficulty: 'ADVANCED',
    concepts: ['autonomous', 'sensors', 'conditions'],
    phase: 2,
  },
  {
    id: 'distance-challenge-11',
    title: '11. Distance Sensor Challenge',
    description: 'Use the "Distance Ahead" sensor block inside a loop to navigate until distance ahead < 2, then turn!',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 3, y: 3},
    optimalCommandCount: 7,
    obstacles: [{x: 4, y: 0}],
    difficulty: 'INTERMEDIATE',
    concepts: ['distance-sensor', 'conditions'],
    phase: 2,
  },
  {
    id: 'color-navigator-12',
    title: '12. Color Tile Navigator',
    description: 'Drive across colored tiles. Use the "Color Under Robot" sensor to turn on RED and BLUE tiles!',
    gridSize: 5,
    start: {x: 0, y: 2, direction: 'EAST'},
    target: {x: 2, y: 0},
    optimalCommandCount: 5,
    cellColors: [
      {x: 2, y: 2, color: 'RED'},
      {x: 2, y: 0, color: 'GREEN'},
    ],
    difficulty: 'INTERMEDIATE',
    concepts: ['color-sensor', 'conditions'],
    phase: 2,
  },
];

/** Phase 3 Missions: Programming Abstraction (Sensors, Variables, Functions, Battery & Objectives) */
export const PHASE_3_MISSIONS: Mission[] = [
  {
    id: 'line-follower-13',
    title: '13. Follow the Track',
    description: 'Follow the track using the Line Sensor to navigate to the goal!',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 2},
    optimalCommandCount: 6,
    lines: [
      {x: 0, y: 0},
      {x: 1, y: 0},
      {x: 2, y: 0},
      {x: 2, y: 1},
      {x: 2, y: 2},
      {x: 3, y: 2},
      {x: 4, y: 2},
    ],
    difficulty: 'ADVANCED',
    concepts: ['line-sensor', 'autonomous'],
    phase: 3,
  },
  {
    id: 'battery-saver-14',
    title: '14. Battery Saver Challenge',
    description: 'Reach the star at (4,0) before your 10.0 energy battery runs out! (Moves cost 1 energy, Turns cost 0.5 energy).',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 0},
    optimalCommandCount: 4,
    initialBattery: 10,
    objective: {type: 'REACH_TARGET'},
    difficulty: 'INTERMEDIATE',
    concepts: ['battery', 'motor-speed', 'optimization'],
    phase: 3,
  },
  {
    id: 'gem-collector-15',
    title: '15. Gem Collector',
    description: 'Objective: Collect all 3 gems scattered across the grid and then reach the target star!',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 4},
    optimalCommandCount: 8,
    items: [
      {x: 2, y: 0},
      {x: 2, y: 2},
      {x: 4, y: 2},
    ],
    objective: {
      type: 'COLLECT_ITEMS',
      requiredItemCount: 3,
    },
    difficulty: 'ADVANCED',
    concepts: ['items', 'multi-objective'],
    phase: 3,
  },
  {
    id: 'color-tour-16',
    title: '16. Color Waypoint Tour',
    description: 'Objective: Visit both the RED and BLUE colored tiles before reaching the target star!',
    gridSize: 5,
    start: {x: 0, y: 2, direction: 'EAST'},
    target: {x: 4, y: 2},
    optimalCommandCount: 6,
    cellColors: [
      {x: 2, y: 2, color: 'RED'},
      {x: 2, y: 0, color: 'BLUE'},
    ],
    objective: {
      type: 'VISIT_COLORS',
      requiredColors: ['RED', 'BLUE'],
    },
    difficulty: 'ADVANCED',
    concepts: ['color-waypoints', 'multi-objective'],
    phase: 3,
  },
  {
    id: 'battery-efficiency-17',
    title: '17. Battery Efficiency Master',
    description: 'Objective: Reach the target star at (4,0) while retaining at least 5.0 battery energy!',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 0},
    optimalCommandCount: 4,
    initialBattery: 8,
    objective: {
      type: 'SURVIVE_WITH_BATTERY',
      minRemainingBattery: 4.0,
    },
    difficulty: 'EXPERT',
    concepts: ['battery-survival', 'optimization'],
    phase: 3,
  },
  {
    id: 'action-speedrun-18',
    title: '18. Action Speedrun Limit',
    description: 'Objective: Reach the target star at (4,4) using 8 or fewer robot actions! Use REPEAT loops efficiently.',
    gridSize: 5,
    start: {x: 0, y: 0, direction: 'EAST'},
    target: {x: 4, y: 4},
    optimalCommandCount: 8,
    objective: {
      type: 'ACTION_LIMIT',
      maxActions: 8,
    },
    difficulty: 'EXPERT',
    concepts: ['action-limit', 'optimization', 'loops'],
    phase: 3,
  },
];

/** Phase definitions for UI categorization */
export const PHASES: PhaseCategory[] = [
  {
    id: 1,
    name: 'Commands',
    label: 'Phase 1: Commands',
    missions: PHASE_1_MISSIONS,
  },
  {
    id: 2,
    name: 'Logic',
    label: 'Phase 2: Logic',
    missions: PHASE_2_MISSIONS,
  },
  {
    id: 3,
    name: 'Programming abstraction',
    label: 'Phase 3: Programming abstraction',
    missions: PHASE_3_MISSIONS,
  },
];

/** Utility to retrieve missions for a specific Phase ID */
export function getMissionsByPhase(phaseId: number): Mission[] {
  switch (phaseId) {
    case 1:
      return PHASE_1_MISSIONS;
    case 2:
      return PHASE_2_MISSIONS;
    case 3:
      return PHASE_3_MISSIONS;
    default:
      return PHASE_1_MISSIONS;
  }
}

/** Utility to filter missions by difficulty (defaults to BEGINNER if unspecified) */
export function getMissionsByDifficulty(
  difficulty: MissionDifficulty | 'ALL',
  missions: Mission[],
): Mission[] {
  if (difficulty === 'ALL') return missions;
  return missions.filter((m) => (m.difficulty || 'BEGINNER') === difficulty);
}

/** All configuration-driven missions across Phase 1, Phase 2, and Phase 3. */
export const MISSIONS: Mission[] = [
  ...PHASE_1_MISSIONS,
  ...PHASE_2_MISSIONS,
  ...PHASE_3_MISSIONS,
];
