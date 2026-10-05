/**
 * WorldMovementPolicy.ts — Movement Policy & Traversability System for Step 2.
 *
 * Architecture Principles:
 * 1. Independent Subsystem: Determines "Where is the robot allowed to move for this mission?"
 *    Completely separated from physical collision detection, world rendering, and robot state.
 * 2. Simulation Neutral Default: 'FREE_WORLD' is the default policy where open terrain,
 *    grass, walkways, roads, and intersections are all traversable.
 * 3. Continuous Path-Aware: Evaluates the entire continuous movement trajectory (not merely
 *    start or target points), preventing the robot from cutting across forbidden terrain.
 * 4. Circular Footprint: Accounts for authoritative robot collision radius (default: 16px).
 *    Robot is not treated as a point mass.
 * 5. Deterministic Safe Stop: When a policy violation occurs, computes exact safe target
 *    immediately before the boundary (safeDistance = violationDistance - epsilon) so the
 *    robot animates smoothly up to the limit without visual popping or clipping.
 */

import {Point2D, Size2D, WorldMapData, PolygonZone} from './WorldData';
import {WorldRoad, WorldIntersection, isPointOnRoad, isPointInIntersection} from './RoadData';

export type WorldMovementPolicy =
  | 'FREE_WORLD'
  | 'ROAD_ONLY'
  | 'RESTRICTED_ZONE';

export interface MovementPolicyConfig {
  /** Active policy type */
  type: WorldMovementPolicy;
  /** Robot circular footprint radius to keep inside permitted region (default: 16) */
  robotRadius?: number;
  /** Safety distance buffer before violation boundary to prevent visual overshoot (default: 0.5) */
  policyEpsilon?: number;
  /** Optional restricted zones for RESTRICTED_ZONE policy */
  restrictedZones?: PolygonZone[];
}

export const DEFAULT_MOVEMENT_POLICY_CONFIG: Required<Omit<MovementPolicyConfig, 'restrictedZones'>> = {
  type: 'FREE_WORLD',
  robotRadius: 16,
  policyEpsilon: 0.5,
};

export type MovementPolicyViolationReason =
  | 'ALLOWED'
  | 'OFF_ROAD'
  | 'RESTRICTED_ZONE';

export interface MovementPolicyResult {
  /** Whether the full requested movement is allowed under the active policy */
  allowed: boolean;
  /** Result classification reason code */
  reason: MovementPolicyViolationReason;
  /** Descriptive human-readable explanation */
  message?: string;
  /** Distance from start along path to exact policy breach point */
  violationDistance?: number;
  /** Distance from start along path to safe stop position */
  safeDistance?: number;
  /** Continuous world coordinates of safe stopping pose */
  safeTarget?: Point2D;
  /** Continuous world coordinates where policy boundary was breached */
  violationPoint?: Point2D;
  /** Total requested travel distance */
  totalDistance: number;
}

export interface RoadBoundarySegment {
  p1: Point2D;
  p2: Point2D;
  roadId?: string;
}

/**
 * Evaluates whether movement paths and poses comply with the mission movement policy.
 */
export class WorldMovementPolicyEvaluator {
  private config: Required<Omit<MovementPolicyConfig, 'restrictedZones'>> & {
    restrictedZones?: PolygonZone[];
  };
  private worldMap: WorldMapData | null = null;
  private cachedRoadBoundaries: RoadBoundarySegment[] = [];

  constructor(
    map?: WorldMapData,
    policyOrConfig?: WorldMovementPolicy | Partial<MovementPolicyConfig>,
  ) {
    let initialType: WorldMovementPolicy = 'FREE_WORLD';
    let partialConfig: Partial<MovementPolicyConfig> = {};

    if (typeof policyOrConfig === 'string') {
      initialType = policyOrConfig;
    } else if (policyOrConfig) {
      initialType = policyOrConfig.type || 'FREE_WORLD';
      partialConfig = policyOrConfig;
    }

    this.config = {
      ...DEFAULT_MOVEMENT_POLICY_CONFIG,
      ...partialConfig,
      type: initialType,
    };

    if (map) {
      this.setWorldMap(map);
    }
  }

