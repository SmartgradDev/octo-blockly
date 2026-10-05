/**
 * RoadData.ts — Structured Road and Intersection Data Model for Step 2.
 *
 * Architecture Principles:
 * 1. Single Source of Truth: Roads and intersections are structured world data,
 *    not arbitrary drawing calls in renderer code.
 * 2. Continuous Coordinates: All geometry uses floating-point world units (pixels)
 *    matching the Step 2 continuous space: Origin (0,0) top-left, +X East, +Y South.
 * 3. Explicit Centerlines: Each road defines a true centerline segment (start -> end).
 * 4. Explicit Width: Road width is a first-class property in world units.
 * 5. Explicit Topology: Roads reference connected intersections, and intersections
 *    reference connected roads.
 * 6. Simulation Neutral: This phase establishes world data foundations only;
 *    it does NOT enforce road boundaries or collision restrictions.
 */

import {Point2D, BoundingBox2D} from './WorldData';

export type RoadType = 'main-road' | 'secondary-road' | 'avenue' | 'street';

export type RoadOrientation = 'HORIZONTAL' | 'VERTICAL' | 'DIAGONAL';

/**
 * Structured specification of a continuous road segment.
 */
export interface WorldRoad {
  /** Stable semantic identifier, e.g. 'campus-way' */
  id: string;
  /** Human-readable display name, e.g. 'Campus Way' */
  name: string;
  /** Semantic road category */
  type?: RoadType;
  /** Centerline start point in continuous world coordinates */
  start: Point2D;
  /** Centerline end point in continuous world coordinates */
  end: Point2D;
  /** Explicit road width in world units (perpendicular to centerline) */
  width: number;
  /** Whether the road features bordering pedestrian sidewalks */
  hasSidewalk?: boolean;
  /** Width of the sidewalk bordering each side of the road (default: 10) */
  sidewalkWidth?: number;
  /** Whether yellow dashed lane divider is marked along the centerline */
  dashedLaneMarking?: boolean;
  /** Stable IDs of intersections connected to this road */
  connectedIntersectionIds?: string[];
}

/**
 * Structured specification of an intersection connecting multiple roads.
 */
export interface WorldIntersection {
  /** Stable semantic identifier, e.g. 'campus-square-crossing' */
  id: string;
  /** Human-readable display name, e.g. 'Campus Square Crossing' */
  name: string;
  /** Center point of the junction in continuous world coordinates */
  center: Point2D;
  /** Explicit junction width in world units */
  width: number;
  /** Explicit junction height in world units */
  height: number;
  /** Stable IDs of roads meeting at this intersection */
  connectedRoadIds: string[];
}

// ── Road Geometry Utilities ──────────────────────────────────────────

/**
 * Calculates Euclidean length of a road along its centerline.
 */
export function getRoadLength(road: WorldRoad): number {
  const dx = road.end.x - road.start.x;
  const dy = road.end.y - road.start.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculates orientation angle (heading) of a road centerline in radians.
 * Range: [-PI, +PI]. 0 rad = East, PI/2 = South, etc.
 */
export function getRoadHeading(road: WorldRoad): number {
  return Math.atan2(road.end.y - road.start.y, road.end.x - road.start.x);
}

/**
 * Determines primary cardinal orientation of a road segment.
 */
export function getRoadOrientation(road: WorldRoad): RoadOrientation {
  const dx = Math.abs(road.end.x - road.start.x);
  const dy = Math.abs(road.end.y - road.start.y);
  if (dy < 0.001) return 'HORIZONTAL';
  if (dx < 0.001) return 'VERTICAL';
  return 'DIAGONAL';
}

/**
 * Calculates midpoint of a road centerline.
 */
export function getRoadCenter(road: WorldRoad): Point2D {
  return {
    x: (road.start.x + road.end.x) / 2,
    y: (road.start.y + road.end.y) / 2,
  };
}

/**
 * Calculates unit direction (tangent) vector along road centerline.
 */
export function getRoadDirectionVector(road: WorldRoad): Point2D {
  const length = getRoadLength(road);
  if (length === 0) return {x: 1, y: 0};
  return {
    x: (road.end.x - road.start.x) / length,
    y: (road.end.y - road.start.y) / length,
  };
}

/**
 * Calculates unit normal vector perpendicular to road centerline (pointing left).
 */
export function getRoadNormalVector(road: WorldRoad): Point2D {
  const dir = getRoadDirectionVector(road);
  return {x: -dir.y, y: dir.x};
}

/**
 * Returns axis-aligned bounding box covering the entire road asphalt surface.
 */
export function getRoadBoundingBox(road: WorldRoad): BoundingBox2D {
  const orientation = getRoadOrientation(road);
  const halfW = road.width / 2;

  if (orientation === 'HORIZONTAL') {
    const minX = Math.min(road.start.x, road.end.x);
    const maxX = Math.max(road.start.x, road.end.x);
    return {
      x: minX,
      y: road.start.y - halfW,
      width: maxX - minX,
      height: road.width,
    };
  }

  if (orientation === 'VERTICAL') {
    const minY = Math.min(road.start.y, road.end.y);
    const maxY = Math.max(road.start.y, road.end.y);
    return {
      x: road.start.x - halfW,
      y: minY,
      width: road.width,
      height: maxY - minY,
    };
  }

  // General diagonal AABB
  const minX = Math.min(road.start.x, road.end.x) - halfW;
  const maxX = Math.max(road.start.x, road.end.x) + halfW;
  const minY = Math.min(road.start.y, road.end.y) - halfW;
  const maxY = Math.max(road.start.y, road.end.y) + halfW;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Returns axis-aligned bounding box covering an intersection area.
 */
export function getIntersectionBoundingBox(intersection: WorldIntersection): BoundingBox2D {
  return {
    x: intersection.center.x - intersection.width / 2,
    y: intersection.center.y - intersection.height / 2,
    width: intersection.width,
    height: intersection.height,
  };
}

/**
 * Calculates perpendicular Euclidean distance from a point to the road centerline segment.
 */
export function distancePointToRoadCenterline(point: Point2D, road: WorldRoad): number {
  const dx = road.end.x - road.start.x;
  const dy = road.end.y - road.start.y;
  const l2 = dx * dx + dy * dy;

  if (l2 === 0) {
    return Math.hypot(point.x - road.start.x, point.y - road.start.y);
  }

  // Projection parameter t clamped to segment [0, 1]
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - road.start.x) * dx + (point.y - road.start.y) * dy) / l2,
    ),
  );

  const projX = road.start.x + t * dx;
  const projY = road.start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Checks whether a 2D world coordinate falls inside the asphalt surface of a road.
 * (Utility for future collision/zone checks; does NOT affect movement in Phase 4.16).
 */
