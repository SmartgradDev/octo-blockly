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
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (err: Error) => void;

  constructor(options: PhaserSimulatorOptions) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    const parent =
      typeof options.parent === 'string'
        ? document.getElementById(options.parent)
        : options.parent;

    if (!parent) {
      const err = new Error(
        `[PhaserSimulator] Mount target element not found: ${options.parent}`,
      );
      console.warn(err.message);
      this.rejectReady(err);
      return;
    }

    this.initGame(parent);
  }

  private initGame(parent: HTMLElement): void {
    try {
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
        this.resolveReady();
      });
    } catch (err: any) {
      console.error('[PhaserSimulator] Failed to initialize Phaser engine:', err);
      this.rejectReady(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Resolves when the Phaser engine has finished booting and the scene is ready.
   */
  public whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Destroys the Phaser game instance, canvas, and WebGL resources cleanly.
   */
  public destroy(): void {
    if (this.game) {
      try {
        this.game.destroy(true);
      } catch (err) {
        console.warn('[PhaserSimulator] Error destroying game instance:', err);
      }
      this.game = null;
      this.scene = null;
      this.pendingRenderData = null;
    }
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

  // ── Camera Follow & Zoom Controls ──────────────────────────────────
  public zoomIn(): number {
    return this.scene ? this.scene.zoomIn() : 1.0;
  }

  public zoomOut(): number {
    return this.scene ? this.scene.zoomOut() : 1.0;
  }

  public resetZoom(): number {
    return this.scene ? this.scene.resetZoom() : 1.0;
  }

  public setZoom(zoom: number, smooth: boolean = true): number {
    return this.scene ? this.scene.setZoom(zoom, smooth) : 1.0;
  }

  public getZoom(): number {
    return this.scene ? this.scene.getZoom() : 1.0;
  }

  public recenterCamera(immediate: boolean = false): void {
    this.scene?.recenterCamera(immediate);
  }

  public resetCamera(): void {
    this.scene?.resetCamera();
  }

  public setCameraFollow(enabled: boolean): void {
    this.scene?.setCameraFollow(enabled);
  }

  public isCameraFollowEnabled(): boolean {
    return this.scene ? this.scene.isCameraFollowEnabled() : false;
  }

  public setCameraDebug(enabled: boolean): void {
    this.scene?.setCameraDebug(enabled);
  }

  public isCameraDebugEnabled(): boolean {
    return this.scene ? this.scene.isCameraDebugEnabled() : false;
  }

  public getCameraState(): any {
    return this.scene ? this.scene.getCameraState() : null;
  }

  public getGame(): Phaser.Game | null {
    return this.game;
  }

}
