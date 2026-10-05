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

export interface BridgeStatePayload {
  grid: GridConfig;
  robot: RobotState;
  mission: Mission;
  collectedItems?: Position[];
  progressText?: string;
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
  public onStateChange(payload: BridgeStatePayload): void {
    const {grid, robot, mission, collectedItems} = payload;

    const renderData: GridRenderData = {
      grid,
      robot,
      target: mission.target,
      obstacles: mission.obstacles,
      cellColors: mission.cellColors,
      lines: mission.lines,
      items: mission.items,
      collectedItems: collectedItems || [],
    };

    this.simulator.updateState(renderData);
  }

  /**
   * Explicit bridge handler for simulation reset events.
   */
  public onReset(payload: BridgeStatePayload): void {
    this.onStateChange(payload);
  }

  /**
   * Explicit bridge handler for robot movement or turn step events.
   */
  public onStep(payload: BridgeStatePayload): void {
    this.onStateChange(payload);
  }
}
