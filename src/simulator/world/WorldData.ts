/**
 * WorldData.ts — Types and interfaces for continuous world maps in Step 2.
 *
 * All coordinates and dimensions use continuous 2D space (x, y in pixels/world units).
 * Continuous rotation is represented in radians (0 = Facing Right/East, -PI/2 = Facing Up/North).
 * Completely decoupled from discrete integer grid cells (col, row).
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface BoundingBox2D extends Point2D, Size2D {}

export * from './RoadData';
import {WorldRoad, WorldIntersection} from './RoadData';

/**
 * Legacy road segment format (retained for backward compatibility).
 */
export interface RoadSegment {
  id: string;
  name?: string;
  type: 'HORIZONTAL' | 'VERTICAL' | 'INTERSECTION';
  x: number;
  y: number;
  width: number;
  height: number;
  hasSidewalk?: boolean;
  sidewalkWidth?: number;
  dashedLaneMarking?: boolean;
}

export interface CrosswalkData {
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
}

export interface WorldBuilding extends BoundingBox2D {
  id: string;
  name: string;
  label?: string;
  roofColor: number;
  wallColor: number;
  accentColor?: number;
  windowCols?: number;
  windowRows?: number;
  doorPosition?: Point2D;
}

export interface WorldTree extends Point2D {
  id: string;
  canopyRadius: number;
  canopyColor?: number;
  trunkRadius?: number;
}

export interface ParkZone extends BoundingBox2D {
  id: string;
  name: string;
  grassColor?: number;
  pathWays?: Point2D[][];
}

export interface PolygonZone {
  id: string;
  name: string;
  type: 'RESTRICTED' | 'SPEED_LIMIT' | 'PARK' | 'HAZARD';
  points: Point2D[];
  color?: number;
}

export interface WorldObjectiveTarget {
  id: string;
  name: string;
  type: 'GOAL' | 'CHECKPOINT' | 'COLLECTIBLE_FOOD' | 'DROPOFF';
  position: Point2D;
  radius: number;
  color?: number;
  iconSymbol?: string;
}

export interface WorldMapData {
  id: string;
  name: string;
  description: string;
  bounds: Size2D;             // World total dimensions in world units (e.g. 800 x 600)
  groundColor: number;        // Primary terrain ground (e.g. grass green)
  roads: WorldRoad[];
  intersections?: WorldIntersection[];
  crosswalks?: CrosswalkData[];
  buildings: WorldBuilding[];
  trees: WorldTree[];
  parks?: ParkZone[];
  restrictedZones?: PolygonZone[];
  objectives: WorldObjectiveTarget[];
  spawnPoint: {
    position: Point2D;
    rotation: number;         // Continuous heading in radians
  };
}
