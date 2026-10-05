/**
 * Step 2: Advanced Robot Simulator (Phaser 4 Engine)
 *
 * Uses the exact same Shared Robot Engine (RobotState, CommandExecutor,
 * MissionEvaluator, ScoringEngine, blocks, and Blockly generators).
 * Step 2 mounts the isolated Phaser 4 visual engine instead of the DOM table grid.
 */

import * as Blockly from 'blockly';
import {blocks} from './blocks/text';
import {robotBlocks} from './blocks/robot';
import {forBlock} from './generators/javascript';
import {javascriptGenerator} from 'blockly/javascript';
import {save, load} from './serialization';
import {toolbox} from './toolbox';
import {createRobotState, Direction, GridConfig} from './robot/RobotState';
import {ProgramInterpreter} from './robot/CommandExecutor';
import {getMissionsByPhase, Mission, Position} from './robot/Mission';
import {calculateScore} from './robot/ScoringEngine';
import {PhaserSimulator, PhaserSimulationBridge} from './simulator';
import {WorldRobotPose} from './simulator/RobotRenderer';
import {
  CAMPUS_TOWN_MAP,
  WorldRobotState,
  createWorldRobotState,
  WorldCommandExecutor,
  evaluateWorldMission,
  radiansToDegrees,
  calculateStepDurationMs,
} from './simulator/world';
import octopusIcon from './assets/octopus-icon.png';
import './index.css';

// Set application header logo image
const appLogoImg = document.getElementById('appLogoImg') as HTMLImageElement | null;
if (appLogoImg) {
  appLogoImg.src = octopusIcon;
}

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

// ── Active Mission State & Configuration (Shared Robot Engine) ──────
let activeMissionsList: Mission[] = getMissionsByPhase(1);
let currentMission: Mission = activeMissionsList[0];

const grid: GridConfig = {
  width: currentMission.gridSize,
  height: currentMission.gridSize,
};
const robot = createRobotState(
  currentMission.start.x,
  currentMission.start.y,
  currentMission.start.direction,
);

// ── Step 2 Continuous World Robot State & Command Executor ──────────
const activeWorldMap = CAMPUS_TOWN_MAP;
const worldRobot: WorldRobotState = createWorldRobotState(
  activeWorldMap.spawnPoint.position.x,
  activeWorldMap.spawnPoint.position.y,
  activeWorldMap.spawnPoint.rotation,
  50,
  currentMission.initialBattery,
);
const worldCommandExecutor = new WorldCommandExecutor(activeWorldMap);

const phaserContainer = document.getElementById('phaserSimulatorContainer');
const telemetryHud = document.getElementById('telemetryHud');
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

const ws = Blockly.inject(blocklyDiv, {
  toolbox,
  grid: {
    spacing: 24,
    length: 3,
    colour: '#cbd5e1',
    snap: true,
  },
  zoom: {
    controls: false,
    wheel: true,
    startScale: 0.95,
    maxScale: 2.5,
    minScale: 0.4,
    scaleSpeed: 1.15,
    pinch: true,
  },
  trashcan: true,
  renderer: 'zelos',
});

// ── Step 2 Phaser Simulator & Bridge Instance ─────────────────────────
let phaserSimulator: PhaserSimulator | null = null;
let simulationBridge: PhaserSimulationBridge | null = null;

if (phaserContainer) {
  phaserSimulator = new PhaserSimulator({
    parent: phaserContainer,
  });
  simulationBridge = new PhaserSimulationBridge(phaserSimulator);
}

function directionArrow(dir: Direction): string {
  switch (dir) {
    case 'NORTH':
      return '▲';
    case 'SOUTH':
      return '▼';
    case 'EAST':
      return '▶';
    case 'WEST':
      return '◀';
  }
}

/**
 * Updates the DOM Telemetry HUD with real-time pose, motor speed, and battery.
 */
