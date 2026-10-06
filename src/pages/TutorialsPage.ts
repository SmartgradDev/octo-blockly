/**
 * pages/TutorialsPage.ts — Tutorials & Curriculum Guides Page
 */

import {Page, RouteContext} from '../router/types';
import octopusIcon from '../assets/octopus-icon.png';

export class TutorialsPage implements Page {
  private container: HTMLElement | null = null;

  public mount(container: HTMLElement, _context: RouteContext): void {
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
            <a href="/tutorials" class="top-nav-link active">Tutorials</a>
          </nav>

          <div class="top-actions">
            <a href="/play" class="top-action-btn btn-primary" title="Launch Robotics Simulator">
              <span class="btn-icon">▶</span> <span>Simulator</span>
            </a>
          </div>
        </header>

        <!-- Main Tutorials Container -->
        <main class="tutorials-container">
          <div class="tutorials-header">
            <h1 class="tutorials-title">Robotics Programming Tutorials</h1>
            <p class="tutorials-subtitle">
              Learn the foundational principles of autonomous rover navigation and algorithmic thinking.
            </p>
          </div>

          <div class="tutorials-list">
            <article class="tutorial-card">
              <div class="tutorial-badge">MODULE 01</div>
              <h2 class="tutorial-heading">Rover Locomotion & Heading</h2>
              <p class="tutorial-text">
                Robots move in continuous 2D space. The <code>move_forward</code> command translates the rover along its current heading vector, while <code>turn_left</code> and <code>turn_right</code> rotate the vehicle by 90°.
              </p>
              <div class="tutorial-code-snippet">
                <code>forward(); // 65px advance along heading</code><br/>
                <code>turn_right(); // 90° clockwise angular pivot</code>
              </div>
            </article>

            <article class="tutorial-card">
              <div class="tutorial-badge">MODULE 02</div>
              <h2 class="tutorial-heading">Continuous Swept Collisions</h2>
              <p class="tutorial-text">
                The continuous physics engine uses swept circular anti-tunneling. If an obstacle lies ahead, the robot halts safely at the earliest collision perimeter without clipping into solid buildings or trees.
              </p>
            </article>

            <article class="tutorial-card">
              <div class="tutorial-badge">MODULE 03</div>
              <h2 class="tutorial-heading">Mission Objectives & Sorting</h2>
              <p class="tutorial-text">
                Collect target gems and healthy apples while avoiding high-fat obstacles. Program conditional checks to inspect path safety and battery conservation.
              </p>
            </article>
          </div>

          <div class="tutorials-cta">
            <a href="/play" class="hero-btn-primary">
              <span>🚀 Launch Simulator & Practice</span>
              <span class="btn-arrow">➔</span>
            </a>
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
