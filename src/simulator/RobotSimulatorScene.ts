import * as Phaser from 'phaser';
import {PhaserGridRenderer, GridRenderData} from './PhaserGridRenderer';
import {WorldRenderer, CAMPUS_TOWN_MAP, WorldMapData} from './world';

export class RobotSimulatorScene extends Phaser.Scene {
  private gridRenderer?: PhaserGridRenderer;
  private worldRenderer?: WorldRenderer;
  private currentRenderData: GridRenderData | null = null;
  private currentWorldMap: WorldMapData = CAMPUS_TOWN_MAP;
  private headerTitle?: Phaser.GameObjects.Text;

  constructor() {
    super({key: 'RobotSimulatorScene'});
  }

  preload(): void {
    // Procedural vector rendering - no external assets required
  }

  create(): void {
    const {width, height} = this.scale;

    // 1. Initialize the new Procedural World Renderer
    this.worldRenderer = new WorldRenderer(this);
    this.worldRenderer.render(this.currentWorldMap);

    // 2. Set camera bounds and view to match the continuous world map
    const {width: worldW, height: worldH} = this.currentWorldMap.bounds;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Initial camera zoom/framing to fit the world comfortably into the viewport
    this.updateCameraViewport(width, height);

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

    // If data was set prior to create() completion, render robot
    if (this.currentRenderData) {
      this.gridRenderer.render(this.currentRenderData);
    }

    // Responsive canvas resize handling
    this.scale.on('resize', this.handleResize, this);
  }

  update(_time: number, _delta: number): void {
    // Game loop tick
  }

  /**
   * Called by PhaserSimulator when simulation state changes
   */
  public updateSimulationState(data: GridRenderData): void {
    this.currentRenderData = data;
    if (this.gridRenderer) {
      this.gridRenderer.render(data);
    }
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

  private updateCameraViewport(viewportWidth: number, viewportHeight: number): void {
    const {width: worldW, height: worldH} = this.currentWorldMap.bounds;
    
    // Calculate aspect-ratio preserving zoom to display the town neatly with breathing room
    const padding = 24;
    const availableW = Math.max(100, viewportWidth - padding);
    const availableH = Math.max(100, viewportHeight - padding);
    const zoomX = availableW / worldW;
    const zoomY = availableH / worldH;
    const zoom = Math.min(zoomX, zoomY);
    const clampedZoom = Math.max(0.4, Math.min(zoom, 1.8));

    this.cameras.main.setZoom(clampedZoom);
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const {width, height} = gameSize;
    if (this.headerTitle) {
      this.headerTitle.setPosition(width / 2, 14);
    }
    this.updateCameraViewport(width, height);

    if (this.gridRenderer && this.currentRenderData) {
      this.gridRenderer.render(this.currentRenderData);
    }
  }
}
