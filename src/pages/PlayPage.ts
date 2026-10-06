/**
 * pages/PlayPage.ts — Step 2: Advanced Continuous World Robotics Simulator Page
 *
 * Implements the full lifecycle Page interface (mount, unmount) to ensure:
 * 1. Complete initialization of Blockly, PhaserSimulator, and telemetry.
 * 2. Complete, leak-free teardown when navigating away:
 *    - phaserSimulator.destroy() kills WebGL canvas and Phaser scene loop.
 *    - ws.dispose() cleans up Blockly SVG, listeners, and workspace memory.
 *    - soundSystem.stopMotor() halts running audio synthesis.
 *    - ResizeObserver, keyboard shortcuts, and button handlers are cleanly detached.
 */

import * as Blockly from 'blockly';
import {blocks} from '../blocks/text';
import {robotBlocks} from '../blocks/robot';
import {forBlock} from '../generators/javascript';
import {javascriptGenerator} from 'blockly/javascript';
import {save, load} from '../serialization';
import {toolbox} from '../toolbox';
import {createRobotState, Direction, GridConfig} from '../robot/RobotState';
import {ProgramInterpreter} from '../robot/CommandExecutor';
import {getMissionsByPhase, Mission} from '../robot/Mission';
import {calculateScore} from '../robot/ScoringEngine';
import {PhaserSimulator, PhaserSimulationBridge, soundSystem} from '../simulator';
import {WorldRobotPose} from '../simulator/RobotRenderer';
import {
  CAMPUS_TOWN_MAP,
  CAMPUS_NUTRITION_MAP,
  WorldRobotState,
  createWorldRobotState,
  WorldCommandExecutor,
  evaluateWorldMission,
  radiansToDegrees,
  calculateStepDurationMs,
} from '../simulator/world';
import {AppBootScreen} from '../ui/AppBootScreen';
import octopusIcon from '../assets/octopus-icon.png';
import {Page, RouteContext} from '../router/types';

export class PlayPage implements Page {
  private container: HTMLElement | null = null;
  private ws: Blockly.WorkspaceSvg | null = null;
  private phaserSimulator: PhaserSimulator | null = null;
  private simulationBridge: PhaserSimulationBridge | null = null;
  private bootScreen: AppBootScreen | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private windowResizeHandler: (() => void) | null = null;

  // Session state & runtime control
  private sessionBestScores: Record<string, number> = {};
  private activeMissionsList: Mission[] = [];
  private currentMission: Mission = null as any;
  private grid: GridConfig = {width: 5, height: 5};
  private robot = createRobotState(0, 0, 'NORTH');
  private activeWorldMap = CAMPUS_TOWN_MAP;
  private worldRobot: WorldRobotState = null as any;
  private worldCommandExecutor: WorldCommandExecutor = null as any;

  private isRunning = false;
  private isPaused = false;
  private stopRequested = false;
  private activeInterpreter: ProgramInterpreter | null = null;
  private activeStartTime = 0;
  private accumulatedExecutionTime = 0;
  private lastStepTime = 0;
  private isUnmounted = false;

