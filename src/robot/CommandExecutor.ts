/**
 * CommandExecutor — AST Interpreter & Robot Command Execution Engine
 *
 * Dynamically interprets Blockly block structures (including loops and IF/ELSE conditionals)
 * at runtime without using eval() or new Function().
 * Supports dynamic sensor evaluation, obstacle collision checking, and max command limits.
 *
 * No DOM dependencies — this is pure logic.
 */

import * as Blockly from 'blockly/core';
import {Direction, GridConfig, RobotCommand, RobotState} from './RobotState';
import {Position, ColoredCell, CellColor, LineSensorResult} from './Mission';
import {
  isBlocked,
  isObstacleAhead,
  distanceAhead,
  colorUnderRobot,
  lineSensor,
  directionDelta,
} from './SensorSystem';

export {isBlocked, isObstacleAhead, distanceAhead, colorUnderRobot, lineSensor};

/** Map from Blockly block type to RobotCommand. */
const BLOCK_TO_COMMAND: Record<string, RobotCommand> = {
  octo_move_forward: 'MOVE_FORWARD',
  octo_move_backward: 'MOVE_BACKWARD',
  octo_turn_left: 'TURN_LEFT',
  octo_turn_right: 'TURN_RIGHT',
};

export const MAX_COMMANDS_LIMIT = 500;
export const MAX_CALL_DEPTH_LIMIT = 50;

export interface StepResult {
  command: RobotCommand | null;
  done: boolean;
  limitExceeded: boolean;
  error?: string;
}

interface StackFrame {
  block: Blockly.Block | null;
  repeatCount?: number;
  currentIteration?: number;
  bodyBlock?: Blockly.Block | null;
  functionName?: string;
  localVariables?: Map<string, number>;
}

interface ProcedureDef {
  name: string;
  params: string[];
  bodyBlock: Blockly.Block | null;
}

/**
 * Safely extract parameter names from a Blockly procedure definition block.
 */
export function getProcedureParams(block: Blockly.Block): string[] {
  if (typeof (block as any).getVars === 'function') {
    const vars = (block as any).getVars();
    if (Array.isArray(vars)) return vars;
  }
  if (Array.isArray((block as any).arguments_)) {
    return (block as any).arguments_;
  }
  if (typeof (block as any).getProcedureModel === 'function') {
    const model = (block as any).getProcedureModel();
    if (model && typeof model.getParameters === 'function') {
      const params = model.getParameters();
      if (Array.isArray(params)) {
        return params.map((p: any) =>
          typeof p === 'string' ? p : p.name || p.name_,
        );
      }
    }
  }
  const params: string[] = [];
  let i = 0;
  while (true) {
    const varName = block.getFieldValue(`VAR${i}`);
    if (!varName) break;
    params.push(varName);
    i++;
  }
  return params;
}

/**
 * Get connected target block for a function call argument by index or parameter name.
 */
function getCallArgumentBlock(
  callBlock: Blockly.Block,
  index: number,
  paramName: string,
): Blockly.Block | null {
  let inputBlock = callBlock.getInputTargetBlock(`ARG${index}`);
  if (inputBlock) return inputBlock;

  inputBlock = callBlock.getInputTargetBlock(paramName);
  if (inputBlock) return inputBlock;

  const valueInputs = callBlock.inputList.filter(
    (input) => (input as any).type === 1 || input.connection !== null,
  );
  if (valueInputs[index]) {
    return valueInputs[index].connection?.targetBlock() || null;
  }

  return null;
}

/**
 * ProgramInterpreter — Step-by-step AST Interpreter for Blockly robot programs.
 * Evaluates conditions dynamically at runtime against current robot state.
 * Supports loops, IF/ELSE conditionals, variables, procedure/function calls, parameters, and virtual sensors.
 */
export class ProgramInterpreter {
  private stack: StackFrame[] = [];
  private robot: RobotState;
  private grid: GridConfig;
  private obstacles?: Position[];
  private cellColors?: ColoredCell[];
  private lines?: Position[];
  private commandCount: number = 0;
  private maxCommands: number;
  private maxCallDepth: number;
  private variables: Map<string, number> = new Map();
  private functions: Map<string, ProcedureDef> = new Map();

