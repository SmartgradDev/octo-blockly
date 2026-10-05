import * as Phaser from 'phaser';
import {PhaserGridRenderer, GridRenderData} from './PhaserGridRenderer';
import {WorldRenderer, CAMPUS_TOWN_MAP, WorldMapData} from './world';

export interface CameraFollowConfig {
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  followLerpX: number;
  followLerpY: number;
  deadzoneWidth: number;
  deadzoneHeight: number;
  followEnabled: boolean;
}

export const DEFAULT_CAMERA_CONFIG: CameraFollowConfig = {
  defaultZoom: 1.0,
  minZoom: 0.4,
  maxZoom: 2.5,
  zoomStep: 0.2,
  followLerpX: 0.08,
  followLerpY: 0.08,
  deadzoneWidth: 80,
  deadzoneHeight: 80,
  followEnabled: true,
};

export class RobotSimulatorScene extends Phaser.Scene {
  private gridRenderer?: PhaserGridRenderer;
  private worldRenderer?: WorldRenderer;
  private currentRenderData: GridRenderData | null = null;
  private currentWorldMap: WorldMapData = CAMPUS_TOWN_MAP;
  private headerTitle?: Phaser.GameObjects.Text;

  // Camera Follow & Zoom state
  private cameraConfig: CameraFollowConfig = {...DEFAULT_CAMERA_CONFIG};
  private currentZoom: number = 1.0;
  private cameraDebugEnabled: boolean = false;
  private cameraDebugGraphics?: Phaser.GameObjects.Graphics;
  private cameraDebugText?: Phaser.GameObjects.Text;

  constructor() {
    super({key: 'RobotSimulatorScene'});
  }

  preload(): void {
    // Procedural vector rendering - no external assets required
  }

  create(): void {
    const {width, height} = this.scale;

    // 1. Initialize the Procedural World Renderer
    this.worldRenderer = new WorldRenderer(this);
    this.worldRenderer.render(this.currentWorldMap);

    // 2. Set camera bounds matching the continuous world map
    const {width: worldW, height: worldH} = this.currentWorldMap.bounds;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // 3. Header title (depth 200, floating on top of world)
    this.headerTitle = this.add.text(width / 2, 14, `Campus Town — Robotics World`, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      padding: {x: 10, y: 4},
      fontStyle: 'bold',
      align: 'center',
    });
    this.headerTitle.setOrigin(0.5, 0.5);
    this.headerTitle.setScrollFactor(0); // Pin to top of viewport
    this.headerTitle.setDepth(200);

    // 4. Initialize Robot/GridRenderer for robot presentation on top of world
    this.gridRenderer = new PhaserGridRenderer(this);

    // If data was set prior to create() completion, render robot; otherwise render at world spawn point
    if (this.currentRenderData) {
      this.gridRenderer.render(this.currentRenderData);
    } else {
      const spawn = this.currentWorldMap.spawnPoint;
      this.gridRenderer.getRobotRenderer().renderWorld(
        {x: spawn.position.x, y: spawn.position.y, rotation: spawn.rotation},
        true,
      );
    }

    // 5. Setup Camera Follow on authoritative Robot Container
    const robotContainer = this.gridRenderer.getRobotRenderer().getContainer();
    this.setupCameraFollow(robotContainer);

