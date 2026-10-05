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
  WorldRoad,
  WorldIntersection,
  CrosswalkData,
  WorldBuilding,
  WorldTree,
  ParkZone,
  WorldObjectiveTarget,
  getRoadBoundingBox,
  getRoadOrientation,
  getIntersectionBoundingBox,
  isPointInIntersection,
} from './WorldData';

export class WorldRenderer {
  private scene: Phaser.Scene;
  private groundGraphics: Phaser.GameObjects.Graphics;
  private roadGraphics: Phaser.GameObjects.Graphics;
  private buildingGraphics: Phaser.GameObjects.Graphics;
  private sceneryGraphics: Phaser.GameObjects.Graphics;
  private objectiveGraphics: Phaser.GameObjects.Graphics;
  private debugRoadGraphics: Phaser.GameObjects.Graphics;
  private debugCollisionGraphics: Phaser.GameObjects.Graphics;
  private labelGroup: Phaser.GameObjects.Group;
  private debugRoadOverlay: boolean = false;
  private debugCollisionOverlay: boolean = false;
  private lastMap: WorldMapData | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Create layered visual graphics objects
    this.groundGraphics = scene.add.graphics().setDepth(10);
    this.roadGraphics = scene.add.graphics().setDepth(30);
    this.buildingGraphics = scene.add.graphics().setDepth(40);
    this.sceneryGraphics = scene.add.graphics().setDepth(50);
    this.objectiveGraphics = scene.add.graphics().setDepth(60);
    this.debugRoadGraphics = scene.add.graphics().setDepth(70);
    this.debugCollisionGraphics = scene.add.graphics().setDepth(72);
    this.labelGroup = scene.add.group();
  }

  public setDebugRoadOverlay(enabled: boolean): void {
    this.debugRoadOverlay = enabled;
  }

  public isDebugRoadOverlayEnabled(): boolean {
    return this.debugRoadOverlay;
  }

  public setDebugCollisionOverlay(enabled: boolean): void {
    this.debugCollisionOverlay = enabled;
    if (this.lastMap) {
      if (enabled) {
        this.renderCollisionDebugOverlay(this.lastMap);
      } else {
        this.debugCollisionGraphics.clear();
      }
    }
  }

  public isDebugCollisionOverlayEnabled(): boolean {
    return this.debugCollisionOverlay;
  }

  public render(map: WorldMapData): void {
    this.lastMap = map;
    this.clear();

    // 1. Base terrain ground
    this.renderGround(map);

    // 2. Parks
    if (map.parks) {
      this.renderParks(map.parks);
    }

    // 3. Structured roads, sidewalks, intersections, lane dashes & crosswalks
    this.renderRoads(map.roads, map.intersections, map.crosswalks);

    // 4. 2.5D Buildings with roofs, shadow and windows
    this.renderBuildings(map.buildings);

    // 5. Trees with foliage canopies and shadow
    this.renderTrees(map.trees);

    // 6. Mission objectives & goal markers
    this.renderObjectives(map.objectives);

    // 7. Collision debug overlay (if enabled)
    if (this.debugCollisionOverlay) {
      this.renderCollisionDebugOverlay(map);
    }
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

  private renderRoads(
    roads: WorldRoad[],
    intersections?: WorldIntersection[],
    crosswalks?: CrosswalkData[],
  ): void {
    const interList = intersections || [];

    // A. Draw sidewalks (lighter concrete bordering roads)
    for (const road of roads) {
      if (road.hasSidewalk) {
        const bounds = getRoadBoundingBox(road);
        const sw = road.sidewalkWidth || 10;
        const orientation = getRoadOrientation(road);
        const sx = orientation === 'VERTICAL' ? bounds.x - sw : bounds.x;
        const sy = orientation === 'HORIZONTAL' ? bounds.y - sw : bounds.y;
        const swidth = orientation === 'VERTICAL' ? bounds.width + sw * 2 : bounds.width;
        const sheight = orientation === 'HORIZONTAL' ? bounds.height + sw * 2 : bounds.height;

        this.roadGraphics.fillStyle(0xd1d5db, 1); // Concrete sidewalk gray
        this.roadGraphics.fillRect(sx, sy, swidth, sheight);
        this.roadGraphics.lineStyle(1.5, 0x9ca3af, 1);
        this.roadGraphics.strokeRect(sx, sy, swidth, sheight);
      }
    }

    // B. Draw dark asphalt road surfaces
    for (const road of roads) {
      const bounds = getRoadBoundingBox(road);
      this.roadGraphics.fillStyle(0x334155, 1); // Dark slate asphalt
      this.roadGraphics.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

      // Asphalt curbs
      this.roadGraphics.lineStyle(1.5, 0x1e293b, 1);
      this.roadGraphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // C. Draw intersection junction pavements
    for (const inter of interList) {
      const ibox = getIntersectionBoundingBox(inter);
      this.roadGraphics.fillStyle(0x334155, 1); // Dark slate asphalt
      this.roadGraphics.fillRect(ibox.x, ibox.y, ibox.width, ibox.height);

      this.roadGraphics.lineStyle(1.5, 0x1e293b, 1);
      this.roadGraphics.strokeRect(ibox.x, ibox.y, ibox.width, ibox.height);
    }

    // D. Dashed centerline markings (safety yellow)
    for (const road of roads) {
      if (road.dashedLaneMarking) {
        this.roadGraphics.fillStyle(0xfde047, 1); // Safety yellow
        const orientation = getRoadOrientation(road);
        const dashLength = 18;
        const gapLength = 14;

        if (orientation === 'HORIZONTAL') {
          const centerY = road.start.y;
          const minX = Math.min(road.start.x, road.end.x);
          const maxX = Math.max(road.start.x, road.end.x);

          for (let x = minX + 8; x < maxX - 8; x += dashLength + gapLength) {
            const inIntersection = interList.some((it) =>
              isPointInIntersection({x: x + dashLength / 2, y: centerY}, it),
            );
            if (!inIntersection) {
              this.roadGraphics.fillRect(x, centerY - 1.5, dashLength, 3);
            }
          }
        } else if (orientation === 'VERTICAL') {
          const centerX = road.start.x;
          const minY = Math.min(road.start.y, road.end.y);
          const maxY = Math.max(road.start.y, road.end.y);

          for (let y = minY + 8; y < maxY - 8; y += dashLength + gapLength) {
            const inIntersection = interList.some((it) =>
              isPointInIntersection({x: centerX, y: y + dashLength / 2}, it),
            );
            if (!inIntersection) {
              this.roadGraphics.fillRect(centerX - 1.5, y, 3, dashLength);
            }
          }
        }
      }
    }

    // E. Crosswalk white stripes at intersections
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

    // F. Debug road overlay visualization
    if (this.debugRoadOverlay) {
      this.renderRoadDebugOverlay(roads, interList);
    }
  }

  private renderRoadDebugOverlay(roads: WorldRoad[], intersections: WorldIntersection[]): void {
    this.debugRoadGraphics.clear();

    // Road centerlines (cyan) and boundaries (magenta)
    for (const road of roads) {
      const bounds = getRoadBoundingBox(road);

      // Magenta boundary stroke
      this.debugRoadGraphics.lineStyle(1, 0xff00ff, 0.7);
      this.debugRoadGraphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

      // Cyan centerline
      this.debugRoadGraphics.lineStyle(2, 0x06b6d4, 0.9);
      this.debugRoadGraphics.lineBetween(road.start.x, road.start.y, road.end.x, road.end.y);

      // Road ID and width tag
      const midX = (road.start.x + road.end.x) / 2;
      const midY = (road.start.y + road.end.y) / 2;
      this.createText(midX, midY - 14, `${road.id} (${road.width}px)`, 10, '#06b6d4', true, 75);
    }

    // Intersection centers (amber diamond + label)
    for (const inter of intersections) {
      const ibox = getIntersectionBoundingBox(inter);
      this.debugRoadGraphics.lineStyle(2, 0xf59e0b, 0.9);
      this.debugRoadGraphics.strokeRect(ibox.x, ibox.y, ibox.width, ibox.height);

      // Center crosshair marker
      this.debugRoadGraphics.fillStyle(0xf59e0b, 1);
      this.debugRoadGraphics.fillCircle(inter.center.x, inter.center.y, 4);

      this.createText(
        inter.center.x,
        inter.center.y + 14,
        `[${inter.id}]`,
        10,
        '#f59e0b',
        true,
        75,
      );
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

  private renderCollisionDebugOverlay(map: WorldMapData): void {
    this.debugCollisionGraphics.clear();

    // 1. Solid buildings (red boxes with red semi-transparent fill)
    for (const b of map.buildings) {
      if (b.solid !== false) {
        this.debugCollisionGraphics.fillStyle(0xef4444, 0.22);
        this.debugCollisionGraphics.fillRect(b.x, b.y, b.width, b.height);
        this.debugCollisionGraphics.lineStyle(2, 0xdc2626, 0.9);
        this.debugCollisionGraphics.strokeRect(b.x, b.y, b.width, b.height);
      }
    }

    // 2. Solid trees (red circles with red semi-transparent fill)
    for (const t of map.trees) {
      if (t.solid !== false) {
        this.debugCollisionGraphics.fillStyle(0xef4444, 0.22);
        this.debugCollisionGraphics.fillCircle(t.x, t.y, t.canopyRadius);
        this.debugCollisionGraphics.lineStyle(2, 0xdc2626, 0.9);
        this.debugCollisionGraphics.strokeCircle(t.x, t.y, t.canopyRadius);
      }
    }
  }

  public clear(): void {
    this.groundGraphics.clear();
    this.roadGraphics.clear();
    this.buildingGraphics.clear();
    this.sceneryGraphics.clear();
    this.objectiveGraphics.clear();
    this.debugRoadGraphics.clear();
    this.debugCollisionGraphics.clear();
    this.labelGroup.clear(true, true);
  }

  public destroy(): void {
    this.groundGraphics.destroy();
    this.roadGraphics.destroy();
    this.buildingGraphics.destroy();
    this.sceneryGraphics.destroy();
    this.objectiveGraphics.destroy();
    this.debugRoadGraphics.destroy();
    this.debugCollisionGraphics.destroy();
    this.labelGroup.destroy(true);
  }
}
