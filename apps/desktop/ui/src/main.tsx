import { render } from "solid-js/web";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@xterm/xterm/css/xterm.css";
import "./styles/app.css";
import App from "./App";

// Block the webview's own context menu and reload shortcuts in production; the app has its own.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest("input, textarea, .cm-content, .xterm, .md-body")) e.preventDefault();
  });
}

render(() => <App />, document.getElementById("root")!);
