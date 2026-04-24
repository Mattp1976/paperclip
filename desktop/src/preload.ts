/**
 * Preload — runs in the renderer before the page loads, with contextIsolation.
 *
 * v0.1: we don't expose any privileged APIs to the renderer yet. The page talks
 * to the local server over fetch like it does in the browser. This file exists
 * so we can ship `contextIsolation: true` from day one and have a clean seam
 * for future needs (e.g. "reveal in Finder", native notifications, OS filesystem
 * picker for output routers).
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("paperclip", {
  /** Build metadata so the renderer can tell it's running inside the desktop shell. */
  platform: "desktop",
  version: "0.0.1",
});

export {};
