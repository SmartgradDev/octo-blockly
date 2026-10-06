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
import {PhaserSimulator, PhaserSimulationBridge, soundSystem} from './simulator';
import {WorldRobotPose} from './simulator/RobotRenderer';
import {
  CAMPUS_TOWN_MAP,
  CAMPUS_NUTRITION_MAP,
  WorldRobotState,
  createWorldRobotState,
  WorldCommandExecutor,
  evaluateWorldMission,
  radiansToDegrees,
  calculateStepDurationMs,
} from './simulator/world';
import {AppBootScreen} from './ui/AppBootScreen';
import octopusIcon from './assets/octopus-icon.png';
import './index.css';

// ── Contextual Robotics Boot Screen Controller ───────────────────────
const bootScreen = new AppBootScreen({
  onReveal: () => {
    if (typeof ws !== 'undefined' && ws) {
      Blockly.svgResize(ws as Blockly.WorkspaceSvg);
    }
    phaserSimulator?.refreshScale();
  },
});

bootScreen.startSubsystem('ui', 'Mounting application interface...', 15);

// Set application header logo image
const appLogoImg = document.getElementById('appLogoImg') as HTMLImageElement | null;
if (appLogoImg) {
  appLogoImg.src = octopusIcon;
}
bootScreen.completeSubsystem('ui', 'UI controls & theme ready', 25);

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
let activeWorldMap = CAMPUS_TOWN_MAP;
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
bootScreen.startSubsystem('blockly', 'Mounting Blockly visual programming workspace...', 35);
const codeDiv = document.getElementById('generatedCode')?.firstChild;
const blocklyDiv = document.getElementById('blocklyDiv');
const statusMessage = document.getElementById('statusMessage');

if (!blocklyDiv) {
  const err = new Error(`div with id 'blocklyDiv' not found`);
  bootScreen.fail(err, 'Blockly workspace container could not be found in DOM.');
  throw err;
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

bootScreen.completeSubsystem('blockly', 'Blockly workspace ready', 55);

// ── Step 2 Phaser Simulator & Bridge Instance ─────────────────────────
bootScreen.startSubsystem('simulator', 'Booting Phaser 4 continuous world physics engine...', 65);
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

  // Select world map if mission specifies a dedicated preset
  if (mission.worldMapId === 'campus_nutrition') {
    activeWorldMap = CAMPUS_NUTRITION_MAP;
  } else {
    activeWorldMap = CAMPUS_TOWN_MAP;
  }
  worldCommandExecutor.setWorldMap(activeWorldMap);

  worldCommandExecutor.getAdapter().resetToSpawn(worldRobot, activeWorldMap.spawnPoint);
  const activePolicy =
    mission.movementPolicy || activeWorldMap.movementPolicy || 'FREE_WORLD';
  worldCommandExecutor.setMovementPolicy(activePolicy);

  // If mission has items (or activeWorldMap has missionObjects), load them into MissionObjectSystem
  if (mission.items && mission.items.length > 0) {
    // Map grid mission items to continuous world coordinates (e.g. aligned with Campus Way / town)
    const missionObjects: import('./simulator/world').WorldMissionObject[] = mission.items.map(
      (item, idx) => ({
        id: `mission_item_${idx + 1}`,
        type: 'COLLECTIBLE',
        x: 120 + item.x * 65,
        y: 300 + (item.y - 1) * 65,
        interactionRadius: 18,
        state: 'AVAILABLE',
        color: 0x38bdf8,
        iconSymbol: '💎',
        label: `Gem ${idx + 1}`,
      }),
    );
    worldCommandExecutor.setMissionObjects(missionObjects);
    phaserSimulator?.updateMissionObjects(missionObjects);
  } else if (mission.missionObjects && mission.missionObjects.length > 0) {
    worldCommandExecutor.setMissionObjects(mission.missionObjects);
    phaserSimulator?.updateMissionObjects(mission.missionObjects);
  } else if (activeWorldMap.missionObjects && activeWorldMap.missionObjects.length > 0) {
    worldCommandExecutor.setMissionObjects(activeWorldMap.missionObjects);
    phaserSimulator?.updateMissionObjects(activeWorldMap.missionObjects);
  } else {
    worldCommandExecutor.setMissionObjects([]);
    phaserSimulator?.updateMissionObjects([]);
  }

  const initialEval = evaluateWorldMission(
    activeWorldMap,
    worldRobot,
    worldCommandExecutor.getMissionObjectSystem(),
  );

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
  phaserSimulator?.resetCamera();
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
  soundSystem.playClick();
  soundSystem.stopMotor();
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
  soundSystem.playClick();
  isPaused = false;
  lastStepTime = performance.now();
  simulationBridge?.onResume();
  updateControlButtons();
  setStatus('Resuming execution in Phaser 4...');
};

