/**
 * AppBootScreen.ts — Professional Contextual Robotics Boot Screen Controller
 *
 * Responsibilities:
 * 1. Zero-FOUC Guarantee: Ensures main application UI remains completely hidden
 *    while CSS, Blockly, and Phaser simulation initialize.
 * 2. True Readiness Tracking: Monitors real lifecycle milestones across UI,
 *    Blockly AST, Phaser 4 WebGL engine, and robot calibration.
 * 3. Contextual Robotics Telemetry: Displays meaningful engineering status messages
 *    rather than a generic spinner.
 * 4. Error Catching & Fallback: Displays a contextual failure card with Retry if
 *    Blockly or Phaser encounters an unrecoverable exception or times out.
 * 5. Smooth Transition: Coordinates stabilization delay and exit transition,
 *    preventing layout jumping or visual flashes.
 */

export type BootSubsystem = 'ui' | 'blockly' | 'simulator' | 'robot';

export interface BootSubsystemState {
  id: BootSubsystem;
  label: string;
  status: 'waiting' | 'active' | 'ready' | 'error';
  message: string;
}

export interface BootScreenOptions {
  containerId?: string;
  appRootId?: string;
  watchdogTimeoutMs?: number;
  stabilizationMs?: number;
  onReveal?: () => void;
}

export class AppBootScreen {
  private container: HTMLElement | null = null;
  private appRoot: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private telemetryTextEl: HTMLElement | null = null;
  private progressFillEl: HTMLElement | null = null;
  private progressPercentEl: HTMLElement | null = null;
  private errorCardEl: HTMLElement | null = null;
  private errorMessageEl: HTMLElement | null = null;
  private retryBtnEl: HTMLElement | null = null;
  private fallbackLinkEl: HTMLElement | null = null;

  private subsystems: Map<BootSubsystem, BootSubsystemState> = new Map();
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private isDone: boolean = false;
  private hasFailed: boolean = false;
  private onRevealCallback?: () => void;

  constructor(options: BootScreenOptions = {}) {
    const containerId = options.containerId || 'appBootScreen';
    const appRootId = options.appRootId || 'appRoot';
    const watchdogMs = options.watchdogTimeoutMs || 15000;
    this.onRevealCallback = options.onReveal;

    this.container = document.getElementById(containerId);
    this.appRoot = document.getElementById(appRootId);

    if (this.container) {
      this.statusTextEl = this.container.querySelector('#bootStatusText');
      this.telemetryTextEl = this.container.querySelector('#bootTelemetryText');
      this.progressFillEl = this.container.querySelector('#bootProgressFill');
      this.progressPercentEl = this.container.querySelector('#bootProgressPercent');
      this.errorCardEl = this.container.querySelector('#bootErrorCard');
      this.errorMessageEl = this.container.querySelector('#bootErrorMessage');
      this.retryBtnEl = this.container.querySelector('#bootRetryBtn');
      this.fallbackLinkEl = this.container.querySelector('#bootFallbackLink');

      this.retryBtnEl?.addEventListener('click', () => {
        window.location.reload();
      });
    }

    // Initialize subsystem definitions
    this.subsystems.set('ui', {
      id: 'ui',
      label: 'UI Interface',
      status: 'waiting',
      message: 'Initializing interface & runtime styles...',
    });
    this.subsystems.set('blockly', {
      id: 'blockly',
      label: 'Blockly AST',
      status: 'waiting',
      message: 'Mounting visual programming workspace...',
    });
    this.subsystems.set('simulator', {
      id: 'simulator',
      label: 'Phaser Simulator',
      status: 'waiting',
      message: 'Booting continuous physics engine...',
    });
    this.subsystems.set('robot', {
      id: 'robot',
      label: 'Rover Calibration',
      status: 'waiting',
      message: 'Calibrating rover telemetry & spawn pose...',
    });

    // Watchdog timeout to prevent infinite hanging in unexpected failure modes
    this.watchdogTimer = setTimeout(() => {
      if (!this.isDone && !this.hasFailed) {
        this.fail(
          new Error('Initialization timed out. Browser resources may be restricted.'),
          'The simulation took longer than expected to prepare. Please verify browser hardware acceleration and retry.',
        );
      }
    }, watchdogMs);

    // Global uncaught error listener during boot
    const errorHandler = (event: ErrorEvent) => {
      if (!this.isDone && !this.hasFailed) {
        console.error('[AppBootScreen] Caught unhandled error during boot:', event.error || event.message);
        this.fail(
          event.error || event.message,
          'A script error interrupted application startup. Please retry.',
        );
      }
    };
    window.addEventListener('error', errorHandler, {once: true});

    // Expose instance for diagnostics
    (window as any).__bootScreen = this;
  }

  /**
   * Marks a subsystem as actively initializing and updates progress display.
   */
  public startSubsystem(id: BootSubsystem, message?: string, progress?: number): void {
    if (this.hasFailed || this.isDone) return;
    const sub = this.subsystems.get(id);
    if (sub) {
      sub.status = 'active';
      if (message) sub.message = message;
    }
    this.updatePillUI(id, 'active');
    this.updateDisplay(
      message || sub?.message || `Starting ${id}...`,
      progress !== undefined ? progress : this.calculateProgress(),
      `SYSTEM // ${id.toUpperCase()} INITIALIZING`,
    );
  }

