import * as Phaser from 'phaser';
import {RobotSimulatorScene} from './RobotSimulatorScene';
import {GridRenderData} from './PhaserGridRenderer';

export interface PhaserSimulatorOptions {
  parent: string | HTMLElement;
  width?: number | string;
  height?: number | string;
}

export class PhaserSimulator {
  private game: Phaser.Game | null = null;
  private scene: RobotSimulatorScene | null = null;
  private pendingRenderData: GridRenderData | null = null;

  constructor(options: PhaserSimulatorOptions) {
    const parent =
      typeof options.parent === 'string'
        ? document.getElementById(options.parent)
        : options.parent;

    if (!parent) {
      console.warn(
        `[PhaserSimulator] Mount target element not found:`,
        options.parent,
      );
      return;
    }

    this.initGame(parent);
  }

  private initGame(parent: HTMLElement): void {
    const sceneInstance = new RobotSimulatorScene();
    this.scene = sceneInstance;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: parent,
      width: parent.clientWidth || 320,
      height: 380,
      transparent: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: 380,
      },
      scene: [sceneInstance],
    };

    this.game = new Phaser.Game(config);

    // Apply pending render data when scene is ready
    this.game.events.once('ready', () => {
      if (this.pendingRenderData && this.scene) {
        this.scene.updateSimulationState(this.pendingRenderData);
      }
    });
  }

  /**
   * Synchronizes the visual Phaser grid with the authoritative simulation state.
   */
  public updateState(data: GridRenderData): void {
    this.pendingRenderData = data;
    if (this.scene) {
      this.scene.updateSimulationState(data);
    }
  }

  public pauseVisuals(): void {
    this.scene?.pauseVisuals();
  }

  public resumeVisuals(): void {
    this.scene?.resumeVisuals();
  }

  public stopVisuals(snapToTarget: boolean = true): void {
    this.scene?.stopVisuals(snapToTarget);
  }

  public getGame(): Phaser.Game | null {
    return this.game;
  }

  public destroy(): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      this.scene = null;
    }
  }
}