export function isPointOnRoad(point: Point2D, road: WorldRoad): boolean {
  const dist = distancePointToRoadCenterline(point, road);
  if (dist > road.width / 2) return false;

  // Longitudinal segment check
  const dx = road.end.x - road.start.x;
  const dy = road.end.y - road.start.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist <= road.width / 2;

  const t = ((point.x - road.start.x) * dx + (point.y - road.start.y) * dy) / l2;
  return t >= 0 && t <= 1;
}

/**
 * Checks whether a 2D world coordinate falls inside an intersection's bounds.
 */
export function isPointInIntersection(point: Point2D, intersection: WorldIntersection): boolean {
  const halfW = intersection.width / 2;
  const halfH = intersection.height / 2;
  return (
    point.x >= intersection.center.x - halfW &&
    point.x <= intersection.center.x + halfW &&
    point.y >= intersection.center.y - halfH &&
    point.y <= intersection.center.y + halfH
  );
}

// ── Road System Validation ───────────────────────────────────────────

export interface RoadValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Performs lightweight runtime integrity validation on road and intersection data.
 */
export function validateRoadSystem(
  roads: WorldRoad[],
  intersections: WorldIntersection[] = [],
): RoadValidationResult {
  const errors: string[] = [];
  const roadIdSet = new Set<string>();
  const intersectionIdSet = new Set<string>();

  // 1. Validate roads
  for (const road of roads) {
    if (!road.id || road.id.trim() === '') {
      errors.push(`Road has missing or empty id`);
    } else if (roadIdSet.has(road.id)) {
      errors.push(`Duplicate road id: "${road.id}"`);
    } else {
      roadIdSet.add(road.id);
    }

    if (!Number.isFinite(road.start.x) || !Number.isFinite(road.start.y)) {
      errors.push(`Road "${road.id}" has invalid start coordinates (${road.start.x}, ${road.start.y})`);
    }
    if (!Number.isFinite(road.end.x) || !Number.isFinite(road.end.y)) {
      errors.push(`Road "${road.id}" has invalid end coordinates (${road.end.x}, ${road.end.y})`);
    }
    if (road.width <= 0 || !Number.isFinite(road.width)) {
      errors.push(`Road "${road.id}" has invalid width: ${road.width}`);
    }
    if (getRoadLength(road) === 0) {
      errors.push(`Road "${road.id}" has zero length (start equals end)`);
    }
  }

  // 2. Validate intersections
  for (const inter of intersections) {
    if (!inter.id || inter.id.trim() === '') {
      errors.push(`Intersection has missing or empty id`);
    } else if (intersectionIdSet.has(inter.id)) {
      errors.push(`Duplicate intersection id: "${inter.id}"`);
    } else {
      intersectionIdSet.add(inter.id);
    }

    if (!Number.isFinite(inter.center.x) || !Number.isFinite(inter.center.y)) {
      errors.push(`Intersection "${inter.id}" has invalid center (${inter.center.x}, ${inter.center.y})`);
    }
    if (inter.width <= 0 || !Number.isFinite(inter.width)) {
      errors.push(`Intersection "${inter.id}" has invalid width: ${inter.width}`);
    }
    if (inter.height <= 0 || !Number.isFinite(inter.height)) {
      errors.push(`Intersection "${inter.id}" has invalid height: ${inter.height}`);
    }

    // Verify connected road references exist
    for (const roadId of inter.connectedRoadIds) {
      if (!roadIdSet.has(roadId)) {
        errors.push(`Intersection "${inter.id}" references nonexistent road: "${roadId}"`);
      }
    }
  }

  // 3. Verify road intersection references exist
  for (const road of roads) {
    if (road.connectedIntersectionIds) {
      for (const interId of road.connectedIntersectionIds) {
        if (!intersectionIdSet.has(interId)) {
          errors.push(`Road "${road.id}" references nonexistent intersection: "${interId}"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
