/**
 * WorldCollisionSystem.ts — Continuous 2D World Collision Engine for Step 2.
 *
 * Responsibilities:
 * 1. Derives authoritative static colliders from WorldMapData (buildings, trees).
 * 2. Models robot as a continuous circular footprint (radius).
 * 3. Swept continuous collision detection: tests entire movement segment (start -> target)
 *    against solid geometry, completely preventing tunneling through obstacles.
 * 4. Deterministic safe stop calculation: computes the exact earliest point of contact
 *    and stops the robot immediately before collision with a tiny safety epsilon.
 * 5. Simulation-only: completely decoupled from Phaser rendering.
 * 6. Grass, open terrain, roads, and intersections are explicitly non-collidable (traversable).
 */

import {Point2D, BoundingBox2D, WorldMapData} from './WorldData';

export type ColliderType = 'building' | 'tree' | 'obstacle' | 'custom';
export type ColliderShape = 'rectangle' | 'circle';

export interface WorldCollider {
  id: string;
  name: string;
  type: ColliderType;
  shape: ColliderShape;
  solid: boolean;
  /** Axis-aligned bounding box for rectangle colliders */
  bounds?: BoundingBox2D;
  /** Center point for circular colliders */
  center?: Point2D;
  /** Radius for circular colliders */
  radius?: number;
}

export interface WorldCollisionConfig {
  /** Robot circular collision footprint radius in world units (default: 16) */
  robotRadius: number;
  /** Safety distance buffer before contact to prevent visual penetration (default: 0.5) */
  collisionEpsilon: number;
}

export const DEFAULT_WORLD_COLLISION_CONFIG: WorldCollisionConfig = {
  robotRadius: 16,
  collisionEpsilon: 0.5,
};

export interface PathCollisionResult {
  collided: boolean;
  collider?: WorldCollider;
  /** Distance from start along path to exact collision contact point */
  collisionDistance: number;
  /** Distance from start along path to safe stop position */
  safeDistance: number;
  /** Continuous coordinates of the safe stopping pose */
  safeTarget?: Point2D;
  /** Point on the collider surface touched */
  collisionPoint?: Point2D;
  /** Total travel distance of the requested movement */
  totalDistance: number;
}

export class WorldCollisionSystem {
  private colliders: WorldCollider[] = [];
  private config: WorldCollisionConfig;

  constructor(
    source?: WorldMapData | WorldCollider[],
    config: Partial<WorldCollisionConfig> = {},
  ) {
    this.config = {...DEFAULT_WORLD_COLLISION_CONFIG, ...config};
    if (source) {
      if (Array.isArray(source)) {
        this.colliders = [...source];
      } else {
        this.loadFromWorldMap(source);
      }
    }
  }

  public getConfig(): WorldCollisionConfig {
    return this.config;
  }

  public getRobotRadius(): number {
    return this.config.robotRadius;
  }

  public getColliders(): WorldCollider[] {
    return this.colliders;
  }

  /**
   * Derives static solid colliders from authoritative WorldMapData.
   * Buildings -> solid rectangles
   * Trees -> solid circles
   * Roads, intersections, park grass -> non-collidable (traversable)
   */
  public loadFromWorldMap(map: WorldMapData): void {
    this.colliders = [];

    // 1. Buildings (solid rectangles)
    if (map.buildings) {
      for (const b of map.buildings) {
        this.colliders.push({
          id: b.id,
          name: b.name || b.label || 'Building',
          type: 'building',
          shape: 'rectangle',
          solid: true,
          bounds: {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
          },
        });
      }
    }

    // 2. Trees (solid circles)
    if (map.trees) {
      for (const t of map.trees) {
        this.colliders.push({
          id: t.id,
          name: `Tree (${t.id})`,
          type: 'tree',
          shape: 'circle',
          solid: true,
          center: {x: t.x, y: t.y},
          radius: t.canopyRadius,
        });
      }
    }
  }

