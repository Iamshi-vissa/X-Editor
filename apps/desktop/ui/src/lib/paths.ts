// Path helpers that work with both "/" and "\" separators.
export const sep = (p: string) => (p.includes("\\") && !p.includes("/") ? "\\" : "/");
export const norm = (p: string) => p.replace(/\\/g, "/");
export const basename = (p: string) => norm(p).replace(/\/+$/, "").split("/").pop() ?? p;
export const dirname = (p: string) => {
  const n = p.replace(/[\\/]+$/, "");
  const i = Math.max(n.lastIndexOf("/"), n.lastIndexOf("\\"));
  return i <= 0 ? n.slice(0, i + 1) : n.slice(0, i);
};
export const join = (a: string, ...parts: string[]) => {
  const s = sep(a);
  return [a.replace(/[\\/]+$/, ""), ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ""))].join(s);
};
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
};
/** Path relative to root, with forward slashes, or the original path if outside. */
export const relative = (root: string | null | undefined, p: string) => {
  if (!root) return norm(p);
  const r = norm(root).replace(/\/+$/, "") + "/";
  const n = norm(p);
  return n.startsWith(r) ? n.slice(r.length) : n;
};
export const isInside = (root: string, p: string) => {
  const r = norm(root).replace(/\/+$/, "");
  const n = norm(p);
  return n === r || n.startsWith(r + "/");
};
export const toFileUri = (p: string) => {
  const n = norm(p);
  const withSlash = /^[a-zA-Z]:/.test(n) ? "/" + n : n;
  return "file://" + withSlash.split("/").map((s, i) => (i === 1 && /^[a-zA-Z]:$/.test(s) ? s : encodeURIComponent(s))).join("/");
};
export const fromFileUri = (uri: string, windows: boolean) => {
  let p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
  if (windows && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1).replace(/\//g, "\\");
  return p;
};
