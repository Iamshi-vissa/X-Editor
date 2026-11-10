// A drag handle that resizes a neighbouring pane.
export function Resizer(p: { dir: "x" | "y"; onResize: (delta: number) => void; onEnd?: () => void; invert?: boolean }) {
  const down = (e: PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let last = p.dir === "x" ? e.clientX : e.clientY;
    document.body.classList.add(p.dir === "x" ? "resizing-x" : "resizing-y");
    const move = (ev: PointerEvent) => {
      const now = p.dir === "x" ? ev.clientX : ev.clientY;
      const delta = (now - last) * (p.invert ? -1 : 1);
      last = now;
      if (delta) p.onResize(delta);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-x", "resizing-y");
      p.onEnd?.();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return <div class={`resizer resizer-${p.dir}`} onPointerDown={down} />;
}