  public async mount(container: HTMLElement, _context: RouteContext): Promise<void> {
    this.container = container;
    this.isUnmounted = false;

    // 1. Render DOM structure
    container.innerHTML = this.renderHtml();

    // 2. Set application logo
    const appLogoImg = container.querySelector('#appLogoImg') as HTMLImageElement | null;
    if (appLogoImg) {
      appLogoImg.src = octopusIcon;
    }

    // 3. Define Blockly blocks & generator
    Blockly.common.defineBlocks(blocks);
    Blockly.common.defineBlocks(robotBlocks);
    Object.assign(javascriptGenerator.forBlock, forBlock);

    // 4. Initialize Boot Screen
    this.bootScreen = new AppBootScreen({
      containerId: 'appBootScreen',
      appRootId: 'appRoot',
      onReveal: () => {
        if (this.ws) {
          Blockly.svgResize(this.ws);
        }
        this.phaserSimulator?.refreshScale();
      },
    });

    this.bootScreen.startSubsystem('ui', 'Mounting application interface...', 15);

    // 5. Initialize Mission & World State
    this.activeMissionsList = getMissionsByPhase(1);
    this.currentMission = this.activeMissionsList[0];
    this.grid = {
      width: this.currentMission.gridSize,
      height: this.currentMission.gridSize,
    };
    this.robot = createRobotState(
      this.currentMission.start.x,
      this.currentMission.start.y,
      this.currentMission.start.direction,
    );

    this.activeWorldMap = CAMPUS_TOWN_MAP;
    this.worldRobot = createWorldRobotState(
      this.activeWorldMap.spawnPoint.position.x,
      this.activeWorldMap.spawnPoint.position.y,
      this.activeWorldMap.spawnPoint.rotation,
      50,
      this.currentMission.initialBattery,
    );
    this.worldCommandExecutor = new WorldCommandExecutor(this.activeWorldMap);

    this.bootScreen.completeSubsystem('ui', 'UI controls & theme ready', 25);

    // 6. Inject Blockly Workspace
    this.bootScreen.startSubsystem('blockly', 'Mounting Blockly visual programming workspace...', 35);
    const blocklyDiv = container.querySelector('#blocklyDiv') as HTMLElement | null;
    if (!blocklyDiv) {
      const err = new Error(`div with id 'blocklyDiv' not found`);
      this.bootScreen.fail(err, 'Blockly workspace container could not be found in DOM.');
      throw err;
    }

    this.ws = Blockly.inject(blocklyDiv, {
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

    this.bootScreen.completeSubsystem('blockly', 'Blockly workspace ready', 55);

    // 7. Inject Phaser 4 Simulator
    this.bootScreen.startSubsystem('simulator', 'Booting Phaser 4 continuous world physics engine...', 65);
    const phaserContainer = container.querySelector('#phaserSimulatorContainer') as HTMLElement | null;
    if (phaserContainer) {
      this.phaserSimulator = new PhaserSimulator({
        parent: phaserContainer,
      });
      this.simulationBridge = new PhaserSimulationBridge(this.phaserSimulator);
    }

    // 8. Bind Events, Toolbars & Observers
    this.bindEvents(container);

    // 9. Load mission
    this.populateMissionDropdown(this.activeMissionsList);
    this.loadMission(this.currentMission);

    // 10. Load saved Blockly workspace
    if (this.ws) {
      load(this.ws);
      this.updateCodePreview();

      this.ws.addChangeListener((e: Blockly.Events.Abstract) => {
        if (e.isUiEvent || this.isUnmounted || !this.ws) return;
        save(this.ws);
      });

      this.ws.addChangeListener((e: Blockly.Events.Abstract) => {
        if (
          e.isUiEvent ||
          e.type === Blockly.Events.FINISHED_LOADING ||
          (this.ws && this.ws.isDragging()) ||
          this.isUnmounted
        ) {
          return;
        }
        this.updateCodePreview();
      });
    }

    // 11. Register global development testing hooks
    this.registerTestingHooks();

    // 12. Finalize Boot
    try {
      this.bootScreen.startSubsystem('robot', 'Calibrating rover drive and world coordinates...', 80);
      if (this.phaserSimulator) {
        await this.phaserSimulator.whenReady();
      }
      this.bootScreen.completeSubsystem('simulator', 'Phaser 4 continuous world ready', 90);
      this.bootScreen.completeSubsystem('robot', 'Campus Town geometry & rover calibrated', 98);
      await this.bootScreen.complete(220);
    } catch (err: any) {
      this.bootScreen.fail(err, 'Failed to initialize the robotics simulation environment. Please retry.');
    }
  }

  public async unmount(): Promise<void> {
    this.isUnmounted = true;
    this.stopRequested = true;
    this.isRunning = false;
    this.isPaused = false;

    // 1. Halt sound system
    try {
      soundSystem.stopMotor();
    } catch {}

    // 2. Disconnect window listeners
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 3. Destroy Phaser Simulator
    if (this.phaserSimulator) {
      try {
        this.phaserSimulator.destroy();
      } catch (err) {
        console.warn('[PlayPage] Error destroying Phaser instance:', err);
      }
      this.phaserSimulator = null;
      this.simulationBridge = null;
    }

    // 4. Dispose Blockly Workspace
    if (this.ws) {
      try {
        this.ws.dispose();
      } catch (err) {
        console.warn('[PlayPage] Error disposing Blockly workspace:', err);
      }
      this.ws = null;
    }

    // 5. Clean testing hooks
    if (typeof window !== 'undefined') {
      delete (window as any).__step2TestPose;
      delete (window as any).__step2ExecuteCommand;
      delete (window as any).__step2GetWorldRobot;
      delete (window as any).__step2GetVisualPose;
      delete (window as any).__step2GetRoads;
      delete (window as any).__step2GetIntersections;
      delete (window as any).__step2SetRoadDebug;
      delete (window as any).__step2SetCollisionDebug;
      delete (window as any).__step2GetColliders;
      delete (window as any).__step2SetMovementPolicy;
      delete (window as any).__step2GetMovementPolicy;
      delete (window as any).__step2GetMissionObjects;
      delete (window as any).__step2SetMissionObjects;
      delete (window as any).__step2ResetMissionObjects;
      delete (window as any).__step2SetMissionObjectDebug;
      delete (window as any).__step2SetAnimationDebug;
      delete (window as any).__step2GetAnimationState;
      delete (window as any).__step2IsAnimationDebugEnabled;
      delete (window as any).__step2SetCameraDebug;
      delete (window as any).__step2IsCameraDebugEnabled;
      delete (window as any).__step2GetCameraState;
      delete (window as any).__step2CameraZoomIn;
      delete (window as any).__step2CameraZoomOut;
      delete (window as any).__step2CameraReset;
      delete (window as any).__step2SetCameraFollow;
      delete (window as any).__step2IsCameraFollowEnabled;
      delete (window as any).__step2GetRobotMotionConfig;
      delete (window as any).__step2SetRobotMoveSpeed;
      delete (window as any).__step2SetRobotTurnSpeed;
      delete (window as any).__step2SetSoundMuted;
      delete (window as any).__step2IsSoundMuted;
      delete (window as any).__step2SetSoundVolume;
      delete (window as any).__step2GetSoundVolume;
      delete (window as any).__step2PlaySound;
      delete (window as any).__step2GetBootScreen;
    }

    // 6. Clear container
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  // ── Session Score Tracking ──────────────────────────────────────────
  private getBestScore(missionId: string): number | null {
    return this.sessionBestScores[missionId] !== undefined ? this.sessionBestScores[missionId] : null;
  }

  private updateBestScore(missionId: string, score: number): {best: number; isNewBest: boolean} {
    const currentBest = this.sessionBestScores[missionId];
    if (currentBest === undefined || score > currentBest) {
      this.sessionBestScores[missionId] = score;
      return {best: score, isNewBest: true};
    }
    return {best: currentBest, isNewBest: false};
  }

  // ── Telemetry & Visual Updates ──────────────────────────────────────
  private updateTelemetryDisplay(
    pose: {x: number; y: number; rotation: number},
    progressText?: string,
  ): void {
    const telemetryHud = this.container?.querySelector('#telemetryHud');
    if (!telemetryHud) return;

    const headingDeg = Math.round(radiansToDegrees(pose.rotation));
    const posChip = `<div class="hud-chip hud-chip-pos"><span class="hud-icon">📍</span><span class="hud-label">X:${pose.x.toFixed(1)}, Y:${pose.y.toFixed(1)}</span></div>`;
    const dirChip = `<div class="hud-chip hud-chip-dir"><span class="hud-icon">🧭</span><span class="hud-label">${headingDeg}° (${pose.rotation.toFixed(2)} rad)</span></div>`;
    const speedChip = `<div class="hud-chip hud-chip-speed"><span class="hud-icon">⚡</span><span class="hud-label">${this.worldRobot.motorSpeedSetting}%</span></div>`;

    let batChip = '';
    if (this.worldRobot.battery !== undefined) {
      const maxBat = this.worldRobot.maxBattery || 100;
      const currentBat = Math.max(0, this.worldRobot.battery);
      const batPct = Math.min(100, Math.round((currentBat / maxBat) * 100));
      const batColor = batPct > 50 ? 'battery-high' : batPct > 20 ? 'battery-mid' : 'battery-low';
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

  private updateStep2View(
    progressText?: string,
    immediate: boolean = false,
    durationMs?: number,
    onProgress?: (pose: WorldRobotPose) => void,
  ): Promise<void> {
    this.updateTelemetryDisplay(this.worldRobot, progressText);

    if (this.simulationBridge) {
      return this.simulationBridge.onStateChange({
        grid: this.grid,
        robot: this.robot,
        worldRobot: this.worldRobot,
        mission: this.currentMission,
        progressText,
        immediate,
        durationMs,
        onProgress,
      });
    }
    return Promise.resolve();
  }

  private updateCodePreview(): void {
    try {
      if (!this.ws) return;
      const code = javascriptGenerator.workspaceToCode(this.ws);
      const codeDiv = this.container?.querySelector('#generatedCode')?.firstChild;
      if (codeDiv) codeDiv.textContent = code;
    } catch (err) {
      console.warn('Error generating code preview:', err);
    }
  }

  private setStatus(text: string, type: '' | 'error' | 'success' = ''): void {
    const statusMessage = this.container?.querySelector('#statusMessage');
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

  private updateControlButtons(): void {
    if (!this.container) return;
    const runBtn = this.container.querySelector('#runBtn') as HTMLButtonElement | null;
    const sidebarRunBtn = this.container.querySelector('#sidebarRunBtn') as HTMLButtonElement | null;
    const runBtnText = this.container.querySelector('#runBtnText');
    const sidebarRunText = this.container.querySelector('.sidebar-run-text');

    const pauseBtn = this.container.querySelector('#pauseBtn') as HTMLButtonElement | null;
    const sidebarPauseBtn = this.container.querySelector('#sidebarPauseBtn') as HTMLButtonElement | null;
    const stopBtn = this.container.querySelector('#stopBtn') as HTMLButtonElement | null;
    const sidebarStopBtn = this.container.querySelector('#sidebarStopBtn') as HTMLButtonElement | null;

    if (this.isRunning) {
      if (this.isPaused) {
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

  // ── Mission Management ──────────────────────────────────────────────
  private loadMission(mission: Mission): void {
    if (!this.container) return;
    this.stopRequested = true;
    this.isRunning = false;

    this.currentMission = mission;
    this.grid.width = mission.gridSize;
    this.grid.height = mission.gridSize;

    this.robot.x = mission.start.x;
    this.robot.y = mission.start.y;
    this.robot.direction = mission.start.direction;
    this.robot.motorSpeed = 50;
    this.robot.battery =
      mission.initialBattery !== undefined ? Math.max(0, mission.initialBattery) : undefined;
    this.robot.maxBattery =
      mission.initialBattery !== undefined ? Math.max(0, mission.initialBattery) : undefined;

    this.worldCommandExecutor.getAdapter().resetToSpawn(this.worldRobot, this.activeWorldMap.spawnPoint);

    const missionTitleEl = this.container.querySelector('#missionTitle');
    const missionDescEl = this.container.querySelector('#missionDescription');
    if (missionTitleEl) missionTitleEl.textContent = mission.title;
    if (missionDescEl) missionDescEl.textContent = mission.description;

    const topPhaseLabel = this.container.querySelector('#topPhaseLabel');
    const topMissionLabel = this.container.querySelector('#topMissionLabel');
    const missionPhaseTag = this.container.querySelector('#missionPhaseTag');
    const missionStepCounter = this.container.querySelector('#missionStepCounter');

    const phaseNames: Record<number, string> = {
      1: 'Commands',
      2: 'Logic',
      3: 'Programming abstraction',
    };
    const phaseName = phaseNames[mission.phase] || `Phase ${mission.phase}`;

    if (topPhaseLabel) topPhaseLabel.textContent = `Phase ${mission.phase}: ${phaseName}`;
    if (topMissionLabel) topMissionLabel.textContent = mission.title;
    if (missionPhaseTag) missionPhaseTag.textContent = `Phase ${mission.phase}`;

    const currentIdx = this.activeMissionsList.findIndex((m) => m.id === mission.id);
    if (missionStepCounter && currentIdx >= 0) {
      missionStepCounter.textContent = `Mission ${currentIdx + 1} of ${this.activeMissionsList.length}`;
    }

    const nextMissionBtn = this.container.querySelector('#nextMissionBtn') as HTMLElement | null;
    const sidebarNextBtn = this.container.querySelector('#sidebarNextBtn') as HTMLElement | null;
    if (nextMissionBtn) nextMissionBtn.style.display = 'none';
    if (sidebarNextBtn) sidebarNextBtn.style.display = 'none';

    const conceptsContainerEl = this.container.querySelector('#conceptsContainer');
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

    if (mission.worldMapId === 'campus_nutrition') {
      this.activeWorldMap = CAMPUS_NUTRITION_MAP;
    } else {
      this.activeWorldMap = CAMPUS_TOWN_MAP;
    }
    this.worldCommandExecutor.setWorldMap(this.activeWorldMap);
    this.worldCommandExecutor.getAdapter().resetToSpawn(this.worldRobot, this.activeWorldMap.spawnPoint);

    const activePolicy = mission.movementPolicy || this.activeWorldMap.movementPolicy || 'FREE_WORLD';
    this.worldCommandExecutor.setMovementPolicy(activePolicy);

    if (mission.items && mission.items.length > 0) {
      const missionObjects: import('../simulator/world').WorldMissionObject[] = mission.items.map(
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
      this.worldCommandExecutor.setMissionObjects(missionObjects);
      this.phaserSimulator?.updateMissionObjects(missionObjects);
    } else if (mission.missionObjects && mission.missionObjects.length > 0) {
      this.worldCommandExecutor.setMissionObjects(mission.missionObjects);
      this.phaserSimulator?.updateMissionObjects(mission.missionObjects);
    } else if (this.activeWorldMap.missionObjects && this.activeWorldMap.missionObjects.length > 0) {
      this.worldCommandExecutor.setMissionObjects(this.activeWorldMap.missionObjects);
      this.phaserSimulator?.updateMissionObjects(this.activeWorldMap.missionObjects);
    } else {
      this.worldCommandExecutor.setMissionObjects([]);
      this.phaserSimulator?.updateMissionObjects([]);
    }

    const initialEval = evaluateWorldMission(
      this.activeWorldMap,
      this.worldRobot,
      this.worldCommandExecutor.getMissionObjectSystem(),
    );

    this.updateStep2View(initialEval.progressText, true);

    const runBtn = this.container.querySelector('#runBtn') as HTMLButtonElement | null;
    const sidebarRunBtn = this.container.querySelector('#sidebarRunBtn') as HTMLButtonElement | null;
    const runBtnText = this.container.querySelector('#runBtnText');
    const sidebarRunText = this.container.querySelector('.sidebar-run-text');

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

    const best = this.getBestScore(mission.id);
    const bestStr = best !== null ? ` (Session Best: ${best})` : '';
    this.phaserSimulator?.resetCamera();
    this.setStatus(`Loaded ${mission.title}${bestStr}. Program the robot in Step 2!`);
  }

  private populateMissionDropdown(missions: Mission[]): void {
    const missionSelect = this.container?.querySelector('#missionSelect') as HTMLSelectElement | null;
    if (!missionSelect) return;
    missionSelect.innerHTML = '';
    missions.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = m.title;
      missionSelect.appendChild(opt);
    });
  }

  // ── Execution Flow ──────────────────────────────────────────────────
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private pauseProgram(): void {
    if (!this.isRunning || this.isPaused) return;
    soundSystem.playClick();
    soundSystem.stopMotor();
    this.isPaused = true;
    this.accumulatedExecutionTime += performance.now() - this.lastStepTime;
    this.simulationBridge?.onPause();
    const visualPose = this.simulationBridge?.getVisualPose();
    if (visualPose) {
      this.updateTelemetryDisplay(visualPose);
    }
    this.updateControlButtons();
    this.setStatus('Simulation paused. Click Resume or ▶ to continue.');
  }

  private resumeProgram(): void {
    if (!this.isRunning || !this.isPaused) return;
    soundSystem.playClick();
    this.isPaused = false;
    this.lastStepTime = performance.now();
    this.simulationBridge?.onResume();
    this.updateControlButtons();
    this.setStatus('Resuming execution in Phaser 4...');
  }

  private stopProgram(): void {
    if (!this.isRunning) return;
    soundSystem.playClick();
    soundSystem.stopMotor();
    this.stopRequested = true;
    this.isPaused = false;
    this.isRunning = false;
    this.activeInterpreter = null;
    this.simulationBridge?.onStop(false);
    const visualPose = this.simulationBridge?.getVisualPose();
    if (visualPose) {
      this.worldCommandExecutor.getAdapter().setPose(
        this.worldRobot,
        visualPose.x,
        visualPose.y,
        visualPose.rotation,
      );
      this.updateTelemetryDisplay(this.worldRobot);
    }
    this.updateControlButtons();
    this.setStatus('Execution stopped.', 'error');
  }

  private async runProgram(): Promise<void> {
    if (this.isRunning) {
      if (this.isPaused) {
        this.resumeProgram();
      }
      return;
    }

    soundSystem.playClick();

    if (!this.ws) return;
    const allBlocks = this.ws.getAllBlocks(false);
    if (allBlocks.length === 0) {
      this.setStatus('No robot commands found. Drag some blocks!');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;
    this.updateControlButtons();

    // Restore starting state for fresh run
    this.robot.x = this.currentMission.start.x;
    this.robot.y = this.currentMission.start.y;
    this.robot.direction = this.currentMission.start.direction;
    this.robot.motorSpeed = 50;
    this.robot.battery =
      this.currentMission.initialBattery !== undefined
        ? Math.max(0, this.currentMission.initialBattery)
        : undefined;
    this.robot.maxBattery =
      this.currentMission.initialBattery !== undefined
        ? Math.max(0, this.currentMission.initialBattery)
        : undefined;

    this.worldCommandExecutor.getAdapter().resetToSpawn(this.worldRobot, this.activeWorldMap.spawnPoint);
    this.worldCommandExecutor.getMissionObjectSystem().reset();
    this.phaserSimulator?.updateMissionObjects(this.worldCommandExecutor.getMissionObjectSystem().getObjects());

    let currentEval = evaluateWorldMission(
      this.activeWorldMap,
      this.worldRobot,
      this.worldCommandExecutor.getMissionObjectSystem(),
    );

    this.updateStep2View(currentEval.progressText, true);

    this.activeInterpreter = new ProgramInterpreter(this.ws, this.robot, this.grid);

    this.setStatus('Starting execution in Phaser 4...');

    this.activeStartTime = performance.now();
    this.lastStepTime = this.activeStartTime;
    this.accumulatedExecutionTime = 0;
    let hadError = false;

    while (this.activeInterpreter && !this.activeInterpreter.isDone()) {
      if (this.stopRequested || this.isUnmounted) {
        break;
      }

      while (this.isPaused && !this.stopRequested && !this.isUnmounted) {
        soundSystem.stopMotor();
        await this.delay(50);
      }

      if (this.stopRequested || this.isUnmounted) {
        break;
      }

      const stepResult = this.activeInterpreter.step();

      if (stepResult.limitExceeded) {
        hadError = true;
        soundSystem.stopMotor();
        this.setStatus(
          stepResult.error || '⚠️ Program limit exceeded! Maximum 500 robot commands per run.',
          'error',
        );
        break;
      }

      if (!stepResult.command) {
        continue;
      }

      const cmd = stepResult.command;
      const executedCount = this.activeInterpreter.getExecutedCommandCount();
      const isTurn = cmd === 'TURN_LEFT' || cmd === 'TURN_RIGHT';

      if (isTurn) {
        soundSystem.stopMotor();
        soundSystem.playTurn();
      } else {
        soundSystem.playMotor(true);
      }

      const result = this.worldCommandExecutor.execute(this.worldRobot, cmd);

      if (result.interactions && result.interactions.length > 0) {
        this.phaserSimulator?.updateMissionObjects(
          this.worldCommandExecutor.getMissionObjectSystem().getObjects(),
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
        this.activeWorldMap,
        this.worldRobot,
        this.worldCommandExecutor.getMissionObjectSystem(),
      );

      if (!result.ok) {
        hadError = true;
        soundSystem.stopMotor();
        if (result.reason === 'WORLD_COLLISION' || result.reason === 'WORLD_BOUNDARY') {
          soundSystem.playCollision();
        }

        if (
          (result.reason === 'WORLD_COLLISION' ||
            result.reason === 'OFF_ROAD' ||
            result.reason === 'RESTRICTED_ZONE' ||
            result.reason === 'POLICY_VIOLATION') &&
          result.partialTravelRatio !== undefined &&
          result.partialTravelRatio > 0.001 &&
          this.simulationBridge
        ) {
          const baseDurationMs = calculateStepDurationMs(
            this.worldRobot.motorSpeedSetting,
            isTurn,
            undefined,
            this.worldCommandExecutor.getMovementConfig(),
          );
          const partialDurationMs = Math.max(60, Math.round(baseDurationMs * result.partialTravelRatio));
          await this.simulationBridge.onStateChange({
            grid: this.grid,
            robot: this.robot,
            worldRobot: this.worldRobot,
            mission: this.currentMission,
            progressText: currentEval.progressText,
            durationMs: partialDurationMs,
            onProgress: (interPose) => {
              this.updateTelemetryDisplay(interPose, currentEval.progressText);
            },
          });
        }
        this.setStatus(`Step ${executedCount} (${cmd}): ${result.message}`, 'error');
        this.updateTelemetryDisplay(this.worldRobot, currentEval.progressText);
        break;
      }

      const durationMs = calculateStepDurationMs(
        this.worldRobot.motorSpeedSetting,
        isTurn,
        undefined,
        this.worldCommandExecutor.getMovementConfig(),
      );

      this.setStatus(`Step ${executedCount} (${cmd}): ${result.message}`);

      if (this.simulationBridge) {
        await this.simulationBridge.onStateChange({
          grid: this.grid,
          robot: this.robot,
          worldRobot: this.worldRobot,
          mission: this.currentMission,
          progressText: currentEval.progressText,
          durationMs,
          onProgress: (interPose) => {
            this.updateTelemetryDisplay(interPose, currentEval.progressText);
          },
        });
      }

      this.updateTelemetryDisplay(this.worldRobot, currentEval.progressText);

      if (this.stopRequested || this.isUnmounted) {
        soundSystem.stopMotor();
        break;
      }

      if (currentEval.completed) {
        soundSystem.stopMotor();
        soundSystem.playSuccess();

        const totalTimeMs = this.accumulatedExecutionTime + (performance.now() - this.lastStepTime);
        const blockCount = this.ws.getAllBlocks(false).length;

        const scoreResult = calculateScore({
          completed: true,
          executedActionCount: executedCount,
          blockCount: blockCount,
          timeMs: totalTimeMs,
          optimalActionCount: 8,
        });

        const {best: bestScore, isNewBest} = this.updateBestScore(
          this.currentMission.id,
          scoreResult.score,
        );

        const bestBadge = isNewBest
          ? `<div class="best-score-badge">🏆 New Best Score: ${bestScore}!</div>`
          : `<div class="best-score-badge">Best Score: ${bestScore}</div>`;

        this.setStatus(
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

        const nextMissionBtn = this.container?.querySelector('#nextMissionBtn') as HTMLElement | null;
        const sidebarNextBtn = this.container?.querySelector('#sidebarNextBtn') as HTMLElement | null;
        if (nextMissionBtn) nextMissionBtn.style.display = 'inline-flex';
        if (sidebarNextBtn) sidebarNextBtn.style.display = 'inline-flex';
        break;
      }

      if (isTurn) {
        await this.delay(40);
      } else {
        await Promise.resolve();
      }
    }

    soundSystem.stopMotor();

    const totalExecuted = this.activeInterpreter ? this.activeInterpreter.getExecutedCommandCount() : 0;

    if (totalExecuted === 0 && !hadError && !this.stopRequested) {
      this.setStatus('No robot commands found. Drag some blocks!');
    } else if (!this.stopRequested && !hadError && !currentEval.completed) {
      this.setStatus(
        `Robot stopped at (X: ${this.worldRobot.x.toFixed(1)}, Y: ${this.worldRobot.y.toFixed(1)}), heading ${radiansToDegrees(this.worldRobot.rotation).toFixed(0)}°. Objective not reached yet. Try again!`,
      );
    }

    this.isRunning = false;
    this.isPaused = false;
    this.activeInterpreter = null;
    this.updateControlButtons();
  }

  private resetRobot(): void {
    if (!this.container) return;
    soundSystem.playClick();
    soundSystem.stopMotor();
    this.stopRequested = true;
    this.isPaused = false;
    this.isRunning = false;
    this.activeInterpreter = null;

    this.simulationBridge?.onStop(false);

    const nextMissionBtn = this.container.querySelector('#nextMissionBtn') as HTMLElement | null;
    const sidebarNextBtn = this.container.querySelector('#sidebarNextBtn') as HTMLElement | null;
    if (nextMissionBtn) nextMissionBtn.style.display = 'none';
    if (sidebarNextBtn) sidebarNextBtn.style.display = 'none';

    this.updateControlButtons();

    this.worldCommandExecutor.getAdapter().resetToSpawn(this.worldRobot, this.activeWorldMap.spawnPoint);
    this.worldCommandExecutor.getMissionObjectSystem().reset();
    this.phaserSimulator?.updateMissionObjects(this.worldCommandExecutor.getMissionObjectSystem().getObjects());

    const initialEval = evaluateWorldMission(
      this.activeWorldMap,
      this.worldRobot,
      this.worldCommandExecutor.getMissionObjectSystem(),
    );

    this.updateStep2View(initialEval.progressText, true);

    const best = this.getBestScore(this.currentMission.id);
    const bestStr = best !== null ? ` (Session Best: ${best})` : '';
    this.phaserSimulator?.resetCamera();
    this.setStatus(`Mission reset${bestStr}. Program the robot in Step 2!`);
  }

  private handleNextMission(): void {
    if (!this.container) return;
    soundSystem.playClick();
    const currentIdx = this.activeMissionsList.findIndex((m) => m.id === this.currentMission.id);
    const missionSelect = this.container.querySelector('#missionSelect') as HTMLSelectElement | null;
    const phaseSelect = this.container.querySelector('#phaseSelect') as HTMLSelectElement | null;

    if (currentIdx >= 0 && currentIdx < this.activeMissionsList.length - 1) {
      const nextMission = this.activeMissionsList[currentIdx + 1];
      if (missionSelect) {
        missionSelect.value = (currentIdx + 1).toString();
      }
      this.loadMission(nextMission);
    } else {
      const currentPhase = this.currentMission.phase;
      if (currentPhase < 3) {
        const nextPhase = currentPhase + 1;
        if (phaseSelect) {
          phaseSelect.value = nextPhase.toString();
        }
        this.activeMissionsList = getMissionsByPhase(nextPhase);
        this.populateMissionDropdown(this.activeMissionsList);
        if (this.activeMissionsList.length > 0) {
          this.loadMission(this.activeMissionsList[0]);
        }
      } else {
        this.setStatus('🏆 Congratulations! You have completed all missions!', 'success');
      }
    }
  }

  // ── Event Bindings ──────────────────────────────────────────────────
  private bindEvents(container: HTMLElement): void {
    container.querySelector('#runBtn')?.addEventListener('click', () => this.runProgram());
    container.querySelector('#sidebarRunBtn')?.addEventListener('click', () => this.runProgram());

    const togglePause = () => {
      if (this.isPaused) {
        this.resumeProgram();
      } else {
        this.pauseProgram();
      }
    };
    container.querySelector('#pauseBtn')?.addEventListener('click', togglePause);
    container.querySelector('#sidebarPauseBtn')?.addEventListener('click', togglePause);

    container.querySelector('#stopBtn')?.addEventListener('click', () => this.stopProgram());
    container.querySelector('#sidebarStopBtn')?.addEventListener('click', () => this.stopProgram());

    container.querySelector('#resetBtn')?.addEventListener('click', () => this.resetRobot());
    container.querySelector('#sidebarResetBtn')?.addEventListener('click', () => this.resetRobot());

    container.querySelector('#nextMissionBtn')?.addEventListener('click', () => this.handleNextMission());
    container.querySelector('#sidebarNextBtn')?.addEventListener('click', () => this.handleNextMission());

    // Phase & Mission select dropdowns
    const phaseSelect = container.querySelector('#phaseSelect') as HTMLSelectElement | null;
    const missionSelect = container.querySelector('#missionSelect') as HTMLSelectElement | null;

    phaseSelect?.addEventListener('change', () => {
      const phaseId = phaseSelect ? parseInt(phaseSelect.value, 10) : 1;
      this.activeMissionsList = getMissionsByPhase(phaseId);
      this.populateMissionDropdown(this.activeMissionsList);
      if (this.activeMissionsList.length > 0) {
        this.loadMission(this.activeMissionsList[0]);
      }
    });

    missionSelect?.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLSelectElement).value, 10);
      if (!isNaN(idx) && this.activeMissionsList[idx]) {
        this.loadMission(this.activeMissionsList[idx]);
      }
    });

    // Code Inspector Toggle
    const codeInspectorToggle = container.querySelector('#codeInspectorToggle');
    const codeInspectorBody = container.querySelector('#codeInspectorBody');
    const codeToggleIcon = container.querySelector('#codeToggleIcon');
    const topCodeBtn = container.querySelector('#topCodeBtn');

    const toggleCode = () => {
      if (!codeInspectorBody) return;
      const isOpen = codeInspectorBody.classList.toggle('is-open');
      if (codeToggleIcon) codeToggleIcon.textContent = isOpen ? '▼' : '▶';
      if (topCodeBtn) topCodeBtn.classList.toggle('active', isOpen);
    };

    codeInspectorToggle?.addEventListener('click', toggleCode);
    topCodeBtn?.addEventListener('click', toggleCode);

    // Workspace Toolbar buttons
    container.querySelector('#wsZoomIn')?.addEventListener('click', () => {
      (this.ws as any)?.zoomCenter ? (this.ws as any).zoomCenter(1) : (this.ws as any)?.zoom?.(0, 0, 1);
    });
    container.querySelector('#wsZoomOut')?.addEventListener('click', () => {
      (this.ws as any)?.zoomCenter ? (this.ws as any).zoomCenter(-1) : (this.ws as any)?.zoom?.(0, 0, -1);
    });
    container.querySelector('#wsZoomReset')?.addEventListener('click', () => {
      (this.ws as any)?.zoomReset ? (this.ws as any).zoomReset() : (this.ws as any)?.scrollCenter?.();
    });
    container.querySelector('#wsUndo')?.addEventListener('click', () => {
      (this.ws as any)?.undo?.(false);
    });
    container.querySelector('#wsRedo')?.addEventListener('click', () => {
      (this.ws as any)?.undo?.(true);
    });

    // Simulator Camera Toolbar
    const simCamZoomLabel = container.querySelector('#simCamZoomLabel');
    const updateCamZoomBadge = () => {
      if (simCamZoomLabel && this.phaserSimulator) {
        const z = Math.round(this.phaserSimulator.getZoom() * 100);
        simCamZoomLabel.textContent = `${z}%`;
      }
    };

    container.querySelector('#simCamZoomIn')?.addEventListener('click', () => {
      soundSystem.playClick();
      this.phaserSimulator?.zoomIn();
      updateCamZoomBadge();
    });
    container.querySelector('#simCamZoomOut')?.addEventListener('click', () => {
      soundSystem.playClick();
      this.phaserSimulator?.zoomOut();
      updateCamZoomBadge();
    });
    container.querySelector('#simCamReset')?.addEventListener('click', () => {
      soundSystem.playClick();
      this.phaserSimulator?.resetCamera();
      updateCamZoomBadge();
    });

    const followToggleBtn = container.querySelector('#simCamFollowToggle');
    followToggleBtn?.addEventListener('click', () => {
      soundSystem.playClick();
      if (this.phaserSimulator) {
        const isFollowing = this.phaserSimulator.isCameraFollowEnabled();
        this.phaserSimulator.setCameraFollow(!isFollowing);
        followToggleBtn.classList.toggle('active', !isFollowing);
      }
    });

    const soundToggleBtn = container.querySelector('#simSoundToggle');
    soundToggleBtn?.addEventListener('click', () => {
      const isMuted = soundSystem.isMuted();
      soundSystem.setMuted(!isMuted);
      if (soundToggleBtn) {
        soundToggleBtn.textContent = !isMuted ? '🔇' : '🔊';
        soundToggleBtn.classList.toggle('active', isMuted);
      }
      soundSystem.playClick();
    });

    // Global keyboard shortcuts for simulator camera
    this.keydownHandler = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      if (e.key === '+' || e.key === '=') {
        this.phaserSimulator?.zoomIn();
        updateCamZoomBadge();
      } else if (e.key === '-' || e.key === '_') {
        this.phaserSimulator?.zoomOut();
        updateCamZoomBadge();
      } else if (e.key === '0') {
        this.phaserSimulator?.resetZoom();
        updateCamZoomBadge();
      } else if (e.key === 'f' || e.key === 'F') {
        this.phaserSimulator?.recenterCamera();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    // Resizing & Observers
    this.windowResizeHandler = () => {
      if (this.ws) Blockly.svgResize(this.ws);
      this.phaserSimulator?.refreshScale();
    };
    window.addEventListener('resize', this.windowResizeHandler);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.ws) Blockly.svgResize(this.ws);
        this.phaserSimulator?.refreshScale();
      });
      const wsPanel = container.querySelector('#workspaceContainer');
      const simPanel = container.querySelector('#phaserSimulatorContainer');
      if (wsPanel) this.resizeObserver.observe(wsPanel);
      if (simPanel) this.resizeObserver.observe(simPanel);
    }
  }

  // ── Testing Hooks Registration ─────────────────────────────────────
  private registerTestingHooks(): void {
    if (typeof window === 'undefined') return;

    (window as any).__step2TestPose = (x: number, y: number, rotation: number) => {
      this.worldCommandExecutor.getAdapter().setPose(this.worldRobot, x, y, rotation);
      const evalResult = evaluateWorldMission(this.activeWorldMap, this.worldRobot);
      this.updateStep2View(evalResult.progressText, false);
      return {x: this.worldRobot.x, y: this.worldRobot.y, rotation: this.worldRobot.rotation};
    };
    (window as any).__step2ExecuteCommand = (cmd: any) => {
      const res = this.worldCommandExecutor.execute(this.worldRobot, cmd);
      const evalResult = evaluateWorldMission(this.activeWorldMap, this.worldRobot);
      this.updateStep2View(evalResult.progressText, false);
      return res;
    };
    (window as any).__step2GetWorldRobot = () => ({...this.worldRobot});
    (window as any).__step2GetVisualPose = () => this.simulationBridge?.getVisualPose() || null;
    (window as any).__step2GetRoads = () => this.activeWorldMap.roads;
    (window as any).__step2GetIntersections = () => this.activeWorldMap.intersections || [];
    (window as any).__step2SetRoadDebug = (enabled: boolean) => {
      this.phaserSimulator?.setDebugRoadOverlay(enabled);
      return enabled;
    };
    (window as any).__step2SetCollisionDebug = (enabled: boolean) => {
      this.phaserSimulator?.setDebugCollisionOverlay(enabled);
      return enabled;
    };
    (window as any).__step2GetColliders = () => {
      return this.worldCommandExecutor.getCollisionSystem()?.getColliders() || [];
    };
    (window as any).__step2SetMovementPolicy = (policy: any) => {
      this.worldCommandExecutor.setMovementPolicy(policy);
      return this.worldCommandExecutor.getMovementPolicy().type;
    };
    (window as any).__step2GetMovementPolicy = () => {
      return this.worldCommandExecutor.getMovementPolicy();
    };
    (window as any).__step2GetMissionObjects = () => {
      return this.worldCommandExecutor.getMissionObjectSystem().getObjects();
    };
    (window as any).__step2SetMissionObjects = (objects: any) => {
      this.worldCommandExecutor.setMissionObjects(objects);
      this.phaserSimulator?.updateMissionObjects(
        this.worldCommandExecutor.getMissionObjectSystem().getObjects(),
      );
      return this.worldCommandExecutor.getMissionObjectSystem().getObjects();
    };
    (window as any).__step2ResetMissionObjects = () => {
      this.worldCommandExecutor.getMissionObjectSystem().reset();
      this.phaserSimulator?.updateMissionObjects(
        this.worldCommandExecutor.getMissionObjectSystem().getObjects(),
      );
    };
    (window as any).__step2SetMissionObjectDebug = (enabled: boolean) => {
      this.phaserSimulator?.setDebugMissionObjectsOverlay(enabled);
      return enabled;
    };
    (window as any).__step2SetAnimationDebug = (enabled: boolean) => {
      this.phaserSimulator?.setAnimationDebug(enabled);
      return enabled;
    };
    (window as any).__step2GetAnimationState = () => {
      return this.phaserSimulator?.getAnimationState() || 'IDLE';
    };
    (window as any).__step2IsAnimationDebugEnabled = () => {
      return this.phaserSimulator?.isAnimationDebugEnabled() || false;
    };
    (window as any).__step2SetCameraDebug = (enabled: boolean) => {
      this.phaserSimulator?.setCameraDebug(enabled);
      return enabled;
    };
    (window as any).__step2IsCameraDebugEnabled = () => {
      return this.phaserSimulator?.isCameraDebugEnabled() || false;
    };
    (window as any).__step2GetCameraState = () => {
      return this.phaserSimulator?.getCameraState() || null;
    };
    (window as any).__step2CameraZoomIn = () => {
      return this.phaserSimulator?.zoomIn() || 1.0;
    };
    (window as any).__step2CameraZoomOut = () => {
      return this.phaserSimulator?.zoomOut() || 1.0;
    };
    (window as any).__step2CameraReset = () => {
      this.phaserSimulator?.resetCamera();
    };
    (window as any).__step2SetCameraFollow = (enabled: boolean) => {
      this.phaserSimulator?.setCameraFollow(enabled);
      return enabled;
    };
    (window as any).__step2IsCameraFollowEnabled = () => {
      return this.phaserSimulator?.isCameraFollowEnabled() || false;
    };
    (window as any).__step2GetRobotMotionConfig = () => {
      return {...this.worldCommandExecutor.getMovementConfig()};
    };
    (window as any).__step2SetRobotMoveSpeed = (speedPxPerSec: number) => {
      this.worldCommandExecutor.setMoveSpeed(speedPxPerSec);
      return this.worldCommandExecutor.getMovementConfig();
    };
    (window as any).__step2SetRobotTurnSpeed = (speedDegPerSec: number) => {
      this.worldCommandExecutor.setTurnSpeed(speedDegPerSec);
      return this.worldCommandExecutor.getMovementConfig();
    };
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
    (window as any).__step2GetBootScreen = () => this.bootScreen;
  }

  // ── Template Markup ─────────────────────────────────────────────────
  private renderHtml(): string {
    return `
      <!-- Contextual Robotics Boot Screen -->
      <div id="appBootScreen" class="boot-screen" role="status" aria-live="polite">
        <div class="boot-backdrop">
          <div class="boot-grid-pattern"></div>
          <div class="boot-glow-spot"></div>
        </div>

        <div class="boot-card">
          <!-- Brand Header -->
          <div class="boot-brand">
            <div class="boot-logo-badge">
              <svg class="boot-logo-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3 3"/>
                <path d="M16 6C10.477 6 6 10.477 6 16C6 21.523 10.477 26 16 26C21.523 26 26 21.523 26 16C26 10.477 21.523 6 16 6Z" fill="#1e293b"/>
                <circle cx="12" cy="14" r="2.5" fill="#38bdf8"/>
                <circle cx="20" cy="14" r="2.5" fill="#38bdf8"/>
                <circle cx="12.5" cy="13.5" r="0.8" fill="#ffffff"/>
                <circle cx="20.5" cy="13.5" r="0.8" fill="#ffffff"/>
                <path d="M12 20C13.2 21.2 14.8 21.5 16 21.5C17.2 21.5 18.8 21.2 20 20" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="boot-brand-text">
              <h1 class="boot-title">OCTO-BLOCKLY</h1>
              <span class="boot-subtitle">Educational Robotics Studio · World Simulator</span>
            </div>
          </div>

          <!-- Central Animated Rover Schematic -->
          <div class="boot-rover-container">
            <svg class="boot-rover-svg" viewBox="0 0 150 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="scanGrad" x1="95" y1="50" x2="145" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.65"/>
                  <stop offset="60%" stop-color="#0284c7" stop-opacity="0.25"/>
                  <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>
                </linearGradient>
              </defs>

              <path class="rover-scan-beam" d="M95 50 L145 22 L145 78 Z" fill="url(#scanGrad)"/>
              <rect x="24" y="10" width="28" height="15" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
              <line x1="28" y1="17.5" x2="48" y2="17.5" stroke="#38bdf8" stroke-width="1.5" class="rover-tread-marks"/>
              <rect x="68" y="10" width="28" height="15" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
              <line x1="72" y1="17.5" x2="92" y2="17.5" stroke="#38bdf8" stroke-width="1.5" class="rover-tread-marks"/>
              <rect x="24" y="75" width="28" height="15" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
              <line x1="28" y1="82.5" x2="48" y2="82.5" stroke="#38bdf8" stroke-width="1.5" class="rover-tread-marks"/>
              <rect x="68" y="75" width="28" height="15" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
              <line x1="72" y1="82.5" x2="92" y2="82.5" stroke="#38bdf8" stroke-width="1.5" class="rover-tread-marks"/>

              <rect x="34" y="20" width="52" height="6" rx="2" fill="#334155"/>
              <rect x="34" y="74" width="52" height="6" rx="2" fill="#334155"/>

              <rect x="30" y="25" width="60" height="50" rx="8" fill="#1e3a8a" stroke="#2563eb" stroke-width="1.5"/>

              <rect x="38" y="32" width="44" height="36" rx="5" fill="#0f172a"/>
              <path d="M42 40 H50 V46 H54" stroke="#0284c7" stroke-width="1" stroke-linecap="round"/>
              <path d="M42 60 H50 V54 H54" stroke="#0284c7" stroke-width="1" stroke-linecap="round"/>
              <path d="M66 46 H70 V40 H76" stroke="#0284c7" stroke-width="1" stroke-linecap="round"/>
              <path d="M66 54 H70 V60 H76" stroke="#0284c7" stroke-width="1" stroke-linecap="round"/>

              <circle cx="60" cy="50" r="8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
              <circle cx="60" cy="50" r="4" fill="#0284c7" class="rover-core-led"/>
              <circle class="rover-lidar-ring" cx="60" cy="50" r="5" fill="none" stroke="#38bdf8" stroke-width="1.2"/>

              <rect x="88" y="28" width="8" height="44" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.5"/>
              <rect x="94" y="34" width="2" height="32" fill="#475569"/>

              <circle cx="94" cy="38" r="3.5" fill="#64748b" stroke="#0f172a" stroke-width="1"/>
              <circle cx="94" cy="38" r="2" fill="#38bdf8"/>
              <circle cx="94" cy="62" r="3.5" fill="#64748b" stroke="#0f172a" stroke-width="1"/>
              <circle cx="94" cy="62" r="2" fill="#38bdf8"/>

              <circle cx="33" cy="35" r="1.8" fill="#f59e0b"/>
              <circle cx="33" cy="65" r="1.8" fill="#10b981"/>
            </svg>
          </div>

          <!-- Telemetry & Status Header -->
          <div class="boot-status-header">
            <div class="boot-status-row">
              <span id="bootStatusText" class="boot-status-text">Booting Robotics Simulation Engine...</span>
              <span id="bootProgressPercent" class="boot-status-percent">15%</span>
            </div>
            <div id="bootTelemetryText" class="boot-telemetry-text">INIT // CALIBRATING SYSTEM BUS</div>
          </div>

          <!-- Progress Indicator -->
          <div class="boot-progress-track">
            <div id="bootProgressFill" class="boot-progress-fill" style="width: 15%;">
              <span class="boot-progress-glow"></span>
            </div>
          </div>

          <!-- Subsystems Readiness Grid -->
          <div class="boot-subsystems-grid">
            <div class="boot-subsystem-pill active" data-subsystem="ui">
              <span class="pill-dot"></span>
              <span class="pill-label">UI Interface</span>
            </div>
            <div class="boot-subsystem-pill" data-subsystem="blockly">
              <span class="pill-dot"></span>
              <span class="pill-label">Blockly AST</span>
            </div>
            <div class="boot-subsystem-pill" data-subsystem="simulator">
              <span class="pill-dot"></span>
              <span class="pill-label">Phaser Engine</span>
            </div>
            <div class="boot-subsystem-pill" data-subsystem="robot">
              <span class="pill-dot"></span>
              <span class="pill-label">Rover Telemetry</span>
            </div>
          </div>

          <!-- Error Card -->
          <div id="bootErrorCard" class="boot-error-card" style="display: none;">
            <div class="boot-error-icon">⚠️</div>
            <h3 class="boot-error-title">Robot Simulator Couldn't Start</h3>
            <p id="bootErrorMessage" class="boot-error-msg">An unexpected issue occurred while initializing the simulation environment.</p>
            <div class="boot-error-actions">
              <button id="bootRetryBtn" class="boot-btn boot-btn-primary">↺ Retry Initialization</button>
              <a href="/" class="boot-btn boot-btn-secondary" id="bootFallbackLink" style="display: inline-flex;">⬅ Home Page</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Application Container -->
      <div id="appRoot" class="app-root">
        <!-- Top Application Bar -->
        <header id="topAppBar" class="step2-topbar">
          <div class="app-branding">
            <a href="/" class="app-logo-badge" title="OctoBlockly Home">
              <img id="appLogoImg" alt="Octo" class="app-logo-img" />
            </a>
            <div class="app-title-group">
              <h1 class="app-title"><a href="/" style="text-decoration: none; color: inherit;">OctoBlockly</a></h1>
              <span class="app-subtitle">Robotics World Simulator</span>
            </div>
          </div>

          <div class="top-mission-context">
            <div class="context-pill">
              <span class="context-phase" id="topPhaseLabel">Phase 1: Commands</span>
              <span class="context-divider">·</span>
              <span class="context-mission" id="topMissionLabel">1. Reach the Star</span>
            </div>
            <div class="step-indicator" id="missionStepCounter">Mission 1 of 6</div>
          </div>

          <div class="top-actions">
            <button id="topCodeBtn" class="top-action-btn btn-ghost" title="Toggle Code Inspector">
              <span class="btn-icon">&lt;/&gt;</span> <span>Code</span>
            </button>
            <button id="runBtn" class="top-action-btn btn-primary" title="Execute Blockly Program">
              <span class="btn-icon">▶</span> <span id="runBtnText">Run</span>
            </button>
            <button id="pauseBtn" class="top-action-btn btn-warning-action" style="display: none;" title="Pause Execution">
              <span class="btn-icon">⏸</span> <span>Pause</span>
            </button>
            <button id="stopBtn" class="top-action-btn btn-danger-action" style="display: none;" title="Stop Execution">
              <span class="btn-icon">⏹</span> <span>Stop</span>
            </button>
            <button id="resetBtn" class="top-action-btn btn-secondary" title="Reset Robot to Start">
              <span class="btn-icon">↺</span> <span>Reset</span>
            </button>
            <button id="nextMissionBtn" class="top-action-btn btn-success" style="display: none;" title="Go to Next Mission">
              <span>Next Mission</span> <span class="btn-icon">➔</span>
            </button>
            <div class="step-mode-switcher">
              <a href="/" class="mode-link" title="Return to Home">Home</a>
              <a href="/tutorials" class="mode-link" title="Explore Tutorials">Tutorials</a>
              <span class="mode-badge active">Simulator</span>
            </div>
          </div>
        </header>

        <!-- Main Application 3-Column Split Layout -->
        <div id="pageContainer" class="step2-layout">
          <!-- 1. Left Column: Mission & Controls Sidebar -->
          <aside id="outputPane" class="step2-sidebar">
            <!-- Navigation Card: Phase & Mission Dropdowns -->
            <div class="sidebar-card mission-nav-card" id="missionSelectorPane">
              <div class="sidebar-card-title">
                <span class="card-icon">🧭</span>
                <span>Mission Selection</span>
              </div>
              <div class="form-group">
                <label for="phaseSelect" class="form-label">Category</label>
                <div class="select-container">
                  <select id="phaseSelect">
                    <option value="1">Phase 1: Commands</option>
                    <option value="2">Phase 2: Logic</option>
                    <option value="3">Phase 3: Programming abstraction</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label for="missionSelect" class="form-label">Mission Challenge</label>
                <div class="select-container">
                  <select id="missionSelect"></select>
                </div>
              </div>
            </div>

            <!-- Mission Goal & Information Card -->
            <div class="sidebar-card mission-info-card">
              <div class="mission-info-header">
                <div class="mission-meta-row">
                  <span class="meta-phase-badge" id="missionPhaseTag">Phase 1</span>
                  <div id="missionBadges">
                    <span id="conceptsContainer"></span>
                  </div>
                </div>
                <h2 id="missionTitle">1. Reach the Star</h2>
              </div>
              
              <div class="mission-goal-box">
                <div class="goal-header">
                  <span class="goal-icon">🎯</span>
                  <span class="goal-title">Challenge Objective</span>
                </div>
                <p id="missionDescription">Program the robot to move from (0,0) to the star at (4,4).</p>
              </div>
            </div>

            <!-- Primary Execution Controls Card -->
            <div class="sidebar-card step2-controls-card" id="controlsPane">
              <div class="sidebar-card-title">
                <span class="card-icon">⚡</span>
                <span>Simulation Controls</span>
              </div>
              <div class="controls-btn-grid">
                <button id="sidebarRunBtn" class="sidebar-action-btn btn-run" title="Run / Resume Program">
                  <span class="btn-icon">▶</span> <span class="sidebar-run-text">Run</span>
                </button>
                <button id="sidebarPauseBtn" class="sidebar-action-btn btn-pause" style="display: none;" title="Pause Execution">
                  <span class="btn-icon">⏸</span> <span>Pause</span>
                </button>
                <button id="sidebarStopBtn" class="sidebar-action-btn btn-stop" style="display: none;" title="Stop Execution">
                  <span class="btn-icon">⏹</span> <span>Stop</span>
                </button>
                <button id="sidebarResetBtn" class="sidebar-action-btn btn-reset" title="Reset Robot to Start">
                  <span class="btn-icon">↺</span> <span>Reset</span>
                </button>
              </div>
              <button id="sidebarNextBtn" class="sidebar-action-btn btn-next" style="display: none;" title="Advance to Next Mission">
                <span>Next Mission</span> <span class="btn-icon">➔</span>
              </button>
            </div>

            <!-- Results & Status Card -->
            <div id="statusMessage" class="status-card">
              Program the robot in Phaser 4 Simulator!
            </div>

            <!-- Collapsible Code Inspector Card -->
            <div class="sidebar-card code-inspector-card" id="codeInspectorCard">
              <div class="code-inspector-header" id="codeInspectorToggle">
                <div class="header-left">
                  <span class="code-badge">&lt;/&gt;</span>
                  <span class="code-title">Generated JavaScript</span>
                </div>
                <span class="toggle-arrow" id="codeToggleIcon">▼</span>
              </div>
              <div class="code-inspector-body is-open" id="codeInspectorBody">
                <pre id="generatedCode"><code></code></pre>
                <div id="output"></div>
              </div>
            </div>
          </aside>

          <!-- 2. Middle Column: Blockly Workspace -->
          <main id="workspaceContainer" class="step2-workspace">
            <div class="workspace-header-bar">
              <div class="ws-header-title">
                <span class="ws-title-icon">🧩</span>
                <span class="ws-title-text">Blockly Programming</span>
              </div>
              <div class="ws-header-hints">
                <span>Drag blocks to command the robot</span>
              </div>
            </div>

            <!-- Floating Workspace Toolbar -->
            <div class="workspace-floating-toolbar" id="workspaceToolbar">
              <button class="ws-btn" id="wsZoomIn" title="Zoom In (+)">+</button>
              <button class="ws-btn" id="wsZoomOut" title="Zoom Out (−)">−</button>
              <button class="ws-btn" id="wsZoomReset" title="Reset View (⛶)">⛶</button>
              <div class="ws-btn-divider"></div>
              <button class="ws-btn" id="wsUndo" title="Undo (Ctrl+Z)">↶</button>
              <button class="ws-btn" id="wsRedo" title="Redo (Ctrl+Y)">↷</button>
            </div>

            <!-- Blockly Injection Target -->
            <div id="blocklyDiv"></div>
          </main>

          <!-- 3. Right Column: Large Interactive Phaser Simulator Viewport -->
          <section id="step2SimulatorArea" class="step2-simulator-panel">
            <div class="sim-panel-header">
              <div class="sim-panel-title-group">
                <div class="sim-live-indicator">
                  <span class="pulse-dot"></span>
                  <span class="live-label">LIVE SIMULATOR</span>
                </div>
                <h2 class="sim-panel-title">Phaser 4 World Viewport</h2>
                <span class="sim-panel-meta">Campus Town · 800 × 600</span>
              </div>
              <div class="sim-panel-badges">
                <span class="sim-badge-tech">Continuous World</span>
                <span class="sim-badge-tech">Phaser 4 Engine</span>
              </div>
            </div>

            <!-- Dedicated Phaser Canvas Mount Container with Camera Toolbar -->
            <div id="phaserSimulatorContainer" class="step2-phaser-container">
              <!-- Floating Camera Follow & Zoom Toolbar -->
              <div class="sim-camera-toolbar" id="simCameraToolbar">
                <button class="sim-cam-btn" id="simCamZoomIn" title="Zoom In (+)">+</button>
                <button class="sim-cam-btn" id="simCamZoomOut" title="Zoom Out (−)">−</button>
                <button class="sim-cam-btn" id="simCamReset" title="Recenter Camera on Robot (⛶)">⛶</button>
                <button class="sim-cam-btn active" id="simCamFollowToggle" title="Toggle Camera Follow (🎥)">🎥</button>
                <button class="sim-cam-btn" id="simSoundToggle" title="Toggle Sound (🔊)">🔊</button>
                <span class="sim-cam-zoom-badge" id="simCamZoomLabel">100%</span>
              </div>
            </div>

            <!-- Robot Telemetry HUD at bottom of simulator viewport -->
            <div id="telemetryHud" class="step2-telemetry-hud"></div>
          </section>
        </div>
      </div>
    `;
  }
}
