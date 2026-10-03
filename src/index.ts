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
import {MISSIONS, Mission} from './robot/Mission';
import {calculateScore} from './robot/ScoringEngine';
import './index.css';

// Register the blocks and generator with Blockly
Blockly.common.defineBlocks(blocks);
Blockly.common.defineBlocks(robotBlocks);
Object.assign(javascriptGenerator.forBlock, forBlock);

// ── Active Mission State & Configuration ────────────────────────────
let currentMission: Mission = MISSIONS[0];
const grid: GridConfig = {
  width: currentMission.gridSize,
  height: currentMission.gridSize,
};
const robot = createRobotState(
  currentMission.start.x,
  currentMission.start.y,
  currentMission.start.direction,
);

const simulatorPane = document.getElementById('simulatorPane');
const missionTitleEl = document.getElementById('missionTitle');
const missionDescEl = document.getElementById('missionDescription');
const missionSelect = document.getElementById('missionSelect') as HTMLSelectElement | null;

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

// Helper to check if robot has reached mission target
const isTargetReached = (): boolean => {
  return (
    robot.x === currentMission.target.x && robot.y === currentMission.target.y
  );
};

// ── Helper: Load & switch mission ───────────────────────────────────
const loadMission = (mission: Mission) => {
  stopRequested = true;
  isRunning = false;

  currentMission = mission;
  grid.width = mission.gridSize;
  grid.height = mission.gridSize;

  robot.x = mission.start.x;
  robot.y = mission.start.y;
  robot.direction = mission.start.direction;

  if (missionTitleEl) missionTitleEl.textContent = mission.title;
  if (missionDescEl) missionDescEl.textContent = mission.description;

  if (simulatorPane) {
    renderGrid(simulatorPane, grid, robot, mission.target);
  }

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.disabled = false;

  setStatus(`Loaded ${mission.title}. Program the robot!`);
};

// Populate Mission Selector Dropdown
if (missionSelect) {
  missionSelect.innerHTML = '';
  MISSIONS.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = idx.toString();
    opt.textContent = m.title;
    missionSelect.appendChild(opt);
  });

  missionSelect.addEventListener('change', (e) => {
    const idx = parseInt((e.target as HTMLSelectElement).value, 10);
    if (MISSIONS[idx]) {
      loadMission(MISSIONS[idx]);
    }
  });
}

// Load initial mission
loadMission(currentMission);

// ── Run: extract commands from blocks, execute sequentially with delay
const runProgram = async () => {
  if (isRunning) return;
  isRunning = true;
  stopRequested = false;

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.disabled = true;

  // Reset robot to initial mission state before starting run.
  robot.x = currentMission.start.x;
  robot.y = currentMission.start.y;
  robot.direction = currentMission.start.direction;
  if (simulatorPane) {
    renderGrid(simulatorPane, grid, robot, currentMission.target);
  }

  const commands = extractCommands(ws as Blockly.Workspace);

  if (commands.length === 0) {
    setStatus('No robot commands found. Drag some blocks!');
    isRunning = false;
    if (runBtn) runBtn.disabled = false;
    return;
  }

  setStatus(`Starting execution of ${commands.length} command(s)...`);

  const startTime = performance.now();
  let hadError = false;
  let targetReached = isTargetReached();

  for (let i = 0; i < commands.length; i++) {
    if (stopRequested) {
      setStatus('Execution stopped.', 'error');
      break;
    }

    const cmd = commands[i];
    const result = executeCommand(robot, grid, cmd);

    if (simulatorPane) {
      renderGrid(simulatorPane, grid, robot, currentMission.target);
    }

    if (!result.ok) {
      hadError = true;
      setStatus(
        `Step ${i + 1}/${commands.length} (${cmd}): ${result.message}`,
        'error',
      );
      break;
    }

    if (isTargetReached()) {
      targetReached = true;
      const elapsedTimeMs = performance.now() - startTime;
      const scoreResult = calculateScore({
        completed: true,
        commandCount: commands.length,
        timeMs: elapsedTimeMs,
        optimalCommandCount: currentMission.optimalCommandCount,
      });

      setStatus(
        `🎉 Mission Complete!\n` +
          `Rating: ${scoreResult.starDisplay} (${scoreResult.stars} ${scoreResult.stars === 1 ? 'star' : 'stars'})\n` +
          `Score: ${scoreResult.score}\n` +
          `Commands: ${scoreResult.commandCount}\n` +
          `Time: ${scoreResult.timeSeconds}s`,
        'success',
      );
      break;
    } else {
      setStatus(`Step ${i + 1}/${commands.length} (${cmd}): ${result.message}`);
    }

    // Delay 400ms between steps for visual animation
    await delay(400);
  }

  if (!stopRequested && !hadError && !targetReached) {
    setStatus(
      `Robot stopped at (${robot.x}, ${robot.y}), but hasn't reached the star yet. Try again!`,
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

  robot.x = currentMission.start.x;
  robot.y = currentMission.start.y;
  robot.direction = currentMission.start.direction;
  if (simulatorPane) {
    renderGrid(simulatorPane, grid, robot, currentMission.target);
  }
  setStatus('Mission reset. Program the robot to reach the star!');
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
