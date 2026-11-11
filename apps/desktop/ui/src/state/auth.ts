// GitHub account: device-flow sign-in and the signed-in user.
import { createSignal } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, errorText, type DeviceCode, type GithubUser } from "../lib/ipc";
import { toast } from "./ui";

export const [user, setUser] = createSignal<GithubUser | null>(null);
export const [deviceCode, setDeviceCode] = createSignal<DeviceCode | null>(null);
export const [signingIn, setSigningIn] = createSignal(false);

export async function restoreSession() {
  try {
    setUser(await ipc.auth.status());
  } catch {
    setUser(null);
  }
}

export async function signIn() {
  if (signingIn()) return;
  setSigningIn(true);
  try {
    const code = await ipc.auth.start();
    setDeviceCode(code);
    try {
      await navigator.clipboard.writeText(code.userCode);
    } catch { /* clipboard may be unavailable */ }
    await openUrl(code.verificationUri).catch(() => {});
    const u = await ipc.auth.wait(code);
    setUser(u);
    toast("success", `Signed in as ${u.login}`);
  } catch (e) {
    const msg = errorText(e);
    if (!msg.includes("cancelled")) toast("error", "GitHub sign-in failed", { detail: msg, timeout: 12000 });
  } finally {
    setDeviceCode(null);
    setSigningIn(false);
  }
}

export async function cancelSignIn() {
  await ipc.auth.cancel();
}

export async function signOut() {
  await ipc.auth.logout().catch((e) => toast("error", "Sign out failed", { detail: errorText(e) }));
  setUser(null);
}
