# Mobile-First UI Redesign — Design Spec

- **Status:** approved 2026-11-24
- **Date:** 2026-11-24
- **Project:** ctdv-react (Create React App 5.0.1, React 18.2, MUI 5.10)
- **Goal:** Redraw the single screen of the app so it is comfortable to use one-handed on a phone, with a new visual identity ("Ấm áp": cream background, terracotta accent).
- **Shippable unit:** the CRA frontend only. `api/` is not touched.

## Context

The app has one screen (`src/components/ctdv.tsx`, 467 lines). An admin pastes raw information about a lost pet, optionally lets AI rewrite it, and copies the finished Facebook post.

Problems on a phone today:

- Textareas and the category dropdown are forced to 80% of the screen width.
- The four actions (`Assign`, `Replicate`, `Append`, `AI gen`) are small text buttons; `Copy` sits at the very bottom of a long page.
- The Assign modal packs seven MUI dropdowns two per row at 42% width.
- Every notification is a blocking `alert()`.
- White text on a pink-to-blue gradient is hard to read outdoors.

Decisions taken in the interview (the user's answers):

| Topic           | Decision                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Scope           | Redesign look **and** interaction flow. Keep every existing feature.                                                        |
| Main flows      | (1) paste → Copy. (2) paste → AI gen → Copy. Assign is secondary.                                                           |
| Button labels   | Stay in English, exactly as today.                                                                                          |
| Visual identity | Replaced completely. Direction "A · Ấm áp" chosen from mockups.                                                             |
| Assign          | Demoted to a secondary button; opens a bottom sheet.                                                                        |
| Main actions    | Sticky bar fixed to the bottom of the screen.                                                                               |
| Category picker | Four one-tap chips instead of a dropdown.                                                                                   |
| Colour scheme   | Light only. No dark mode.                                                                                                   |
| Implementation  | Keep MUI v5 and add a custom theme. No new dependencies.                                                                    |
| Notifications   | Auto-hiding snackbar instead of `alert()`.                                                                                  |
| Reload          | Moves to the top-right corner of the header.                                                                                |
| Wide screens    | Same single column, centred, at most 480px wide.                                                                            |
| Page metadata   | Approved with the design: `lang="vi"`, safe-area viewport, cream `theme-color`, real app names in the manifest (section 8). |

Approved mockups are kept in `.blueprint/brainstorm/64987-1795454465/content/` (`visual-style.html`, `design-final.html`). They illustrate the layout; where a mockup and this spec disagree, this spec wins.

## Global Constraints

- Runtime and tooling versions stay as installed: Node 20, `react` 18.2.0, `react-scripts` 5.0.1, `typescript` 4.8.4, `@mui/material` 5.10.12, `@mui/icons-material` 5.10.9, `@emotion/react` 11.10.5.
- `package.json` and `package-lock.json` are not modified. No dependency is added, removed, or upgraded.
- These paths are not modified: `api/**`, `scripts/**`, `src/utils/**`, `.env.example`.
- Light theme only. No `prefers-color-scheme` rules, no theme toggle.
- Button labels are exactly: `Replicate`, `Append`, `Assign`, `AI gen`, `Generating...`, `Copy`, `Reload`, `Cancel`.
- The page heading is an `<h1>` with the exact text `Tìm Chó Mèo Lạc Đà Nẵng`.
- Section labels are exactly: `Thể loại`, `Nội dung`, `Bài Viết`.
- Colours, radii, and font sizes come only from the Design Tokens section below. Two MUI defaults are exempt and left as they are: the button ripple effect and the `Drawer` elevation shadow.
- Disabled controls keep their normal colours and are shown at `opacity: 0.45`. MUI's grey disabled colours are overridden.
- Every `<textarea>` and `<select>` has `font-size: 16px` (prevents iOS Safari zoom on focus).
- Minimum tap height: 48px for action-bar and sheet-footer buttons; 44px for category chips and sheet selects; 40px for the `Reload`, `Append`, and `Assign` pill buttons.
- The page column, the action bar, and the Assign sheet are each at most 480px wide and centred at every viewport width. On wider viewports the area beside them shows only the `bg` page background (dimmed by the `overlay` backdrop while the sheet is open). There is no separate desktop layout.
- The post-composition logic (title line, separator lines, text replacements, per-line capitalisation, footer sentences) produces byte-identical output to the current code for the same inputs. The exact format is in section 5 and is pinned by tests 13 and 14 in section 10.
- The `@fontsource/roboto` imports (weights 300, 400, 500, 700) stay in `src/components/ctdv.tsx`. No other font files are loaded.
- Code is formatted with the repository's `.prettierrc`.
- `CI=true npm test` passes and `CI=true npm run build` succeeds.

## Design Tokens

| Token               | Value                                                      | Used for                                                         |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `bg`                | `#FBF5EC`                                                  | Page background                                                  |
| `surface`           | `#FFFFFF`                                                  | Textareas, chips, neutral buttons, selects                       |
| `surface-raised`    | `#FFFDF9`                                                  | Action bar, Assign sheet                                         |
| `border`            | `#EADFCF`                                                  | All 1px borders and dividers                                     |
| `text`              | `#3B2A20`                                                  | Body text, heading                                               |
| `text-muted`        | `#7A6657`                                                  | Section labels, placeholders, sheet field labels                 |
| `accent`            | `#BF4A26`                                                  | Logo tile, primary buttons, selected-chip border, focus ring     |
| `on-accent`         | `#FFFFFF`                                                  | Text and icon on `accent`                                        |
| `accent-soft`       | `#FBE3D6`                                                  | Selected chip background, `AI gen` button background, focus glow |
| `accent-strong`     | `#8F3415`                                                  | Text on `accent-soft`, pill-button text                          |
| `accent-hover`      | `#A8401F`                                                  | Hover background of primary buttons                              |
| `accent-soft-hover` | `#F7D3C0`                                                  | Hover background of the `AI gen` button                          |
| `error`             | `#B3261E`                                                  | Error snackbar background                                        |
| `snackbar`          | `#3B2A20`                                                  | Success snackbar background (white text)                         |
| `overlay`           | `rgba(40, 25, 15, 0.45)`                                   | Backdrop behind the Assign sheet                                 |
| `radius-card`       | `18px`                                                     | Textareas                                                        |
| `radius-control`    | `14px`                                                     | Buttons, chips, selects, logo tile                               |
| `radius-small`      | `12px`                                                     | Snackbar message                                                 |
| `radius-pill`       | `999px`                                                    | `Reload`, `Append`, `Assign` pill buttons; sheet grab handle     |
| `radius-sheet`      | `22px 22px 0 0`                                            | Assign sheet                                                     |
| `font-body`         | `Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif` | Everything except titles                                         |
| `font-title`        | `Georgia, 'Times New Roman', serif`                        | `<h1>` and the sheet title                                       |

States:

- **Hover** (pointer devices only): primary buttons use `accent-hover`; the `AI gen` button uses `accent-soft-hover`; neutral buttons, pill buttons, and unselected chips use `bg` as background; the selected chip does not change.
- **Disabled**: the control keeps the colours of its enabled state, gets `opacity: 0.45`, and has no shadow. This is set once in `src/theme.ts` through `&.Mui-disabled` overrides for `MuiButton` and `MuiToggleButton`, not repeated per component. MUI's own disabled rules set `color`, `background-color`, and `border-color`, so the override restates the enabled colours for each case: primary, tonal, neutral, pill, unselected chip, selected chip. For that reason the enabled colours of the neutral button, the pill button, and both chip states are also defined in `src/theme.ts`, next to the override, and not in `sx` props or `ctdv.css`.
- **Read-only textareas** look the same as editable ones.

Font sizes: `<h1>` 18px/700 with `line-height: 1.25`; sheet title 18px/700; section label 13px/700; chip 14px/500; action-bar and sheet-footer buttons 15px/700; pill buttons 13px/700; textarea and select 16px/400 with `line-height: 1.5`; snackbar 14px/500.

`accent` is `#BF4A26`, slightly darker than the `#C8502A` shown in the first mockup, so that white text on it reaches a 4.5:1 contrast ratio.

## Design

### 1. Architecture

No routing, no new state library. State and behaviour stay in `Ctdv`; presentation is split into small components.

| File                                             | Action    | Responsibility                                                                                                                                |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/theme.ts`                                   | create    | Exports `theme` (MUI `createTheme`) built from the Design Tokens.                                                                             |
| `src/App.tsx`                                    | modify    | Wraps `<Ctdv />` in `<ThemeProvider theme={theme}>`. Drops the `App.css` import and the `App` wrapper class.                                  |
| `src/App.css`                                    | delete    | Only held unused CRA boilerplate and `text-align: center`.                                                                                    |
| `src/components/assignInfo.ts`                   | create    | Moved from `ctdv.tsx` unchanged: `AssignInfo` type, `ContentKeyInfo` map, `initialAssignInfo`, `generateContent`.                             |
| `src/components/CategoryChips.tsx`               | create    | The four category chips.                                                                                                                      |
| `src/components/AssignSheet.tsx`                 | create    | The bottom sheet with seven selects.                                                                                                          |
| `src/components/ActionBar.tsx`                   | create    | The sticky bottom bar.                                                                                                                        |
| `src/components/ctdv.tsx`                        | rewrite   | Owns state, refs, the post-composition effect, clipboard and AI handlers, the snackbar, and the page layout.                                  |
| `src/components/ctdv.css`                        | rewrite   | Declares the tokens as CSS custom properties on `:root`; styles page, header, sections, textareas, action-bar container, sheet rows, selects. |
| `public/index.html`                              | modify    | See section 8.                                                                                                                                |
| `public/manifest.json`                           | modify    | See section 8.                                                                                                                                |
| `src/index.css`, `src/index.tsx`, `src/logo.svg` | untouched |                                                                                                                                               |

Token values live in two places: `src/theme.ts` (for MUI components) and the `:root` block of `ctdv.css` (for plain elements). Both must match the Design Tokens table.

`ctdv.css` no longer contains the global `* { margin: 0; padding: 0 }` reset, the gradient background, `letter-spacing: 1px`, or any `!important`. It sets `*, *::before, *::after { box-sizing: border-box }`, and on `body`: `margin: 0`, `background: bg`, `color: text`, `font-family: font-body`, `min-height: 100vh`.

### 2. MUI theme (`src/theme.ts`)

- `palette.mode: 'light'`
- `palette.primary`: `main` = `accent`, `dark` = `accent-hover`, `contrastText` = `on-accent`
- `palette.secondary`: `main` = `accent-soft`, `dark` = `accent-soft-hover`, `contrastText` = `accent-strong`
- `palette.error.main` = `error`
- `palette.text.primary` = `text`, `palette.text.secondary` = `text-muted`
- `palette.background.default` = `bg`, `palette.background.paper` = `surface`
- `palette.divider` = `border`
- `shape.borderRadius: 14`
- `typography.fontFamily` = `font-body`; `typography.button`: `textTransform: 'none'`, `fontWeight: 700`, `fontSize: '15px'`
- `components.MuiButton.defaultProps`: `disableElevation: true`
- `components.MuiButton.styleOverrides.root`: `minHeight: 48`, `borderRadius: 14`
- `components.MuiButton.styleOverrides.sizeSmall`: `minHeight: 40`, `borderRadius: 999`, `fontSize: '13px'`, `padding: '0 14px'`
- `components.MuiButton` and `components.MuiToggleButton`: `&.Mui-disabled` overrides that implement the Disabled state from the Design Tokens section

Button variants used:

| Role                                       | MUI props                                                                                                                                                                | Result                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Primary (`Copy`, sheet `Assign`)           | `variant="contained" color="primary"`                                                                                                                                    | `accent` background, white text                |
| Tonal (`AI gen`)                           | `variant="contained" color="secondary"`                                                                                                                                  | `accent-soft` background, `accent-strong` text |
| Neutral (`Replicate`, `Cancel`)            | `variant="outlined" color="inherit"` plus `surface` background and `border` border colour                                                                                | White, 1px border, `text` colour               |
| Pill (`Reload`, `Append`, `Assign` opener) | `variant="outlined" size="small"` plus `surface` background and `border` border colour; text colour `accent-strong` for `Append` and `Assign`, `text-muted` for `Reload` | Small rounded pill                             |

### 3. Main screen layout (`ctdv.tsx`)

Top to bottom, inside a column with `max-width: 480px`, `margin: 0 auto`, `padding: 16px 16px calc(96px + env(safe-area-inset-bottom))`, left-aligned text. Vertical gap between sections is 20px.

1. **Header** — a flex row, `gap: 10px`, vertically centred.
   - Logo tile: 36×36px, `radius-control`, `accent` background, containing `PetsSharpIcon` at 22px in `on-accent`. Decorative (`aria-hidden`).
   - `<h1>` `Tìm Chó Mèo Lạc Đà Nẵng`, `font-title`, `flex: 1`, `margin: 0`. On viewports of about 375px and narrower the heading wraps onto two lines; that is accepted.
   - `Reload` pill button. Calls `window.location.reload()` with no confirmation. Never disabled.
2. **Thể loại** — section label, then `<CategoryChips>`.
3. **Nội dung** — a flex row with the section label on the left and the `Append` and `Assign` pill buttons on the right (`gap: 8px`), then the content textarea.
4. **Bài Viết** — section label, then the post textarea.
5. **Action bar** — `<ActionBar>`, fixed to the viewport bottom.
6. **Snackbar** — see section 6.

Each section label (`Thể loại`, `Nội dung`, `Bài Viết`) is an `<h2>` with `margin: 0`, styled 13px/700 in `text-muted`. The label sits 8px above its control.

Textareas are plain `<textarea>` elements and stay uncontrolled with the existing refs (`contentRef`, `finalRef`). A helper in `ctdv.tsx`, `fitRows(textarea, { min, max })`, sets each textarea's height to fit its text between `minRows` and `maxRows` lines and turns on internal scrolling beyond `maxRows`. It runs at the end of the post-composition effect, after every streamed AI chunk, on window resize, and once the web font has loaded.

**Amended 2026-11-24 during implementation.** The approved text said "keep MUI `TextareaAutosize`". Browser verification showed it clips the post: it measures with a hidden copy that ignores horizontal padding (so wrapped lines are under-counted), it measures before the effect writes the new text, and it stops resizing an uncontrolled textarea after 20 height changes. The row limits below are unchanged.

| Textarea | `aria-label` | `minRows` | `maxRows` | `placeholder`                           |
| -------- | ------------ | --------- | --------- | --------------------------------------- |
| Content  | `Nội dung`   | 6         | 12        | `Dán thông tin vào đây, mỗi ý một dòng` |
| Post     | `Bài Viết`   | 10        | 20        | none                                    |

Textarea style: `width: 100%`, `surface` background, 1px `border`, `radius-card`, `padding: 12px 14px`, `resize: none`, `font-family: font-body`. On focus: border colour `accent` and `box-shadow: 0 0 0 3px accent-soft`; no browser outline.

All buttons and chips show a visible keyboard focus ring: `outline: 2px solid accent; outline-offset: 2px` on `:focus-visible`.

### 4. `CategoryChips`

Props: `value: CategoryOption`, `onChange: (value: CategoryOption) => void`, `disabled: boolean`. `CategoryOption` is `'dog' | 'cat' | 'dogFindOwner' | 'catFindOwner'`.

- A `<div role="group" aria-label="Thể loại">` laid out as a CSS grid: two equal columns, `gap: 8px`.
- Four standalone MUI `ToggleButton`s (not wrapped in `ToggleButtonGroup`), in this order and with these labels:

| Value          | Chip label        | Post title (unchanged `optionTitle` map) |
| -------------- | ----------------- | ---------------------------------------- |
| `dog`          | `Tìm chó lạc`     | `TÌM CHÓ LẠC`                            |
| `cat`          | `Tìm mèo lạc`     | `TÌM MÈO LẠC`                            |
| `dogFindOwner` | `Chó lạc tìm chủ` | `CHÓ LẠC TÌM CHỦ`                        |
| `catFindOwner` | `Mèo lạc tìm chủ` | `MÈO LẠC TÌM CHỦ`                        |

- The chip labels are in sentence case on purpose. The old dropdown showed `Tìm Chó Lạc` and `Tìm Mèo Lạc`; the new labels replace them.
- Each chip: `min-height: 44px`, `radius-control`, `surface` background, 1px `border`, `text` colour, `text-transform: none`.
- The chip whose value equals `value` has `selected` set (MUI renders `aria-pressed="true"`): `accent-soft` background, `accent` border, `accent-strong` text.
- Clicking a chip calls `onChange` with its value. Clicking the already-selected chip does nothing. Exactly one chip is always selected; the initial value is `dog`.
- `disabled` disables all four chips.

`Ctdv` handles `onChange` exactly as the old dropdown did: set `option`, set `title` from `optionTitle`.

### 5. `ActionBar` and the generating state

Props: `isGenerating: boolean`, `onReplicate: () => void`, `onAiGen: () => void`, `onCopy: () => void`.

- One element: `position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; z-index: 10`, `surface-raised` background, 1px `border` on top. The bar itself is 480px at most; it is not a full-width strip.
- Inside it: `padding: 10px 16px calc(10px + env(safe-area-inset-bottom))`, CSS grid with columns `minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr)` and `gap: 8px`.
- Three buttons, left to right: `Replicate` (neutral), `AI gen` (tonal), `Copy` (primary). No icons. Each has `min-width: 0` and `padding: 0 6px` so the three fit a 320px viewport (with `8px`, `Replicate` was cut by one pixel at 320px). Button labels use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. At 320px the `Generating...` label may be cut with an ellipsis; that is accepted.
- While `isGenerating` is true the middle button's label is `Generating...`; otherwise it is `AI gen`.

Handlers keep today's behaviour:

- `Replicate` reads the clipboard and **replaces** the content textarea.
- `Append` reads the clipboard and adds it to the content textarea on a new line (or sets it when the textarea is empty).
- `AI gen` streams `generateWithAIStream(content, title)` into the post textarea, scrolling it to the bottom after each chunk. On error the post textarea is restored to the text it held before the click.
- `Copy` writes the post textarea's value to the clipboard.

**Post composition (unchanged).** The existing effect keeps its dependencies and sets the post textarea to exactly this string:

```ts
`${title}\n    \n${processed}\n    \n${footer}`;
```

- The two separator lines each contain exactly four space characters. They are kept.
- `processed` is the content textarea's value after these replacements, applied to every occurrence and in this order: `" :"` → `":"`, `" ,"` → `","`, `"( "` → `"("`, `" )"` → `")"`, `" / mất:"` → `":"`, `"Giống chó/mèo"` → `"Giống"`; then the first character of every line is upper-cased.
- `footer` when `title` is `TÌM CHÓ LẠC` or `TÌM MÈO LẠC`: `Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ.`
- `footer` for the other two titles: `Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn.`

**Generating lock (new).** While `isGenerating` is true:

- Disabled: all four chips, `Replicate`, `AI gen`, `Copy`, `Append`, and the `Assign` opener.
- Both textareas are `readOnly`.
- `Reload` stays enabled.

Reason: today, changing the category, pasting, or typing during a stream re-runs the post-composition effect and overwrites the half-written post.

### 6. Notifications

`alert()` is no longer called anywhere. `Ctdv` renders one MUI `Snackbar` containing one MUI `Alert`.

- State: `{ open: boolean; message: string; severity: 'success' | 'error' }`.
- `Snackbar`: `anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}`, lifted above the action bar with `bottom: calc(84px + env(safe-area-inset-bottom))`, width `calc(100% - 32px)`, `max-width: 448px`.
- `autoHideDuration`: 3000 ms for `success`, 6000 ms for `error`.
- Closing: only on timeout. A `clickaway` close reason is ignored.
- A new message shown while another is visible replaces it and restarts the timer. To make the timer restart, the `Snackbar` gets a `key` that changes with every message shown (a counter), because MUI only restarts its timer when `open` or `autoHideDuration` changes.
- `Alert`: `variant="filled"`, `icon={false}`, `radius-small`, white text; background `snackbar` for `success`, `error` for `error`.

| Event            | Severity | Message (exact)                                                                                              |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Copy succeeded   | success  | `copy success`                                                                                               |
| Copy failed      | error    | `copy fail`                                                                                                  |
| Replicate failed | error    | `Replicate fail`                                                                                             |
| Append failed    | error    | `Append fail`                                                                                                |
| AI gen failed    | error    | `Lỗi AI gen: <error.message>`; when the thrown value is not an `Error`, `<error.message>` is `Unknown error` |

Successful Replicate and Append show no snackbar. If `navigator.clipboard` is undefined (insecure origin), the action is treated as a failure and shows the matching message from the table instead of throwing.

### 7. `AssignSheet`

Props:

```ts
type AssignSheetProps = {
  open: boolean;
  lines: string[];
  value: AssignInfo;
  onAssign: (next: AssignInfo) => void;
  onCancel: () => void;
};
```

- MUI `Drawer` with `anchor="bottom"`, `open`, `onClose={onCancel}` (backdrop tap and Escape both cancel).
- Paper: `surface-raised` background, `radius-sheet`, `max-height: 85vh`, `overflow-y: auto`, `max-width: 480px`, horizontally centred, `padding: 8px 16px calc(16px + env(safe-area-inset-bottom))`. Backdrop colour `overlay`.
- Paper has `role="dialog"` and `aria-labelledby` pointing at the sheet title.
- Contents, top to bottom:
  1. A decorative grab handle: 36×4px, `border` colour, `radius-pill`, centred.
  2. Title `<h2>` `Assign` in `font-title`.
  3. Seven field rows, or the empty message (below).
  4. Footer: CSS grid `1fr 1.4fr`, `gap: 8px`, `position: sticky; bottom: 0`, `surface-raised` background. Buttons `Cancel` (neutral) and `Assign` (primary).

**Field rows.** One row per `AssignInfo` key, in `ContentKeyInfo` order. The row label is the key's `translate` text:

| Key        | Label                |
| ---------- | -------------------- |
| `name`     | `Tên`                |
| `breed`    | `Giống`              |
| `gender`   | `Giới tính`          |
| `location` | `Khu vực lạc`        |
| `time`     | `Thời gian lạc`      |
| `info`     | `Đặc điểm nhận dạng` |
| `phone`    | `Sdt liên hệ`        |

- Row layout: CSS grid `112px 1fr`, `gap: 8px`, vertically centred, 8px between rows.
- Left: a `<label>` (13px/700, `text-muted`) linked to the select with `htmlFor`/`id`.
- Right: a native HTML `<select>` (not MUI `Select`), `min-height: 44px`, `width: 100%`, `surface` background, 1px `border`, `radius-control`, `padding: 0 12px`. Using the native element gives the phone's own picker. On focus it gets the same treatment as the textareas: border colour `accent`, `box-shadow: 0 0 0 3px accent-soft`, no browser outline.
- Options of every select, in order:
  1. `<option value="">—</option>`
  2. One option per entry of `lines`.
  3. If the field's current draft value is non-empty and not in `lines`, one extra option for that value.

**Draft state (new behaviour).** The sheet keeps its own draft copy of `AssignInfo`.

- Each time `open` changes from `false` to `true`, the draft is reset to `value`.
- Changing a select updates only the draft.
- `Assign` calls `onAssign(draft)`.
- `Cancel`, backdrop tap, and Escape call `onCancel()`; the draft is discarded.

Today each dropdown writes straight into component state, so there is nothing to cancel. With the draft, selections take effect only when `Assign` is pressed.

**Empty state.** When `lines` is empty and every field of `value` is an empty string, the seven rows are replaced by the paragraph `Chưa có nội dung. Dán nội dung trước rồi mới Assign.` (`text-muted`) and the footer `Assign` button is disabled. `Cancel` stays enabled.

**Wiring in `Ctdv`.**

- `useReducer` and its seven actions are replaced by `const [assignInfo, setAssignInfo] = useState(initialAssignInfo)`.
- `lines` passed to the sheet = the `assignedContent` state, with each entry trimmed, empty entries removed, and duplicates removed keeping first occurrence.
- `assignedContent` starts as `[]` (today it starts as the placeholder `['a', 'b', 'c']`). It is still updated in the same three places as today: content textarea `onChange`, Replicate, Append.
- `onAssign(next)`: `setAssignInfo(next)`, `setIsAssigned(true)`, close the sheet.
- `onCancel()`: close the sheet.

**Existing behaviour that must be preserved, not fixed.** Once `isAssigned` is true, the post-composition effect rewrites the content textarea from `generateContent(assignInfo)` on every run, so later manual edits to the content are overwritten until the page is reloaded. This is why `Reload` exists. Changing it is out of scope. For the same reason, pressing `Assign` with every field set to `—` empties the content textarea; that also matches today's behaviour and stays.

### 8. `public/index.html` and `public/manifest.json`

`public/index.html`:

- `<html lang="vi">`
- viewport: `width=device-width, initial-scale=1, viewport-fit=cover` (required for `env(safe-area-inset-bottom)`)
- `theme-color`: `#FBF5EC`
- description: `Công cụ soạn bài đăng tìm chó mèo lạc tại Đà Nẵng`
- `<title>` unchanged: `Cứu Trợ Động Vật Đà Nẵng`

