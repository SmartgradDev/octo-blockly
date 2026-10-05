/**
 * PhaserGridRenderer — renders the simulation grid background, cells, obstacles,
 * and targets using simple Phaser graphics and text primitives.
 *
 * Architecture Rule:
 * The simulation state (RobotState, GridConfig, Mission) remains the authoritative
 * single source of truth. PhaserGridRenderer receives snapshot/reference of state
 * and delegates robot rendering to the dedicated RobotRenderer.
 */

import * as Phaser from 'phaser';
import {GridConfig, RobotState} from '../robot/RobotState';
import {Position, TargetPosition, ColoredCell} from '../robot/Mission';
import {RobotRenderer, GridCoordinateConverter} from './RobotRenderer';

import {WorldRobotState} from './world';

export interface GridRenderData {
  grid: GridConfig;
  robot: RobotState;
  worldRobot?: WorldRobotState;
  target?: TargetPosition;
  obstacles?: Position[];
  cellColors?: ColoredCell[];
  lines?: Position[];
  items?: Position[];
  collectedItems?: Position[];
  immediate?: boolean;
}

export class PhaserGridRenderer implements GridCoordinateConverter {
  private scene: Phaser.Scene;
  private backgroundGraphics: Phaser.GameObjects.Graphics;
  private cellsGraphics: Phaser.GameObjects.Graphics;
  private textGroup: Phaser.GameObjects.Group;
  private robotRenderer: RobotRenderer;

  // Cached layout geometry
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private cellSize: number = 44;
  private showGridBoard: boolean = false; // False by default so continuous world shines through in Step 2

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.backgroundGraphics = scene.add.graphics().setDepth(20);
    this.cellsGraphics = scene.add.graphics().setDepth(25);
    this.textGroup = scene.add.group();

