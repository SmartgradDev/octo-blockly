import * as Phaser from 'phaser';
import {PhaserGridRenderer, GridRenderData} from './PhaserGridRenderer';

export class RobotSimulatorScene extends Phaser.Scene {
  private gridRenderer?: PhaserGridRenderer;
  private currentRenderData: GridRenderData | null = null;
  private headerTitle?: Phaser.GameObjects.Text;

  constructor() {
    super({key: 'RobotSimulatorScene'});
  }

  preload(): void {
    // No external assets required for geometric grid rendering
  }

  create(): void {
    const {width} = this.scale;

    // Header banner text
    this.headerTitle = this.add.text(width / 2, 14, 'Octo Robotics Simulator', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      color: '#475569',
      fontStyle: 'bold',
      align: 'center',
    });
    this.headerTitle.setOrigin(0.5, 0.5);

    // Initialize the isolated GridRenderer
    this.gridRenderer = new PhaserGridRenderer(this);

    // If data was set prior to create() completion, render immediately
    if (this.currentRenderData) {
      this.gridRenderer.render(this.currentRenderData);
    }

    // Responsive canvas resize handling
    this.scale.on('resize', this.handleResize, this);
  }

  update(_time: number, _delta: number): void {
    // Kept minimal for Phase 4
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

  private handleResize(_gameSize: Phaser.Structs.Size): void {
    const {width} = this.scale;
    if (this.headerTitle) {
      this.headerTitle.setPosition(width / 2, 14);
    }
    if (this.gridRenderer && this.currentRenderData) {
      this.gridRenderer.render(this.currentRenderData);
    }
  }
}