const stopProgram = () => {
  if (!isRunning) return;
  soundSystem.playClick();
  soundSystem.stopMotor();
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

  soundSystem.playClick();

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
  worldCommandExecutor.getMissionObjectSystem().reset();
  phaserSimulator?.updateMissionObjects(worldCommandExecutor.getMissionObjectSystem().getObjects());

  let currentEval = evaluateWorldMission(
    activeWorldMap,
    worldRobot,
    worldCommandExecutor.getMissionObjectSystem(),
  );

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
      soundSystem.stopMotor();
      await delay(50);
    }

    if (stopRequested) {
      break;
    }

    const stepResult = activeInterpreter.step();

    if (stepResult.limitExceeded) {
      hadError = true;
      soundSystem.stopMotor();
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
    const isTurn = cmd === 'TURN_LEFT' || cmd === 'TURN_RIGHT';

    // Audio cue for locomotion
    if (isTurn) {
      soundSystem.stopMotor();
      soundSystem.playTurn();
    } else {
      soundSystem.playMotor(true);
    }

    // 1. Authoritative Step-2 World Command Execution
    const result = worldCommandExecutor.execute(worldRobot, cmd);

    // If objects were collected or interacted with, refresh mission objects in simulator visuals and play audio
    if (result.interactions && result.interactions.length > 0) {
      phaserSimulator?.updateMissionObjects(
        worldCommandExecutor.getMissionObjectSystem().getObjects(),
      );
      for (const event of result.interactions) {
        if (event.semanticType === 'HAZARD_CONTACT' || event.foodClassification === 'UNHEALTHY') {
          soundSystem.playHazard();
        } else {
          soundSystem.playCollect();
        }
      }
    }

    currentEval = evaluateWorldMission(
      activeWorldMap,
      worldRobot,
      worldCommandExecutor.getMissionObjectSystem(),
    );

    if (!result.ok) {
      hadError = true;
      soundSystem.stopMotor();
      if (result.reason === 'WORLD_COLLISION' || result.reason === 'WORLD_BOUNDARY') {
        soundSystem.playCollision();
      }

      // If there was partial travel before collision or policy boundary, smoothly animate to safe target before halting
      if (
        (result.reason === 'WORLD_COLLISION' ||
          result.reason === 'OFF_ROAD' ||
          result.reason === 'RESTRICTED_ZONE' ||
          result.reason === 'POLICY_VIOLATION') &&
        result.partialTravelRatio !== undefined &&
        result.partialTravelRatio > 0.001 &&
        simulationBridge
      ) {
        const baseDurationMs = calculateStepDurationMs(
          worldRobot.motorSpeedSetting,
          isTurn,
          undefined,
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
    const durationMs = calculateStepDurationMs(
      worldRobot.motorSpeedSetting,
      isTurn,
      undefined,
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
      soundSystem.stopMotor();
      break;
    }

    if (currentEval.completed) {
      soundSystem.stopMotor();
      soundSystem.playSuccess();

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

    // Inter-command transition:
    // If turning, settle briefly (40ms) for realistic rotational pause.
    // If consecutive linear moves, yield to microtask so robot rolls continuously without stop/start hitching.
    if (isTurn) {
      await delay(40);
    } else {
      await Promise.resolve();
    }
  }

  soundSystem.stopMotor();

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
  soundSystem.playClick();
  soundSystem.stopMotor();
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
  worldCommandExecutor.getMissionObjectSystem().reset();
  phaserSimulator?.updateMissionObjects(worldCommandExecutor.getMissionObjectSystem().getObjects());

  const initialEval = evaluateWorldMission(
    activeWorldMap,
    worldRobot,
    worldCommandExecutor.getMissionObjectSystem(),
  );

  updateStep2View(
    initialEval.progressText,
    true,
  );

  const best = getBestScore(currentMission.id);
  const bestStr = best !== null ? ` (Session Best: ${best})` : '';
  phaserSimulator?.resetCamera();
  setStatus(`Mission reset${bestStr}. Program the robot in Step 2!`);
};

const handleNextMission = () => {
  soundSystem.playClick();
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
  (window as any).__step2SetMovementPolicy = (policy: any) => {
    worldCommandExecutor.setMovementPolicy(policy);
    return worldCommandExecutor.getMovementPolicy().type;
  };
  (window as any).__step2GetMovementPolicy = () => {
    return worldCommandExecutor.getMovementPolicy();
  };
  (window as any).__step2GetMissionObjects = () => {
    return worldCommandExecutor.getMissionObjectSystem().getObjects();
  };
  (window as any).__step2SetMissionObjects = (objects: any) => {
    worldCommandExecutor.setMissionObjects(objects);
    phaserSimulator?.updateMissionObjects(worldCommandExecutor.getMissionObjectSystem().getObjects());
    return worldCommandExecutor.getMissionObjectSystem().getObjects();
  };
  (window as any).__step2ResetMissionObjects = () => {
    worldCommandExecutor.getMissionObjectSystem().reset();
    phaserSimulator?.updateMissionObjects(worldCommandExecutor.getMissionObjectSystem().getObjects());
  };
  (window as any).__step2SetMissionObjectDebug = (enabled: boolean) => {
    phaserSimulator?.setDebugMissionObjectsOverlay(enabled);
    return enabled;
  };
  (window as any).__step2SetAnimationDebug = (enabled: boolean) => {
    phaserSimulator?.setAnimationDebug(enabled);
    return enabled;
  };
  (window as any).__step2GetAnimationState = () => {
    return phaserSimulator?.getAnimationState() || 'IDLE';
  };
  (window as any).__step2IsAnimationDebugEnabled = () => {
    return phaserSimulator?.isAnimationDebugEnabled() || false;
  };
  (window as any).__step2SetCameraDebug = (enabled: boolean) => {
    phaserSimulator?.setCameraDebug(enabled);
    return enabled;
  };
  (window as any).__step2IsCameraDebugEnabled = () => {
    return phaserSimulator?.isCameraDebugEnabled() || false;
  };
  (window as any).__step2GetCameraState = () => {
    return phaserSimulator?.getCameraState() || null;
  };
  (window as any).__step2CameraZoomIn = () => {
    return phaserSimulator?.zoomIn() || 1.0;
  };
  (window as any).__step2CameraZoomOut = () => {
    return phaserSimulator?.zoomOut() || 1.0;
  };
  (window as any).__step2CameraReset = () => {
    phaserSimulator?.resetCamera();
  };
  (window as any).__step2SetCameraFollow = (enabled: boolean) => {
    phaserSimulator?.setCameraFollow(enabled);
    return enabled;
  };
  (window as any).__step2IsCameraFollowEnabled = () => {
    return phaserSimulator?.isCameraFollowEnabled() || false;
  };

  // Phase 4.23: Speed & Motion Observability Hooks
  (window as any).__step2GetRobotMotionConfig = () => {
    return {
      ...worldCommandExecutor.getMovementConfig(),
    };
  };
  (window as any).__step2SetRobotMoveSpeed = (speedPxPerSec: number) => {
    worldCommandExecutor.setMoveSpeed(speedPxPerSec);
    return worldCommandExecutor.getMovementConfig();
  };
  (window as any).__step2SetRobotTurnSpeed = (speedDegPerSec: number) => {
    worldCommandExecutor.setTurnSpeed(speedDegPerSec);
    return worldCommandExecutor.getMovementConfig();
  };

  // Phase 4.23: Sound Foundation Hooks
  (window as any).__step2SetSoundMuted = (muted: boolean) => {
    soundSystem.setMuted(muted);
    return soundSystem.isMuted();
  };
  (window as any).__step2IsSoundMuted = () => {
    return soundSystem.isMuted();
  };
  (window as any).__step2SetSoundVolume = (volume: number) => {
    soundSystem.setVolume(volume);
    return soundSystem.getVolume();
  };
  (window as any).__step2GetSoundVolume = () => {
    return soundSystem.getVolume();
  };
  (window as any).__step2PlaySound = (type: string) => {
    switch (type) {
      case 'motor':
        soundSystem.playMotor(true);
        break;
      case 'stopMotor':
        soundSystem.stopMotor();
        break;
      case 'turn':
        soundSystem.playTurn();
        break;
      case 'collision':
        soundSystem.playCollision();
        break;
      case 'collect':
        soundSystem.playCollect();
        break;
      case 'hazard':
        soundSystem.playHazard();
        break;
      case 'success':
        soundSystem.playSuccess();
        break;
      case 'click':
        soundSystem.playClick();
        break;
    }
  };
  (window as any).__step2GetBootScreen = () => bootScreen;
}

// ── Simulator Floating Camera & Sound Toolbar ────────────────────────
const simCamZoomLabel = document.getElementById('simCamZoomLabel');
const updateCamZoomBadge = () => {
  if (simCamZoomLabel && phaserSimulator) {
    const z = Math.round(phaserSimulator.getZoom() * 100);
    simCamZoomLabel.textContent = `${z}%`;
  }
};

document.getElementById('simCamZoomIn')?.addEventListener('click', () => {
  soundSystem.playClick();
  phaserSimulator?.zoomIn();
  updateCamZoomBadge();
});
document.getElementById('simCamZoomOut')?.addEventListener('click', () => {
  soundSystem.playClick();
  phaserSimulator?.zoomOut();
  updateCamZoomBadge();
});
document.getElementById('simCamReset')?.addEventListener('click', () => {
  soundSystem.playClick();
  phaserSimulator?.resetCamera();
  updateCamZoomBadge();
});
const followToggleBtn = document.getElementById('simCamFollowToggle');
followToggleBtn?.addEventListener('click', () => {
  soundSystem.playClick();
  if (phaserSimulator) {
    const isFollowing = phaserSimulator.isCameraFollowEnabled();
    phaserSimulator.setCameraFollow(!isFollowing);
    followToggleBtn.classList.toggle('active', !isFollowing);
  }
});

const soundToggleBtn = document.getElementById('simSoundToggle');
soundToggleBtn?.addEventListener('click', () => {
  const isMuted = soundSystem.isMuted();
  soundSystem.setMuted(!isMuted);
  if (soundToggleBtn) {
    soundToggleBtn.textContent = !isMuted ? '🔇' : '🔊';
    soundToggleBtn.classList.toggle('active', isMuted);
  }
  soundSystem.playClick();
});

// Global keyboard shortcuts for camera interaction
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  if (activeTag === 'input' || activeTag === 'textarea') return;
  if (e.key === '+' || e.key === '=') {
    phaserSimulator?.zoomIn();
    updateCamZoomBadge();
  } else if (e.key === '-' || e.key === '_') {
    phaserSimulator?.zoomOut();
    updateCamZoomBadge();
  } else if (e.key === '0') {
    phaserSimulator?.resetZoom();
    updateCamZoomBadge();
  } else if (e.key === 'f' || e.key === 'F') {
    phaserSimulator?.recenterCamera();
  }
});

// ── Final Boot Verification & Smooth Studio Reveal ───────────────────
(async () => {
  try {
    bootScreen.startSubsystem('robot', 'Calibrating rover drive and world coordinates...', 80);
    if (phaserSimulator) {
      await phaserSimulator.whenReady();
    }
    bootScreen.completeSubsystem('simulator', 'Phaser 4 continuous world ready', 90);
    bootScreen.completeSubsystem('robot', 'Campus Town geometry & rover calibrated', 98);
    await bootScreen.complete(220);
  } catch (err: any) {
    bootScreen.fail(err, 'Failed to initialize the robotics simulation environment. Please retry.');
  }
})();
