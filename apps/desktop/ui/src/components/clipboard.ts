import { toast } from "../state/ui";

export async function writeText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("info", "Copied to clipboard", { timeout: 1500 });
  } catch {
    toast("error", "Couldn't access the clipboard");
  }
}
