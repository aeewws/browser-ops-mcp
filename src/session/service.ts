import { mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  type CloseParams,
  type CloseResult,
  type ExtractFormField,
  type ExtractLink,
  type ExtractMode,
  type ExtractParams,
  type ExtractResult,
  type FillParams,
  type OpenParams,
  type OpenResult,
  type ScreenshotParams,
  type ScreenshotResult,
  type SelectParams,
  type SnapshotElement,
  type SnapshotParams,
  type SnapshotResult,
  type WaitParams,
  type WaitResult
} from "../types/api.js";
import { normalizeText } from "../output/formatters.js";

interface SessionRecord {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  headed: boolean;
  currentSnapshotId?: string;
  validRefs: Set<string>;
}

interface PageSnapshotPayload {
  url: string;
  title: string;
  elements: SnapshotElement[];
}

const DEFAULT_SESSION_ID = "default";
const SUPPORTED_EXTRACT_MODES = new Set<ExtractMode>(["text", "markdown", "links", "forms"]);

export class BrowserOpsError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BrowserOpsError";
  }
}

export class BrowserOpsService {
  private readonly sessions = new Map<string, SessionRecord>();

  async open(params: OpenParams): Promise<OpenResult> {
    const sessionId = params.sessionId ?? DEFAULT_SESSION_ID;
    const headed = params.headed ?? false;
    const existing = this.sessions.get(sessionId);
    if (existing && existing.headed !== headed) {
      await this.close({ sessionId });
    }

    let session = this.sessions.get(sessionId);
    if (!session) {
      const browser = await chromium.launch({ headless: !headed });
      const context = await browser.newContext();
      const page = await context.newPage();
      session = {
        id: sessionId,
        browser,
        context,
        page,
        headed,
        validRefs: new Set()
      };
      this.sessions.set(sessionId, session);
    }

    await session.page.goto(params.url, { waitUntil: "domcontentloaded" });
    this.invalidateSnapshot(session);
    return {
      sessionId,
      url: session.page.url(),
      title: await session.page.title(),
      headed
    };
  }

  async snapshot(params: SnapshotParams): Promise<SnapshotResult> {
    const session = this.requireSession(params.sessionId);
    const snapshotId = this.randomId("snap");
    const payload = await session.page.evaluate(() => {
      const normalize = (value: string | null | undefined): string | undefined => {
        const result = value?.replace(/\s+/g, " ").trim();
        return result ? result : undefined;
      };

      const isVisible = (element: Element): boolean => {
        const html = element as HTMLElement;
        const style = window.getComputedStyle(html);
        const rect = html.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0;
      };

      const detectRole = (element: Element): string => {
        const explicit = element.getAttribute("role");
        if (explicit) {
          return explicit;
        }
        const tag = element.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "button") return "button";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "input") {
          const input = element as HTMLInputElement;
          if (input.type === "checkbox") return "checkbox";
          if (input.type === "radio") return "radio";
          return "textbox";
        }
        return tag;
      };

      const detectName = (element: Element): string => {
        const html = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const labelByAria = element.getAttribute("aria-label");
        if (labelByAria) {
          return labelByAria.trim();
        }

        const ariaLabelledBy = element.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          const labelled = ariaLabelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .trim();
          if (labelled) {
            return labelled;
          }
        }

        if ("labels" in html && html.labels?.length) {
          const label = Array.from(html.labels).map((item) => item.textContent ?? "").join(" ").trim();
          if (label) {
            return label;
          }
        }

        const text = element.textContent?.replace(/\s+/g, " ").trim();
        if (text) {
          return text;
        }

        const placeholder = html.getAttribute("placeholder");
        if (placeholder) {
          return placeholder.trim();
        }

        return html.getAttribute("name") || html.id || element.tagName.toLowerCase();
      };

      document.querySelectorAll("[data-browser-ops-ref]").forEach((element) => {
        element.removeAttribute("data-browser-ops-ref");
      });

      const candidates = Array.from(document.querySelectorAll("a[href],button,input,select,textarea,[role],[tabindex]"));
      const seen = new Set<Element>();
      const elements: SnapshotElement[] = [];

