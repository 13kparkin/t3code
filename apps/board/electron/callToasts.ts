import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BrowserWindow, ipcMain, Notification, powerMonitor } from "electron";

import { CallToast } from "../src/domain/recording";

/** `setTimeout` fires at once for a longer delay, so a far wake fires early and the renderer asks again. */
const MAX_DELAY_MS = 2 ** 31 - 1;

export const decodeToastRecord = Schema.decodeUnknownOption(Schema.fromJsonString(CallToast));
const decodeToast = Schema.decodeUnknownOption(CallToast);
const decodeWake = Schema.decodeUnknownOption(Schema.NullOr(Schema.Finite));

const xmlText = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** Dismiss is Windows' own button, as in Electron's own toasts, so it never starts the app. */
export const toastXml = (toast: CallToast) =>
  [
    `<toast><visual><binding template="ToastGeneric">`,
    `<text>${xmlText(`${toast.request.title} is starting`)}</text>`,
    `</binding></visual><actions>`,
    `<action content="Record" arguments="${xmlText(JSON.stringify(toast))}" activationType="foreground"/>`,
    `<action content="Dismiss" arguments="dismiss" activationType="system"/>`,
    `</actions></toast>`,
  ].join("");

/** Main holds the one wake timer, because Chromium delays a hidden window's chained timers by up to a minute. */
export function registerCallToasts(platform: NodeJS.Platform) {
  if (platform !== "win32") return;
  const windows = () => BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
  let wake: ReturnType<typeof setTimeout> | undefined;
  let pressed: CallToast | null = null;

  ipcMain.on("board:call-wake-at", (event, at) =>
    Option.map(decodeWake(at), (time) => {
      clearTimeout(wake);
      if (time === null) return;
      wake = setTimeout(
        () => {
          if (!event.sender.isDestroyed()) event.sender.send("board:call-wake");
        },
        Math.min(Math.max(0, time - Date.now()), MAX_DELAY_MS),
      );
    }),
  );
  // The timer can miss a start that passed while the PC slept.
  powerMonitor.on("resume", () => {
    for (const window of windows()) window.webContents.send("board:call-wake");
  });
  ipcMain.on("board:call-notify", (_event, toast) =>
    Option.map(decodeToast(toast), (valid) => {
      if (Notification.isSupported()) new Notification({ toastXml: toastXml(valid) }).show();
    }),
  );
  ipcMain.handle("board:call-record-take", () => {
    const taken = pressed;
    pressed = null;
    return taken;
  });
  // Also runs when Windows starts the board from a toast pressed after it quit, before any window opens.
  Notification.handleActivation((details) => {
    const window = windows()[0];
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
    Option.map(decodeToastRecord(details.arguments), (toast) => {
      pressed = toast;
      for (const open of windows()) open.webContents.send("board:call-record");
    });
  });
}
