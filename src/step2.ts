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
import {executeCommand, ProgramInterpreter} from './robot/CommandExecutor';
import {getMissionsByPhase, Mission, Position} from './robot/Mission';
import {calculateScore} from './robot/ScoringEngine';
import {evaluateMission, MissionRuntimeState} from './robot/MissionEvaluator';
import {PhaserSimulator, PhaserSimulationBridge} from './simulator';
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
 * Updates the Step 2 visual presentation:
 * - Uses PhaserSimulationBridge to update Phaser GameObjects
 * - Updates DOM Telemetry HUD
 */
function updateStep2View(
  currentCollectedItems: Position[] = [],
  progressText?: string,
): void {
  // 1. Phaser Simulation Bridge (Robot Engine -> Bridge -> Phaser Visual State)
  if (simulationBridge) {
    simulationBridge.onStateChange({
      grid,
      robot,
      mission: currentMission,
      collectedItems: currentCollectedItems,
      progressText,
    });
  }

  // 2. DOM Telemetry HUD (outside Phaser canvas)
  if (telemetryHud) {
    const posChip = `<div class="hud-chip hud-chip-pos"><span class="hud-icon">📍</span><span class="hud-label">(${robot.x}, ${robot.y})</span></div>`;
    const dirChip = `<div class="hud-chip hud-chip-dir"><span class="hud-icon">${directionArrow(robot.direction)}</span><span class="hud-label">${robot.direction}</span></div>`;
    const speedChip = `<div class="hud-chip hud-chip-speed"><span class="hud-icon">⚡</span><span class="hud-label">${robot.motorSpeed}%</span></div>`;

    let batChip = '';
    if (robot.battery !== undefined) {
      const maxBat = robot.maxBattery || 100;
      const currentBat = Math.max(0, robot.battery);
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
let stopRequested = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const initialRuntimeState: MissionRuntimeState = {
    collectedItems: [],
    visitedColors: new Set(),
    executedActions: 0,
    batteryDepleted: false,
  };

  const initialEval = evaluateMission(mission, robot, initialRuntimeState);

  updateStep2View(
    initialRuntimeState.collectedItems,
    initialEval.progressText,
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

// ── Run Program Execution ───────────────────────────────────────────
const runProgram = async () => {
  if (isRunning) return;

  const runBtn = document.getElementById('runBtn') as HTMLButtonElement | null;
  const sidebarRunBtn = document.getElementById('sidebarRunBtn') as HTMLButtonElement | null;
  const runBtnText = document.getElementById('runBtnText');
  const sidebarRunText = document.querySelector('.sidebar-run-text');

  isRunning = true;
  stopRequested = false;

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

  // Restore starting state
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

  const runtimeState: MissionRuntimeState = {
    collectedItems: [],
    visitedColors: new Set(),
    executedActions: 0,
    batteryDepleted: false,
  };

  const checkCellVisit = () => {
    if (currentMission.items) {
      const foundItem = currentMission.items.find(
        (it) =>
          it.x === robot.x &&
          it.y === robot.y &&
          !runtimeState.collectedItems.some((ci) => ci.x === it.x && ci.y === it.y),
      );
      if (foundItem) {
        runtimeState.collectedItems.push({x: foundItem.x, y: foundItem.y});
      }
    }

    if (currentMission.cellColors) {
      const colorCell = currentMission.cellColors.find(
        (c) => c.x === robot.x && c.y === robot.y,
      );
      if (colorCell) {
        runtimeState.visitedColors.add(colorCell.color);
      }
    }
  };

  checkCellVisit();
  let currentEval = evaluateMission(currentMission, robot, runtimeState);

  updateStep2View(
    runtimeState.collectedItems,
    currentEval.progressText,
  );

  const interpreter = new ProgramInterpreter(
    ws as Blockly.Workspace,
    robot,
    grid,
    currentMission.obstacles,
    currentMission.cellColors,
    currentMission.lines,
  );

  setStatus('Starting execution in Phaser 4...');

  const startTime = performance.now();
  let hadError = false;

  while (!interpreter.isDone()) {
    if (stopRequested) {
      setStatus('Execution stopped.', 'error');
      break;
    }

    const stepResult = interpreter.step();

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
    const executedCount = interpreter.getExecutedCommandCount();

    const result = executeCommand(
      robot,
      grid,
      cmd,
      currentMission.obstacles,
    );

    runtimeState.executedActions = executedCount;
    if (!result.ok && result.message.includes('Battery depleted')) {
      runtimeState.batteryDepleted = true;
    }

    checkCellVisit();
    currentEval = evaluateMission(currentMission, robot, runtimeState);

    updateStep2View(
      runtimeState.collectedItems,
      currentEval.progressText,
    );

    if (!result.ok) {
      hadError = true;
      setStatus(
        `Step ${executedCount} (${cmd}): ${result.message}`,
        'error',
      );
      break;
    }

    if (currentEval.failed) {
      hadError = true;
      setStatus(currentEval.message, 'error');
      break;
    }

    if (currentEval.completed) {
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
    } else {
      setStatus(`Step ${executedCount} (${cmd}): ${result.message}`);
    }

    const stepDelay = Math.max(100, Math.round(800 - robot.motorSpeed * 7));
    await delay(stepDelay);
  }

  const totalExecuted = interpreter.getExecutedCommandCount();

  if (totalExecuted === 0 && !hadError && !stopRequested) {
    setStatus('No robot commands found. Drag some blocks!');
  } else if (!stopRequested && !hadError && !currentEval.completed) {
    setStatus(
      `Robot stopped at (${robot.x}, ${robot.y}), but objective is not completed yet. Try again!`,
    );
  }

  isRunning = false;
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
};

const resetRobot = () => {
  stopRequested = true;
  isRunning = false;

  const nextMissionBtn = document.getElementById('nextMissionBtn');
  const sidebarNextBtn = document.getElementById('sidebarNextBtn');
  if (nextMissionBtn) nextMissionBtn.style.display = 'none';
  if (sidebarNextBtn) sidebarNextBtn.style.display = 'none';

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

  const resetRuntimeState: MissionRuntimeState = {
    collectedItems: [],
    visitedColors: new Set(),
    executedActions: 0,
    batteryDepleted: false,
  };

  const initialEval = evaluateMission(currentMission, robot, resetRuntimeState);

  updateStep2View(
    resetRuntimeState.collectedItems,
    initialEval.progressText,
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
});

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
