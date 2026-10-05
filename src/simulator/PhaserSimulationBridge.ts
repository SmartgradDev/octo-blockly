/**
 * PhaserSimulationBridge — clean, decoupled bridge between the authoritative
 * Robot Engine and the Phaser visual simulator.
 *
 * Architecture:
 * Robot Engine (RobotState, Mission, GridConfig)
 *       ↓
 * simulation state change event / update
 *       ↓
 * PhaserSimulationBridge
 *       ↓
 * RobotRenderer / PhaserGridRenderer
 *       ↓
 * Phaser GameObjects visual presentation
 *
 * Responsibilities:
 * - Listens for/receives state changes from the Robot Engine.
 * - Bridges position (x, y) movements to the visual robot.
 * - Bridges direction changes to the visual robot orientation.
 * - Bridges reset actions to restore the initial visual state.
 * - Maintains zero independent simulation physics or state calculations.
 */

import {GridConfig, RobotState} from '../robot/RobotState';
import {Mission, Position} from '../robot/Mission';
import {PhaserSimulator} from './PhaserSimulator';
import {GridRenderData} from './PhaserGridRenderer';
import {WorldRobotState} from './world';

import {WorldRobotPose} from './RobotRenderer';

export interface BridgeStatePayload {
  grid: GridConfig;
  robot: RobotState;
  worldRobot?: WorldRobotState;
  mission: Mission;
  collectedItems?: Position[];
  progressText?: string;
  immediate?: boolean;
  durationMs?: number;
  onProgress?: (pose: WorldRobotPose) => void;
}

export class PhaserSimulationBridge {
  private simulator: PhaserSimulator;

  constructor(simulator: PhaserSimulator) {
    this.simulator = simulator;
  }

  /**
   * Called on robot movement, turn, item collection, or reset.
   * Maps authoritative Robot Engine state directly to Phaser visual state.
   */
  public onStateChange(payload: BridgeStatePayload): Promise<void> {
    const {
      grid,
      robot,
      worldRobot,
      mission,
      collectedItems,
      immediate,
      durationMs,
      onProgress,
    } = payload;

    const renderData: GridRenderData = {
      grid,
      robot,
      worldRobot,
      target: mission.target,
      obstacles: mission.obstacles,
      cellColors: mission.cellColors,
      lines: mission.lines,
      items: mission.items,
      collectedItems: collectedItems || [],
      immediate: immediate || false,
      durationMs,
      onProgress,
    };

    return this.simulator.updateState(renderData);
  }

  /**
   * Returns current continuous visual pose from Phaser simulator.
   */
  public getVisualPose(): WorldRobotPose | null {
    return this.simulator.getVisualPose();
  }

  /**
   * Explicit bridge handler for simulation reset events.
   * Forces immediate snapping without tweening.
   */
  public onReset(payload: BridgeStatePayload): Promise<void> {
    this.simulator.stopVisuals(false);
    return this.onStateChange({...payload, immediate: true});
  }

  /**
   * Explicit bridge handler for pausing execution.
   */
  public onPause(): void {
    this.simulator.pauseVisuals();
  }

  /**
   * Explicit bridge handler for resuming execution.
   */
  public onResume(): void {
    this.simulator.resumeVisuals();
  }

  /**
   * Explicit bridge handler for stopping execution.
   */
  public onStop(snapToTarget: boolean = true): void {
    this.simulator.stopVisuals(snapToTarget);
  }

  /**
   * Explicit bridge handler for robot movement or turn step events.
   */
  public onStep(payload: BridgeStatePayload): Promise<void> {
    return this.onStateChange(payload);
  }
}
