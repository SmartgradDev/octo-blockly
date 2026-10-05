/**
 * WorldRenderer.ts — Procedural Phaser 4 renderer for continuous world maps.
 *
 * Architecture:
 * - Reads WorldMapData (bounds, terrain, roads, sidewalks, buildings, trees, objectives).
 * - Generates clean, vector-style 2D/2.5D graphics purely using Phaser primitives.
 * - Organizes rendering into strict visual depth layers:
 *   1. Ground / Terrain (depth 10)
 *   2. Parks & Sidewalks (depth 20)
 *   3. Roads & Markings (depth 30)
 *   4. Buildings & Details (depth 40)
 *   5. Trees & Scenery (depth 50)
 *   6. Objectives & Markers (depth 60)
 *   7. Robot (managed on top at depth 100)
 */

import * as Phaser from 'phaser';
import {
  WorldMapData,
  RoadSegment,
  CrosswalkData,
  WorldBuilding,
  WorldTree,
  ParkZone,
  WorldObjectiveTarget,
} from './WorldData';

export class WorldRenderer {
  private scene: Phaser.Scene;
  private groundGraphics: Phaser.GameObjects.Graphics;
  private roadGraphics: Phaser.GameObjects.Graphics;
  private buildingGraphics: Phaser.GameObjects.Graphics;
  private sceneryGraphics: Phaser.GameObjects.Graphics;
  private objectiveGraphics: Phaser.GameObjects.Graphics;
  private labelGroup: Phaser.GameObjects.Group;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Create layered visual graphics objects
    this.groundGraphics = scene.add.graphics().setDepth(10);
    this.roadGraphics = scene.add.graphics().setDepth(30);
    this.buildingGraphics = scene.add.graphics().setDepth(40);
    this.sceneryGraphics = scene.add.graphics().setDepth(50);
    this.objectiveGraphics = scene.add.graphics().setDepth(60);
    this.labelGroup = scene.add.group();
  }

  /**
   * Main render method: takes any continuous WorldMapData and draws procedural vector elements.
   */
  public render(map: WorldMapData): void {
    this.clear();

    // 1. Base terrain ground
    this.renderGround(map);

    // 2. Parks
    if (map.parks) {
      this.renderParks(map.parks);
    }

    // 3. Roads, sidewalks, lane dashes & crosswalks
    this.renderRoads(map.roads, map.crosswalks);

    // 4. 2.5D Buildings with roofs, shadow and windows
    this.renderBuildings(map.buildings);

    // 5. Trees with foliage canopies and shadow
    this.renderTrees(map.trees);

    // 6. Mission objectives & goal markers
    this.renderObjectives(map.objectives);
  }

  private renderGround(map: WorldMapData): void {
    const {width, height} = map.bounds;

    // Rich grass background
    this.groundGraphics.fillStyle(map.groundColor, 1);
    this.groundGraphics.fillRect(0, 0, width, height);

    // Subtle grass texture lines/cross-hatch pattern
    this.groundGraphics.lineStyle(1, 0x4ade80, 0.25);
    for (let x = 0; x < width; x += 32) {
      this.groundGraphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 32) {
      this.groundGraphics.lineBetween(0, y, width, y);
    }

    // Outer map boundary border
    this.groundGraphics.lineStyle(4, 0x15803d, 1);
    this.groundGraphics.strokeRect(2, 2, width - 4, height - 4);
  }

  private renderParks(parks: ParkZone[]): void {
    for (const park of parks) {
      // Park grass zone
      this.groundGraphics.fillStyle(park.grassColor || 0x4ade80, 1);
      this.groundGraphics.fillRoundedRect(park.x, park.y, park.width, park.height, 12);
      this.groundGraphics.lineStyle(2, 0x22c55e, 1);
      this.groundGraphics.strokeRoundedRect(park.x, park.y, park.width, park.height, 12);

      // Park name subtle label
      this.createText(
        park.x + park.width / 2,
        park.y + 14,
        park.name.toUpperCase(),
        10,
        '#166534',
        true,
        25,
      );
    }
  }

  private renderRoads(roads: RoadSegment[], crosswalks?: CrosswalkData[]): void {
    // A. Draw sidewalks (lighter concrete under roads)
    for (const road of roads) {
      if (road.hasSidewalk) {
        const sw = road.sidewalkWidth || 10;
        const sx = road.type === 'VERTICAL' ? road.x - sw : road.x;
        const sy = road.type === 'HORIZONTAL' ? road.y - sw : road.y;
        const swidth = road.type === 'VERTICAL' ? road.width + sw * 2 : road.width;
        const sheight = road.type === 'HORIZONTAL' ? road.height + sw * 2 : road.height;

        this.roadGraphics.fillStyle(0xd1d5db, 1); // Concrete sidewalk gray
        this.roadGraphics.fillRect(sx, sy, swidth, sheight);
        this.roadGraphics.lineStyle(1.5, 0x9ca3af, 1);
        this.roadGraphics.strokeRect(sx, sy, swidth, sheight);
      }
    }

    // B. Draw dark asphalt road surface
    for (const road of roads) {
      this.roadGraphics.fillStyle(0x334155, 1); // Dark slate asphalt
      this.roadGraphics.fillRect(road.x, road.y, road.width, road.height);

      // Asphalt curbs
      this.roadGraphics.lineStyle(1.5, 0x1e293b, 1);
      this.roadGraphics.strokeRect(road.x, road.y, road.width, road.height);

      // Dashed centerline markings
      if (road.dashedLaneMarking) {
        this.roadGraphics.fillStyle(0xfde047, 1); // Safety yellow dashed line

        if (road.type === 'HORIZONTAL') {
          const centerY = road.y + road.height / 2;
          const dashLength = 18;
          const gapLength = 14;
          for (let x = road.x + 8; x < road.x + road.width - 8; x += dashLength + gapLength) {
            this.roadGraphics.fillRect(x, centerY - 1.5, dashLength, 3);
          }
        } else if (road.type === 'VERTICAL') {
          const centerX = road.x + road.width / 2;
          const dashLength = 18;
          const gapLength = 14;
          for (let y = road.y + 8; y < road.y + road.height - 8; y += dashLength + gapLength) {
            this.roadGraphics.fillRect(centerX - 1.5, y, 3, dashLength);
          }
        }
      }
    }

    // C. Crosswalk white stripes at intersections
    if (crosswalks) {
      this.roadGraphics.fillStyle(0xffffff, 0.95);
      for (const cw of crosswalks) {
        if (cw.orientation === 'VERTICAL') {
          const stripeH = 8;
          const gapH = 6;
          for (let y = cw.y + 2; y < cw.y + cw.height - stripeH; y += stripeH + gapH) {
            this.roadGraphics.fillRect(cw.x, y, cw.width, stripeH);
          }
        } else {
          const stripeW = 8;
          const gapW = 6;
          for (let x = cw.x + 2; x < cw.x + cw.width - stripeW; x += stripeW + gapW) {
            this.roadGraphics.fillRect(x, cw.y, stripeW, cw.height);
          }
        }
      }
    }
  }

  private renderBuildings(buildings: WorldBuilding[]): void {
    const shadowDepth = 8;

    for (const b of buildings) {
      // 1. Soft ambient cast shadow (offset down and right)
      this.buildingGraphics.fillStyle(0x0f172a, 0.28);
      this.buildingGraphics.fillRoundedRect(
        b.x + 4,
        b.y + shadowDepth + 2,
        b.width,
        b.height,
        8,
      );

      // 2. Base wall foundation (giving a 2.5D extruded depth effect)
      this.buildingGraphics.fillStyle(b.wallColor, 1);
      this.buildingGraphics.fillRoundedRect(
        b.x,
        b.y + 6,
        b.width,
        b.height,
        6,
      );

      // 3. Building roof
      this.buildingGraphics.fillStyle(b.roofColor, 1);
      this.buildingGraphics.fillRoundedRect(b.x, b.y, b.width, b.height - 4, 6);
      this.buildingGraphics.lineStyle(2, b.wallColor, 1);
      this.buildingGraphics.strokeRoundedRect(b.x, b.y, b.width, b.height - 4, 6);

      // 4. Roof inner accent band
      if (b.accentColor) {
        this.buildingGraphics.lineStyle(1.5, b.accentColor, 0.8);
        this.buildingGraphics.strokeRoundedRect(b.x + 6, b.y + 6, b.width - 12, b.height - 16, 4);
      }

      // 5. Procedural glass solar panels / skylight windows
      const cols = b.windowCols || 3;
      const rows = b.windowRows || 2;
      const windowMarginX = 18;
      const windowMarginY = 22;
      const availableW = b.width - windowMarginX * 2;
      const availableH = b.height - windowMarginY * 2 - 10;
      const winW = (availableW - (cols - 1) * 8) / cols;
      const winH = (availableH - (rows - 1) * 8) / rows;

      this.buildingGraphics.fillStyle(0xe0f2fe, 0.9); // Glass blue
      this.buildingGraphics.lineStyle(1, 0x38bdf8, 1);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = b.x + windowMarginX + c * (winW + 8);
          const wy = b.y + windowMarginY + r * (winH + 8);
          this.buildingGraphics.fillRoundedRect(wx, wy, winW, winH, 3);
          this.buildingGraphics.strokeRoundedRect(wx, wy, winW, winH, 3);
        }
      }

      // 6. Name banner label on roof
      this.createText(
        b.x + b.width / 2,
        b.y + 12,
        b.label || b.name,
        11,
        '#ffffff',
        true,
        45,
      );
    }
  }

  private renderTrees(trees: WorldTree[]): void {
    for (const tree of trees) {
      const r = tree.canopyRadius;

      // 1. Tree contact shadow
      this.sceneryGraphics.fillStyle(0x064e3b, 0.35);
      this.sceneryGraphics.fillEllipse(tree.x + 3, tree.y + r * 0.5, r * 1.8, r * 0.9);

      // 2. Trunk
      const trunkR = tree.trunkRadius || Math.max(3, Math.round(r * 0.25));
      this.sceneryGraphics.fillStyle(0x78350f, 1); // Tree bark brown
      this.sceneryGraphics.fillCircle(tree.x, tree.y, trunkR);

      // 3. Tree crown outer canopy (lush forest green)
      const canopyColor = tree.canopyColor || 0x15803d;
      this.sceneryGraphics.fillStyle(canopyColor, 1);
      this.sceneryGraphics.fillCircle(tree.x, tree.y - 2, r);

      // 4. Inner highlight leaf cluster (lighter emerald)
      this.sceneryGraphics.fillStyle(0x22c55e, 0.8);
      this.sceneryGraphics.fillCircle(tree.x - r * 0.25, tree.y - r * 0.35, r * 0.55);
      this.sceneryGraphics.lineStyle(1.5, 0x166534, 1);
      this.sceneryGraphics.strokeCircle(tree.x, tree.y - 2, r);
    }
  }

  private renderObjectives(objectives: WorldObjectiveTarget[]): void {
    for (const obj of objectives) {
      const {x, y} = obj.position;
      const r = obj.radius;

      // 1. Pulsing goal base beacon
      this.objectiveGraphics.fillStyle(obj.color || 0xfacc15, 0.3);
      this.objectiveGraphics.fillCircle(x, y, r + 6);

      // 2. Solid goal target pad
      this.objectiveGraphics.fillStyle(obj.color || 0xfacc15, 1);
      this.objectiveGraphics.fillCircle(x, y, r);
      this.objectiveGraphics.lineStyle(2.5, 0xb45309, 1);
      this.objectiveGraphics.strokeCircle(x, y, r);

      // 3. Center icon / star symbol
      if (obj.iconSymbol) {
        this.createText(x, y, obj.iconSymbol, 18, '#78350f', true, 65);
      }

      // 4. Goal title tag
      this.createText(x, y + r + 10, obj.name, 10, '#1e293b', true, 65);
    }
  }

  private createText(
    x: number,
    y: number,
    text: string,
    fontSize: number = 12,
    color: string = '#ffffff',
    bold: boolean = false,
    depth: number = 50,
  ): Phaser.GameObjects.Text {
    const txt = this.scene.add.text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${fontSize}px`,
      color: color,
      fontStyle: bold ? 'bold' : 'normal',
    });
    txt.setOrigin(0.5, 0.5);
    txt.setDepth(depth);
    this.labelGroup.add(txt);
    return txt;
  }

  public clear(): void {
    this.groundGraphics.clear();
    this.roadGraphics.clear();
    this.buildingGraphics.clear();
    this.sceneryGraphics.clear();
    this.objectiveGraphics.clear();
    this.labelGroup.clear(true, true);
  }

  public destroy(): void {
    this.groundGraphics.destroy();
    this.roadGraphics.destroy();
    this.buildingGraphics.destroy();
    this.sceneryGraphics.destroy();
    this.objectiveGraphics.destroy();
    this.labelGroup.destroy(true);
  }
}
