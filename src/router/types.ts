/**
 * router/types.ts — Lightweight Client-Side Router Type Definitions
 */

export interface RouteParams {
  [key: string]: string;
}

export interface RouteContext {
  pathname: string;
  search: string;
  hash: string;
  query: Record<string, string>;
  params: RouteParams;
  state?: any;
}

export interface Page {
  mount(container: HTMLElement, context: RouteContext): Promise<void> | void;
  unmount(): Promise<void> | void;
}

export type PageConstructor = new () => Page;
export type PageFactory = () => Page | Promise<Page>;

export interface RouteDefinition {
  /** Path pattern (e.g. '/', '/play', '/tutorials', '/challenge/:id', '*') */
  path: string;
  /** Component constructor or factory */
  component: PageConstructor | PageFactory;
  /** Optional document title */
  title?: string;
}

export type RouteChangeCallback = (to: RouteContext, from: RouteContext | null) => void;
