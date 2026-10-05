/**
 * MissionObjectSystem.ts — Generic Mission Object System for Step 2.
 *
 * Responsibilities:
 * 1. Manages authoritative lifecycle states of all WorldMissionObjects.
 * 2. Evaluates continuous path interactions using swept circle-vs-circle math
 *    against the ACTUAL traveled robot path segment.
 * 3. Processes multiple objects along a path deterministically in strict parametric order (t).
 * 4. Ensures idempotent interaction (objects cannot be double-collected).
 * 5. Provides deterministic reset to restore all objects to their initial states.
 */

import {Point2D} from './WorldData';
import {
  WorldMissionObject,
  MissionObjectState,
  MissionObjectInteractionEvent,
} from './WorldMissionObject';

export class MissionObjectSystem {
  private objects: Map<string, WorldMissionObject> = new Map();
  private initialSnapshots: Map<string, WorldMissionObject> = new Map();

  constructor(objects?: WorldMissionObject[]) {
    if (objects) {
      this.loadObjects(objects);
    }
  }

  /**
   * Loads a collection of mission objects, storing deep clones as initial snapshots for reset.
   */
  public loadObjects(objects: WorldMissionObject[]): void {
    this.objects.clear();
    this.initialSnapshots.clear();

    for (const obj of objects) {
      const cloned = this.cloneObject(obj);
      this.objects.set(obj.id, cloned);
      this.initialSnapshots.set(obj.id, this.cloneObject(obj));
    }
  }

  public getObjects(): WorldMissionObject[] {
    return Array.from(this.objects.values());
  }

  public getObject(id: string): WorldMissionObject | undefined {
    return this.objects.get(id);
  }

  public getAvailableObjects(): WorldMissionObject[] {
    return Array.from(this.objects.values()).filter((o) => o.state === 'AVAILABLE');
  }

  public getCollectedObjects(): WorldMissionObject[] {
    return Array.from(this.objects.values()).filter((o) => o.state === 'COLLECTED');
  }

  public getHealthyFoodObjects(): WorldMissionObject[] {
    return Array.from(this.objects.values()).filter(
      (o) => o.metadata && o.metadata.category === 'FOOD' && o.metadata.foodClassification === 'HEALTHY',
    );
  }

  public getUnhealthyFoodObjects(): WorldMissionObject[] {
    return Array.from(this.objects.values()).filter(
      (o) => o.metadata && o.metadata.category === 'FOOD' && o.metadata.foodClassification === 'UNHEALTHY',
    );
  }

  public getEncounteredUnhealthyFoodObjects(): WorldMissionObject[] {
    return Array.from(this.objects.values()).filter(
      (o) =>
        o.metadata &&
        o.metadata.category === 'FOOD' &&
        o.metadata.foodClassification === 'UNHEALTHY' &&
        (o.state === 'ACTIVATED' || o.state === 'COLLECTED'),
    );
  }

  public addObject(obj: WorldMissionObject): void {
    const cloned = this.cloneObject(obj);
    this.objects.set(obj.id, cloned);
    if (!this.initialSnapshots.has(obj.id)) {
      this.initialSnapshots.set(obj.id, this.cloneObject(obj));
    }
  }

  public setObjectState(id: string, state: MissionObjectState): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;
    obj.state = state;
    return true;
  }

  /**
   * Resets all mission objects to their initial state snapshots.
   */
  public reset(): void {
    this.objects.clear();
    for (const [id, initialObj] of this.initialSnapshots.entries()) {
      this.objects.set(id, this.cloneObject(initialObj));
    }
  }

  /**
   * Sweeps the robot's actual traveled path segment (start -> end) against all AVAILABLE
   * mission objects using continuous circular footprint overlap.
   *
   * Objects are detected, sorted by path progress parameter (t in [0, 1]), updated to
   * COLLECTED, and returned as an ordered list of interaction events.
   */
  public checkPathInteractions(
    start: Point2D,
    end: Point2D,
    robotRadius: number = 16,
  ): MissionObjectInteractionEvent[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    interface CandidateHit {
      obj: WorldMissionObject;
      t: number;
      point: Point2D;
    }

    const candidateHits: CandidateHit[] = [];

    for (const obj of this.objects.values()) {
      if (obj.state !== 'AVAILABLE') continue;

      const objRadius = obj.interactionRadius ?? 16;
      const effRadius = objRadius + robotRadius;
      const effRadiusSq = effRadius * effRadius;

      const vx = start.x - obj.x;
      const vy = start.y - obj.y;

      if (length < 1e-6) {
        // Zero-length movement: test static circle overlap at start position
        const distSq = vx * vx + vy * vy;
        if (distSq <= effRadiusSq) {
          candidateHits.push({
            obj,
            t: 0,
            point: {x: start.x, y: start.y},
          });
        }
        continue;
      }

      // Swept ray vs circle (center: obj.x, obj.y, radius: effRadius)
      // Path: P(t) = start + t * (dx, dy), t in [0, 1]
      const a = dx * dx + dy * dy;
      const b = 2 * (vx * dx + vy * dy);
      const c = vx * vx + vy * vy - effRadiusSq;

      if (c <= 0) {
        // Start position is already within or touching the interaction radius!
        candidateHits.push({
          obj,
          t: 0,
          point: {x: start.x, y: start.y},
        });
        continue;
      }

      // Check if ray enters the expanded circle within t in [0, 1]
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        const tHit = (-b - sqrtDisc) / (2 * a);

        if (tHit >= 0 && tHit <= 1) {
          candidateHits.push({
            obj,
            t: tHit,
            point: {x: start.x + tHit * dx, y: start.y + tHit * dy},
          });
        }
      }
    }

    // Sort strictly in path order (lowest t to highest t)
    candidateHits.sort((a, b) => a.t - b.t);

    const events: MissionObjectInteractionEvent[] = [];

    for (const hit of candidateHits) {
      const obj = hit.obj;
      // Guard against double collection within same step
      if (obj.state !== 'AVAILABLE') continue;

      const previousState = obj.state;
      const isFood =
        obj.type === 'FOOD' ||
        (obj.metadata && obj.metadata.category === 'FOOD');
      const foodClass =
        obj.metadata && obj.metadata.foodClassification
          ? (obj.metadata.foodClassification as 'HEALTHY' | 'UNHEALTHY')
          : undefined;

      let newState: MissionObjectState = 'COLLECTED';
      let semanticType: import('./WorldMissionObject').InteractionSemanticType = 'COLLECTED';

      if (isFood && foodClass === 'UNHEALTHY') {
        // Unhealthy food acts as a mission hazard: triggers ACTIVATED state
        newState = 'ACTIVATED';
        semanticType = 'HAZARD_CONTACT';
      } else if (obj.type === 'TRIGGER' || obj.type === 'HAZARD') {
        newState = 'ACTIVATED';
        semanticType = obj.type === 'HAZARD' ? 'HAZARD_CONTACT' : 'ACTIVATED';
      } else {
        newState = 'COLLECTED';
        semanticType = 'COLLECTED';
      }

      obj.state = newState;

      events.push({
        objectId: obj.id,
        objectType: obj.type,
        object: obj,
        t: hit.t,
        interactionPoint: hit.point,
        previousState,
        newState,
        semanticType,
        foodClassification: foodClass,
      });
    }

    return events;
  }

  private cloneObject(obj: WorldMissionObject): WorldMissionObject {
    return {
      ...obj,
      metadata: obj.metadata ? JSON.parse(JSON.stringify(obj.metadata)) : undefined,
    };
  }
}

