/**
 * Robotics block definitions for octo-blockly.
 *
 * Defines four simple statement blocks for controlling a robot:
 * - octo_move_forward
 * - octo_move_backward
 * - octo_turn_left
 * - octo_turn_right
 *
 * This file has no side effects — blocks must be registered
 * separately via Blockly.common.defineBlocks().
 */

import * as Blockly from 'blockly/core';

const octoMoveForward = {
  type: 'octo_move_forward',
  message0: '⬆ Move Forward',
  previousStatement: null,
  nextStatement: null,
  colour: 210,
  tooltip: 'Move the robot one step forward.',
  helpUrl: '',
};

const octoMoveBackward = {
  type: 'octo_move_backward',
  message0: '⬇ Move Backward',
  previousStatement: null,
  nextStatement: null,
  colour: 210,
  tooltip: 'Move the robot one step backward.',
  helpUrl: '',
};

const octoTurnLeft = {
  type: 'octo_turn_left',
  message0: '↩ Turn Left',
  previousStatement: null,
  nextStatement: null,
  colour: 260,
  tooltip: 'Rotate the robot 90° to the left.',
  helpUrl: '',
};

const octoTurnRight = {
  type: 'octo_turn_right',
  message0: '↪ Turn Right',
  previousStatement: null,
  nextStatement: null,
  colour: 260,
  tooltip: 'Rotate the robot 90° to the right.',
  helpUrl: '',
};

export const robotBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  octoMoveForward,
  octoMoveBackward,
  octoTurnLeft,
  octoTurnRight,
]);
