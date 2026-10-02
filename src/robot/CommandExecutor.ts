/**
 * CommandExecutor — extracts robot commands from the Blockly workspace
 * and executes them against a RobotState.
 *
 * This module does NOT use eval() or new Function(). It walks the
 * Blockly block tree directly to build a safe command list, then
 * applies each command to the robot state.
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

/**
 * Walk the top-level blocks in the workspace and collect an ordered
 * list of robot commands. Non-robot blocks are silently skipped.
 */
export function extractCommands(workspace: Blockly.Workspace): RobotCommand[] {
  const commands: RobotCommand[] = [];
  const topBlocks = workspace.getTopBlocks(true);

  for (const topBlock of topBlocks) {
    let block: Blockly.Block | null = topBlock;
    while (block) {
      const cmd = BLOCK_TO_COMMAND[block.type];
      if (cmd) {
        commands.push(cmd);
      }
      block = block.getNextBlock();
    }
  }

  return commands;
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
