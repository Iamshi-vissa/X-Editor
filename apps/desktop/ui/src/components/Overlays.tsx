// Toasts, modal dialogs and the context menu.
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-solid";
import { dialog, dismissToast, setDialog, toasts } from "../state/ui";

export function Toasts() {
  const icon = (k: string) =>
    k === "success" ? <CircleCheck size={16} /> : k === "error" ? <CircleAlert size={16} /> : k === "warning" ? <TriangleAlert size={16} /> : <Info size={16} />;
  return (
    <div class="toasts">
      <For each={toasts()}>
        {(t) => (
          <div class={`toast toast-${t.kind}`} role="status">
            <span class="toast-icon">{icon(t.kind)}</span>
            <div class="toast-body">
              <div class="toast-msg">{t.message}</div>
              <Show when={t.detail}><div class="toast-detail">{t.detail}</div></Show>
              <Show when={t.actions?.length}>
                <div class="toast-actions">
                  <For each={t.actions}>
                    {(a) => <button class="btn btn-sm" onClick={() => { a.run(); dismissToast(t.id); }}>{a.label}</button>}
                  </For>
                </div>
              </Show>
            </div>
            <button class="icon-btn toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X size={14} /></button>
          </div>
        )}
      </For>
    </div>
  );
}

export function DialogHost() {
  const [input, setInput] = createSignal("");
  let inputEl: HTMLInputElement | undefined;
  createEffect(() => {
    const d = dialog();
    if (d) {
      setInput(d.input?.value ?? "");
      setTimeout(() => {
        if (inputEl) { inputEl.focus(); inputEl.select(); }
        else document.querySelector<HTMLButtonElement>(".dialog .btn-primary")?.focus();
      }, 20);
    }
  });
  const finish = (button: string) => {
    const d = dialog();
    if (!d) return;
    setDialog(null);
    d.resolve({ button, input: input() });
  };
  const cancelValue = () => dialog()?.buttons.find((b) => b.value === "cancel")?.value ?? "cancel";
  return (
    <Show when={dialog()}>
      {(d) => (
        <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && finish(cancelValue())}>
          <div class="dialog" role="dialog" aria-modal="true" onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); finish(cancelValue()); }
            if (e.key === "Enter" && d().input) { e.preventDefault(); finish(d().buttons.find((b) => b.primary)?.value ?? "ok"); }
          }}>
            <div class="dialog-title">{d().title}</div>
            <Show when={d().message}><div class="dialog-msg">{d().message}</div></Show>
            <Show when={d().input}>
              <input ref={inputEl} class="input" value={input()} placeholder={d().input?.placeholder} onInput={(e) => setInput(e.currentTarget.value)} />
            </Show>
            <div class="dialog-buttons">
              <For each={d().buttons}>
                {(b) => <button class={`btn ${b.primary ? "btn-primary" : ""} ${b.danger ? "btn-danger" : ""}`} onClick={() => finish(b.value)}>{b.label}</button>}
              </For>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

export interface MenuItem { label: string; run?: () => void; hint?: string; danger?: boolean; separator?: boolean; disabled?: boolean }
const [menu, setMenu] = createSignal<{ x: number; y: number; items: MenuItem[] } | null>(null);

export function showContextMenu(e: MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  setMenu({ x: e.clientX, y: e.clientY, items });
}

export function ContextMenuHost() {
  let el: HTMLDivElement | undefined;
  const close = () => setMenu(null);
  const onDown = (e: MouseEvent) => { if (el && !el.contains(e.target as Node)) close(); };
  window.addEventListener("mousedown", onDown, true);
  window.addEventListener("blur", close);
  onCleanup(() => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("blur", close); });
  createEffect(() => {
    const m = menu();
    if (m && el) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth) el.style.left = `${Math.max(4, window.innerWidth - r.width - 4)}px`;
      if (r.bottom > window.innerHeight) el.style.top = `${Math.max(4, window.innerHeight - r.height - 4)}px`;
    }
  });
  return (
    <Show when={menu()}>
      {(m) => (
        <Portal>
          <div ref={el} class="context-menu" style={{ left: `${m().x}px`, top: `${m().y}px` }} onKeyDown={(e) => e.key === "Escape" && close()}>
            <For each={m().items}>
              {(item) =>
                item.separator ? <div class="menu-sep" /> : (
                  <button class={`menu-item ${item.danger ? "danger" : ""}`} disabled={item.disabled} onClick={() => { close(); item.run?.(); }}>
                    <span>{item.label}</span>
                    <Show when={item.hint}><span class="menu-hint">{item.hint}</span></Show>
                  </button>
                )
              }
            </For>
          </div>
        </Portal>
      )}
    </Show>
  );
}
