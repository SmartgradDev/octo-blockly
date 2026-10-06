/**
 * pages/HomePage.ts — Home Landing Page for OctoBlockly
 */

import {Page, RouteContext} from '../router/types';
import octopusIcon from '../assets/octopus-icon.png';

export class HomePage implements Page {
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
            <a href="/" class="top-nav-link active">Home</a>
            <a href="/play" class="top-nav-link">Simulator</a>
            <a href="/tutorials" class="top-nav-link">Tutorials</a>
          </nav>

          <div class="top-actions">
            <a href="/play" class="top-action-btn btn-primary" title="Launch Robotics Simulator">
              <span class="btn-icon">▶</span> <span>Launch Simulator</span>
            </a>
          </div>
        </header>

        <!-- Main Home Hero & Showcase Content -->
        <main class="home-hero-container">
          <section class="home-hero-banner">
            <div class="hero-badge">
              <span class="pulse-dot"></span>
              <span>CONTINUOUS WORLD ROBOTICS PLATFORM</span>
            </div>
            <h1 class="hero-headline">Program. Simulate. Explore.</h1>
            <p class="hero-subheadline">
              Master autonomous robotics algorithms with Blockly visual programming and an authoritative continuous physics simulation engine.
            </p>
            <div class="hero-cta-group">
              <a href="/play" class="hero-btn-primary">
                <span>🚀 Launch Simulator</span>
                <span class="btn-arrow">➔</span>
              </a>
              <a href="/tutorials" class="hero-btn-secondary">
                <span>📖 Explore Tutorials</span>
              </a>
            </div>
          </section>

          <!-- Feature Pillars Grid -->
          <section class="home-features-grid">
            <article class="feature-card">
              <div class="feature-icon">🧩</div>
              <h3 class="feature-title">Blockly Visual Logic</h3>
              <p class="feature-desc">
                Construct autonomous behaviors with drag-and-drop programming blocks that compile deterministically to clean JavaScript ASTs.
              </p>
            </article>

            <article class="feature-card">
              <div class="feature-icon">🚗</div>
              <h3 class="feature-title">Continuous World Physics</h3>
              <p class="feature-desc">
                Explore continuous 2D space with true circular collision footprints, continuous swept collision detection, and anti-tunneling physics.
              </p>
            </article>

            <article class="feature-card">
              <div class="feature-icon">🎯</div>
              <h3 class="feature-title">Mission-Driven Challenges</h3>
              <p class="feature-desc">
                Collect gems, avoid hazardous obstacles, follow designated road networks, and optimize your algorithms for session high scores.
              </p>
            </article>
          </section>
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