      let index = 1;
      for (const element of candidates) {
        if (seen.has(element) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        const ref = `r${index++}`;
        element.setAttribute("data-browser-ops-ref", ref);
        const inputLike = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        elements.push({
          ref,
          role: detectRole(element),
          name: detectName(element),
          text: normalize(element.textContent),
          value: "value" in inputLike ? normalize(inputLike.value) : undefined,
          disabled: "disabled" in inputLike ? Boolean(inputLike.disabled) : false
        });
      }

      return {
        url: window.location.href,
        title: document.title,
        elements
      };
    }) as PageSnapshotPayload;

    session.currentSnapshotId = snapshotId;
    session.validRefs = new Set(payload.elements.map((element) => element.ref));
    return {
      sessionId: session.id,
      snapshotId,
      url: payload.url,
      title: payload.title,
      elements: payload.elements
    };
  }

  async click(params: { sessionId?: string; snapshotId: string; ref: string }): Promise<WaitResult> {
    const session = this.requireSession(params.sessionId);
    this.assertSnapshot(session, params.snapshotId, params.ref);
    await session.page.locator(this.selectorForRef(params.ref)).first().click();
    this.invalidateSnapshot(session);
    return this.waitFor({ sessionId: session.id, ms: 50 });
  }

  async fill(params: FillParams): Promise<WaitResult> {
    const session = this.requireSession(params.sessionId);
    this.assertSnapshot(session, params.snapshotId, params.ref);
    await session.page.locator(this.selectorForRef(params.ref)).first().fill(params.text);
    this.invalidateSnapshot(session);
    return {
      sessionId: session.id,
      url: session.page.url(),
      title: await session.page.title()
    };
  }

  async select(params: SelectParams): Promise<WaitResult> {
    const session = this.requireSession(params.sessionId);
    this.assertSnapshot(session, params.snapshotId, params.ref);
    await session.page.locator(this.selectorForRef(params.ref)).first().selectOption(params.value);
    this.invalidateSnapshot(session);
    return {
      sessionId: session.id,
      url: session.page.url(),
      title: await session.page.title()
    };
  }

  async waitFor(params: WaitParams): Promise<WaitResult> {
    const session = this.requireSession(params.sessionId);
    if (params.ms !== undefined) {
      await session.page.waitForTimeout(params.ms);
    } else if (params.text) {
      await session.page.waitForFunction((expectedText) => document.body.innerText.includes(expectedText), params.text);
    } else if (params.urlIncludes) {
      await session.page.waitForFunction((fragment) => window.location.href.includes(fragment), params.urlIncludes);
    } else {
      throw new BrowserOpsError("INVALID_WAIT", "Provide one of --ms, --text, or --url-includes.");
    }

    return {
      sessionId: session.id,
      url: session.page.url(),
      title: await session.page.title()
    };
  }

  async extract(params: ExtractParams): Promise<ExtractResult> {
    const session = this.requireSession(params.sessionId);
    const mode = normalizeExtractMode(params.mode);
    const extraction = await session.page.evaluate((selectedMode) => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const title = document.title;
      const url = window.location.href;

      if (selectedMode === "text") {
        return { title, url, mode: selectedMode, content: document.body.innerText };
      }

      if (selectedMode === "markdown") {
        const lines: string[] = [];
        const nodes = Array.from(document.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote"));
        for (const node of nodes) {
          const text = normalize(node.textContent);
          if (!text) continue;
          if (/^h[1-6]$/i.test(node.tagName)) {
            const level = Number.parseInt(node.tagName.slice(1), 10);
            lines.push(`${"#".repeat(level)} ${text}`);
          } else if (node.tagName.toLowerCase() === "li") {
            lines.push(`- ${text}`);
          } else if (node.tagName.toLowerCase() === "blockquote") {
            lines.push(`> ${text}`);
          } else {
            lines.push(text);
          }
        }
        return { title, url, mode: selectedMode, content: lines.join("\n\n") };
      }

      if (selectedMode === "links") {
        const links = Array.from(document.querySelectorAll("a[href]")).map((link) => ({
          text: normalize(link.textContent),
          href: (link as HTMLAnchorElement).href
        }));
        return {
          title,
          url,
          mode: selectedMode,
          content: JSON.stringify(links, null, 2),
          links
        };
      }

      const forms = Array.from(document.querySelectorAll("input,select,textarea,button")).map((element) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        return {
          name: control.getAttribute("name") || control.id || element.tagName.toLowerCase(),
          type: element.tagName.toLowerCase() === "input" ? (control as HTMLInputElement).type || "text" : element.tagName.toLowerCase(),
          value: "value" in control ? normalize(control.value) : "",
          disabled: "disabled" in control ? Boolean(control.disabled) : false
        };
      });
      return {
        title,
        url,
        mode: selectedMode,
        content: JSON.stringify(forms, null, 2),
        forms
      };
    }, mode) as {
      title: string;
      url: string;
      mode: ExtractParams["mode"];
      content: string;
      links?: ExtractLink[];
      forms?: ExtractFormField[];
    };

    return {
      sessionId: session.id,
      url: extraction.url,
      title: extraction.title,
      mode: extraction.mode,
      content: normalizeText(extraction.content),
      links: extraction.links,
      forms: extraction.forms
    };
  }

  async screenshot(params: ScreenshotParams): Promise<ScreenshotResult> {
    const session = this.requireSession(params.sessionId);
    const screenshotPath = params.path ?? path.resolve(process.cwd(), `browser-ops-${Date.now()}.png`);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await session.page.screenshot({
      path: screenshotPath,
      fullPage: params.fullPage ?? false
    });
    return {
      sessionId: session.id,
      path: screenshotPath
    };
  }

  async close(params: CloseParams): Promise<CloseResult> {
    const sessionId = params.sessionId ?? DEFAULT_SESSION_ID;
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        closed: true
      };
    }
    await session.context.close();
    await session.browser.close();
    this.sessions.delete(sessionId);
    return {
      sessionId,
      closed: true
    };
  }

  async dispose(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((sessionId) => this.close({ sessionId })));
  }

  private requireSession(sessionId = DEFAULT_SESSION_ID): SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new BrowserOpsError("NO_SESSION", `No active session found for '${sessionId}'. Run open first.`);
    }
    return session;
  }

  private assertSnapshot(session: SessionRecord, snapshotId: string, ref: string): void {
    if (!session.currentSnapshotId || session.currentSnapshotId !== snapshotId) {
      throw new BrowserOpsError("STALE_SNAPSHOT", "Snapshot is stale. Run snapshot again before interacting.");
    }
    if (!session.validRefs.has(ref)) {
      throw new BrowserOpsError("UNKNOWN_REF", `Reference '${ref}' was not found in the active snapshot.`);
    }
  }

  private invalidateSnapshot(session: SessionRecord): void {
    session.currentSnapshotId = undefined;
    session.validRefs = new Set();
  }

  private randomId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
  }

  private selectorForRef(ref: string): string {
    return `[data-browser-ops-ref="${ref}"]`;
  }
}

function normalizeExtractMode(mode: string): ExtractMode {
  if (SUPPORTED_EXTRACT_MODES.has(mode as ExtractMode)) {
    return mode as ExtractMode;
  }

  throw new BrowserOpsError(
    "INVALID_EXTRACT_MODE",
    `Unsupported extract mode '${mode}'. Use text, markdown, links, or forms.`
  );
}