  /**
   * Swept continuous collision detection.
   * Evaluates entire trajectory segment from start to target against all solid colliders.
   * Finds the earliest collision along the path, completely preventing tunneling.
   */
  public checkSweptPath(start: Point2D, target: Point2D): PathCollisionResult {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const totalDistance = Math.hypot(dx, dy);

    if (totalDistance < 1e-6) {
      return {
        collided: false,
        collisionDistance: 0,
        safeDistance: 0,
        safeTarget: {...start},
        totalDistance: 0,
      };
    }

    const robotR = this.config.robotRadius;

    // Broadphase AABB of path expanded by robot radius
    const pathMinX = Math.min(start.x, target.x) - robotR - 25;
    const pathMaxX = Math.max(start.x, target.x) + robotR + 25;
    const pathMinY = Math.min(start.y, target.y) - robotR - 25;
    const pathMaxY = Math.max(start.y, target.y) + robotR + 25;

    let earliestT = Infinity;
    let earliestCollider: WorldCollider | undefined;
    let contactPoint: Point2D | undefined;

    for (const collider of this.colliders) {
      if (!collider.solid) continue;

      // Broadphase check
      const colAABB = this.getColliderAABB(collider);
      if (
        colAABB.maxX < pathMinX ||
        colAABB.minX > pathMaxX ||
        colAABB.maxY < pathMinY ||
        colAABB.minY > pathMaxY
      ) {
        continue;
      }

      // Narrowphase check
      let hitT: number | null = null;
      let hitContact: Point2D | undefined;

      if (collider.shape === 'circle' && collider.center && collider.radius !== undefined) {
        const res = this.sweepRayVsCircle(start, dx, dy, collider.center, collider.radius, robotR);
        hitT = res.t;
        hitContact = res.contact;
      } else if (collider.shape === 'rectangle' && collider.bounds) {
        const res = this.sweepRayVsRectangle(start, dx, dy, collider.bounds, robotR);
        hitT = res.t;
        hitContact = res.contact;
      }

      if (hitT !== null && hitT >= 0 && hitT <= 1) {
        if (hitT < earliestT) {
          earliestT = hitT;
          earliestCollider = collider;
          contactPoint = hitContact;
        }
      }
    }

    if (earliestT < Infinity && earliestCollider) {
      const collisionDistance = earliestT * totalDistance;
      const safeDistance = Math.max(0, collisionDistance - this.config.collisionEpsilon);
      const safeT = safeDistance / totalDistance;

      const safeTarget: Point2D = {
        x: start.x + safeT * dx,
        y: start.y + safeT * dy,
      };

      return {
        collided: true,
        collider: earliestCollider,
        collisionDistance,
        safeDistance,
        safeTarget,
        collisionPoint: contactPoint,
        totalDistance,
      };
    }

    return {
      collided: false,
      collisionDistance: totalDistance,
      safeDistance: totalDistance,
      safeTarget: {...target},
      totalDistance,
    };
  }

  /**
   * Checks whether the robot footprint at a given point overlaps any solid collider.
   */
  public checkOverlapAt(point: Point2D, customRadius?: number): WorldCollider | null {
    const r = customRadius ?? this.config.robotRadius;
    for (const collider of this.colliders) {
      if (!collider.solid) continue;

      if (collider.shape === 'circle' && collider.center && collider.radius !== undefined) {
        const distSq =
          (point.x - collider.center.x) ** 2 + (point.y - collider.center.y) ** 2;
        const thresh = (collider.radius + r);
        if (distSq < thresh * thresh) {
          return collider;
        }
      } else if (collider.shape === 'rectangle' && collider.bounds) {
        const b = collider.bounds;
        const clampedX = Math.max(b.x, Math.min(point.x, b.x + b.width));
        const clampedY = Math.max(b.y, Math.min(point.y, b.y + b.height));
        const distSq = (point.x - clampedX) ** 2 + (point.y - clampedY) ** 2;
        if (distSq < r * r) {
          return collider;
        }
      }
    }
    return null;
  }

  /**
   * Sweeps circular robot against static circle collider.
   * Uses Minkowski sum: ray vs circle with radius (colliderRadius + robotRadius).
   */
  private sweepRayVsCircle(
    start: Point2D,
    dx: number,
    dy: number,
    center: Point2D,
    colliderRadius: number,
    robotRadius: number,
  ): {t: number | null; contact?: Point2D} {
    const effRadius = colliderRadius + robotRadius;
    const vx = start.x - center.x;
    const vy = start.y - center.y;

    const a = dx * dx + dy * dy;
    if (a < 1e-9) return {t: null};

    const c = vx * vx + vy * vy - effRadius * effRadius;

    // Start point already inside/touching
    if (c <= 0) {
      const dist = Math.hypot(vx, vy);
      const dirX = dist > 1e-6 ? vx / dist : 1;
      const dirY = dist > 1e-6 ? vy / dist : 0;
      return {
        t: 0,
        contact: {
          x: center.x + dirX * colliderRadius,
          y: center.y + dirY * colliderRadius,
        },
      };
    }

    const b = 2 * (vx * dx + vy * dy);
    // Moving away from circle
    if (b >= 0) return {t: null};

    const disc = b * b - 4 * a * c;
    if (disc < 0) return {t: null};

    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return {t: null};

    const robotHitX = start.x + t * dx;
    const robotHitY = start.y + t * dy;
    const hx = robotHitX - center.x;
    const hy = robotHitY - center.y;
    const hDist = Math.hypot(hx, hy);
    const dirX = hDist > 1e-6 ? hx / hDist : 1;
    const dirY = hDist > 1e-6 ? hy / hDist : 0;

    return {
      t,
      contact: {
        x: center.x + dirX * colliderRadius,
        y: center.y + dirY * colliderRadius,
      },
    };
  }