    // Responsive canvas resize handling
    this.scale.on('resize', this.handleResize, this);
  }

  update(_time: number, _delta: number): void {
    if (this.cameraDebugEnabled) {
      this.renderCameraDebug();
    }
  }

  /**
   * Initializes smooth camera follow and deadzone on the robot container.
   */
  private setupCameraFollow(target: Phaser.GameObjects.Container): void {
    const {width: worldW, height: worldH} = this.currentWorldMap.bounds;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(this.currentZoom);

    if (this.cameraConfig.followEnabled) {
      this.cameras.main.startFollow(
        target,
        true,
        this.cameraConfig.followLerpX,
        this.cameraConfig.followLerpY,
      );
      this.cameras.main.setDeadzone(
        this.cameraConfig.deadzoneWidth,
        this.cameraConfig.deadzoneHeight,
      );
    } else {
      this.cameras.main.centerOn(target.x, target.y);
    }
  }

  /**
   * Increases camera zoom level by zoomStep.
   */
  public zoomIn(): number {
    const nextZoom = Math.min(
      this.cameraConfig.maxZoom,
      Math.round((this.currentZoom + this.cameraConfig.zoomStep) * 100) / 100,
    );
    return this.setZoom(nextZoom);
  }

  /**
   * Decreases camera zoom level by zoomStep.
   */
  public zoomOut(): number {
    const nextZoom = Math.max(
      this.cameraConfig.minZoom,
      Math.round((this.currentZoom - this.cameraConfig.zoomStep) * 100) / 100,
    );
    return this.setZoom(nextZoom);
  }

  /**
   * Resets camera zoom level to default.
   */
  public resetZoom(): number {
    return this.setZoom(this.cameraConfig.defaultZoom);
  }

  /**
   * Sets camera zoom level clamped within min and max bounds.
   */
  public setZoom(zoom: number, smooth: boolean = true): number {
    const clamped = Math.max(
      this.cameraConfig.minZoom,
      Math.min(this.cameraConfig.maxZoom, zoom),
    );
    this.currentZoom = clamped;

    if (this.cameras && this.cameras.main) {
      if (smooth) {
        this.tweens.add({
          targets: this.cameras.main,
          zoom: clamped,
          duration: 200,
          ease: 'Cubic.easeOut',
        });
      } else {
        this.cameras.main.setZoom(clamped);
      }
    }
    return this.currentZoom;
  }

  /**
   * Returns current camera zoom level.
   */
  public getZoom(): number {
    return this.currentZoom;
  }

  /**
   * Centers the camera directly onto the robot's current position.
   */
  public recenterCamera(immediate: boolean = false): void {
    if (!this.gridRenderer) return;
    const pose = this.gridRenderer.getVisualPose();
    if (pose) {
      if (immediate) {
        this.cameras.main.centerOn(pose.x, pose.y);
      } else {
        this.cameras.main.pan(pose.x, pose.y, 250, 'Cubic.easeOut');
      }
    }
  }

  /**
   * Full camera reset: recenters on robot and restores default zoom.
   */
  public resetCamera(): void {
    this.resetZoom();
    this.recenterCamera(true);
    if (!this.cameraConfig.followEnabled) {
      this.setCameraFollow(true);
    }
  }

  /**
   * Enables or disables camera following the robot.
   */
  public setCameraFollow(enabled: boolean): void {
    this.cameraConfig.followEnabled = enabled;
    if (!this.gridRenderer) return;
    const container = this.gridRenderer.getRobotRenderer().getContainer();

    if (enabled) {
      this.cameras.main.startFollow(
        container,
        true,
        this.cameraConfig.followLerpX,
        this.cameraConfig.followLerpY,
      );
      this.cameras.main.setDeadzone(
        this.cameraConfig.deadzoneWidth,
        this.cameraConfig.deadzoneHeight,
      );
    } else {
      this.cameras.main.stopFollow();
    }
  }

  public isCameraFollowEnabled(): boolean {
    return this.cameraConfig.followEnabled;
  }

  /**
   * Toggles optional camera debug overlay.
   */
  public setCameraDebug(enabled: boolean): void {
    this.cameraDebugEnabled = enabled;
    if (!enabled) {
      this.cameraDebugGraphics?.clear();
      if (this.cameraDebugText) {
        this.cameraDebugText.setVisible(false);
      }
    } else if (this.cameraDebugText) {
      this.cameraDebugText.setVisible(true);
    }
  }

  public isCameraDebugEnabled(): boolean {
    return this.cameraDebugEnabled;
  }

  /**
   * Returns inspection state of camera.
   */
  public getCameraState(): {
    scrollX: number;
    scrollY: number;
    zoom: number;
    followEnabled: boolean;
    deadzone: {width: number; height: number} | null;
    bounds: {x: number; y: number; width: number; height: number};
  } {
    const cam = this.cameras.main;
    return {
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      zoom: cam.zoom,
      followEnabled: this.cameraConfig.followEnabled,
      deadzone: cam.deadzone ? {width: cam.deadzone.width, height: cam.deadzone.height} : null,
      bounds: {
        x: (cam as any)._bounds?.x ?? 0,
        y: (cam as any)._bounds?.y ?? 0,
        width: (cam as any)._bounds?.width ?? this.currentWorldMap.bounds.width,
        height: (cam as any)._bounds?.height ?? this.currentWorldMap.bounds.height,
      },
    };
  }

  private renderCameraDebug(): void {
    if (!this.cameraDebugGraphics) {
      this.cameraDebugGraphics = this.add.graphics().setDepth(300).setScrollFactor(0);
    }
    if (!this.cameraDebugText) {
      this.cameraDebugText = this.add.text(10, 36, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#38bdf8',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        padding: {x: 6, y: 3},
      }).setDepth(300).setScrollFactor(0);
    }

    const cam = this.cameras.main;
    this.cameraDebugGraphics.clear();

    // Draw deadzone in viewport center if active
    if (cam.deadzone) {
      this.cameraDebugGraphics.lineStyle(1.5, 0xfacc15, 0.8);
      this.cameraDebugGraphics.strokeRect(
        cam.deadzone.x,
        cam.deadzone.y,
        cam.deadzone.width,
        cam.deadzone.height,
      );
    }

    // Viewport center crosshair
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    this.cameraDebugGraphics.lineStyle(1, 0xef4444, 0.8);
    this.cameraDebugGraphics.lineBetween(cx - 10, cy, cx + 10, cy);
    this.cameraDebugGraphics.lineBetween(cx, cy - 10, cx, cy + 10);

    const followTarget = (cam as any)._follow;
    const targetInfo = followTarget ? `TGT: (${Math.round(followTarget.x)}, ${Math.round(followTarget.y)})` : 'NO_TARGET';
    this.cameraDebugText.setText(
      `CAM: (${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)}) | ZOOM: ${cam.zoom.toFixed(2)}x | ${targetInfo} | FOLLOW: ${this.cameraConfig.followEnabled ? 'ON' : 'OFF'}`,
    );
  }

  /**
   * Called by PhaserSimulator when simulation state changes
   */
  public updateSimulationState(data: GridRenderData): Promise<void> {
    this.currentRenderData = data;
    if (this.gridRenderer) {
      return this.gridRenderer.render(data);
    }
    return Promise.resolve();
  }

  public getVisualPose(): import('./RobotRenderer').WorldRobotPose | null {
    return this.gridRenderer ? this.gridRenderer.getVisualPose() : null;
  }

  public pauseVisuals(): void {
    this.gridRenderer?.pauseVisuals();
  }

  public resumeVisuals(): void {
    this.gridRenderer?.resumeVisuals();
  }

  public stopVisuals(snapToTarget: boolean = true): void {
    this.gridRenderer?.stopVisuals(snapToTarget);
  }

  public setAnimationDebug(enabled: boolean): void {
    this.gridRenderer?.setAnimationDebug(enabled);
  }

  public isAnimationDebugEnabled(): boolean {
    return this.gridRenderer ? this.gridRenderer.isAnimationDebugEnabled() : false;
  }

  public getAnimationState(): string {
    return this.gridRenderer ? this.gridRenderer.getAnimationState() : 'IDLE';
  }

  public setDebugRoadOverlay(enabled: boolean): void {
    if (this.worldRenderer) {
      this.worldRenderer.setDebugRoadOverlay(enabled);
      this.worldRenderer.render(this.currentWorldMap);
    }
  }

  public isDebugRoadOverlayEnabled(): boolean {
    return this.worldRenderer ? this.worldRenderer.isDebugRoadOverlayEnabled() : false;
  }

  public setDebugCollisionOverlay(enabled: boolean): void {
    if (this.worldRenderer) {
      this.worldRenderer.setDebugCollisionOverlay(enabled);
    }
  }

  public isDebugCollisionOverlayEnabled(): boolean {
    return this.worldRenderer ? this.worldRenderer.isDebugCollisionOverlayEnabled() : false;
  }

  public setDebugMissionObjectsOverlay(enabled: boolean): void {
    if (this.worldRenderer) {
      this.worldRenderer.setDebugMissionObjectsOverlay(enabled);
    }
  }

  public isDebugMissionObjectsOverlayEnabled(): boolean {
    return this.worldRenderer ? this.worldRenderer.isDebugMissionObjectsOverlayEnabled() : false;
  }

  public updateMissionObjects(objects: import('./world').WorldMissionObject[]): void {
    if (this.worldRenderer) {
      this.worldRenderer.updateMissionObjects(objects);
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const {width, height} = gameSize;
    if (this.headerTitle) {
      this.headerTitle.setPosition(width / 2, 14);
    }

    const {width: worldW, height: worldH} = this.currentWorldMap.bounds;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    if (this.gridRenderer && this.currentRenderData) {
      this.gridRenderer.render(this.currentRenderData);
    }
  }
}

