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
import {Position, TargetPosition} from './Mission';
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
 * Creates a DOM wrapper containing the octopus icon image and direction arrow.
 */
function renderRobotElement(dir: Direction): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'robot-icon-wrapper';

  const img = document.createElement('img');
  img.src = octopusIcon;
  img.alt = 'Octopus Robot';
  img.className = 'octopus-icon-img';

  const arrow = document.createElement('span');
  arrow.className = 'robot-direction-arrow';
  arrow.textContent = directionArrow(dir);

  wrapper.appendChild(img);
  wrapper.appendChild(arrow);

  return wrapper;
}

/**
 * Render the grid + robot + target + obstacles into the given container element.
 *
 * This function replaces the container's innerHTML each time it is
 * called — simple and stateless.
 */
export function renderGrid(
  container: HTMLElement,
  grid: GridConfig,
  robot: RobotState,
  target?: TargetPosition,
  obstacles?: Position[],
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
      const isObstacle =
        obstacles && obstacles.some((o) => o.x === col && o.y === row);

      if (isObstacle) {
        td.classList.add('obstacle-cell');
        if (isRobot) {
          td.appendChild(renderRobotElement(robot.direction));
          const rockSpan = document.createElement('span');
          rockSpan.textContent = '🪨';
          td.appendChild(rockSpan);
        } else {
          td.textContent = '🪨';
        }
      } else if (isTarget) {
        td.classList.add('target-cell');
        if (isRobot) {
          td.classList.add('robot-cell', 'robot-on-target');
          td.appendChild(renderRobotElement(robot.direction));
          const starSpan = document.createElement('span');
          starSpan.textContent = '⭐';
          td.appendChild(starSpan);
        } else {
          td.textContent = '⭐';
        }
      } else if (isRobot) {
        td.classList.add('robot-cell');
        td.appendChild(renderRobotElement(robot.direction));
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