function updateTelemetryDisplay(
  pose: {x: number; y: number; rotation: number},
  progressText?: string,
): void {
  if (!telemetryHud) return;
  const headingDeg = Math.round(radiansToDegrees(pose.rotation));
  const posChip = `<div class="hud-chip hud-chip-pos"><span class="hud-icon">📍</span><span class="hud-label">X:${pose.x.toFixed(1)}, Y:${pose.y.toFixed(1)}</span></div>`;
  const dirChip = `<div class="hud-chip hud-chip-dir"><span class="hud-icon">🧭</span><span class="hud-label">${headingDeg}° (${pose.rotation.toFixed(2)} rad)</span></div>`;
  const speedChip = `<div class="hud-chip hud-chip-speed"><span class="hud-icon">⚡</span><span class="hud-label">${worldRobot.motorSpeedSetting}%</span></div>`;

  let batChip = '';
  if (worldRobot.battery !== undefined) {
    const maxBat = worldRobot.maxBattery || 100;
    const currentBat = Math.max(0, worldRobot.battery);
    const batPct = Math.min(100, Math.round((currentBat / maxBat) * 100));
    const batColor =
      batPct > 50 ? 'battery-high' : batPct > 20 ? 'battery-mid' : 'battery-low';
    batChip = `
        <div class="hud-chip hud-chip-battery ${batColor}">
          <span class="hud-icon">🔋</span>
          <span class="hud-label">${currentBat.toFixed(1)} / ${maxBat.toFixed(1)}</span>
          <div class="battery-gauge"><div class="battery-gauge-fill" style="width: ${batPct}%;"></div></div>
        </div>
      `;
  }

  let progBanner = '';
  if (progressText) {
    progBanner = `<div class="hud-progress-banner"><span class="prog-icon">🎯</span><span class="prog-text">${progressText}</span></div>`;
  }

  telemetryHud.innerHTML = posChip + dirChip + speedChip + batChip + progBanner;
}

/**
 * Updates the Step 2 visual presentation:
 * - Uses PhaserSimulationBridge to update Phaser GameObjects
 * - Updates DOM Telemetry HUD
 * - Returns a Promise that resolves when visual animation finishes
 */
function updateStep2View(
  progressText?: string,
  immediate: boolean = false,
  durationMs?: number,
  onProgress?: (pose: WorldRobotPose) => void,
): Promise<void> {
  // 1. DOM Telemetry HUD
  updateTelemetryDisplay(worldRobot, progressText);

  // 2. Phaser Simulation Bridge
  if (simulationBridge) {
    return simulationBridge.onStateChange({
      grid,
      robot,
      worldRobot,
      mission: currentMission,
      progressText,
      immediate,
      durationMs,
      onProgress,
    });
  }

  return Promise.resolve();
}

// ── Code inspector updater ──────────────────────────────────────────
const updateCodePreview = () => {
  try {
    const code = javascriptGenerator.workspaceToCode(ws as Blockly.Workspace);
    if (codeDiv) codeDiv.textContent = code;
  } catch (err) {
    console.warn('Error generating code preview:', err);
  }
};

