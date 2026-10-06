/**
 * pages/NotFoundPage.ts — 404 Unknown Route Fallback Page
 */

import {Page, RouteContext} from '../router/types';
import octopusIcon from '../assets/octopus-icon.png';

export class NotFoundPage implements Page {
  private container: HTMLElement | null = null;

  public mount(container: HTMLElement, context: RouteContext): void {
    this.container = container;

    container.innerHTML = `
      <div class="home-page-layout">
        <!-- Top Navigation Header -->
        <header class="app-topbar">
          <div class="app-branding">
            <div class="app-logo-badge">
              <img src="${octopusIcon}" alt="Octo" class="app-logo-img" />
            </div>
            <div class="app-title-group">
              <h1 class="app-title">OctoBlockly</h1>
              <span class="app-subtitle">Robotics Studio</span>
            </div>
          </div>

          <nav class="top-nav-links">
            <a href="/" class="top-nav-link">Home</a>
            <a href="/play" class="top-nav-link">Simulator</a>
            <a href="/tutorials" class="top-nav-link">Tutorials</a>
          </nav>
        </header>

        <!-- 404 Alert Banner -->
        <main class="not-found-container">
          <div class="not-found-card">
            <div class="not-found-badge">404 // SENSOR OFF-GRID</div>
            <h1 class="not-found-title">Waypoint Not Found</h1>
            <p class="not-found-desc">
              The requested route <code class="not-found-path">${context.pathname}</code> does not exist in the simulation database.
            </p>
            <div class="not-found-actions">
              <a href="/" class="hero-btn-secondary">
                <span>⬅ Return Home</span>
              </a>
              <a href="/play" class="hero-btn-primary">
                <span>🚀 Launch Simulator</span>
              </a>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  public unmount(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