`public/manifest.json`:

- `short_name`: `CTĐV Đà Nẵng`
- `name`: `Cứu Trợ Động Vật Đà Nẵng`
- `icons`: remove the `favicon.ico` entry (the file does not exist); keep the `logo192.png` and `logo512.png` entries as they are
- `theme_color`: `#FBF5EC`
- `background_color`: `#FBF5EC`
- `start_url` and `display` unchanged

### 9. Error handling and edge cases

- Clipboard permission denied or API missing → error snackbar (section 6); textareas unchanged.
- AI gen error → previous post restored, error snackbar, lock released (`finally`).
- Opening the sheet with empty content and nothing assigned yet → empty state (section 7).
- Very long pasted content → textareas stop growing at `maxRows` and scroll internally; the page and the fixed bar stay usable.
- Viewport 320px wide → chips stay two per row; the sheet label column stays 112px and long labels wrap onto two lines.
- On-screen keyboard open → the fixed bar may be covered by the keyboard; no special handling.

### 10. Testing

Jest + React Testing Library, as today. `generateWithAIStream` is mocked in every component test.

Existing tests:

| File                                     | Change                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.test.tsx`                       | None. Must still pass.                                                                                                                                                                                   |
| `src/components/ctdv.test.tsx`           | None. Must still pass (first textbox = content, last textbox = post, button found by `/AI gen/i`).                                                                                                       |
| `src/components/ctdv.aiFailure.test.tsx` | Replace the `window.alert` assertions: assert that text matching `/Lỗi AI gen: AI đang quá tải/` appears, that `window.alert` was not called, and that the post textarea still holds its previous value. |
| `src/utils/*.test.ts`                    | None.                                                                                                                                                                                                    |

New tests in `src/components/ctdv.ui.test.tsx`:

1. Clicking the chip `Tìm mèo lạc` sets `aria-pressed="true"` on it and makes the post textarea value start with `TÌM MÈO LẠC`.
2. With `navigator.clipboard.writeText` resolving, clicking `Copy` calls it with the post textarea's value and shows `copy success`.
3. With `navigator.clipboard.writeText` rejecting, clicking `Copy` shows `copy fail`.
4. With `navigator.clipboard.readText` resolving to `Milu\nPoodle`, clicking `Replicate` sets the content textarea to that text.
5. After typing `Milu\nPoodle` into the content textarea and clicking the `Assign` opener, a dialog appears whose `Tên` select has exactly the options `—`, `Milu`, `Poodle`.
6. In that dialog, choosing `Milu` for `Tên` and clicking the dialog's `Assign` closes the dialog and sets the content textarea to `Tên: Milu`.
7. In that dialog, choosing `Milu` for `Tên` and clicking `Cancel` closes the dialog and leaves the content textarea as `Milu\nPoodle`.
8. Clicking the `Assign` opener with an empty content textarea shows `Chưa có nội dung. Dán nội dung trước rồi mới Assign.` and the dialog's `Assign` button is disabled.
9. With content `Milu\nPoodle`: open the sheet, choose `Milu` for `Tên`, click `Cancel`, open the sheet again. The `Tên` select shows `—` (empty value).
10. With content `Milu` and `navigator.clipboard.readText` resolving to `Đực`, clicking `Append` sets the content textarea to `Milu\nĐực`.
11. With `navigator.clipboard.readText` rejecting, clicking `Replicate` shows `Replicate fail` and clicking `Append` shows `Append fail`.
12. With `navigator.clipboard` undefined, clicking `Copy` shows `copy fail` and nothing throws.

New tests in `src/components/ctdv.post.test.tsx` (they pin the byte-identical post format):

13. Default category, content `milu\npoodle nâu`: the post textarea value equals exactly `TÌM CHÓ LẠC\n    \nMilu\nPoodle nâu\n    \nNhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ.` This test is written first and must pass against the current `ctdv.tsx` before the rewrite starts, then again after it.
14. Same content, after clicking the chip `Chó lạc tìm chủ`: the post textarea value equals exactly `CHÓ LẠC TÌM CHỦ\n    \nMilu\nPoodle nâu\n    \nNhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn.` This test is added together with the chips.

New test in `src/components/ctdv.generating.test.tsx` (its mock generator waits on a promise the test controls):

15. After clicking `AI gen` and before the generator finishes: a button labelled `Generating...` is disabled; `Replicate`, `Copy`, `Append`, the `Assign` opener, and all four chips are disabled; both textareas are read-only; `Reload` is enabled. After the generator finishes, `AI gen` is back and enabled, and the other controls are enabled.

## Out of Scope (YAGNI)

- Dark mode or a theme switch.
- Translating button labels to Vietnamese.
- A two-column or otherwise distinct desktop layout.
- New features: post history, image upload, share buttons, offline support, a service worker.
- Any change to the AI prompt, `api/`, or `src/utils/aiGen.ts`.
- New logo or icon artwork; `logo192.png` and `logo512.png` stay as they are.
- Migrating off Create React App or off MUI.
- Changing how content is regenerated from assigned fields after `Assign` (section 7, last paragraph).
- Icons inside buttons, swipe-to-dismiss on the sheet, animations beyond MUI defaults.

## Verification

1. `CI=true npm test` — all suites pass.
2. `CI=true npm run build` — succeeds. With `CI=true`, any ESLint warning fails the build.
3. `npm start`, then in a browser with a 375×812 viewport:
   - The page shows header, four chips, two textareas, and the fixed bar, with no horizontal scroll.
   - Repeat at 320px wide: no horizontal scroll, the three bar buttons fit.
   - Repeat at 1280px wide: the column and the bar are each 480px wide and centred, with only the page background beside them.
   - Tapping each chip changes the first line of the post.
   - `Assign` opens the sheet from the bottom; `Cancel` discards; `Assign` writes labelled lines into the content.
   - `Copy` shows the `copy success` snackbar above the bar and it disappears after 3 seconds.
4. `npx vercel dev` (the CRA dev server does not serve `/api`): click `AI gen`, confirm text streams into the post, all controls except `Reload` are locked during the stream and unlocked after it.
5. On a real iPhone (Safari): focusing a textarea does not zoom the page, and the action bar clears the home indicator.

No change is made to AI generation code, so `scripts/probe-models.mjs` does not need to be run for this work.