  /**
   * Marks a subsystem as successfully initialized.
   */
  public completeSubsystem(id: BootSubsystem, message?: string, progress?: number): void {
    if (this.hasFailed || this.isDone) return;
    const sub = this.subsystems.get(id);
    if (sub) {
      sub.status = 'ready';
      if (message) sub.message = message;
    }
    this.updatePillUI(id, 'ready');
    const nextProg = progress !== undefined ? progress : this.calculateProgress();
    this.updateDisplay(
      message || sub?.message || `${id} ready`,
      nextProg,
      `SYSTEM // ${id.toUpperCase()} OK`,
    );
  }

  /**
   * Updates status message and progress percentage directly.
   */
  public setProgress(percent: number, message?: string, telemetry?: string): void {
    if (this.hasFailed || this.isDone) return;
    this.updateDisplay(message, percent, telemetry);
  }

  private calculateProgress(): number {
    let completed = 0;
    let active = 0;
    for (const sub of this.subsystems.values()) {
      if (sub.status === 'ready') completed++;
      else if (sub.status === 'active') active++;
    }
    const total = this.subsystems.size;
    const score = (completed * 100 + active * 40) / total;
    return Math.min(95, Math.round(score));
  }

  private updatePillUI(id: BootSubsystem, status: 'active' | 'ready' | 'error'): void {
    if (!this.container) return;
    const pill = this.container.querySelector(`.boot-subsystem-pill[data-subsystem="${id}"]`);
    if (pill) {
      pill.classList.remove('waiting', 'active', 'ready', 'error');
      pill.classList.add(status);
      const dot = pill.querySelector('.pill-dot');
      if (dot) {
        dot.textContent = status === 'ready' ? '✓' : '';
      }
    }
  }

  private updateDisplay(message?: string, percent?: number, telemetry?: string): void {
    if (message && this.statusTextEl) {
      this.statusTextEl.textContent = message;
    }
    if (telemetry && this.telemetryTextEl) {
      this.telemetryTextEl.textContent = telemetry;
    }
    if (percent !== undefined) {
      const clamped = Math.max(0, Math.min(100, percent));
      if (this.progressFillEl) {
        this.progressFillEl.style.width = `${clamped}%`;
      }
      if (this.progressPercentEl) {
        this.progressPercentEl.textContent = `${clamped}%`;
      }
    }
  }

  /**
   * Transitions to error card state, explaining failure cleanly without raw stack dump.
   */
  public fail(error: Error | string, userFriendlyMessage?: string): void {
    if (this.isDone) return;
    this.hasFailed = true;

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    const errObj = error instanceof Error ? error : new Error(String(error));
    console.error('[AppBootScreen] Boot failed:', errObj);

    // Update telemetry header to alert
    this.updateDisplay(
      'Simulation startup interrupted',
      undefined,
      'ERR // SYSTEM BOOT HALTED',
    );

    if (this.errorMessageEl) {
      this.errorMessageEl.textContent =
        userFriendlyMessage ||
        errObj.message ||
        'The simulation encountered an unexpected issue during startup.';
    }

    // Hide normal progress indicators and show error card
    if (this.container) {
      const progressHeader = this.container.querySelector('.boot-status-header');
      const progressTrack = this.container.querySelector('.boot-progress-track');
      const subsystemsGrid = this.container.querySelector('.boot-subsystems-grid');
      const roverVisual = this.container.querySelector('.boot-rover-container');

      if (progressTrack) (progressTrack as HTMLElement).style.display = 'none';
      if (subsystemsGrid) (subsystemsGrid as HTMLElement).style.display = 'none';
      if (progressHeader) (progressHeader as HTMLElement).style.display = 'none';
      if (roverVisual) (roverVisual as HTMLElement).classList.add('is-error');

      if (this.errorCardEl) {
        this.errorCardEl.style.display = 'block';
      }
    }
  }

  /**
   * Completes initialization, verifies layout readiness, and smoothly fades into the app.
   */
  public async complete(stabilizationMs: number = 220): Promise<void> {
    if (this.hasFailed || this.isDone) return;
    this.isDone = true;

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    // Mark all subsystems ready and set 100%
    for (const id of this.subsystems.keys()) {
      this.updatePillUI(id, 'ready');
    }
    this.updateDisplay(
      'Simulation environment ready · Launching studio...',
      100,
      'STATUS // ALL SYSTEMS NOMINAL · READY',
    );

    // 1. Stabilization pause: lets SVG fonts and WebGL viewport dimensions settle
    if (stabilizationMs > 0) {
      await new Promise((r) => setTimeout(r, stabilizationMs));
    }

    // 2. Reveal application root and prepare transition
    document.body.classList.remove('app-booting');
    document.body.classList.add('app-ready');

    if (this.appRoot) {
      this.appRoot.style.visibility = 'visible';
      this.appRoot.style.opacity = '1';
    }

    // Trigger onReveal callbacks (e.g. svgResize, canvas scale refresh) while both are visible
    if (this.onRevealCallback) {
      try {
        this.onRevealCallback();
      } catch (e) {
        console.warn('[AppBootScreen] onReveal callback warning:', e);
      }
    }

    // 3. Smooth exit fade of boot screen overlay
    if (this.container) {
      this.container.classList.add('boot-screen--exiting');
      // Await exit transition duration (300ms)
      await new Promise((r) => setTimeout(r, 320));

      this.container.style.display = 'none';
      this.container.setAttribute('aria-hidden', 'true');
    }

    // Secondary layout refresh after boot screen removed
    if (this.onRevealCallback) {
      try {
        this.onRevealCallback();
      } catch {}
    }
  }

  public isComplete(): boolean {
    return this.isDone;
  }
}