  constructor(
    workspace: Blockly.Workspace,
    robot: RobotState,
    grid: GridConfig,
    obstacles?: Position[],
    cellColors?: ColoredCell[],
    lines?: Position[],
    maxCommands: number = MAX_COMMANDS_LIMIT,
    maxCallDepth: number = MAX_CALL_DEPTH_LIMIT,
  ) {
    this.robot = robot;
    this.grid = grid;
    this.obstacles = obstacles;
    this.cellColors = cellColors;
    this.lines = lines;
    this.maxCommands = maxCommands;
    this.maxCallDepth = maxCallDepth;

    // 1. Register procedure definitions across workspace
    const allBlocks = workspace.getAllBlocks(false);
    for (const block of allBlocks) {
      if (
        block.type === 'procedures_defnoreturn' ||
        block.type === 'procedures_defreturn'
      ) {
        const name = block.getFieldValue('NAME');
        const params = getProcedureParams(block);
        const bodyBlock = block.getInputTargetBlock('STACK');
        if (name) {
          this.functions.set(name, {name, params, bodyBlock});
        }
      }
    }

    // 2. Push top blocks (excluding procedure definitions) in reverse order
    const topBlocks = workspace.getTopBlocks(true);
    for (let i = topBlocks.length - 1; i >= 0; i--) {
      const block = topBlocks[i];
      if (
        block.type !== 'procedures_defnoreturn' &&
        block.type !== 'procedures_defreturn'
      ) {
        this.stack.push({block});
      }
    }
  }

  public isDone(): boolean {
    return this.stack.length === 0;
  }

  public getExecutedCommandCount(): number {
    return this.commandCount;
  }

  private getCallDepth(): number {
    let depth = 0;
    for (const frame of this.stack) {
      if (frame.functionName !== undefined) {
        depth++;
      }
    }
    return depth;
  }

  /**
   * Advance the interpreter by one step.
   * Returns a RobotCommand if an action block was reached, or command: null if a control block was evaluated.
   */
  public step(): StepResult {
    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1];

      if (!frame.block) {
        // Frame statement chain is finished
        if (
          frame.repeatCount !== undefined &&
          frame.currentIteration !== undefined
        ) {
          frame.currentIteration++;
          if (frame.currentIteration < frame.repeatCount) {
            // Restart loop body for next iteration
            frame.block = frame.bodyBlock || null;
            continue;
          }
        }
        // Pop finished frame
        this.stack.pop();
        continue;
      }

      const currentBlock = frame.block;
      // Advance frame pointer to next block in current chain
      frame.block = currentBlock.getNextBlock();

      const type = currentBlock.type;