  /**
   * Sweeps circular robot against static axis-aligned rectangle collider.
   * Uses Minkowski sum: ray vs rounded rectangle (box expanded by robotRadius).
   */
  private sweepRayVsRectangle(
    start: Point2D,
    dx: number,
    dy: number,
    box: BoundingBox2D,
    robotRadius: number,
  ): {t: number | null; contact?: Point2D} {
    const x0 = box.x;
    const x1 = box.x + box.width;
    const y0 = box.y;
    const y1 = box.y + box.height;

    // Check if start point is already inside the expanded rounded rectangle
    const closestStartX = Math.max(x0, Math.min(x1, start.x));
    const closestStartY = Math.max(y0, Math.min(y1, start.y));
    const startDist = Math.hypot(start.x - closestStartX, start.y - closestStartY);
    if (startDist <= robotRadius) {
      return {
        t: 0,
        contact: {x: closestStartX, y: closestStartY},
      };
    }

    let minT = Infinity;
    let bestContact: Point2D | undefined;

    // 1. Four expanded flat edge segments
    // Left edge (x = x0 - R, y in [y0, y1])
    if (dx > 0) {
      const t = (x0 - robotRadius - start.x) / dx;
      if (t >= 0 && t <= 1 && t < minT) {
        const y = start.y + t * dy;
        if (y >= y0 && y <= y1) {
          minT = t;
          bestContact = {x: x0, y};
        }
      }
    }

    // Right edge (x = x1 + R, y in [y0, y1])
    if (dx < 0) {
      const t = (x1 + robotRadius - start.x) / dx;
      if (t >= 0 && t <= 1 && t < minT) {
        const y = start.y + t * dy;
        if (y >= y0 && y <= y1) {
          minT = t;
          bestContact = {x: x1, y};
        }
      }
    }

    // Top edge (y = y0 - R, x in [x0, x1])
    if (dy > 0) {
      const t = (y0 - robotRadius - start.y) / dy;
      if (t >= 0 && t <= 1 && t < minT) {
        const x = start.x + t * dx;
        if (x >= x0 && x <= x1) {
          minT = t;
          bestContact = {x, y: y0};
        }
      }
    }

    // Bottom edge (y = y1 + R, x in [x0, x1])
    if (dy < 0) {
      const t = (y1 + robotRadius - start.y) / dy;
      if (t >= 0 && t <= 1 && t < minT) {
        const x = start.x + t * dx;
        if (x >= x0 && x <= x1) {
          minT = t;
          bestContact = {x, y: y1};
        }
      }
    }

    // 2. Four rounded corner quarter-circles (radius = robotRadius)
    const corners: Point2D[] = [
      {x: x0, y: y0}, // Top-Left
      {x: x1, y: y0}, // Top-Right
      {x: x0, y: y1}, // Bottom-Left
      {x: x1, y: y1}, // Bottom-Right
    ];

    for (const corner of corners) {
      const cornerRes = this.sweepRayVsCircle(start, dx, dy, corner, 0, robotRadius);
      if (cornerRes.t !== null && cornerRes.t >= 0 && cornerRes.t <= 1 && cornerRes.t < minT) {
        const hitX = start.x + cornerRes.t * dx;
        const hitY = start.y + cornerRes.t * dy;

        // Verify hit lies in the corner's external quadrant
        const inQuadrant =
          (corner.x === x0 ? hitX <= x0 : hitX >= x1) &&
          (corner.y === y0 ? hitY <= y0 : hitY >= y1);

        if (inQuadrant) {
          minT = cornerRes.t;
          bestContact = {x: corner.x, y: corner.y};
        }
      }
    }

    if (minT < Infinity) {
      return {t: minT, contact: bestContact};
    }

    return {t: null};
  }

  private getColliderAABB(collider: WorldCollider): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    if (collider.shape === 'circle' && collider.center && collider.radius !== undefined) {
      const r = collider.radius;
      return {
        minX: collider.center.x - r,
        maxX: collider.center.x + r,
        minY: collider.center.y - r,
        maxY: collider.center.y + r,
      };
    }
    if (collider.shape === 'rectangle' && collider.bounds) {
      return {
        minX: collider.bounds.x,
        maxX: collider.bounds.x + collider.bounds.width,
        minY: collider.bounds.y,
        maxY: collider.bounds.y + collider.bounds.height,
      };
    }
    return {minX: 0, maxX: 0, minY: 0, maxY: 0};
  }
}
