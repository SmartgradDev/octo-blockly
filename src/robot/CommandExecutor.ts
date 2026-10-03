/**
 * CommandExecutor — AST Interpreter & Robot Command Execution Engine
 *
 * Dynamically interprets Blockly block structures (including loops and IF/ELSE conditionals)
 * at runtime without using eval() or new Function().
 * Supports dynamic sensor evaluation, obstacle collision checking, and max command limits.
 *
 * No DOM dependencies — this is pure logic.
 */

import * as Blockly from 'blockly/core';
import {Direction, GridConfig, RobotCommand, RobotState} from './RobotState';
import {Position} from './Mission';

/** Map from Blockly block type to RobotCommand. */
const BLOCK_TO_COMMAND: Record<string, RobotCommand> = {
  octo_move_forward: 'MOVE_FORWARD',
  octo_move_backward: 'MOVE_BACKWARD',
  octo_turn_left: 'TURN_LEFT',
  octo_turn_right: 'TURN_RIGHT',
};

export const MAX_COMMANDS_LIMIT = 500;

export interface StepResult {
  command: RobotCommand | null;
  done: boolean;
  limitExceeded: boolean;
}

interface StackFrame {
  block: Blockly.Block | null;
  repeatCount?: number;
  currentIteration?: number;
  bodyBlock?: Blockly.Block | null;
}

/**
 * ProgramInterpreter — Step-by-step AST Interpreter for Blockly robot programs.
 * Evaluates conditions dynamically at runtime against current robot state.
 */
export class ProgramInterpreter {
  private stack: StackFrame[] = [];
  private robot: RobotState;
  private grid: GridConfig;
  private obstacles?: Position[];
  private commandCount: number = 0;
  private maxCommands: number;

  constructor(
    workspace: Blockly.Workspace,
    robot: RobotState,
    grid: GridConfig,
    obstacles?: Position[],
    maxCommands: number = MAX_COMMANDS_LIMIT,
  ) {
    this.robot = robot;
    this.grid = grid;
    this.obstacles = obstacles;
    this.maxCommands = maxCommands;

    const topBlocks = workspace.getTopBlocks(true);
    // Push top blocks in reverse order so they execute top-to-bottom
    for (let i = topBlocks.length - 1; i >= 0; i--) {
      this.stack.push({block: topBlocks[i]});
    }
  }

  public isDone(): boolean {
    return this.stack.length === 0;
  }

  public getExecutedCommandCount(): number {
    return this.commandCount;
  }

  /**
   * Advance the interpreter by one step.
   * Returns a RobotCommand if an action block was reached, or command: null if a control block was evaluated.
   */
  public step(): StepResult {
    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1];

      if (!frame.block) {
        // Frame statement chain is finished
        if (
          frame.repeatCount !== undefined &&
          frame.currentIteration !== undefined
        ) {
          frame.currentIteration++;
          if (frame.currentIteration < frame.repeatCount) {
            // Restart loop body for next iteration
            frame.block = frame.bodyBlock || null;
            continue;
          }
        }
        // Pop finished frame
        this.stack.pop();
        continue;
      }

      const currentBlock = frame.block;
      // Advance frame pointer to next block in current chain
      frame.block = currentBlock.getNextBlock();

      const type = currentBlock.type;

      if (type in BLOCK_TO_COMMAND) {
        if (this.commandCount >= this.maxCommands) {
          return {command: null, done: true, limitExceeded: true};
        }
        this.commandCount++;
        return {
          command: BLOCK_TO_COMMAND[type],
          done: false,
          limitExceeded: false,
        };
      } else if (type === 'controls_repeat_ext' || type === 'controls_repeat') {
        const repeatCount = getRepeatCount(currentBlock);
        const bodyBlock = currentBlock.getInputTargetBlock('DO');
        if (repeatCount > 0 && bodyBlock) {
          this.stack.push({
            block: bodyBlock,
            bodyBlock: bodyBlock,
            repeatCount,
            currentIteration: 0,
          });
        }
      } else if (type === 'controls_if') {
        const branchBlock = getIfBranch(
          currentBlock,
          this.robot,
          this.grid,
          this.obstacles,
        );
        if (branchBlock) {
          this.stack.push({block: branchBlock});
        }
      }
    }

    return {command: null, done: true, limitExceeded: false};
  }
}

/**
 * Dynamically evaluate an IF condition attached to a controls_if block.
 */
function evaluateCondition(
  condBlock: Blockly.Block | null,
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
): boolean {
  if (!condBlock) return false;

  if (condBlock.type === 'octo_obstacle_ahead') {
    return isObstacleAhead(robot, grid, obstacles);
  }

  if (condBlock.type === 'logic_negate') {
    const innerCond = condBlock.getInputTargetBlock('BOOL');
    return !evaluateCondition(innerCond, robot, grid, obstacles);
  }

  return false;
}

