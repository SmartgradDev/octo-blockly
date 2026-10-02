/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Blockly from 'blockly';
import {blocks} from './blocks/text';
import {robotBlocks} from './blocks/robot';
import {forBlock} from './generators/javascript';
import {javascriptGenerator} from 'blockly/javascript';
import {save, load} from './serialization';
import {toolbox} from './toolbox';
import {createRobotState, GridConfig} from './robot/RobotState';
import {renderGrid} from './robot/GridRenderer';
import {extractCommands, executeCommand} from './robot/CommandExecutor';
import './index.css';

// Register the blocks and generator with Blockly
Blockly.common.defineBlocks(blocks);
Blockly.common.defineBlocks(robotBlocks);
Object.assign(javascriptGenerator.forBlock, forBlock);

// ── Robot simulator: initial state ──────────────────────────────────
const grid: GridConfig = {width: 5, height: 5};
const robot = createRobotState(0, 0, 'EAST');

const simulatorPane = document.getElementById('simulatorPane');
if (simulatorPane) {
  renderGrid(simulatorPane, grid, robot);
}

// Set up UI elements and inject Blockly
const codeDiv = document.getElementById('generatedCode')?.firstChild;
const blocklyDiv = document.getElementById('blocklyDiv');
const statusMessage = document.getElementById('statusMessage');

if (!blocklyDiv) {
  throw new Error(`div with id 'blocklyDiv' not found`);
}
const ws = Blockly.inject(blocklyDiv, {toolbox});

// ── Helper: update the generated code preview ───────────────────────
const updateCodePreview = () => {
  const code = javascriptGenerator.workspaceToCode(ws as Blockly.Workspace);
  if (codeDiv) codeDiv.textContent = code;
};

// ── Helper: set a status message ────────────────────────────────────
function setStatus(text: string, type: '' | 'error' | 'success' = '') {
  if (!statusMessage) return;
  statusMessage.textContent = text;
  statusMessage.className = type;
}

// ── Execution state & helpers ───────────────────────────────────────
let isRunning = false;
let stopRequested = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Run: extract commands from blocks, execute sequentially with delay
const runProgram = async () => {
  if (isRunning) return;
  isRunning = true;
  stopRequested = false;

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.disabled = true;

  // Reset robot to initial state before starting run.
  robot.x = 0;
  robot.y = 0;
  robot.direction = 'EAST';
  if (simulatorPane) renderGrid(simulatorPane, grid, robot);

  const commands = extractCommands(ws as Blockly.Workspace);

  if (commands.length === 0) {
    setStatus('No robot commands found. Drag some blocks!');
    isRunning = false;
    if (runBtn) runBtn.disabled = false;
    return;
  }

  setStatus(`Starting execution of ${commands.length} command(s)...`);

  let hadError = false;
  let executedCount = 0;

  for (let i = 0; i < commands.length; i++) {
    if (stopRequested) {
      setStatus('Execution stopped.', 'error');
      break;
    }

    const cmd = commands[i];
    const result = executeCommand(robot, grid, cmd);
    executedCount++;

    if (simulatorPane) renderGrid(simulatorPane, grid, robot);

    if (!result.ok) {
      hadError = true;
      setStatus(`Step ${i + 1}/${commands.length} (${cmd}): ${result.message}`, 'error');
      break;
    } else {
      setStatus(`Step ${i + 1}/${commands.length} (${cmd}): ${result.message}`);
    }

    // Delay 400ms between steps for visual animation
    await delay(400);
  }

  if (!stopRequested && !hadError) {
    setStatus(
      `Finished executing all ${executedCount} command(s) successfully!`,
      'success',
    );
  }

  isRunning = false;
  if (runBtn) runBtn.disabled = false;
};

// ── Reset: restore the robot to its initial position & stop running ─
const resetRobot = () => {
  stopRequested = true;
  isRunning = false;

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.disabled = false;

  robot.x = 0;
  robot.y = 0;
  robot.direction = 'EAST';
  if (simulatorPane) renderGrid(simulatorPane, grid, robot);
  setStatus('Robot reset to (0, 0) EAST.');
};

// ── Wire up buttons ─────────────────────────────────────────────────
document.getElementById('runBtn')?.addEventListener('click', runProgram);
document.getElementById('resetBtn')?.addEventListener('click', resetRobot);

if (ws) {
  // Load the initial state from storage.
  load(ws);
  updateCodePreview();

  // Every time the workspace changes state, save the changes to storage.
  ws.addChangeListener((e: Blockly.Events.Abstract) => {
    // UI events are things like scrolling, zooming, etc.
    // No need to save after one of these.
    if (e.isUiEvent) return;
    save(ws);
  });

  // Whenever the workspace changes meaningfully, update the code preview.
  ws.addChangeListener((e: Blockly.Events.Abstract) => {
    // Don't update when the workspace finishes loading; we're
    // already doing it once when the application starts.
    // Don't update during drags; we might have invalid state.
    if (
      e.isUiEvent ||
      e.type == Blockly.Events.FINISHED_LOADING ||
      ws.isDragging()
    ) {
      return;
    }
    updateCodePreview();
  });
}
