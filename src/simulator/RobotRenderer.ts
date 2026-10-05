/**
 * RobotRenderer — dedicated Phaser 4 robot presentation renderer.
 *
 * Architecture Rules:
 * 1. Single source of truth: RobotState (x, y, direction, motorSpeed, battery)
 *    is owned and updated strictly by the shared Robot Engine.
 * 2. RobotRenderer never alters or duplicates state.
 * 3. It converts logical grid coordinates (col, row) into Phaser world coordinates (px, py).
 * 4. It draws the robot with orientation, body, visor/sensor eye, and directional indicator.
 */

import * as Phaser from 'phaser';
import {Direction, RobotState} from '../robot/RobotState';

export interface GridCoordinateConverter {
  toWorldPosition(col: number, row: number): {x: number; y: number};
  getCellSize(): number;
}

export class RobotRenderer {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private pointerGraphics: Phaser.GameObjects.Graphics;
  private directionBadge: Phaser.GameObjects.Text;
  private coordinateConverter: GridCoordinateConverter;

  constructor(scene: Phaser.Scene, coordinateConverter: GridCoordinateConverter) {
    this.scene = scene;
    this.coordinateConverter = coordinateConverter;

    // Create container for grouping all robot sub-elements
    this.container = this.scene.add.container(0, 0);

    // Body graphics (chassis, visor, treads/pads)
    this.bodyGraphics = this.scene.add.graphics();
    this.container.add(this.bodyGraphics);

    // Pointer graphics (directional front arrow)
    this.pointerGraphics = this.scene.add.graphics();
    this.container.add(this.pointerGraphics);

    // Direction symbol badge (▲, ▼, ▶, ◀)
    this.directionBadge = this.scene.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.directionBadge.setOrigin(0.5, 0.5);
    this.container.add(this.directionBadge);
  }

  /**
   * Updates the coordinate converter if grid bounds or canvas resize occurred.
   */
  public setCoordinateConverter(converter: GridCoordinateConverter): void {
    this.coordinateConverter = converter;
  }

  /**
   * Main render method: takes authoritative RobotState and positions/orients Phaser GameObjects.
   */
  public render(robot: RobotState): void {
    const worldPos = this.coordinateConverter.toWorldPosition(robot.x, robot.y);
    const cellSize = this.coordinateConverter.getCellSize();
    const radius = Math.floor((cellSize - 12) / 2);

    // Position the entire robot container at the cell center in Phaser world coordinates
    this.container.setPosition(worldPos.x, worldPos.y);

    // Clear graphics for fresh render
    this.bodyGraphics.clear();
    this.pointerGraphics.clear();

    // 1. Robot chassis / outer shadow ring
    this.bodyGraphics.fillStyle(0x1e3a8a, 0.25);
    this.bodyGraphics.fillCircle(0, 2, radius + 1);

    // 2. Robot body (vibrant robotic blue)
    this.bodyGraphics.fillStyle(0x2563eb, 1);
    this.bodyGraphics.fillCircle(0, 0, radius);

    // 3. Robot chassis border
    this.bodyGraphics.lineStyle(2, 0x1d4ed8, 1);
    this.bodyGraphics.strokeCircle(0, 0, radius);

    // 4. Robot visor / optical sensor scanner (cyan glow)
    const visorWidth = radius * 1.1;
    const visorHeight = radius * 0.7;
    this.bodyGraphics.fillStyle(0x67e8f9, 1);
    this.bodyGraphics.fillRoundedRect(
      -visorWidth / 2,
      -visorHeight / 2,
      visorWidth,
      visorHeight,
      3,
    );

    // 5. Visor inner frame
    this.bodyGraphics.lineStyle(1, 0x06b6d4, 0.8);
    this.bodyGraphics.strokeRoundedRect(
      -visorWidth / 2,
      -visorHeight / 2,
      visorWidth,
      visorHeight,
      3,
    );

    // 6. Directional Front Pointer (amber/orange orientation indicator)
    this.renderDirectionPointer(radius, robot.direction);

    // 7. Direction Symbol Badge
    const symbol = this.getDirectionSymbol(robot.direction);
    this.directionBadge.setText(symbol);
    this.directionBadge.setPosition(0, 0);
  }

  /**
   * Draws orientation pointer based on current direction
   */
  private renderDirectionPointer(radius: number, dir: Direction): void {
    const tipDistance = radius + 6;
    const baseDistance = radius - 2;
    const halfWidth = 5;

    let tipX = 0;
    let tipY = 0;
    let b1X = 0;
    let b1Y = 0;
    let b2X = 0;
    let b2Y = 0;

    switch (dir) {
      case 'NORTH':
        tipY = -tipDistance;
        b1X = -halfWidth;
        b1Y = -baseDistance;
        b2X = halfWidth;
        b2Y = -baseDistance;
        break;
      case 'SOUTH':
        tipY = tipDistance;
        b1X = -halfWidth;
        b1Y = baseDistance;
        b2X = halfWidth;
        b2Y = baseDistance;
        break;
      case 'EAST':
        tipX = tipDistance;
        b1X = baseDistance;
        b1Y = -halfWidth;
        b2X = baseDistance;
        b2Y = halfWidth;
        break;
      case 'WEST':
        tipX = -tipDistance;
        b1X = -baseDistance;
        b1Y = -halfWidth;
        b2X = -baseDistance;
        b2Y = halfWidth;
        break;
    }

    this.pointerGraphics.fillStyle(0xf59e0b, 1);
    this.pointerGraphics.fillTriangle(tipX, tipY, b1X, b1Y, b2X, b2Y);
    this.pointerGraphics.lineStyle(1.5, 0xd97706, 1);
    this.pointerGraphics.strokeTriangle(tipX, tipY, b1X, b1Y, b2X, b2Y);
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

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public destroy(): void {
    this.container.destroy(true);
  }
}