    // Dedicated RobotRenderer instance
    this.robotRenderer = new RobotRenderer(scene, this);
  }

  public setShowGridBoard(show: boolean): void {
    this.showGridBoard = show;
  }

  /**
   * Converts logical grid coordinates (col, row) into Phaser world coordinates (center of cell).
   */
  public toWorldPosition(col: number, row: number): {x: number; y: number} {
    return {
      x: this.gridOffsetX + col * this.cellSize + this.cellSize / 2,
      y: this.gridOffsetY + row * this.cellSize + this.cellSize / 2,
    };
  }

  public getCellSize(): number {
    return this.cellSize;
  }

  public getRobotRenderer(): RobotRenderer {
    return this.robotRenderer;
  }

  /**
   * Main render call: maps simulation state to Phaser shapes and text
   */
  public render(data: GridRenderData): void {
    const {width, height} = this.scene.scale;
    const {grid, robot, target, obstacles, cellColors, lines, items, collectedItems} = data;

    // 1. Calculate cell size and offsets to center grid within available canvas space
    const padding = 16;
    const availableWidth = Math.max(100, width - padding * 2);
    const availableHeight = Math.max(100, height - padding * 2 - 20); // leave room for header/stats
    const topMargin = 20;

    const maxCellW = Math.floor(availableWidth / grid.width);
    const maxCellH = Math.floor(availableHeight / grid.height);
    this.cellSize = Math.min(Math.max(28, Math.min(maxCellW, maxCellH)), 56);

    const totalGridW = grid.width * this.cellSize;
    const totalGridH = grid.height * this.cellSize;

    this.gridOffsetX = Math.floor((width - totalGridW) / 2);
    this.gridOffsetY = Math.floor(topMargin + (height - topMargin - totalGridH) / 2);

    // 2. Clear previous frame board visuals
    this.backgroundGraphics.clear();
    this.cellsGraphics.clear();
    this.textGroup.clear(true, true);

    // 3. Render board background wrapper and cells if showGridBoard enabled
    if (this.showGridBoard) {
      this.backgroundGraphics.fillStyle(0xf8fafc, 1);
      this.backgroundGraphics.fillRoundedRect(
        this.gridOffsetX - 8,
        this.gridOffsetY - 8,
        totalGridW + 16,
        totalGridH + 16,
        12,
      );
      this.backgroundGraphics.lineStyle(1.5, 0xe2e8f0, 1);
      this.backgroundGraphics.strokeRoundedRect(
        this.gridOffsetX - 8,
        this.gridOffsetY - 8,
        totalGridW + 16,
        totalGridH + 16,
        12,
      );
    }

    // 4. Render grid cells, colors, lines, items, obstacles, target (only if showGridBoard enabled)
    if (this.showGridBoard) {
      const collectedList = collectedItems || [];

      for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
          const x = this.gridOffsetX + col * this.cellSize;
          const y = this.gridOffsetY + row * this.cellSize;
          const inset = 3;
          const drawSize = this.cellSize - inset * 2;

          const isObstacle = obstacles && obstacles.some((o) => o.x === col && o.y === row);
          const isTarget = target && target.x === col && target.y === row;
          const coloredCell = cellColors && cellColors.find((c) => c.x === col && c.y === row);
          const isLine = lines && lines.some((l) => l.x === col && l.y === row);
          const isUncollectedItem =
            items &&
            items.some((it) => it.x === col && it.y === row) &&
            !collectedList.some((ci) => ci.x === col && ci.y === row);

          let cellBgColor = 0xffffff;
          let borderColor = 0xe2e8f0;

          if (coloredCell) {
            switch (coloredCell.color.toUpperCase()) {
              case 'RED':
                cellBgColor = 0xfee2e2;
                borderColor = 0xf87171;
                break;
              case 'BLUE':
                cellBgColor = 0xdbeafe;
                borderColor = 0x60a5fa;
                break;
              case 'GREEN':
                cellBgColor = 0xdcfce7;
                borderColor = 0x4ade80;
                break;
              case 'YELLOW':
                cellBgColor = 0xfef9c3;
                borderColor = 0xfacc15;
                break;
            }
          }

          if (isLine) {
            cellBgColor = 0xeff6ff;
            borderColor = 0x93c5fd;
          }

          if (isObstacle) {
            cellBgColor = 0xf1f5f9;
            borderColor = 0x94a3b8;
          } else if (isTarget) {
            cellBgColor = 0xfefce8;
            borderColor = 0xfacc15;
          }

          this.cellsGraphics.fillStyle(cellBgColor, 1);
          this.cellsGraphics.fillRoundedRect(x + inset, y + inset, drawSize, drawSize, 6);
          this.cellsGraphics.lineStyle(1.5, borderColor, 1);
          this.cellsGraphics.strokeRoundedRect(x + inset, y + inset, drawSize, drawSize, 6);

          const centerX = x + this.cellSize / 2;
          const centerY = y + this.cellSize / 2;

          if (isObstacle) {
            this.cellsGraphics.fillStyle(0x64748b, 0.4);
            this.cellsGraphics.fillRoundedRect(x + inset + 4, y + inset + 4, drawSize - 8, drawSize - 8, 4);
            this.createText(centerX, centerY, '🪨', 16);
          } else if (isTarget) {
            this.createText(centerX, centerY, '⭐', 18);
          } else if (isUncollectedItem) {
            this.createText(centerX, centerY, '💎', 16);
          } else if (isLine && !coloredCell) {
            this.createText(centerX, centerY, '🛤️', 14);
          }
        }
      }
    }

    // 5. Delegate robot rendering to the dedicated RobotRenderer
    if (data.worldRobot) {
      this.robotRenderer.renderWorld(data.worldRobot, data.immediate || false);
    } else {
      this.robotRenderer.setCoordinateConverter(this);
      this.robotRenderer.render(robot, data.immediate || false);
    }
  }

  private createText(
    x: number,
    y: number,
    text: string,
    fontSize: number = 14,
    color: string = '#000000',
  ): Phaser.GameObjects.Text {
    const txt = this.scene.add.text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${fontSize}px`,
      color: color,
    });
    txt.setOrigin(0.5, 0.5);
    this.textGroup.add(txt);
    return txt;
  }

  public pauseVisuals(): void {
    this.robotRenderer.pauseVisuals();
  }

  public resumeVisuals(): void {
    this.robotRenderer.resumeVisuals();
  }

  public stopVisuals(snapToTarget: boolean = true): void {
    this.robotRenderer.stopVisuals(snapToTarget);
  }

  public destroy(): void {
    this.backgroundGraphics.destroy();
    this.cellsGraphics.destroy();
    this.textGroup.destroy(true);
    this.robotRenderer.destroy();
  }
}
