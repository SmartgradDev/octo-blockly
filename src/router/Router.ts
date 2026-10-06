/**
 * router/Router.ts — Lightweight Native History API Client-Side Router
 *
 * Responsibilities:
 * - Native History API navigation (pushState, replaceState, popstate).
 * - Centralized route matching with exact, dynamic (:param), and wildcard (*) routes.
 * - Full page lifecycle management (mount, unmount) to prevent memory leaks and
 *   duplicate Phaser/Blockly instances.
 * - Global internal link interception (<a href="/play">).
 * - Zero external framework dependencies.
 */

import {
  RouteDefinition,
  RouteContext,
  RouteParams,
  Page,
  PageConstructor,
  RouteChangeCallback,
} from './types';

export class Router {
  private routes: RouteDefinition[] = [];
  private container: HTMLElement;
  private currentContext: RouteContext | null = null;
  private currentPage: Page | null = null;
  private listeners: Set<RouteChangeCallback> = new Set();
  private isTransitioning: boolean = false;
  private pendingNavigation: string | null = null;

  constructor(routes: RouteDefinition[], container: HTMLElement) {
    this.routes = routes;
    this.container = container;

    this.handlePopState = this.handlePopState.bind(this);
    this.handleLinkClick = this.handleLinkClick.bind(this);
  }

  /**
   * Initializes the router, attaches listeners, and mounts initial route.
   */
  public async init(): Promise<void> {
    window.addEventListener('popstate', this.handlePopState);
    document.addEventListener('click', this.handleLinkClick);

    // Initial navigation based on current browser URL
    const initialUrl = window.location.pathname + window.location.search + window.location.hash;
    await this.resolve(initialUrl, false);
  }

  /**
   * Destroys router listeners and unmounts current page.
   */
  public async destroy(): Promise<void> {
    window.removeEventListener('popstate', this.handlePopState);
    document.removeEventListener('click', this.handleLinkClick);

    if (this.currentPage) {
      try {
        await this.currentPage.unmount();
      } catch (err) {
        console.warn('[Router] Error during unmount:', err);
      }
      this.currentPage = null;
    }
    this.container.innerHTML = '';
    this.listeners.clear();
  }

  /**
   * Programmatic navigation: pushes a new entry onto browser history.
   */
  public async navigate(url: string, state: any = null): Promise<void> {
    const current = this.currentContext
      ? this.currentContext.pathname + this.currentContext.search + this.currentContext.hash
      : '';
    if (url === current) {
      return;
    }
    window.history.pushState(state, '', url);
    await this.resolve(url, true, state);
  }

  /**
   * Programmatic replace: replaces the current history entry.
   */
  public async replace(url: string, state: any = null): Promise<void> {
    window.history.replaceState(state, '', url);
    await this.resolve(url, true, state);
  }

  /**
   * Go back in browser history.
   */
  public back(): void {
    window.history.back();
  }

  /**
   * Go forward in browser history.
   */
  public forward(): void {
    window.history.forward();
  }

  /**
   * Returns current active route context.
   */
  public currentRoute(): RouteContext | null {
    return this.currentContext;
  }

