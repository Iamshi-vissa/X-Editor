# Custom themes

Put a `.json` file in the `themes` folder of X-Editor's config directory, then restart the app
or reopen Settings:

| OS | Folder |
|---|---|
| Windows | `%APPDATA%\x-editor\themes` |
| macOS | `~/Library/Application Support/x-editor/themes` |
| Linux | `~/.config/x-editor/themes` |

```json
{
  "id": "rose-pine-ish",
  "name": "Rosé Night",
  "kind": "dark",
  "extends": "midnight",
  "colors": {
    "bg-app": "#13111c",
    "bg-panel": "#191724",
    "bg-editor": "#1f1d2e",
    "accent": "#eb6f92",
    "syn-keyword": "#c4a7e7",
    "syn-string": "#f6c177"
  }
}
```

Any token you leave out comes from the theme you `extends` (or from Midnight / Paper, depending
on `kind`).

## Tokens

**Surfaces:** `bg-app`, `bg-panel`, `bg-editor`, `bg-raised`, `bg-hover`, `bg-active`,
`bg-input`, `border`, `border-strong`

**Text:** `text`, `text-muted`, `text-faint`

**Accent:** `accent`, `accent-strong`, `accent-text`, `accent-soft`, `selection`, `line-active`

**Status:** `danger`, `warning`, `success`, `info`, `git-added`, `git-modified`, `git-deleted`

**Syntax:** `syn-keyword`, `syn-control`, `syn-string`, `syn-number`, `syn-comment`,
`syn-function`, `syn-type`, `syn-variable`, `syn-property`, `syn-operator`, `syn-tag`,
`syn-attribute`, `syn-constant`, `syn-regexp`, `syn-heading`, `syn-link`, `syn-invalid`
