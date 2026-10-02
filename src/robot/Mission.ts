/**
 * Mission — configuration structure for robotics missions.
 *
 * Defines grid dimensions, initial robot state, and target location.
 * Allows creating multiple missions without changing the simulator engine.
 */

import {RobotState} from './RobotState';

export interface TargetPosition {
  x: number;
  y: number;
}

export interface Mission {
  id: string;
  title: string;
  gridSize: number;
  start: RobotState;
  target: TargetPosition;
}

/** First mission: Reach the Star on a 5x5 grid. */
export const FIRST_MISSION: Mission = {
  id: 'reach-the-star-01',
  title: 'Reach the Star',
  gridSize: 5,
  start: {
    x: 0,
    y: 0,
    direction: 'EAST',
  },
  target: {
    x: 4,
    y: 4,
  },
};
