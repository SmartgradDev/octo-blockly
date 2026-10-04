/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Order} from 'blockly/javascript';
import * as Blockly from 'blockly/core';

// Export all the code generators for our custom blocks,
// but don't register them with Blockly yet.
// This file has no side effects!
export const forBlock = Object.create(null);

forBlock['add_text'] = function (
  block: Blockly.Block,
  generator: Blockly.CodeGenerator,
) {
  const text = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
  const addText = generator.provideFunction_(
    'addText',
    `function ${generator.FUNCTION_NAME_PLACEHOLDER_}(text) {

  // Add text to the output area.
  const outputDiv = document.getElementById('output');
  const textEl = document.createElement('p');
  textEl.innerText = text;
  outputDiv.appendChild(textEl);
}`,
  );
  // Generate the function call for this block.
  const code = `${addText}(${text});\n`;
  return code;
};

// ── Robotics block generators ───────────────────────────────────────
// Each block generates a simple command string constant.
// These are not executed yet — a future simulator will consume them.

forBlock['octo_move_forward'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return "'MOVE_FORWARD';\n";
};

forBlock['octo_move_backward'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return "'MOVE_BACKWARD';\n";
};

forBlock['octo_turn_left'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return "'TURN_LEFT';\n";
};

forBlock['octo_turn_right'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return "'TURN_RIGHT';\n";
};

forBlock['octo_obstacle_ahead'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return ['isObstacleAhead()', Order.ATOMIC];
};

forBlock['octo_set_motor_speed'] = function (
  block: Blockly.Block,
  generator: Blockly.CodeGenerator,
) {
  const speed = generator.valueToCode(block, 'SPEED', Order.NONE) || '50';
  return `setMotorSpeed(${speed});\n`;
};

forBlock['octo_distance_ahead'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return ['getDistanceAhead()', Order.ATOMIC];
};

forBlock['octo_color_under_robot'] = function (
  _block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  return ['getColorUnderRobot()', Order.ATOMIC];
};

forBlock['octo_color_is'] = function (
  block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  const color = block.getFieldValue('COLOR') || 'NONE';
  return [`isColorUnderRobot('${color}')`, Order.ATOMIC];
};

forBlock['octo_line_sensor'] = function (
  block: Blockly.Block,
  _generator: Blockly.CodeGenerator,
) {
  const dir = block.getFieldValue('DIR') || 'CENTER';
  return [`isLineDetected('${dir}')`, Order.ATOMIC];
};
