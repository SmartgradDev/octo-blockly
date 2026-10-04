/**
 * GridRenderer — renders a 2D grid with a robot, target, and obstacles into a DOM container.
 *
 * Uses a plain HTML table for maximum simplicity (no canvas, no
 * game engine). Each cell is a <td>. The robot is rendered using the octopus icon image
 * with a directional arrow indicator. Obstacles are rendered as rock icons.
 *
 * This module reads RobotState/GridConfig/Position but never mutates them.
 */

import {Direction, GridConfig, RobotState} from './RobotState';
import {Position, TargetPosition, ColoredCell} from './Mission';
import octopusIcon from '../assets/octopus-icon.png';

/** Maps a direction to a visual indicator shown alongside the robot. */
function directionArrow(dir: Direction): string {
  switch (dir) {
    case 'NORTH':
      return '⬆';
    case 'SOUTH':
      return '⬇';
    case 'EAST':
      return '➡';
    case 'WEST':
      return '⬅';
  }
}

/**
 * Creates a DOM wrapper containing the octopus icon image and direction indicator.
 */
function renderRobotElement(dir: Direction): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `robot-icon-wrapper robot-dir-${dir.toLowerCase()}`;

  const img = document.createElement('img');
  img.src = octopusIcon;
  img.alt = 'Octo Robot';
  img.className = 'octopus-icon-img';

  const badge = document.createElement('span');
  badge.className = 'robot-direction-badge';
  badge.textContent = directionArrow(dir);

  wrapper.appendChild(img);
  wrapper.appendChild(badge);

  return wrapper;
}

/**
 * Render the grid + robot + target + obstacles + cellColors + lines + items into the given container element.
 */
export function renderGrid(
  container: HTMLElement,
  grid: GridConfig,
  robot: RobotState,
  target?: TargetPosition,
  obstacles?: Position[],
  cellColors?: ColoredCell[],
  lines?: Position[],
  items?: Position[],
  collectedItems?: Position[],
  progressText?: string,
): void {
  const boardWrapper = document.createElement('div');
  boardWrapper.className = 'simulator-board-wrapper';

  const table = document.createElement('table');
  table.className = 'robot-grid';

  const collectedList = collectedItems || [];

  // Row 0 is the top of the grid (y increases downward in the table)
  for (let row = 0; row < grid.height; row++) {
    const tr = document.createElement('tr');
    for (let col = 0; col < grid.width; col++) {
      const td = document.createElement('td');
      td.className = 'robot-grid-cell';
      td.setAttribute('data-col', col.toString());
      td.setAttribute('data-row', row.toString());

      const isRobot = col === robot.x && row === robot.y;
      const isTarget = target && col === target.x && row === target.y;
      const isObstacle =
        obstacles && obstacles.some((o) => o.x === col && o.y === row);
      const coloredCell =
        cellColors && cellColors.find((c) => c.x === col && c.y === row);
      const isLine = lines && lines.some((l) => l.x === col && l.y === row);
      const isUncollectedItem =
        items &&
        items.some((it) => it.x === col && it.y === row) &&
        !collectedList.some((ci) => ci.x === col && ci.y === row);

      if (coloredCell) {
        td.classList.add(`color-cell-${coloredCell.color.toLowerCase()}`);
      }

      if (isLine) {
        td.classList.add('line-cell');
      }

      if (isObstacle) {
        td.classList.add('obstacle-cell');
        if (isRobot) {
          td.appendChild(renderRobotElement(robot.direction));
          const rockSpan = document.createElement('span');
          rockSpan.className = 'cell-item-rock';
          rockSpan.textContent = '🪨';
          td.appendChild(rockSpan);
        } else {
          const rockSpan = document.createElement('span');
          rockSpan.className = 'cell-item-rock';
          rockSpan.textContent = '🪨';
          td.appendChild(rockSpan);
        }
      } else if (isTarget) {
        td.classList.add('target-cell');
        if (isRobot) {
          td.classList.add('robot-cell', 'robot-on-target');
          td.appendChild(renderRobotElement(robot.direction));
          const starSpan = document.createElement('span');
          starSpan.className = 'cell-item-star star-pulse';
          starSpan.textContent = '⭐';
          td.appendChild(starSpan);
        } else {
          const starSpan = document.createElement('span');
          starSpan.className = 'cell-item-star';
          starSpan.textContent = '⭐';
          td.appendChild(starSpan);
        }
      } else if (isRobot) {
        td.classList.add('robot-cell');
        td.appendChild(renderRobotElement(robot.direction));
        if (isUncollectedItem) {
          const itemSpan = document.createElement('span');
          itemSpan.className = 'cell-item-gem';
          itemSpan.textContent = '💎';
          td.appendChild(itemSpan);
        }
      } else if (isUncollectedItem) {
        const itemSpan = document.createElement('span');
        itemSpan.className = 'cell-item-gem';
        itemSpan.textContent = '💎';
        td.appendChild(itemSpan);
      } else if (isLine && !coloredCell) {
        const lineSpan = document.createElement('span');
        lineSpan.className = 'cell-item-line';
        lineSpan.textContent = '🛤️';
        td.appendChild(lineSpan);
      }

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  boardWrapper.appendChild(table);

  // Modern Robot Telemetry HUD below the game board
  const hud = document.createElement('div');
  hud.className = 'robot-hud robot-status';

  // Position Pill
  const posPill = document.createElement('div');
  posPill.className = 'hud-chip hud-chip-pos';
  posPill.innerHTML = `<span class="hud-icon">📍</span><span class="hud-label">(${robot.x}, ${robot.y})</span>`;
  hud.appendChild(posPill);

  // Direction Pill
  const dirPill = document.createElement('div');
  dirPill.className = 'hud-chip hud-chip-dir';
  dirPill.innerHTML = `<span class="hud-icon">${directionArrow(robot.direction)}</span><span class="hud-label">${robot.direction}</span>`;
  hud.appendChild(dirPill);

  // Speed Pill
  const speedPill = document.createElement('div');
  speedPill.className = 'hud-chip hud-chip-speed';
  speedPill.innerHTML = `<span class="hud-icon">⚡</span><span class="hud-label">${robot.motorSpeed}%</span>`;
  hud.appendChild(speedPill);

  // Battery Pill (if battery active)
  if (robot.battery !== undefined) {
    const maxBat = robot.maxBattery || 100;
    const currentBat = Math.max(0, robot.battery);
    const batPct = Math.min(100, Math.round((currentBat / maxBat) * 100));
    const batStatusColor =
      batPct > 50 ? 'battery-high' : batPct > 20 ? 'battery-mid' : 'battery-low';

    const batPill = document.createElement('div');
    batPill.className = `hud-chip hud-chip-battery ${batStatusColor}`;
    batPill.innerHTML = `
      <span class="hud-icon">🔋</span>
      <span class="hud-label">${currentBat.toFixed(1)} / ${maxBat.toFixed(1)}</span>
      <div class="battery-gauge"><div class="battery-gauge-fill" style="width: ${batPct}%;"></div></div>
    `;
    hud.appendChild(batPill);
  }

  // Objective / Progress Text Banner
  if (progressText) {
    const progBanner = document.createElement('div');
    progBanner.className = 'hud-progress-banner';
    progBanner.innerHTML = `<span class="prog-icon">🎯</span><span class="prog-text">${progressText}</span>`;
    hud.appendChild(progBanner);
  }

  container.innerHTML = '';
  container.appendChild(boardWrapper);
  container.appendChild(hud);
}