  public setWorldMap(map: WorldMapData): void {
    this.worldMap = map;
    this.rebuildRoadBoundaries();
  }

  public setPolicy(policyOrConfig: WorldMovementPolicy | Partial<MovementPolicyConfig>): void {
    if (typeof policyOrConfig === 'string') {
      this.config.type = policyOrConfig;
    } else {
      this.config = {
        ...this.config,
        ...policyOrConfig,
        type: policyOrConfig.type || this.config.type,
      };
    }
  }

  public getPolicy(): MovementPolicyConfig {
    return {...this.config};
  }

  /**
   * Rebuilds the road network boundary segments separating road pavement from off-road terrain.
   */
  private rebuildRoadBoundaries(): void {
    this.cachedRoadBoundaries = [];
    if (!this.worldMap || !this.worldMap.roads) return;

    const intersections = this.worldMap.intersections || [];

    for (const road of this.worldMap.roads) {
      const halfW = road.width / 2;
      const dx = road.end.x - road.start.x;
      const dy = road.end.y - road.start.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;

      // Unit normal perpendicular to road centerline (pointing left)
      const nx = -dy / len;
      const ny = dx / len;

      // Left edge segment: (start + halfW*n) -> (end + halfW*n)
      const left1: Point2D = {x: road.start.x + nx * halfW, y: road.start.y + ny * halfW};
      const left2: Point2D = {x: road.end.x + nx * halfW, y: road.end.y + ny * halfW};

      // Right edge segment: (start - halfW*n) -> (end - halfW*n)
      const right1: Point2D = {x: road.start.x - nx * halfW, y: road.start.y - ny * halfW};
      const right2: Point2D = {x: road.end.x - nx * halfW, y: road.end.y - ny * halfW};

      // Clip segments by connected intersections so portals remain open
      this.addClippedBoundarySegments(left1, left2, intersections, road.id);
      this.addClippedBoundarySegments(right1, right2, intersections, road.id);

      // Check endpoints: if road start or end does not connect to an intersection, add cap boundary
      if (!this.isEndpointConnectedToIntersection(road.start, intersections)) {
        this.cachedRoadBoundaries.push({p1: left1, p2: right1, roadId: road.id});
      }
      if (!this.isEndpointConnectedToIntersection(road.end, intersections)) {
        this.cachedRoadBoundaries.push({p1: left2, p2: right2, roadId: road.id});
      }
    }
  }

  private isEndpointConnectedToIntersection(pt: Point2D, intersections: WorldIntersection[]): boolean {
    for (const inter of intersections) {
      if (isPointInIntersection(pt, inter)) return true;
    }
    return false;
  }

  /**
   * Clips a boundary line segment against intersection boxes, retaining only portions
   * bordering off-road terrain.
   */
  private addClippedBoundarySegments(
    p1: Point2D,
    p2: Point2D,
    intersections: WorldIntersection[],
    roadId: string,
  ): void {
    // If no intersections, the whole edge is an off-road boundary
    if (intersections.length === 0) {
      this.cachedRoadBoundaries.push({p1, p2, roadId});
      return;
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;

    // Collect 1D parameter intervals [tA, tB] inside intersections
    const cutIntervals: Array<[number, number]> = [];

    for (const inter of intersections) {
      const halfW = inter.width / 2;
      const halfH = inter.height / 2;
      const minX = inter.center.x - halfW;
      const maxX = inter.center.x + halfW;
      const minY = inter.center.y - halfH;
      const maxY = inter.center.y + halfH;

      // Liang-Barsky line clipping to find parametric overlap [tEnter, tExit]
      let t0 = 0;
      let t1 = 1;
      const p = [-dx, dx, -dy, dy];
      const q = [p1.x - minX, maxX - p1.x, p1.y - minY, maxY - p1.y];

      let overlaps = true;
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
          if (q[i] < 0) {
            overlaps = false;
            break;
          }
        } else {
          const t = q[i] / p[i];
          if (p[i] < 0) {
            if (t > t1) { overlaps = false; break; }
            if (t > t0) t0 = t;
          } else {
            if (t < t0) { overlaps = false; break; }
            if (t < t1) t1 = t;
          }
        }
      }

      if (overlaps && t0 < t1) {
        cutIntervals.push([Math.max(0, t0), Math.min(1, t1)]);
      }
    }

