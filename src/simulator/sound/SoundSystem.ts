/**
 * SoundSystem.ts — Pure Web Audio API Sound Foundation for Step 2 Simulator.
 *
 * Architecture & Design:
 * - 100% self-contained synthesized audio (zero external asset dependencies).
 * - Decoupled presentation-layer sound engine (never dictates simulation authority).
 * - Realistic robotic sound effects: electric servo drive, stepper turn, bumper impact,
 *   telemetry chime, hazard alert, and victory fanfare.
 * - Respects browser audio autoplay policies via lazy AudioContext initialization.
 * - Global mute and master volume control.
 */

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private isMutedState: boolean = false;
  private masterVolume: number = 0.25;
  private masterGain: GainNode | null = null;
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  /**
   * Lazily initializes the Web Audio Context upon user interaction.
   */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(
          this.isMutedState ? 0 : this.masterVolume,
          this.ctx.currentTime,
        );
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : this.masterVolume,
        this.ctx.currentTime,
      );
    }
    if (muted) {
      this.stopMotor();
    }
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx && !this.isMutedState) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  /**
   * Plays a subtle electric geared DC servo motor sound while moving.
   */
  public playMotor(active: boolean): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (active) {
      if (!this.motorOsc) {
        try {
          this.motorOsc = ctx.createOscillator();
          this.motorGain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(280, ctx.currentTime);

          this.motorOsc.type = 'triangle';
          this.motorOsc.frequency.setValueAtTime(115, ctx.currentTime);

          this.motorGain.gain.setValueAtTime(0.01, ctx.currentTime);
          this.motorGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.1);

          this.motorOsc.connect(filter);
          filter.connect(this.motorGain);
          this.motorGain.connect(this.masterGain);

          this.motorOsc.start();
        } catch {
          this.motorOsc = null;
        }
      }
    } else {
      this.stopMotor();
    }
  }

  public stopMotor(): void {
    if (this.motorOsc && this.ctx && this.motorGain) {
      try {
        this.motorGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        const osc = this.motorOsc;
        setTimeout(() => {
          try {
            osc.stop();
            osc.disconnect();
          } catch {}
        }, 100);
      } catch {}
      this.motorOsc = null;
      this.motorGain = null;
    }
  }

  /**
   * Stepper motor audio pulse during an angular turn.
   */
  public playTurn(): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  /**
   * Mechanical bumper thud on obstacle or boundary collision.
   */
  public playCollision(): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  /**
   * Clean dual chime when collecting a target gem or healthy food item.
   */
  public playCollect(): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      for (const [idx, freq] of [784, 1046.5].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + 0.26);
      }
    } catch {}
  }

  /**
   * Low warning buzz on unhealthy food contact.
   */
  public playHazard(): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.18);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  /**
   * Ascending celebration chime on mission completion.
   */
  public playSuccess(): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const master = this.masterGain;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.1;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

        osc.connect(gain);
        gain.connect(master);

        osc.start(start);
        osc.stop(start + 0.38);
      });
    } catch {}
  }

  /**
   * Mechanical relay micro-click on button press / reset.
   */
  public playClick(): void {
    if (this.isMutedState) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }
}

// Global SoundSystem singleton
export const soundSystem = new SoundSystem();
