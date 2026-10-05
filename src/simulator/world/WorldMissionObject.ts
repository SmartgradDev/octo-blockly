/**
 * WorldMissionObject.ts — Generic Mission Object Abstraction for Step 2.
 *
 * Architecture Principles:
 * 1. Decoupled Subsystem: Represents interactive objects in the continuous world
 *    (e.g. collectibles, targets, triggers). Independent from physical collision
 *    (WorldCollisionSystem) and traversability rules (WorldMovementPolicy).
 * 2. Extensible Model: Reusable across collectibles (gems, packages, batteries)
 *    and future objects without creating separate hardcoded systems.
 * 3. Path-Aware Interaction: Objects are collected/triggered when the robot's actual
 *    continuous trajectory touches their interaction radius, preventing jumping over objects.
 * 4. Deterministic State Lifecycle: Clear state transitions (AVAILABLE -> COLLECTED),
 *    idempotent collection (no double collection), and clean reset restoration.
 */

import {Point2D} from './WorldData';

export type MissionObjectState =
  | 'AVAILABLE'
  | 'COLLECTED'
  | 'ACTIVATED'
  | 'COMPLETED'
  | 'INACTIVE';

export type MissionObjectType =
  | 'COLLECTIBLE'
  | 'TRIGGER'
  | 'HAZARD'
  | 'GOAL'
  | string;

export type FoodClassification = 'HEALTHY' | 'UNHEALTHY';

export interface FoodMetadata {
  category: 'FOOD';
  foodClassification: FoodClassification;
  name?: string;
  points?: number;
  [key: string]: unknown;
}

export type InteractionSemanticType =
  | 'COLLECTED'
  | 'HAZARD_CONTACT'
  | 'ACTIVATED'
  | 'TRIGGERED';

export interface WorldMissionObject {
  /** Stable unique identifier (e.g. 'gem_campus_1', 'food_apple_1') */
  id: string;
  /** Generic object type classification (default: 'COLLECTIBLE') */
  type: MissionObjectType;
  /** Continuous world X coordinate */
  x: number;
  /** Continuous world Y coordinate */
  y: number;
  /** Interaction radius in world units (default: 16) */
  interactionRadius?: number;
  /** Current lifecycle state */
  state: MissionObjectState;
  /** Whether the object is visible in world rendering (default: true) */
  visible?: boolean;
  /** Optional human-readable display label */
  label?: string;
  /** Optional color tint for procedural vector rendering (hex number) */
  color?: number;
  /** Optional icon symbol or emoji (e.g. '💎', '📦', '⚡', '🍎', '🍔') */
  iconSymbol?: string;
  /** Extensible custom metadata payload for future mission types */
  metadata?: Record<string, unknown>;
}

export interface MissionObjectInteractionEvent {
  objectId: string;
  objectType: MissionObjectType;
  object: WorldMissionObject;
  /** Parametric progress along traveled path [0, 1] where contact occurred */
  t: number;
  /** Continuous world coordinate of contact point along path */
  interactionPoint: Point2D;
  previousState: MissionObjectState;
  newState: MissionObjectState;
  /** Semantic type of the interaction (e.g. 'COLLECTED' for healthy/gems, 'HAZARD_CONTACT' for unhealthy) */
  semanticType?: InteractionSemanticType;
  /** If this is a food object, its classification */
  foodClassification?: FoodClassification;
}

/** Helper to test if an object is classified as food */
export function isFoodObject(obj: WorldMissionObject): boolean {
  if (obj.metadata && obj.metadata.category === 'FOOD') return true;
  if (obj.metadata && obj.metadata.foodClassification !== undefined) return true;
  return obj.type === 'FOOD';
}

/** Helper to retrieve food classification from structured metadata */
export function getFoodClassification(obj: WorldMissionObject): FoodClassification | undefined {
  if (obj.metadata && (obj.metadata.foodClassification === 'HEALTHY' || obj.metadata.foodClassification === 'UNHEALTHY')) {
    return obj.metadata.foodClassification as FoodClassification;
  }
  return undefined;
}

