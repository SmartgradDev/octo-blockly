/**
 * index.ts — Application Entry Point & SPA Router Bootstrap
 */

import {Router} from './router/Router';
import {routes} from './router/routes';
import './index.css';

// Ensure application root mount container exists
let appContainer = document.getElementById('app');
if (!appContainer) {
  appContainer = document.createElement('div');
  appContainer.id = 'app';
  document.body.appendChild(appContainer);
}

// Instantiate and initialize global router
const router = new Router(routes, appContainer);

// Attach global instance for debugging / programmatic navigation
if (typeof window !== 'undefined') {
  (window as any).__router = router;
}

// Launch client-side routing on page load
window.addEventListener('DOMContentLoaded', () => {
  router.init().catch((err) => {
    console.error('[App] Failed to initialize router:', err);
  });
});