    if (cutIntervals.length === 0) {
      this.cachedRoadBoundaries.push({p1, p2, roadId});
      return;
    }

    // Sort intervals
    cutIntervals.sort((a, b) => a[0] - b[0]);

    // Keep portions of [0, 1] outside cut intervals
    let curT = 0;
    for (const [tStart, tEnd] of cutIntervals) {
      if (tStart > curT + 1e-4) {
        this.cachedRoadBoundaries.push({
          p1: {x: p1.x + curT * dx, y: p1.y + curT * dy},
          p2: {x: p1.x + tStart * dx, y: p1.y + tStart * dy},
          roadId,
        });
      }
      curT = Math.max(curT, tEnd);
    }
    if (curT < 1 - 1e-4) {
      this.cachedRoadBoundaries.push({
        p1: {x: p1.x + curT * dx, y: p1.y + curT * dy},
        p2: {x: p2.x, y: p2.y},
        roadId,
      });
    }
  }

  /**
   * Checks whether a static pose (robot center) with circular footprint is allowed
   * under the current policy.
   */
  public isPoseAllowed(point: Point2D, customRadius?: number): boolean {
    if (this.config.type === 'FREE_WORLD') {
      return true;
    }

    if (this.config.type === 'RESTRICTED_ZONE') {
      return !this.isPointInRestrictedZone(point);
    }

    if (this.config.type === 'ROAD_ONLY') {
      return this.isPoseAllowedOnRoad(point, customRadius);
    }

    return true;
  }

  /**
   * Helper: tests whether the robot circular footprint is completely on the road network.
   */
  private isPoseAllowedOnRoad(point: Point2D, customRadius?: number): boolean {
    if (!this.worldMap) return true;

    // 1. Center must be within the road network pavement
    if (!this.isPointOnRoadNetwork(point)) {
      return false;
    }

    const r = customRadius ?? this.config.robotRadius;

    // 2. Center must maintain at least distance 'r' from any off-road boundary segment
    for (const seg of this.cachedRoadBoundaries) {
      const dist = this.distancePointToSegment(point, seg.p1, seg.p2);
      if (dist < r - 1e-4) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks whether a point lies anywhere on the road or intersection asphalt.
   */
  public isPointOnRoadNetwork(point: Point2D): boolean {
    if (!this.worldMap) return true;

    if (this.worldMap.intersections) {
      for (const inter of this.worldMap.intersections) {
        if (isPointInIntersection(point, inter)) return true;
      }
    }

    if (this.worldMap.roads) {
      for (const road of this.worldMap.roads) {
        if (isPointOnRoad(point, road)) return true;
      }
    }

    return false;
  }

  private isPointInRestrictedZone(point: Point2D): boolean {
    const zones = this.config.restrictedZones || this.worldMap?.restrictedZones;
    if (!zones || zones.length === 0) return false;

    for (const zone of zones) {
      if (zone.type === 'RESTRICTED' && this.pointInPolygon(point, zone.points)) {
        return true;
      }
    }
    return false;
  }

  private pointInPolygon(point: Point2D, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Evaluates the entire continuous movement trajectory from start to target.
   * Finds earliest violation parameter t in [0, 1] and computes exact safe target.
   */
  public evaluatePath(start: Point2D, target: Point2D): MovementPolicyResult {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const totalDistance = Math.hypot(dx, dy);

    // 1. FREE_WORLD: Always permitted
    if (this.config.type === 'FREE_WORLD') {
      return {
        allowed: true,
        reason: 'ALLOWED',
        totalDistance,
        safeDistance: totalDistance,
        safeTarget: {...target},
      };
    }

    if (totalDistance < 1e-6) {
      const allowed = this.isPoseAllowed(start);
      return {
        allowed,
        reason: allowed ? 'ALLOWED' : this.getViolationReasonCode(),
        totalDistance: 0,
        safeDistance: 0,
        safeTarget: {...start},
      };
    }

    // 2. High-resolution continuous swept sampling + bisection root finding
    // Sample step: <= 1px to guarantee no narrow gaps or corners are missed
    const sampleSteps = Math.max(16, Math.ceil(totalDistance));
    let firstInvalidIndex = -1;

    for (let i = 0; i <= sampleSteps; i++) {
      const t = i / sampleSteps;
      const pt: Point2D = {x: start.x + t * dx, y: start.y + t * dy};
      if (!this.isPoseAllowed(pt)) {
        firstInvalidIndex = i;
        break;
      }
    }

    // All sample points along trajectory are valid!
    if (firstInvalidIndex === -1) {
      return {
        allowed: true,
        reason: 'ALLOWED',
        totalDistance,
        safeDistance: totalDistance,
        safeTarget: {...target},
      };
    }

    // If start position itself is already invalid
    if (firstInvalidIndex === 0) {
      return {
        allowed: false,
        reason: this.getViolationReasonCode(),
        message: this.getViolationMessage(),
        violationDistance: 0,
        safeDistance: 0,
        safeTarget: {...start},
        violationPoint: {...start},
        totalDistance,
      };
    }

    // Binary search for exact boundary crossing tViolation in [tPrev, tCurr]
    let tLow = (firstInvalidIndex - 1) / sampleSteps;
    let tHigh = firstInvalidIndex / sampleSteps;

    for (let iter = 0; iter < 16; iter++) {
      const tMid = (tLow + tHigh) / 2;
      const ptMid: Point2D = {x: start.x + tMid * dx, y: start.y + tMid * dy};
      if (this.isPoseAllowed(ptMid)) {
        tLow = tMid;
      } else {
        tHigh = tMid;
      }
    }

    const tViolation = tHigh;
    const violationDistance = tViolation * totalDistance;
    const safeDistance = Math.max(0, violationDistance - this.config.policyEpsilon);
    const safeT = totalDistance > 0 ? safeDistance / totalDistance : 0;

    const safeTarget: Point2D = {
      x: start.x + safeT * dx,
      y: start.y + safeT * dy,
    };
    const violationPoint: Point2D = {
      x: start.x + tViolation * dx,
      y: start.y + tViolation * dy,
    };

    return {
      allowed: false,
      reason: this.getViolationReasonCode(),
      message: this.getViolationMessage(),
      violationDistance,
      safeDistance,
      safeTarget,
      violationPoint,
      totalDistance,
    };
  }

  private getViolationReasonCode(): MovementPolicyViolationReason {
    if (this.config.type === 'ROAD_ONLY') return 'OFF_ROAD';
    if (this.config.type === 'RESTRICTED_ZONE') return 'RESTRICTED_ZONE';
    return 'ALLOWED';
  }

  private getViolationMessage(): string {
    if (this.config.type === 'ROAD_ONLY') {
      return 'Cannot move — robot must stay on the road.';
    }
    if (this.config.type === 'RESTRICTED_ZONE') {
      return 'Cannot move — restricted zone entry prohibited.';
    }
    return 'Cannot move — movement policy violation.';
  }

  private distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);

    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }
}
