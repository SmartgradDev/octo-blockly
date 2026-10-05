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
      transparent: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
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
   * Refreshes Phaser's scale manager when the container layout resizes.
   */
  public refreshScale(): void {
    if (this.game && this.game.scale) {
      this.game.scale.refresh();
    }
  }

  /**
   * Synchronizes the visual Phaser grid with the authoritative simulation state.
   */
  public updateState(data: GridRenderData): Promise<void> {
    this.pendingRenderData = data;
    if (this.scene) {
      return this.scene.updateSimulationState(data);
    }
    return Promise.resolve();
  }

  public getVisualPose(): import('./RobotRenderer').WorldRobotPose | null {
    return this.scene ? this.scene.getVisualPose() : null;
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

  public setAnimationDebug(enabled: boolean): void {
    this.scene?.setAnimationDebug(enabled);
  }

  public isAnimationDebugEnabled(): boolean {
    return this.scene ? this.scene.isAnimationDebugEnabled() : false;
  }

  public getAnimationState(): string {
    return this.scene ? this.scene.getAnimationState() : 'IDLE';
  }

  public setDebugRoadOverlay(enabled: boolean): void {
    this.scene?.setDebugRoadOverlay(enabled);
  }

  public isDebugRoadOverlayEnabled(): boolean {
    return this.scene ? this.scene.isDebugRoadOverlayEnabled() : false;
  }

  public setDebugCollisionOverlay(enabled: boolean): void {
    this.scene?.setDebugCollisionOverlay(enabled);
  }

  public isDebugCollisionOverlayEnabled(): boolean {
    return this.scene ? this.scene.isDebugCollisionOverlayEnabled() : false;
  }

  public setDebugMissionObjectsOverlay(enabled: boolean): void {
    this.scene?.setDebugMissionObjectsOverlay(enabled);
  }

  public isDebugMissionObjectsOverlayEnabled(): boolean {
    return this.scene ? this.scene.isDebugMissionObjectsOverlayEnabled() : false;
  }

  public updateMissionObjects(objects: import('./world').WorldMissionObject[]): void {
    this.scene?.updateMissionObjects(objects);
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