// ── Helper: set a status message ────────────────────────────────────
function setStatus(text: string, type: '' | 'error' | 'success' = '') {
  if (!statusMessage) return;
  statusMessage.className = `status-card ${type}`;

  if (type === 'success') {
    statusMessage.innerHTML = `
      <div class="achievement-title"><span>🎉</span> <span>Mission Complete!</span></div>
      <div>${text.replace(/🎉 Mission Complete!\n?/, '').replace(/\n/g, '<br>')}</div>
    `;
  } else if (type === 'error') {
    statusMessage.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 2px;">⚠️ Execution Stopped</div>
      <div>${text.replace(/\n/g, '<br>')}</div>
    `;
  } else {
    statusMessage.innerHTML = text.replace(/\n/g, '<br>');
  }
}

// ── Execution state & helpers ───────────────────────────────────────
let isRunning = false;
let isPaused = false;
let stopRequested = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Updates button visibility and active styles across the top bar and sidebar.
 */
function updateControlButtons(): void {
  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  const sidebarRunBtn = document.getElementById('sidebarRunBtn') as HTMLButtonElement | null;
  const runBtnText = document.getElementById('runBtnText');
  const sidebarRunText = document.querySelector('.sidebar-run-text');

  const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement | null;
  const sidebarPauseBtn = document.getElementById('sidebarPauseBtn') as HTMLButtonElement | null;
  const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement | null;
  const sidebarStopBtn = document.getElementById('sidebarStopBtn') as HTMLButtonElement | null;

  if (isRunning) {
    if (isPaused) {
      // Paused state: show Resume on runBtn, toggle pauseBtn label
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.classList.remove('is-running');
      }
      if (sidebarRunBtn) {
        sidebarRunBtn.disabled = false;
        sidebarRunBtn.classList.remove('is-running');
      }
      if (runBtnText) runBtnText.textContent = 'Resume';
      if (sidebarRunText) sidebarRunText.textContent = 'Resume';

      if (pauseBtn) {
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.innerHTML = '<span class="btn-icon">▶</span> <span>Resume</span>';
      }
      if (sidebarPauseBtn) {
        sidebarPauseBtn.style.display = 'inline-flex';
        sidebarPauseBtn.innerHTML = '<span class="btn-icon">▶</span> <span>Resume</span>';
      }
    } else {
      // Running state: run button disabled, pause and stop buttons visible
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.classList.add('is-running');
      }
      if (sidebarRunBtn) {
        sidebarRunBtn.disabled = true;
        sidebarRunBtn.classList.add('is-running');
      }
      if (runBtnText) runBtnText.textContent = 'Running...';
      if (sidebarRunText) sidebarRunText.textContent = 'Running...';

      if (pauseBtn) {
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.innerHTML = '<span class="btn-icon">⏸</span> <span>Pause</span>';
      }
      if (sidebarPauseBtn) {
        sidebarPauseBtn.style.display = 'inline-flex';
        sidebarPauseBtn.innerHTML = '<span class="btn-icon">⏸</span> <span>Pause</span>';
      }
    }

    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (sidebarStopBtn) sidebarStopBtn.style.display = 'inline-flex';
  } else {
    // Idle / Stopped state
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.classList.remove('is-running');
    }
    if (sidebarRunBtn) {
      sidebarRunBtn.disabled = false;
      sidebarRunBtn.classList.remove('is-running');
    }
    if (runBtnText) runBtnText.textContent = 'Run';
    if (sidebarRunText) sidebarRunText.textContent = 'Run';

    if (pauseBtn) pauseBtn.style.display = 'none';
    if (sidebarPauseBtn) sidebarPauseBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (sidebarStopBtn) sidebarStopBtn.style.display = 'none';
  }
}

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
  robot.motorSpeed = 50;
  robot.battery =
    mission.initialBattery !== undefined
      ? Math.max(0, mission.initialBattery)
      : undefined;
  robot.maxBattery =
    mission.initialBattery !== undefined
      ? Math.max(0, mission.initialBattery)
      : undefined;

  worldCommandExecutor.getAdapter().resetToSpawn(worldRobot, activeWorldMap.spawnPoint);

  if (missionTitleEl) missionTitleEl.textContent = mission.title;
  if (missionDescEl) missionDescEl.textContent = mission.description;

  const topPhaseLabel = document.getElementById('topPhaseLabel');
  const topMissionLabel = document.getElementById('topMissionLabel');
  const missionPhaseTag = document.getElementById('missionPhaseTag');
  const missionStepCounter = document.getElementById('missionStepCounter');

  const phaseNames: Record<number, string> = {
    1: 'Commands',
    2: 'Logic',
    3: 'Programming abstraction',
  };
  const phaseName = phaseNames[mission.phase] || `Phase ${mission.phase}`;

  if (topPhaseLabel) topPhaseLabel.textContent = `Phase ${mission.phase}: ${phaseName}`;
  if (topMissionLabel) topMissionLabel.textContent = mission.title;
  if (missionPhaseTag) missionPhaseTag.textContent = `Phase ${mission.phase}`;

  const currentIdx = activeMissionsList.findIndex((m) => m.id === mission.id);
  if (missionStepCounter && currentIdx >= 0) {
    missionStepCounter.textContent = `Mission ${currentIdx + 1} of ${activeMissionsList.length}`;
  }

  const nextMissionBtn = document.getElementById('nextMissionBtn');
  const sidebarNextBtn = document.getElementById('sidebarNextBtn');
  if (nextMissionBtn) nextMissionBtn.style.display = 'none';
  if (sidebarNextBtn) sidebarNextBtn.style.display = 'none';

  const conceptsContainerEl = document.getElementById('conceptsContainer');
  if (conceptsContainerEl) {
    conceptsContainerEl.innerHTML = '';
    const concepts = mission.concepts || [];
    concepts.forEach((c) => {
      const tag = document.createElement('span');
      tag.className = 'concept-tag';
      tag.textContent = c;
      conceptsContainerEl.appendChild(tag);
    });
  }

  worldCommandExecutor.getAdapter().resetToSpawn(worldRobot, activeWorldMap.spawnPoint);
  const initialEval = evaluateWorldMission(activeWorldMap, worldRobot);

  updateStep2View(
    initialEval.progressText,
    true,
  );

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  const sidebarRunBtn = document.getElementById('sidebarRunBtn') as HTMLButtonElement | null;
  const runBtnText = document.getElementById('runBtnText');
  const sidebarRunText = document.querySelector('.sidebar-run-text');

  if (runBtn) {
    runBtn.disabled = false;
    runBtn.classList.remove('is-running');
  }
  if (sidebarRunBtn) {
    sidebarRunBtn.disabled = false;
    sidebarRunBtn.classList.remove('is-running');
  }
  if (runBtnText) runBtnText.textContent = 'Run Program';
  if (sidebarRunText) sidebarRunText.textContent = 'Run Program';

  const best = getBestScore(mission.id);
  const bestStr = best !== null ? ` (Session Best: ${best})` : '';
  setStatus(`Loaded ${mission.title}${bestStr}. Program the robot in Step 2!`);
};

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

const updateMissionsList = () => {
  const phaseId = phaseSelect ? parseInt(phaseSelect.value, 10) : 1;
  activeMissionsList = getMissionsByPhase(phaseId);
  populateMissionDropdown(activeMissionsList);

  if (activeMissionsList.length > 0) {
    loadMission(activeMissionsList[0]);
  }
};

if (phaseSelect) {
  phaseSelect.addEventListener('change', updateMissionsList);
}

if (missionSelect) {
  missionSelect.addEventListener('change', (e) => {
    const idx = parseInt((e.target as HTMLSelectElement).value, 10);
    if (!isNaN(idx) && activeMissionsList[idx]) {
      loadMission(activeMissionsList[idx]);
    }
  });
}

// ── Run / Pause / Resume / Stop Controls ─────────────────────────────

// Shared execution session state across pause/resume
let activeInterpreter: ProgramInterpreter | null = null;
let activeStartTime: number = 0;
let accumulatedExecutionTime: number = 0;
let lastStepTime: number = 0;

const pauseProgram = () => {
  if (!isRunning || isPaused) return;
  isPaused = true;
  accumulatedExecutionTime += performance.now() - lastStepTime;
  simulationBridge?.onPause();
  const visualPose = simulationBridge?.getVisualPose();
  if (visualPose) {
    updateTelemetryDisplay(visualPose);
  }
  updateControlButtons();
  setStatus('Simulation paused. Click Resume or ▶ to continue.');
};

const resumeProgram = () => {
  if (!isRunning || !isPaused) return;
  isPaused = false;
  lastStepTime = performance.now();
  simulationBridge?.onResume();
  updateControlButtons();
  setStatus('Resuming execution in Phaser 4...');
};

const stopProgram = () => {
  if (!isRunning) return;
  stopRequested = true;
  isPaused = false;
  isRunning = false;
  activeInterpreter = null;
  // Stop tweens in-place without snapping to forward destination
  simulationBridge?.onStop(false);
  const visualPose = simulationBridge?.getVisualPose();
  if (visualPose) {
    worldCommandExecutor.getAdapter().setPose(
      worldRobot,
      visualPose.x,
      visualPose.y,
      visualPose.rotation,
    );
    updateTelemetryDisplay(worldRobot);
  }
  updateControlButtons();
  setStatus('Execution stopped.', 'error');
};

const runProgram = async () => {
  if (isRunning) {
    if (isPaused) {
      resumeProgram();
    }
    return;
  }

  // Check if workspace has blocks
  const allBlocks = ws.getAllBlocks(false);
  if (allBlocks.length === 0) {
    setStatus('No robot commands found. Drag some blocks!');
    return;
  }

  isRunning = true;
  isPaused = false;
  stopRequested = false;
  updateControlButtons();

  // Restore starting state for fresh run
  robot.x = currentMission.start.x;
  robot.y = currentMission.start.y;
  robot.direction = currentMission.start.direction;
  robot.motorSpeed = 50;
  robot.battery =
    currentMission.initialBattery !== undefined
      ? Math.max(0, currentMission.initialBattery)
      : undefined;
  robot.maxBattery =
    currentMission.initialBattery !== undefined
      ? Math.max(0, currentMission.initialBattery)
      : undefined;

  worldCommandExecutor.getAdapter().resetToSpawn(worldRobot, activeWorldMap.spawnPoint);
  let currentEval = evaluateWorldMission(activeWorldMap, worldRobot);

  updateStep2View(
    currentEval.progressText,
    true,
  );

  activeInterpreter = new ProgramInterpreter(
    ws as Blockly.Workspace,
    robot,
    grid,
  );

  setStatus('Starting execution in Phaser 4...');

  activeStartTime = performance.now();
  lastStepTime = activeStartTime;
  accumulatedExecutionTime = 0;
  let hadError = false;

  while (activeInterpreter && !activeInterpreter.isDone()) {
    if (stopRequested) {
      break;
    }

    // While paused, wait safely without consuming CPU or advancing interpreter
    while (isPaused && !stopRequested) {
      await delay(50);
    }

    if (stopRequested) {
      break;
    }

    const stepResult = activeInterpreter.step();

    if (stepResult.limitExceeded) {
      hadError = true;
      setStatus(
        stepResult.error ||
          '⚠️ Program limit exceeded! Maximum 500 robot commands per run.',
        'error',
      );
      break;
    }

    if (!stepResult.command) {
      continue;
    }

    const cmd = stepResult.command;
    const executedCount = activeInterpreter.getExecutedCommandCount();

    // 1. Authoritative Step-2 World Command Execution
    const result = worldCommandExecutor.execute(worldRobot, cmd);

    currentEval = evaluateWorldMission(activeWorldMap, worldRobot);

    if (!result.ok) {
      hadError = true;
      // If there was partial collision travel, smoothly animate to the safe target pose before halting
      if (
        result.reason === 'WORLD_COLLISION' &&
        result.partialTravelRatio !== undefined &&
        result.partialTravelRatio > 0.001 &&
        simulationBridge
      ) {
        const isTurn = cmd === 'TURN_LEFT' || cmd === 'TURN_RIGHT';
        const baseDurationMs = calculateStepDurationMs(
          worldRobot.motorSpeedSetting,
          isTurn,
          worldCommandExecutor.getMovementConfig(),
        );
        const partialDurationMs = Math.max(
          60,
          Math.round(baseDurationMs * result.partialTravelRatio),
        );
        await simulationBridge.onStateChange({
          grid,
          robot,
          worldRobot,
          mission: currentMission,
          progressText: currentEval.progressText,
          durationMs: partialDurationMs,
          onProgress: (interPose) => {
            updateTelemetryDisplay(interPose, currentEval.progressText);
          },
        });
      }
      setStatus(
        `Step ${executedCount} (${cmd}): ${result.message}`,
        'error',
      );
      updateTelemetryDisplay(worldRobot, currentEval.progressText);
      break;
    }

    // 2. Smooth continuous world movement & turning (Phaser 4 tweens)
    const isTurn = cmd === 'TURN_LEFT' || cmd === 'TURN_RIGHT';
    const durationMs = calculateStepDurationMs(
      worldRobot.motorSpeedSetting,
      isTurn,
      worldCommandExecutor.getMovementConfig(),
    );

    setStatus(`Step ${executedCount} (${cmd}): ${result.message}`);

    // Await visual interpolation completion before next command begins!
    if (simulationBridge) {
      await simulationBridge.onStateChange({
        grid,
        robot,
        worldRobot,
        mission: currentMission,
        progressText: currentEval.progressText,
        durationMs,
        onProgress: (interPose) => {
          updateTelemetryDisplay(interPose, currentEval.progressText);
        },
      });
    }

    // Synchronize telemetry with final authoritative pose
    updateTelemetryDisplay(worldRobot, currentEval.progressText);

    if (stopRequested) {
      break;
    }

    if (currentEval.completed) {
      const totalTimeMs =
        accumulatedExecutionTime + (performance.now() - lastStepTime);
      const blockCount = ws.getAllBlocks(false).length;

      const scoreResult = calculateScore({
        completed: true,
        executedActionCount: executedCount,
        blockCount: blockCount,
        timeMs: totalTimeMs,
        optimalActionCount: 8, // 8 commands from spawn to Science Plaza goal
      });

      const {best: bestScore, isNewBest} = updateBestScore(
        currentMission.id,
        scoreResult.score,
      );

      const bestBadge = isNewBest
        ? `<div class="best-score-badge">🏆 New Best Score: ${bestScore}!</div>`
        : `<div class="best-score-badge">Best Score: ${bestScore}</div>`;

      setStatus(
        `🎉 Mission Complete!\n` +
          `${currentEval.message}\n` +
          `<div class="stars-row">${scoreResult.starDisplay} (${scoreResult.stars} ${scoreResult.stars === 1 ? 'star' : 'stars'})</div>` +
          `<div class="stats-badge-grid">` +
          `<div class="stat-pill">Score: ${scoreResult.score}</div>` +
          `<div class="stat-pill">Actions: ${scoreResult.executedActionCount}</div>` +
          `<div class="stat-pill">Blocks: ${scoreResult.blockCount}</div>` +
          `<div class="stat-pill">Time: ${scoreResult.timeSeconds}s</div>` +
          `</div>` +
          `${bestBadge}`,
        'success',
      );

      const nextMissionBtn = document.getElementById('nextMissionBtn');
      const sidebarNextBtn = document.getElementById('sidebarNextBtn');
      if (nextMissionBtn) nextMissionBtn.style.display = 'inline-flex';
      if (sidebarNextBtn) sidebarNextBtn.style.display = 'inline-flex';
      break;
    }

    // Brief inter-command settle delay
    await delay(30);
  }

  const totalExecuted = activeInterpreter ? activeInterpreter.getExecutedCommandCount() : 0;

  if (totalExecuted === 0 && !hadError && !stopRequested) {
    setStatus('No robot commands found. Drag some blocks!');
  } else if (!stopRequested && !hadError && !currentEval.completed) {
    setStatus(
      `Robot stopped at (X: ${worldRobot.x.toFixed(1)}, Y: ${worldRobot.y.toFixed(1)}), heading ${(radiansToDegrees(worldRobot.rotation)).toFixed(0)}°. Objective not reached yet. Try again!`,
    );
  }

  isRunning = false;
  isPaused = false;
  activeInterpreter = null;
  updateControlButtons();
};

const resetRobot = () => {
  stopRequested = true;
  isPaused = false;
  isRunning = false;
  activeInterpreter = null;

  simulationBridge?.onStop(false);

  const nextMissionBtn = document.getElementById('nextMissionBtn');
  const sidebarNextBtn = document.getElementById('sidebarNextBtn');
  if (nextMissionBtn) nextMissionBtn.style.display = 'none';
  if (sidebarNextBtn) sidebarNextBtn.style.display = 'none';

  updateControlButtons();

  worldCommandExecutor.getAdapter().resetToSpawn(worldRobot, activeWorldMap.spawnPoint);
  const initialEval = evaluateWorldMission(activeWorldMap, worldRobot);

  updateStep2View(
    initialEval.progressText,
    true,
  );

  const best = getBestScore(currentMission.id);
  const bestStr = best !== null ? ` (Session Best: ${best})` : '';
  setStatus(`Mission reset${bestStr}. Program the robot in Step 2!`);
};

const handleNextMission = () => {
  const currentIdx = activeMissionsList.findIndex((m) => m.id === currentMission.id);
  if (currentIdx >= 0 && currentIdx < activeMissionsList.length - 1) {
    const nextMission = activeMissionsList[currentIdx + 1];
    if (missionSelect) {
      missionSelect.value = (currentIdx + 1).toString();
    }
    loadMission(nextMission);
  } else {
    const currentPhase = currentMission.phase;
    if (currentPhase < 3) {
      const nextPhase = currentPhase + 1;
      if (phaseSelect) {
        phaseSelect.value = nextPhase.toString();
      }
      activeMissionsList = getMissionsByPhase(nextPhase);
      populateMissionDropdown(activeMissionsList);
      if (activeMissionsList.length > 0) {
        loadMission(activeMissionsList[0]);
      }
    } else {
      setStatus('🏆 Congratulations! You have completed all missions!', 'success');
    }
  }
};

// Wire up event listeners
document.getElementById('runBtn')?.addEventListener('click', runProgram);
document.getElementById('sidebarRunBtn')?.addEventListener('click', runProgram);
document.getElementById('pauseBtn')?.addEventListener('click', () => {
  if (isPaused) {
    resumeProgram();
  } else {
    pauseProgram();
  }
});
document.getElementById('sidebarPauseBtn')?.addEventListener('click', () => {
  if (isPaused) {
    resumeProgram();
  } else {
    pauseProgram();
  }
});
document.getElementById('stopBtn')?.addEventListener('click', stopProgram);
document.getElementById('sidebarStopBtn')?.addEventListener('click', stopProgram);
document.getElementById('resetBtn')?.addEventListener('click', resetRobot);
document.getElementById('sidebarResetBtn')?.addEventListener('click', resetRobot);
document.getElementById('nextMissionBtn')?.addEventListener('click', handleNextMission);
document.getElementById('sidebarNextBtn')?.addEventListener('click', handleNextMission);

// Initialize missions
populateMissionDropdown(activeMissionsList);
loadMission(currentMission);

// Collapsible Code Inspector Card
const codeInspectorToggle = document.getElementById('codeInspectorToggle');
const codeInspectorBody = document.getElementById('codeInspectorBody');
const codeToggleIcon = document.getElementById('codeToggleIcon');
const topCodeBtn = document.getElementById('topCodeBtn');

const toggleCodeInspector = () => {
  if (!codeInspectorBody) return;
  const isOpen = codeInspectorBody.classList.toggle('is-open');
  if (codeToggleIcon) codeToggleIcon.textContent = isOpen ? '▼' : '▶';
  if (topCodeBtn) topCodeBtn.classList.toggle('active', isOpen);
};

codeInspectorToggle?.addEventListener('click', toggleCodeInspector);
topCodeBtn?.addEventListener('click', toggleCodeInspector);

// Workspace floating toolbar
document.getElementById('wsZoomIn')?.addEventListener('click', () => {
  (ws as any).zoomCenter ? (ws as any).zoomCenter(1) : (ws as any).zoom?.(0, 0, 1);
});
document.getElementById('wsZoomOut')?.addEventListener('click', () => {
  (ws as any).zoomCenter ? (ws as any).zoomCenter(-1) : (ws as any).zoom?.(0, 0, -1);
});
document.getElementById('wsZoomReset')?.addEventListener('click', () => {
  (ws as any).zoomReset ? (ws as any).zoomReset() : (ws as any).scrollCenter?.();
});
document.getElementById('wsUndo')?.addEventListener('click', () => {
  (ws as any).undo?.(false);
});
document.getElementById('wsRedo')?.addEventListener('click', () => {
  (ws as any).undo?.(true);
});

window.addEventListener('resize', () => {
  Blockly.svgResize(ws as Blockly.WorkspaceSvg);
  phaserSimulator?.refreshScale();
});

if (typeof ResizeObserver !== 'undefined') {
  const resizeObserver = new ResizeObserver(() => {
    Blockly.svgResize(ws as Blockly.WorkspaceSvg);
    phaserSimulator?.refreshScale();
  });
  const wsPanel = document.getElementById('workspaceContainer');
  const simPanel = document.getElementById('phaserSimulatorContainer');
  if (wsPanel) resizeObserver.observe(wsPanel);
  if (simPanel) resizeObserver.observe(simPanel);
}

if (ws) {
  load(ws);
  updateCodePreview();

  ws.addChangeListener((e: Blockly.Events.Abstract) => {
    if (e.isUiEvent) return;
    save(ws);
  });

  ws.addChangeListener((e: Blockly.Events.Abstract) => {
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

// ── Development & Validation Testing Hooks ──────────────────────────
if (typeof window !== 'undefined') {
  (window as any).__step2TestPose = (x: number, y: number, rotation: number) => {
    worldCommandExecutor.getAdapter().setPose(worldRobot, x, y, rotation);
    const evalResult = evaluateWorldMission(activeWorldMap, worldRobot);
    updateStep2View(evalResult.progressText, false);
    return {x: worldRobot.x, y: worldRobot.y, rotation: worldRobot.rotation};
  };
  (window as any).__step2ExecuteCommand = (cmd: any) => {
    const res = worldCommandExecutor.execute(worldRobot, cmd);
    const evalResult = evaluateWorldMission(activeWorldMap, worldRobot);
    updateStep2View(evalResult.progressText, false);
    return res;
  };
  (window as any).__step2GetWorldRobot = () => ({...worldRobot});
  (window as any).__step2GetVisualPose = () => simulationBridge?.getVisualPose() || null;
  (window as any).__step2GetRoads = () => activeWorldMap.roads;
  (window as any).__step2GetIntersections = () => activeWorldMap.intersections || [];
  (window as any).__step2SetRoadDebug = (enabled: boolean) => {
    phaserSimulator?.setDebugRoadOverlay(enabled);
    return enabled;
  };
  (window as any).__step2SetCollisionDebug = (enabled: boolean) => {
    phaserSimulator?.setDebugCollisionOverlay(enabled);
    return enabled;
  };
  (window as any).__step2GetColliders = () => {
    return worldCommandExecutor.getCollisionSystem()?.getColliders() || [];
  };
}
