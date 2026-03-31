export type ExtractMode = "text" | "markdown" | "links" | "forms";

export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  text?: string;
  value?: string;
  disabled?: boolean;
}

export interface OpenParams {
  url: string;
  sessionId?: string;
  headed?: boolean;
}

export interface OpenResult {
  sessionId: string;
  url: string;
  title: string;
  headed: boolean;
}

export interface SnapshotParams {
  sessionId?: string;
}

export interface SnapshotResult {
  sessionId: string;
  snapshotId: string;
  url: string;
  title: string;
  elements: SnapshotElement[];
}

export interface ElementActionParams {
  sessionId?: string;
  snapshotId: string;
  ref: string;
}

export interface FillParams extends ElementActionParams {
  text: string;
}

export interface SelectParams extends ElementActionParams {
  value: string;
}

export interface WaitParams {
  sessionId?: string;
  text?: string;
  urlIncludes?: string;
  ms?: number;
}

export interface WaitResult {
  sessionId: string;
  url: string;
  title: string;
}

export interface ExtractParams {
  sessionId?: string;
  mode: ExtractMode;
}

export interface ExtractLink {
  text: string;
  href: string;
}

export interface ExtractFormField {
  name: string;
  type: string;
  value?: string;
  disabled?: boolean;
}

export interface ExtractResult {
  sessionId: string;
  url: string;
  title: string;
  mode: ExtractMode;
  content: string;
  links?: ExtractLink[];
  forms?: ExtractFormField[];
}

export interface ScreenshotParams {
  sessionId?: string;
  path?: string;
  fullPage?: boolean;
}

export interface ScreenshotResult {
  sessionId: string;
  path: string;
}

export interface CloseParams {
  sessionId?: string;
}

export interface CloseResult {
  sessionId: string;
  closed: boolean;
}

export interface RpcRequest<T = unknown> {
  action: string;
  params?: T;
}

export interface RpcSuccess<T> {
  ok: true;
  data: T;
}

export interface RpcFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type RpcResponse<T> = RpcSuccess<T> | RpcFailure;
