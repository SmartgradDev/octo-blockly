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

const octoDistanceAhead = {
  type: 'octo_distance_ahead',
  message0: '📏 distance ahead',
  output: 'Number',
  colour: 120,
  tooltip: 'Returns distance (step count) to the nearest obstacle or wall directly in front of the robot.',
  helpUrl: '',
};

const octoColorUnderRobot = {
  type: 'octo_color_under_robot',
  message0: '🎨 color under robot',
  output: 'String',
  colour: 120,
  tooltip: 'Returns color of current cell (RED, BLUE, GREEN, YELLOW, or NONE).',
  helpUrl: '',
};

const octoColorIs = {
  type: 'octo_color_is',
  message0: '🎨 color under robot is %1',
  args0: [
    {
      type: 'field_dropdown',
      name: 'COLOR',
      options: [
        ['RED', 'RED'],
        ['BLUE', 'BLUE'],
        ['GREEN', 'GREEN'],
        ['YELLOW', 'YELLOW'],
        ['NONE', 'NONE'],
      ],
    },
  ],
  output: 'Boolean',
  colour: 120,
  tooltip: 'Returns true if the cell under the robot matches the selected color.',
  helpUrl: '',
};

const octoLineSensor = {
  type: 'octo_line_sensor',
  message0: '🛤 line detected on %1?',
  args0: [
    {
      type: 'field_dropdown',
      name: 'DIR',
      options: [
        ['CENTER', 'CENTER'],
        ['LEFT', 'LEFT'],
        ['RIGHT', 'RIGHT'],
      ],
    },
  ],
  output: 'Boolean',
  colour: 120,
  tooltip: 'Returns true if a track line exists at the specified position relative to the robot heading.',
  helpUrl: '',
};

const octoSetMotorSpeed = {
  type: 'octo_set_motor_speed',
  message0: '⚡ set motor speed %1',
  args0: [
    {
      type: 'input_value',
      name: 'SPEED',
      check: 'Number',
    },
  ],
  inputsInline: true,
  previousStatement: null,
  nextStatement: null,
  colour: 210,
  tooltip: 'Set robot motor speed (0 to 100).',
  helpUrl: '',
};

export const robotBlocks = Blockly.common.createBlockDefinitionsFromJsonArray([
  octoMoveForward,
  octoMoveBackward,
  octoTurnLeft,
  octoTurnRight,
  octoSetMotorSpeed,
  octoObstacleAhead,
  octoDistanceAhead,
  octoColorUnderRobot,
  octoColorIs,
  octoLineSensor,
]);
