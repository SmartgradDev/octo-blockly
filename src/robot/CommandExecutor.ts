/**
 * CommandExecutor — extracts robot commands from the Blockly workspace
 * and executes them against a RobotState.
 *
 * Recursively interprets Blockly block structures (including loops)
 * without using eval() or new Function().
 *
 * No DOM dependencies — this is pure logic.
 */

import * as Blockly from 'blockly/core';
import {Direction, GridConfig, RobotCommand, RobotState} from './RobotState';

/** Map from Blockly block type to RobotCommand. */
const BLOCK_TO_COMMAND: Record<string, RobotCommand> = {
  octo_move_forward: 'MOVE_FORWARD',
  octo_move_backward: 'MOVE_BACKWARD',
  octo_turn_left: 'TURN_LEFT',
  octo_turn_right: 'TURN_RIGHT',
};

export const MAX_COMMANDS_LIMIT = 500;

export interface ExtractCommandsResult {
  commands: RobotCommand[];
  limitExceeded: boolean;
}

/**
 * Walk top-level blocks in the workspace and recursively interpret
 * commands and loops into a flat command sequence.
 */
export function extractCommands(
  workspace: Blockly.Workspace,
  maxLimit: number = MAX_COMMANDS_LIMIT,
): ExtractCommandsResult {
  const commands: RobotCommand[] = [];
  const topBlocks = workspace.getTopBlocks(true);
  let limitExceeded = false;

  for (const topBlock of topBlocks) {
    if (limitExceeded) break;
    limitExceeded = walkBlockChain(topBlock, commands, maxLimit);
  }

  return {commands, limitExceeded};
}

/**
 * Recursively walk a statement chain of blocks.
 * Returns true if maxLimit was exceeded during walking.
 */
function walkBlockChain(
  firstBlock: Blockly.Block | null,
  commands: RobotCommand[],
  maxLimit: number,
): boolean {
  let block: Blockly.Block | null = firstBlock;

  while (block) {
    if (commands.length >= maxLimit) {
      return true;
    }

    const type = block.type;

    if (type in BLOCK_TO_COMMAND) {
      commands.push(BLOCK_TO_COMMAND[type]);
    } else if (type === 'controls_repeat_ext' || type === 'controls_repeat') {
      const repeatCount = getRepeatCount(block);
      const bodyBlock = block.getInputTargetBlock('DO');

      for (let i = 0; i < repeatCount; i++) {
        if (commands.length >= maxLimit) {
          return true;
        }
        if (bodyBlock) {
          const exceeded = walkBlockChain(bodyBlock, commands, maxLimit);
          if (exceeded) return true;
        }
      }
    }

    block = block.getNextBlock();
  }

  return false;
}

/**
 * Safely extract the numeric repeat count from a repeat block.
 */
function getRepeatCount(block: Blockly.Block): number {
  if (block.type === 'controls_repeat') {
    const val = Number(block.getFieldValue('TIMES'));
    return isNaN(val) ? 0 : Math.max(0, Math.floor(val));
  }

  // controls_repeat_ext
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
  /** Whether the command was applied successfully. */
  ok: boolean;
  /** Human-readable message (e.g. wall-hit warning). */
  message: string;
}

/** Clockwise turn order. */
const TURN_ORDER: Direction[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

/**
 * Execute a single command, mutating the given RobotState in place.
 * The grid config is used for bounds checking.
 */
export function executeCommand(
  robot: RobotState,
  grid: GridConfig,
  command: RobotCommand,
): ExecuteResult {
  switch (command) {
    case 'MOVE_FORWARD':
      return move(robot, grid, 1);
    case 'MOVE_BACKWARD':
      return move(robot, grid, -1);
    case 'TURN_LEFT':
      return turn(robot, -1);
    case 'TURN_RIGHT':
      return turn(robot, 1);
  }
}

/**
 * Move the robot one step forward (+1) or backward (−1) relative
 * to its current direction.
 */
function move(robot: RobotState, grid: GridConfig, step: number): ExecuteResult {
  const delta = directionDelta(robot.direction);
  const newX = robot.x + delta.dx * step;
  const newY = robot.y + delta.dy * step;

  if (newX < 0 || newX >= grid.width || newY < 0 || newY >= grid.height) {
    return {ok: false, message: `Can't move — wall at (${newX}, ${newY})!`};
  }

  robot.x = newX;
  robot.y = newY;
  return {ok: true, message: `Moved to (${robot.x}, ${robot.y})`};
}

/** Rotate: dir = +1 for clockwise (right), −1 for counter-clockwise (left). */
function turn(robot: RobotState, dir: 1 | -1): ExecuteResult {
  const idx = TURN_ORDER.indexOf(robot.direction);
  robot.direction = TURN_ORDER[(idx + dir + 4) % 4];
  return {ok: true, message: `Turned to face ${robot.direction}`};
}

/** Unit delta for a given direction. Y increases downward. */
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