/**
 * Determine which branch of a controls_if block to execute based on runtime condition evaluation.
 */
function getIfBranch(
  ifBlock: Blockly.Block,
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
): Blockly.Block | null {
  let i = 0;
  while (true) {
    const condInput = ifBlock.getInputTargetBlock(`IF${i}`);
    if (!condInput && i > 0) break;
    if (condInput) {
      if (evaluateCondition(condInput, robot, grid, obstacles)) {
        return ifBlock.getInputTargetBlock(`DO${i}`);
      }
    } else if (i === 0) {
      break;
    }
    i++;
  }

  return ifBlock.getInputTargetBlock('ELSE');
}

/**
 * Safely extract numeric repeat count from repeat blocks.
 */
function getRepeatCount(block: Blockly.Block): number {
  if (block.type === 'controls_repeat') {
    const val = Number(block.getFieldValue('TIMES'));
    return isNaN(val) ? 0 : Math.max(0, Math.floor(val));
  }

  const timesBlock = block.getInputTargetBlock('TIMES');
  if (timesBlock) {
    const val = Number(timesBlock.getFieldValue('NUM'));
    if (!isNaN(val)) {
      return Math.max(0, Math.floor(val));
    }
  }

  const fieldVal = Number(block.getFieldValue('TIMES'));
  if (!isNaN(fieldVal)) {
    return Math.max(0, Math.floor(fieldVal));
  }

  return 0;
}

/** Result of executing a single command. */
export interface ExecuteResult {
  ok: boolean;
  message: string;
}

/** Clockwise turn order. */
const TURN_ORDER: Direction[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

/**
 * Check if a cell coordinate is blocked by an obstacle.
 */
export function isBlocked(x: number, y: number, obstacles?: Position[]): boolean {
  if (!obstacles || obstacles.length === 0) return false;
  return obstacles.some((o) => o.x === x && o.y === y);
}

/**
 * Front Obstacle Sensor:
 * Checks if the cell directly in front of the robot is blocked by an obstacle
 * or is outside the grid boundary.
 *
 * Does NOT move the robot or mutate robot state.
 */
export function isObstacleAhead(
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
): boolean {
  const delta = directionDelta(robot.direction);
  const frontX = robot.x + delta.dx;
  const frontY = robot.y + delta.dy;

  if (frontX < 0 || frontX >= grid.width || frontY < 0 || frontY >= grid.height) {
    return true;
  }

  return isBlocked(frontX, frontY, obstacles);
}

/**
 * Execute a single command, mutating the given RobotState in place.
 */
export function executeCommand(
  robot: RobotState,
  grid: GridConfig,
  command: RobotCommand,
  obstacles?: Position[],
): ExecuteResult {
  switch (command) {
    case 'MOVE_FORWARD':
      return move(robot, grid, 1, obstacles);
    case 'MOVE_BACKWARD':
      return move(robot, grid, -1, obstacles);
    case 'TURN_LEFT':
      return turn(robot, -1);
    case 'TURN_RIGHT':
      return turn(robot, 1);
  }
}

function move(
  robot: RobotState,
  grid: GridConfig,
  step: number,
  obstacles?: Position[],
): ExecuteResult {
  const delta = directionDelta(robot.direction);
  const newX = robot.x + delta.dx * step;
  const newY = robot.y + delta.dy * step;

  if (newX < 0 || newX >= grid.width || newY < 0 || newY >= grid.height) {
    return {ok: false, message: `Can't move — boundary at (${newX}, ${newY})!`};
  }

  if (isBlocked(newX, newY, obstacles)) {
    return {ok: false, message: `Can't move — obstacle at (${newX}, ${newY})!`};
  }

  robot.x = newX;
  robot.y = newY;
  return {ok: true, message: `Moved to (${robot.x}, ${robot.y})`};
}

function turn(robot: RobotState, dir: 1 | -1): ExecuteResult {
  const idx = TURN_ORDER.indexOf(robot.direction);
  robot.direction = TURN_ORDER[(idx + dir + 4) % 4];
  return {ok: true, message: `Turned to face ${robot.direction}`};
}

function directionDelta(dir: Direction): {dx: number; dy: number} {
  switch (dir) {
    case 'NORTH':
      return {dx: 0, dy: -1};
    case 'SOUTH':
      return {dx: 0, dy: 1};
    case 'EAST':
      return {dx: 1, dy: 0};
    case 'WEST':
      return {dx: -1, dy: 0};
  }
}
