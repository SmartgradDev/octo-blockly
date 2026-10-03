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
import {executeCommand, ProgramInterpreter} from './robot/CommandExecutor';
import {getMissionsByPhase, Mission} from './robot/Mission';
import {calculateScore} from './robot/ScoringEngine';
import './index.css';

// Register the blocks and generator with Blockly
Blockly.common.defineBlocks(blocks);
Blockly.common.defineBlocks(robotBlocks);
Object.assign(javascriptGenerator.forBlock, forBlock);

// ── Session Best Score Tracking (In-Memory Browser Session) ─────────
const sessionBestScores: Record<string, number> = {};

const getBestScore = (missionId: string): number | null => {
  return sessionBestScores[missionId] !== undefined
    ? sessionBestScores[missionId]
    : null;
};

const updateBestScore = (
  missionId: string,
  score: number,
): {best: number; isNewBest: boolean} => {
  const currentBest = sessionBestScores[missionId];
  if (currentBest === undefined || score > currentBest) {
    sessionBestScores[missionId] = score;
    return {best: score, isNewBest: true};
  }
  return {best: currentBest, isNewBest: false};
};

// ── Active Mission State & Configuration ────────────────────────────
let currentPhaseMissions: Mission[] = getMissionsByPhase(1);
let currentMission: Mission = currentPhaseMissions[0];

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
const phaseSelect = document.getElementById('phaseSelect') as HTMLSelectElement | null;
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
    renderGrid(
      simulatorPane,
      grid,
      robot,
      mission.target,
      mission.obstacles,
    );
  }

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.disabled = false;

  const best = getBestScore(mission.id);
  const bestStr = best !== null ? ` (Session Best: ${best})` : '';
  setStatus(`Loaded ${mission.title}${bestStr}. Program the robot!`);
};

// Helper to populate Mission Selector Dropdown for active phase
const populateMissionDropdown = (missions: Mission[]) => {
  if (!missionSelect) return;
  missionSelect.innerHTML = '';
  missions.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = idx.toString();
    opt.textContent = m.title;
    missionSelect.appendChild(opt);
  });
};

// Wire up Phase / Level Selector (Novice vs Proficient)
if (phaseSelect) {
  phaseSelect.addEventListener('change', (e) => {
    const phaseId = parseInt((e.target as HTMLSelectElement).value, 10);
    currentPhaseMissions = getMissionsByPhase(phaseId);
    populateMissionDropdown(currentPhaseMissions);
    if (currentPhaseMissions.length > 0) {
      loadMission(currentPhaseMissions[0]);
    }
  });
}

// Wire up Mission Selector Dropdown
if (missionSelect) {
  missionSelect.addEventListener('change', (e) => {
    const idx = parseInt((e.target as HTMLSelectElement).value, 10);
    if (currentPhaseMissions[idx]) {
      loadMission(currentPhaseMissions[idx]);
    }
  });
}

// Initial setup
populateMissionDropdown(currentPhaseMissions);
loadMission(currentPhaseMissions[0]);

// ── Run: step-by-step dynamic AST interpretation & execution ────────
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
    renderGrid(
      simulatorPane,
      grid,
      robot,
      currentMission.target,
      currentMission.obstacles,
    );
  }

  const interpreter = new ProgramInterpreter(
    ws as Blockly.Workspace,
    robot,
    grid,
    currentMission.obstacles,
  );

  setStatus('Starting execution...');

  const startTime = performance.now();
  let hadError = false;
  let targetReached = isTargetReached();

  while (!interpreter.isDone()) {
    if (stopRequested) {
      setStatus('Execution stopped.', 'error');
      break;
    }

    const stepResult = interpreter.step();

    if (stepResult.limitExceeded) {
      hadError = true;
      setStatus(
        '⚠️ Program limit exceeded! Maximum 500 robot commands per run.',
        'error',
      );
      break;
    }

    if (!stepResult.command) {
      continue;
    }

    const cmd = stepResult.command;
    const executedCount = interpreter.getExecutedCommandCount();

    const result = executeCommand(
      robot,
      grid,
      cmd,
      currentMission.obstacles,
    );

    if (simulatorPane) {
      renderGrid(
        simulatorPane,
        grid,
        robot,
        currentMission.target,
        currentMission.obstacles,
      );
    }

    if (!result.ok) {
      hadError = true;
      setStatus(
        `Step ${executedCount} (${cmd}): ${result.message}`,
        'error',
      );
      break;
    }

    if (isTargetReached()) {
      targetReached = true;
      const elapsedTimeMs = performance.now() - startTime;
      const blockCount = ws.getAllBlocks(false).length;

      const scoreResult = calculateScore({
        completed: true,
        executedActionCount: executedCount,
        blockCount: blockCount,
        timeMs: elapsedTimeMs,
        optimalActionCount: currentMission.optimalCommandCount,
      });

      const {best: bestScore, isNewBest} = updateBestScore(
        currentMission.id,
        scoreResult.score,
      );

      const bestLine = isNewBest
        ? `Best Score: ${bestScore} 🏆 (New Best!)`
        : `Best Score: ${bestScore}`;

      setStatus(
        `🎉 Mission Complete!\n` +
          `Rating: ${scoreResult.starDisplay} (${scoreResult.stars} ${scoreResult.stars === 1 ? 'star' : 'stars'})\n` +
          `Score: ${scoreResult.score}\n` +
          `Actions: ${scoreResult.executedActionCount} | Blocks: ${scoreResult.blockCount}\n` +
          `Time: ${scoreResult.timeSeconds}s\n` +
          `${bestLine}`,
        'success',
      );
      break;
    } else {
      setStatus(`Step ${executedCount} (${cmd}): ${result.message}`);
    }

    // Delay 400ms between steps for visual animation
    await delay(400);
  }

  const totalExecuted = interpreter.getExecutedCommandCount();

  if (totalExecuted === 0 && !hadError && !stopRequested) {
    setStatus('No robot commands found. Drag some blocks!');
  } else if (!stopRequested && !hadError && !targetReached) {
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
    renderGrid(
      simulatorPane,
      grid,
      robot,
      currentMission.target,
      currentMission.obstacles,
    );
  }

  const best = getBestScore(currentMission.id);
  const bestStr = best !== null ? ` (Session Best: ${best})` : '';
  setStatus(`Mission reset${bestStr}. Program the robot to reach the star!`);
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
