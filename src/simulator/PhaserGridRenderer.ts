/**
 * PhaserGridRenderer — renders the simulation grid, robot, obstacles,
 * and targets using simple Phaser graphics and text primitives.
 *
 * Architecture Rule:
 * The simulation state (RobotState, GridConfig, Mission) remains the authoritative
 * single source of truth. PhaserGridRenderer receives snapshot/reference of state
 * and updates Phaser Game Objects.
 */

import * as Phaser from 'phaser';
import {Direction, GridConfig, RobotState} from '../robot/RobotState';
import {Position, TargetPosition, ColoredCell} from '../robot/Mission';

export interface GridRenderData {
  grid: GridConfig;
  robot: RobotState;
  target?: TargetPosition;
  obstacles?: Position[];
  cellColors?: ColoredCell[];
  lines?: Position[];
  items?: Position[];
  collectedItems?: Position[];
}

export class PhaserGridRenderer {
  private scene: Phaser.Scene;
  private backgroundGraphics: Phaser.GameObjects.Graphics;
  private cellsGraphics: Phaser.GameObjects.Graphics;
  private robotGraphics: Phaser.GameObjects.Graphics;
  private textGroup: Phaser.GameObjects.Group;

  // Cached layout geometry
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private cellSize: number = 44;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.backgroundGraphics = scene.add.graphics();
    this.cellsGraphics = scene.add.graphics();
    this.robotGraphics = scene.add.graphics();
    this.textGroup = scene.add.group();
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

    // 2. Clear previous frame visuals
    this.backgroundGraphics.clear();
    this.cellsGraphics.clear();
    this.robotGraphics.clear();
    this.textGroup.clear(true, true);

    // 3. Render board background wrapper
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

    // 4. Render grid cells, colors, lines, items, obstacles, target
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

        // Cell base background fill & border
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

        // Draw cell rectangle
        this.cellsGraphics.fillStyle(cellBgColor, 1);
        this.cellsGraphics.fillRoundedRect(x + inset, y + inset, drawSize, drawSize, 6);
        this.cellsGraphics.lineStyle(1.5, borderColor, 1);
        this.cellsGraphics.strokeRoundedRect(x + inset, y + inset, drawSize, drawSize, 6);

        const centerX = x + this.cellSize / 2;
        const centerY = y + this.cellSize / 2;

        // Render cell contents
        if (isObstacle) {
          // Obstacle shape: gray block + rock indicator
          this.cellsGraphics.fillStyle(0x64748b, 0.4);
          this.cellsGraphics.fillRoundedRect(x + inset + 4, y + inset + 4, drawSize - 8, drawSize - 8, 4);
          this.createText(centerX, centerY, '🪨', 16);
        } else if (isTarget) {
          // Target star indicator
          this.createText(centerX, centerY, '⭐', 18);
        } else if (isUncollectedItem) {
          // Gem item indicator
          this.createText(centerX, centerY, '💎', 16);
        } else if (isLine && !coloredCell) {
          // Line track indicator
          this.createText(centerX, centerY, '🛤️', 14);
        }
      }
    }

    // 5. Render Robot at robot.x, robot.y with direction indicator
    this.renderRobot(robot);
  }

  /**
   * Renders the robot avatar and direction arrow using geometric shapes and text
   */
  private renderRobot(robot: RobotState): void {
    const robotCenterX = this.gridOffsetX + robot.x * this.cellSize + this.cellSize / 2;
    const robotCenterY = this.gridOffsetY + robot.y * this.cellSize + this.cellSize / 2;
    const radius = Math.floor((this.cellSize - 12) / 2);

    // Robot body circle (cheerful primary blue/indigo)
    this.robotGraphics.fillStyle(0x2563eb, 1);
    this.robotGraphics.fillCircle(robotCenterX, robotCenterY, radius);

    // Robot outline
    this.robotGraphics.lineStyle(2, 0x1d4ed8, 1);
    this.robotGraphics.strokeCircle(robotCenterX, robotCenterY, radius);

    // Robot face / visor (light cyan)
    this.robotGraphics.fillStyle(0x67e8f9, 1);
    this.robotGraphics.fillRoundedRect(
      robotCenterX - radius * 0.55,
      robotCenterY - radius * 0.35,
      radius * 1.1,
      radius * 0.7,
      3,
    );

    // Directional pointer / arrow triangle
    this.renderDirectionPointer(robotCenterX, robotCenterY, radius, robot.direction);

    // Direction text symbol badge in corner
    const badgeText = this.getDirectionSymbol(robot.direction);
    this.createText(robotCenterX, robotCenterY, badgeText, 11, '#ffffff');
  }

  private renderDirectionPointer(
    cx: number,
    cy: number,
    radius: number,
    dir: Direction,
  ): void {
    const tipDistance = radius + 5;
    const baseDistance = radius - 2;
    const halfWidth = 5;

    let tipX = cx;
    let tipY = cy;
    let b1X = cx;
    let b1Y = cy;
    let b2X = cx;
    let b2Y = cy;

    switch (dir) {
      case 'NORTH':
        tipY = cy - tipDistance;
        b1X = cx - halfWidth;
        b1Y = cy - baseDistance;
        b2X = cx + halfWidth;
        b2Y = cy - baseDistance;
        break;
      case 'SOUTH':
        tipY = cy + tipDistance;
        b1X = cx - halfWidth;
        b1Y = cy + baseDistance;
        b2X = cx + halfWidth;
        b2Y = cy + baseDistance;
        break;
      case 'EAST':
        tipX = cx + tipDistance;
        b1X = cx + baseDistance;
        b1Y = cy - halfWidth;
        b2X = cx + baseDistance;
        b2Y = cy + halfWidth;
        break;
      case 'WEST':
        tipX = cx - tipDistance;
        b1X = cx - baseDistance;
        b1Y = cy - halfWidth;
        b2X = cx - baseDistance;
        b2Y = cy + halfWidth;
        break;
    }

    this.robotGraphics.fillStyle(0xf59e0b, 1);
    this.robotGraphics.fillTriangle(tipX, tipY, b1X, b1Y, b2X, b2Y);
    this.robotGraphics.lineStyle(1, 0xd97706, 1);
    this.robotGraphics.strokeTriangle(tipX, tipY, b1X, b1Y, b2X, b2Y);
  }

  private getDirectionSymbol(dir: Direction): string {
    switch (dir) {
      case 'NORTH':
        return '▲';
      case 'SOUTH':
        return '▼';
      case 'EAST':
        return '▶';
      case 'WEST':
        return '◀';
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

  public destroy(): void {
    this.backgroundGraphics.destroy();
    this.cellsGraphics.destroy();
    this.robotGraphics.destroy();
    this.textGroup.destroy(true);
  }
}