      if (type in BLOCK_TO_COMMAND) {
        if (this.commandCount >= this.maxCommands) {
          return {
            command: null,
            done: true,
            limitExceeded: true,
            error: '⚠️ Program limit exceeded! Maximum 500 robot commands per run.',
          };
        }
        this.commandCount++;
        return {
          command: BLOCK_TO_COMMAND[type],
          done: false,
          limitExceeded: false,
        };
      } else if (type === 'octo_set_motor_speed') {
        const speedBlock = currentBlock.getInputTargetBlock('SPEED');
        const speedVal = evaluateNumericValue(
          speedBlock,
          this.variables,
          this.stack,
          this.robot,
          this.grid,
          this.obstacles,
        );
        this.robot.motorSpeed = Math.min(100, Math.max(0, Math.round(speedVal)));
      } else if (type === 'variables_set') {
        const varId = currentBlock.getFieldValue('VAR');
        const varModel = (currentBlock.workspace as any)?.getVariableById?.(varId);
        const varName = varModel?.name || varId;
        const valueBlock = currentBlock.getInputTargetBlock('VALUE');
        const val = evaluateNumericValue(
          valueBlock,
          this.variables,
          this.stack,
          this.robot,
          this.grid,
          this.obstacles,
        );
        const topFrame = this.stack[this.stack.length - 1];
        if (varId && topFrame?.localVariables?.has(varId)) {
          topFrame.localVariables.set(varId, val);
        } else if (varName && topFrame?.localVariables?.has(varName)) {
          topFrame.localVariables.set(varName, val);
        } else if (varId) {
          this.variables.set(varId, val);
        }
      } else if (type === 'math_change') {
        const varId = currentBlock.getFieldValue('VAR');
        const varModel = (currentBlock.workspace as any)?.getVariableById?.(varId);
        const varName = varModel?.name || varId;
        const deltaBlock = currentBlock.getInputTargetBlock('DELTA');
        const delta = evaluateNumericValue(
          deltaBlock,
          this.variables,
          this.stack,
          this.robot,
          this.grid,
          this.obstacles,
        );
        const topFrame = this.stack[this.stack.length - 1];
        let isLocal = false;
        if (varId && topFrame?.localVariables?.has(varId)) {
          const current = topFrame.localVariables.get(varId)!;
          topFrame.localVariables.set(varId, current + delta);
          isLocal = true;
        } else if (varName && topFrame?.localVariables?.has(varName)) {
          const current = topFrame.localVariables.get(varName)!;
          topFrame.localVariables.set(varName, current + delta);
          isLocal = true;
        }
        if (!isLocal && varId) {
          const current = this.variables.get(varId) ?? 0;
          this.variables.set(varId, current + delta);
        }
      } else if (type === 'controls_repeat_ext' || type === 'controls_repeat') {
        const repeatCount = getRepeatCount(
          currentBlock,
          this.variables,
          this.stack,
          this.robot,
          this.grid,
          this.obstacles,
        );
        const bodyBlock = currentBlock.getInputTargetBlock('DO');
        if (repeatCount > 0 && bodyBlock) {
          this.stack.push({
            block: bodyBlock,
            bodyBlock: bodyBlock,
            repeatCount,
            currentIteration: 0,
          });
        }
      } else if (type === 'controls_if') {
        const branchBlock = getIfBranch(
          currentBlock,
          this.robot,
          this.grid,
          this.obstacles,
          this.cellColors,
          this.lines,
          this.variables,
          this.stack,
        );
        if (branchBlock) {
          this.stack.push({block: branchBlock});
        }
      } else if (
        type === 'procedures_callnoreturn' ||
        type === 'procedures_callreturn'
      ) {
        const procName =
          currentBlock.getFieldValue('NAME') ||
          (currentBlock as any).getProcedureCall?.();
        if (procName && this.functions.has(procName)) {
          const currentCallDepth = this.getCallDepth();
          if (currentCallDepth >= this.maxCallDepth) {
            return {
              command: null,
              done: true,
              limitExceeded: true,
              error: '⚠️ Maximum recursion depth exceeded!',
            };
          }

          const procDef = this.functions.get(procName);
          const bodyBlock = procDef?.bodyBlock ?? null;
          const localVariables = new Map<string, number>();

          if (procDef && procDef.params.length > 0) {
            procDef.params.forEach((paramName, idx) => {
              const argBlock = getCallArgumentBlock(
                currentBlock,
                idx,
                paramName,
              );
              const argVal = evaluateNumericValue(
                argBlock,
                this.variables,
                this.stack,
                this.robot,
                this.grid,
                this.obstacles,
              );
              const sanitizedVal =
                isNaN(argVal) || !isFinite(argVal) ? 0 : argVal;
              localVariables.set(paramName, sanitizedVal);

              const ws = currentBlock.workspace as any;
              if (ws && typeof ws.getAllVariables === 'function') {
                const vars: any[] = ws.getAllVariables();
                const matchedVar = vars.find((v: any) => v.name === paramName);
                if (matchedVar && typeof matchedVar.getId === 'function') {
                  localVariables.set(matchedVar.getId(), sanitizedVal);
                }
              }
            });
          }

          if (bodyBlock) {
            this.stack.push({
              block: bodyBlock,
              functionName: procName,
              localVariables,
            });
          }
        }
      }
    }

    return {command: null, done: true, limitExceeded: false};
  }
}

/**
 * Safely evaluate a block into a numeric value.
 */
