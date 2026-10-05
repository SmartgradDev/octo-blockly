/**
 * WorldPresets.ts — Demo world map configurations for Step 2.
 *
 * Implements "Campus Town", the first demonstration continuous world.
 * Features:
 * - Green campus terrain
 * - Horizontal main boulevard + Vertical cross street + Central intersection
 * - Sidewalks and white crosswalk dashes
 * - 4 distinct architectural buildings (Robotics Lab, Science Hall, Student Union, Library)
 * - Shaded trees and small campus park
 * - Clearly marked Goal objective and spawn point
 */

import {WorldMapData} from './WorldData';

export const CAMPUS_TOWN_MAP: WorldMapData = {
  id: 'campus_town',
  name: 'Campus Town',
  description: 'A vibrant educational robotics campus with roads, buildings, and parks.',
  bounds: {
    width: 800,
    height: 600,
  },
  groundColor: 0x86efac, // Vibrant campus lawn green

  // Roads: Structured continuous centerlines, explicit widths, and topology
  roads: [
    // Main horizontal boulevard across middle (centerline Y = 300)
    {
      id: 'campus-way',
      name: 'Campus Way',
      type: 'main-road',
      start: {x: 0, y: 300},
      end: {x: 800, y: 300},
      width: 80,
      hasSidewalk: true,
      sidewalkWidth: 10,
      dashedLaneMarking: true,
      connectedIntersectionIds: ['campus-square-crossing'],
    },
    // Vertical avenue crossing through (centerline X = 400)
    {
      id: 'octo-boulevard',
      name: 'Octo Boulevard',
      type: 'avenue',
      start: {x: 400, y: 0},
      end: {x: 400, y: 600},
      width: 80,
      hasSidewalk: true,
      sidewalkWidth: 10,
      dashedLaneMarking: true,
      connectedIntersectionIds: ['campus-square-crossing'],
    },
  ],

  // Intersections: Explicit topological junction data connecting roads
  intersections: [
    {
      id: 'campus-square-crossing',
      name: 'Campus Square Crossing',
      center: {x: 400, y: 300},
      width: 80,
      height: 80,
      connectedRoadIds: ['campus-way', 'octo-boulevard'],
    },
  ],

  // Crosswalk markings at the four entrances to the intersection
  crosswalks: [
    // West approach crosswalk
    {x: 342, y: 262, width: 14, height: 76, orientation: 'VERTICAL'},
    // East approach crosswalk
    {x: 444, y: 262, width: 14, height: 76, orientation: 'VERTICAL'},
    // North approach crosswalk
    {x: 362, y: 242, width: 76, height: 14, orientation: 'HORIZONTAL'},
    // South approach crosswalk
    {x: 362, y: 344, width: 76, height: 14, orientation: 'HORIZONTAL'},
  ],

  // Architectural Buildings with 2.5D top-down perspective
  buildings: [
    // Top-Left: Robotics Innovation Lab
    {
      id: 'building_robotics_lab',
      name: 'Robotics Innovation Lab',
      label: 'Robotics Lab',
      x: 60,
      y: 50,
      width: 220,
      height: 140,
      roofColor: 0x3b82f6,  // High-tech cobalt blue
      wallColor: 0x1d4ed8,
      accentColor: 0x93c5fd,
      windowCols: 4,
      windowRows: 2,
    },
    // Top-Right: Science & Engineering Hall
    {
      id: 'building_science_hall',
      name: 'Science & Computing Hall',
      label: 'Science Hall',
      x: 520,
      y: 50,
      width: 210,
      height: 150,
      roofColor: 0x8b5cf6,  // Creative purple
      wallColor: 0x6d28d9,
      accentColor: 0xc4b5fd,
      windowCols: 3,
      windowRows: 2,
    },
    // Bottom-Left: Student Hub & Commons
    {
      id: 'building_student_hub',
      name: 'Student Tech Hub',
      label: 'Student Hub',
      x: 70,
      y: 400,
      width: 210,
      height: 130,
      roofColor: 0xf59e0b,  // Warm amber
      wallColor: 0xb45309,
      accentColor: 0xfde68a,
      windowCols: 3,
      windowRows: 2,
    },
    // Bottom-Right: Discovery Library
    {
      id: 'building_library',
      name: 'Discovery Library',
      label: 'Library',
      x: 540,
      y: 410,
      width: 190,
      height: 130,
      roofColor: 0x10b981,  // Scholarly emerald
      wallColor: 0x047857,
      accentColor: 0xa7f3d0,
      windowCols: 3,
      windowRows: 2,
    },
  ],

  // Small Campus Botanical Park
  parks: [
    {
      id: 'park_botanical',
      name: 'Meadow Commons Park',
      x: 480,
      y: 220,
      width: 180,
      height: 120,
      grassColor: 0x4ade80, // Lush manicured grass
    },
  ],

  // Trees with shaded foliage canopies
  trees: [
    // Around Robotics Lab
    {id: 'tree_1', x: 310, y: 80, canopyRadius: 18},
    {id: 'tree_2', x: 310, y: 150, canopyRadius: 22},
    {id: 'tree_3', x: 40, y: 220, canopyRadius: 16},

    // Around Science Hall
    {id: 'tree_4', x: 470, y: 70, canopyRadius: 20},
    {id: 'tree_5', x: 480, y: 140, canopyRadius: 18},

    // In Meadow Park & Boulevard borders
    {id: 'tree_6', x: 500, y: 240, canopyRadius: 17},
    {id: 'tree_7', x: 570, y: 250, canopyRadius: 22},
    {id: 'tree_8', x: 630, y: 235, canopyRadius: 18},

    // Around Student Hub
    {id: 'tree_9', x: 310, y: 440, canopyRadius: 20},
    {id: 'tree_10', x: 310, y: 520, canopyRadius: 18},

    // Around Library
    {id: 'tree_11', x: 480, y: 460, canopyRadius: 22},
    {id: 'tree_12', x: 480, y: 530, canopyRadius: 18},
  ],

  // Goal objective and initial robot spawn
  objectives: [
    {
      id: 'obj_goal_main',
      name: 'Science Plaza Goal',
      type: 'GOAL',
      position: {x: 640, y: 300}, // On the east boulevard in front of the park/library
      radius: 26,
      color: 0xfacc15,             // Gold star yellow
      iconSymbol: '⭐',
    },
  ],

  spawnPoint: {
    position: {x: 120, y: 300},    // Start on the west lane of Campus Way
    rotation: 0,                   // Heading East (+X)
  },
};