  /**
   * Registers a callback for route change events. Returns unregister function.
   */
  public onRouteChange(callback: RouteChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Core routing resolver: parses URL, matches route, unmounts previous page, mounts new page.
   */
  private async resolve(url: string, pushNav: boolean = true, state: any = null): Promise<void> {
    if (this.isTransitioning) {
      this.pendingNavigation = url;
      return;
    }

    this.isTransitioning = true;
    try {
      const parsed = this.parseUrl(url);
      const matched = this.matchRoute(parsed.pathname);

      if (!matched) {
        console.error(`[Router] No route matched for ${parsed.pathname}`);
        return;
      }

      const {route, params} = matched;
      const prevContext = this.currentContext;
      const nextContext: RouteContext = {
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        query: parsed.query,
        params,
        state: state || window.history.state,
      };

      // 1. Unmount current page if active
      if (this.currentPage) {
        try {
          await this.currentPage.unmount();
        } catch (err) {
          console.error('[Router] Error during unmount of previous page:', err);
        }
        this.currentPage = null;
      }

      // Clean container DOM
      this.container.innerHTML = '';

      // Update document title if specified
      if (route.title) {
        document.title = route.title;
      }

      // 2. Instantiate and mount target page
      let pageInstance: Page;
      if (typeof route.component === 'function') {
        // Constructor vs Factory
        try {
          pageInstance = new (route.component as PageConstructor)();
        } catch {
          pageInstance = await (route.component as () => Promise<Page> | Page)();
        }
      } else {
        pageInstance = route.component;
      }

      this.currentPage = pageInstance;
      this.currentContext = nextContext;

      await pageInstance.mount(this.container, nextContext);

      // Notify route change listeners
      for (const cb of this.listeners) {
        try {
          cb(nextContext, prevContext);
        } catch (e) {
          console.warn('[Router] Error in route change listener:', e);
        }
      }
    } finally {
      this.isTransitioning = false;
      if (this.pendingNavigation) {
        const next = this.pendingNavigation;
        this.pendingNavigation = null;
        await this.resolve(next, pushNav);
      }
    }
  }

  private handlePopState(e: PopStateEvent): void {
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    this.resolve(currentUrl, false, e.state);
  }

  /**
   * Intercepts standard HTML link clicks for client-side navigation.
   */
  private handleLinkClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;

    // Check if target is not self
    const target = anchor.getAttribute('target');
    if (target && target !== '_self') return;

    // Ignore downloads or explicit opt-outs
    if (anchor.hasAttribute('download') || anchor.getAttribute('rel') === 'external' || anchor.hasAttribute('data-no-route')) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
      return;
    }

    // Check same-origin
    const origin = window.location.origin;
    if (anchor.origin !== origin && !href.startsWith('/')) {
      return;
    }

    e.preventDefault();
    const targetUrl = anchor.pathname + anchor.search + anchor.hash;
    this.navigate(targetUrl);
  }

  /**
   * Normalizes and parses URL parts and query parameters.
   */
  private parseUrl(url: string): {
    pathname: string;
    search: string;
    hash: string;
    query: Record<string, string>;
  } {
    // Handle relative paths
    const parser = document.createElement('a');
    parser.href = url.startsWith('/') ? window.location.origin + url : url;

    let pathname = parser.pathname || '/';
    // Normalize trailing slash (e.g. /play/ -> /play, except root /)
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    const query: Record<string, string> = {};
    if (parser.search && parser.search.length > 1) {
      const searchParams = new URLSearchParams(parser.search);
      searchParams.forEach((val, key) => {
        query[key] = val;
      });
    }

    return {
      pathname,
      search: parser.search || '',
      hash: parser.hash || '',
      query,
    };
  }

  /**
   * Matches pathname against route definitions (exact, parameterized, wildcard).
   */
  private matchRoute(pathname: string): {route: RouteDefinition; params: RouteParams} | null {
    // 1. Try exact and parameterized routes
    for (const route of this.routes) {
      if (route.path === '*') continue;

      const params = this.matchPattern(route.path, pathname);
      if (params !== null) {
        return {route, params};
      }
    }

    // 2. Try wildcard fallback route (*)
    const fallback = this.routes.find((r) => r.path === '*');
    if (fallback) {
      return {route: fallback, params: {}};
    }

    return null;
  }

  /**
   * Matches route pattern with optional :param tokens.
   */
  private matchPattern(pattern: string, pathname: string): RouteParams | null {
    // Exact match
    if (pattern === pathname) {
      return {};
    }

    // Dynamic :param pattern matching
    if (pattern.includes(':')) {
      const patternParts = pattern.split('/').filter(Boolean);
      const pathParts = pathname.split('/').filter(Boolean);

      if (patternParts.length !== pathParts.length) {
        return null;
      }

      const params: RouteParams = {};
      for (let i = 0; i < patternParts.length; i++) {
        const pPart = patternParts[i];
        const uPart = pathParts[i];

        if (pPart.startsWith(':')) {
          const paramName = pPart.slice(1);
          params[paramName] = decodeURIComponent(uPart);
        } else if (pPart !== uPart) {
          return null;
        }
      }
      return params;
    }

    return null;
  }
}