export function evaluateNumericValue(
  block: Blockly.Block | null,
  variables: Map<string, number>,
  stack?: StackFrame[],
  robot?: RobotState,
  grid?: GridConfig,
  obstacles?: Position[],
): number {
  if (!block) return 0;

  let result = 0;
  switch (block.type) {
    case 'octo_distance_ahead': {
      if (robot && grid) {
        result = distanceAhead(robot, grid, obstacles);
      }
      break;
    }
    case 'math_number': {
      const val = Number(block.getFieldValue('NUM'));
      result = isNaN(val) ? 0 : val;
      break;
    }
    case 'variables_get': {
      const varId = block.getFieldValue('VAR');
      const varModel = (block.workspace as any)?.getVariableById?.(varId);
      const varName = varModel?.name || varId;

      let found = false;
      let val = 0;
      if (stack) {
        for (let i = stack.length - 1; i >= 0; i--) {
          const localVars = stack[i].localVariables;
          if (localVars) {
            if (localVars.has(varId)) {
              val = localVars.get(varId)!;
              found = true;
              break;
            }
            if (localVars.has(varName)) {
              val = localVars.get(varName)!;
              found = true;
              break;
            }
          }
        }
      }

      if (!found) {
        val = variables.get(varId) ?? variables.get(varName) ?? 0;
      }

      result = isNaN(val) || !isFinite(val) ? 0 : val;
      break;
    }
    case 'math_arithmetic': {
      const op = block.getFieldValue('OP');
      const aBlock = block.getInputTargetBlock('A');
      const bBlock = block.getInputTargetBlock('B');
      const valA = evaluateNumericValue(aBlock, variables, stack, robot, grid, obstacles);
      const valB = evaluateNumericValue(bBlock, variables, stack, robot, grid, obstacles);
      switch (op) {
        case 'ADD':
          result = valA + valB;
          break;
        case 'MINUS':
          result = valA - valB;
          break;
        case 'MULTIPLY':
          result = valA * valB;
          break;
        case 'DIVIDE':
          result = valB === 0 ? 0 : valA / valB;
          break;
        case 'POWER':
          result = Math.pow(valA, valB);
          break;
        default:
          result = 0;
      }
      break;
    }
    case 'math_single': {
      const op = block.getFieldValue('OP');
      const numBlock = block.getInputTargetBlock('NUM');
      const val = evaluateNumericValue(numBlock, variables, stack, robot, grid, obstacles);
      switch (op) {
        case 'ROOT':
          result = Math.sqrt(val);
          break;
        case 'ABS':
          result = Math.abs(val);
          break;
        case 'NEG':
          result = -val;
          break;
        case 'LN':
          result = Math.log(val);
          break;
        case 'LOG10':
          result = Math.log10(val);
          break;
        case 'EXP':
          result = Math.exp(val);
          break;
        case 'POW10':
          result = Math.pow(10, val);
          break;
        default:
          result = 0;
      }
      break;
    }
    case 'math_round': {
      const op = block.getFieldValue('OP');
      const numBlock = block.getInputTargetBlock('NUM');
      const val = evaluateNumericValue(numBlock, variables, stack, robot, grid, obstacles);
      switch (op) {
        case 'ROUND':
          result = Math.round(val);
          break;
        case 'ROUNDUP':
          result = Math.ceil(val);
          break;
        case 'ROUNDDOWN':
          result = Math.floor(val);
          break;
        default:
          result = val;
      }
      break;
    }
    case 'math_modulo': {
      const divBlock = block.getInputTargetBlock('DIVIDEND');
      const divisorBlock = block.getInputTargetBlock('DIVISOR');
      const dividend = evaluateNumericValue(divBlock, variables, stack, robot, grid, obstacles);
      const divisor = evaluateNumericValue(divisorBlock, variables, stack, robot, grid, obstacles);
      result = divisor === 0 ? 0 : dividend % divisor;
      break;
    }
    default: {
      const fieldVal = Number(block.getFieldValue('NUM'));
      result = isNaN(fieldVal) ? 0 : fieldVal;
      break;
    }
  }

  if (isNaN(result) || !isFinite(result)) {
    return 0;
  }
  return result;
}

/**
 * Dynamically evaluate an IF condition attached to a controls_if block.
 */
function evaluateCondition(
  condBlock: Blockly.Block | null,
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
  cellColors?: ColoredCell[],
  lines?: Position[],
  variables?: Map<string, number>,
  stack?: StackFrame[],
): boolean {
  if (!condBlock) return false;

  if (condBlock.type === 'octo_obstacle_ahead') {
    return isObstacleAhead(robot, grid, obstacles);
  }

  if (condBlock.type === 'octo_color_is') {
    const targetColor = condBlock.getFieldValue('COLOR');
    return colorUnderRobot(robot, cellColors) === targetColor;
  }

  if (condBlock.type === 'octo_line_sensor') {
    const dir = condBlock.getFieldValue('DIR') as 'CENTER' | 'LEFT' | 'RIGHT';
    const res = lineSensor(robot, grid, lines);
    if (dir === 'LEFT') return res.left;
    if (dir === 'RIGHT') return res.right;
    return res.center;
  }

  if (condBlock.type === 'logic_negate') {
    const innerCond = condBlock.getInputTargetBlock('BOOL');
    return !evaluateCondition(
      innerCond,
      robot,
      grid,
      obstacles,
      cellColors,
      lines,
      variables,
      stack,
    );
  }

  if (condBlock.type === 'logic_boolean') {
    return condBlock.getFieldValue('BOOL') === 'TRUE';
  }

  if (condBlock.type === 'logic_compare') {
    const op = condBlock.getFieldValue('OP');
    const aBlock = condBlock.getInputTargetBlock('A');
    const bBlock = condBlock.getInputTargetBlock('B');
    const vars = variables ?? new Map();
    const valA = evaluateNumericValue(aBlock, vars, stack, robot, grid, obstacles);
    const valB = evaluateNumericValue(bBlock, vars, stack, robot, grid, obstacles);
    switch (op) {
      case 'EQ':
        return valA === valB;
      case 'NEQ':
        return valA !== valB;
      case 'LT':
        return valA < valB;
      case 'LTE':
        return valA <= valB;
      case 'GT':
        return valA > valB;
      case 'GTE':
        return valA >= valB;
      default:
        return false;
    }
  }

  return false;
}

