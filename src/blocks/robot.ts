/**
 * Robotics block definitions for octo-blockly.
 *
 * Defines movement statement blocks and sensor value blocks for controlling a robot:
 * - octo_move_forward
 * - octo_move_backward
 * - octo_turn_left
 * - octo_turn_right
 * - octo_obstacle_ahead (Front Obstacle Sensor)
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

const octoObstacleAhead = {
  type: 'octo_obstacle_ahead',
  message0: '🧱 obstacle ahead?',
  output: 'Boolean',
  colour: 120,
  tooltip: 'Returns true if an obstacle or grid boundary is directly in front of the robot.',
  helpUrl: '',
};

export const robotBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  octoMoveForward,
  octoMoveBackward,
  octoTurnLeft,
  octoTurnRight,
  octoObstacleAhead,
]);
