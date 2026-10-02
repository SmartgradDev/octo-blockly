/**
 * GridRenderer — renders a 2D grid with a robot into a DOM container.
 *
 * Uses a plain HTML table for maximum simplicity (no canvas, no
 * game engine). Each cell is a <td>. The robot is shown as an emoji
 * with a directional arrow.
 *
 * This module reads RobotState/GridConfig but never mutates them.
 */

import {Direction, GridConfig, RobotState} from './RobotState';
import {TargetPosition} from './Mission';

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
 * Render the grid + robot + target into the given container element.
 *
 * This function replaces the container's innerHTML each time it is
 * called — simple and stateless.
 */
export function renderGrid(
  container: HTMLElement,
  grid: GridConfig,
  robot: RobotState,
  target?: TargetPosition,
): void {
  const table = document.createElement('table');
  table.className = 'robot-grid';

  // Row 0 is the top of the grid (y increases downward in the table,
  // but we keep the coordinate system with (0,0) at top-left).
  for (let row = 0; row < grid.height; row++) {
    const tr = document.createElement('tr');
    for (let col = 0; col < grid.width; col++) {
      const td = document.createElement('td');
      td.className = 'robot-grid-cell';

      const isRobot = col === robot.x && row === robot.y;
      const isTarget = target && col === target.x && row === target.y;

      if (isTarget) {
        td.classList.add('target-cell');
      }

      if (isRobot && isTarget) {
        td.classList.add('robot-cell', 'robot-on-target');
        td.textContent = '🤖⭐';
      } else if (isRobot) {
        td.classList.add('robot-cell');
        td.textContent = '🤖' + directionArrow(robot.direction);
      } else if (isTarget) {
        td.textContent = '⭐';
      }

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  // Status line below the grid.
  const status = document.createElement('div');
  status.className = 'robot-status';
  status.textContent = `Position: (${robot.x}, ${robot.y})  Direction: ${robot.direction}`;

  container.innerHTML = '';
  container.appendChild(table);
  container.appendChild(status);
}