/**
 * Determine which branch of a controls_if block to execute based on runtime condition evaluation.
 */
function getIfBranch(
  ifBlock: Blockly.Block,
  robot: RobotState,
  grid: GridConfig,
  obstacles?: Position[],
  cellColors?: ColoredCell[],
  lines?: Position[],
  variables?: Map<string, number>,
  stack?: StackFrame[],
): Blockly.Block | null {
  let i = 0;
  while (true) {
    const condInput = ifBlock.getInputTargetBlock(`IF${i}`);
    if (!condInput && i > 0) break;
    if (condInput) {
      if (
        evaluateCondition(
          condInput,
          robot,
          grid,
          obstacles,
          cellColors,
          lines,
          variables,
          stack,
        )
      ) {
        return ifBlock.getInputTargetBlock(`DO${i}`);
      }
    } else if (i === 0) {
      break;
    }
    i++;
  }

  return ifBlock.getInputTargetBlock('ELSE');
}

/**
 * Safely extract numeric repeat count from repeat blocks.
 */
function getRepeatCount(
  block: Blockly.Block,
  variables: Map<string, number>,
  stack?: StackFrame[],
  robot?: RobotState,
  grid?: GridConfig,
  obstacles?: Position[],
): number {
  if (block.type === 'controls_repeat') {
    const val = Number(block.getFieldValue('TIMES'));
    return isNaN(val) ? 0 : Math.max(0, Math.floor(val));
  }

  const timesBlock = block.getInputTargetBlock('TIMES');
  if (timesBlock) {
    const val = evaluateNumericValue(timesBlock, variables, stack, robot, grid, obstacles);
    return Math.max(0, Math.floor(val));
  }

  const fieldVal = Number(block.getFieldValue('TIMES'));
  if (!isNaN(fieldVal)) {
    return Math.max(0, Math.floor(fieldVal));
  }

  return 0;
}

/** Result of executing a single command. */
export interface ExecuteResult {
  ok: boolean;
  message: string;
}

/** Clockwise turn order. */
const TURN_ORDER: Direction[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

/**
 * Execute a single command, mutating the given RobotState in place.
 */
export function executeCommand(
  robot: RobotState,
  grid: GridConfig,
  command: RobotCommand,
  obstacles?: Position[],
): ExecuteResult {
  const isMove = command === 'MOVE_FORWARD' || command === 'MOVE_BACKWARD';
  const energyCost = isMove ? 1.0 : 0.5;

  if (robot.battery !== undefined) {
    if (robot.battery <= 0 || robot.battery < energyCost) {
      robot.battery = 0;
      return {ok: false, message: '⚠️ Battery depleted! Robot ran out of energy.'};
    }
    robot.battery = Math.max(0, Math.round((robot.battery - energyCost) * 10) / 10);
  }

  switch (command) {
    case 'MOVE_FORWARD':
      return move(robot, grid, 1, obstacles);
    case 'MOVE_BACKWARD':
      return move(robot, grid, -1, obstacles);
    case 'TURN_LEFT':
      return turn(robot, -1);
    case 'TURN_RIGHT':
      return turn(robot, 1);
  }
}

function move(
  robot: RobotState,
  grid: GridConfig,
  step: number,
  obstacles?: Position[],
): ExecuteResult {
  const delta = directionDelta(robot.direction);
  const newX = robot.x + delta.dx * step;
  const newY = robot.y + delta.dy * step;

  if (newX < 0 || newX >= grid.width || newY < 0 || newY >= grid.height) {
    return {ok: false, message: `Can't move — boundary at (${newX}, ${newY})!`};
  }

  if (isBlocked(newX, newY, obstacles)) {
    return {ok: false, message: `Can't move — obstacle at (${newX}, ${newY})!`};
  }

  robot.x = newX;
  robot.y = newY;
  return {ok: true, message: `Moved to (${robot.x}, ${robot.y})`};
}

function turn(robot: RobotState, dir: 1 | -1): ExecuteResult {
  const idx = TURN_ORDER.indexOf(robot.direction);
  robot.direction = TURN_ORDER[(idx + dir + 4) % 4];
  return {ok: true, message: `Turned to face ${robot.direction}`};
}
