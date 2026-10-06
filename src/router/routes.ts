/**
 * router/routes.ts — Application Route Definitions
 *
 * Configures the central routes for OctoBlockly SPA:
 * - /         -> HomePage (Landing, features, overview)
 * - /play     -> PlayPage (Canonical Step 2 Continuous World Robotics Simulator)
 * - /tutorials-> TutorialsPage (Curriculum & robotics concepts)
 * - *         -> NotFoundPage (404 Sensor Off-Grid fallback)
 */

import {RouteDefinition} from './types';
import {HomePage} from '../pages/HomePage';
import {PlayPage} from '../pages/PlayPage';
import {TutorialsPage} from '../pages/TutorialsPage';
import {NotFoundPage} from '../pages/NotFoundPage';

export const routes: RouteDefinition[] = [
  {
    path: '/',
    title: 'OctoBlockly — Educational Robotics Studio',
    component: HomePage,
  },
  {
    path: '/play',
    title: 'OctoBlockly — Robotics Simulator',
    component: PlayPage,
  },
  {
    path: '/tutorials',
    title: 'OctoBlockly — Tutorials & Guides',
    component: TutorialsPage,
  },
  {
    path: '*',
    title: 'OctoBlockly — 404 Waypoint Not Found',
    component: NotFoundPage,
  },
];
