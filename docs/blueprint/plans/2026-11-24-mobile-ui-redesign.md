# Mobile-First UI Redesign Implementation Plan

Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/blueprint/specs/2026-11-24-mobile-ui-redesign-design.md`

**Status:** approved 2026-11-24 (the user pre-approved the plan and asked for implementation in the same session)

**Goal:** Rebuild the single screen of ctdv-react as a one-handed mobile layout with the "Ấm áp" theme, keeping every feature and the exact post output.

**Architecture:** `Ctdv` keeps state, refs, the post-composition effect, and the clipboard/AI handlers. Presentation moves into `CategoryChips`, `ActionBar`, and `AssignSheet`. Colours live in `src/theme.ts` (MUI) and the `:root` block of `ctdv.css` (plain elements).

**Tech Stack:** React 18.2, Create React App 5.0.1, TypeScript 4.8, MUI 5.10.12, Jest + React Testing Library.

**Format note:** This plan is condensed. It was executed by the same session that wrote the spec, so the code is in the commit and is not duplicated here. Exact values (tokens, sizes, texts, test expectations) are in the spec; each task names the spec section it implements.

## Global Constraints

Copied from the spec; every task must obey them.

- Versions stay as installed: Node 20, `react` 18.2.0, `react-scripts` 5.0.1, `typescript` 4.8.4, `@mui/material` 5.10.12, `@mui/icons-material` 5.10.9, `@emotion/react` 11.10.5.
- `package.json` and `package-lock.json` are not modified.
- Not modified: `api/**`, `scripts/**`, `src/utils/**`, `.env.example`.
- Light theme only.
- Button labels exactly: `Replicate`, `Append`, `Assign`, `AI gen`, `Generating...`, `Copy`, `Reload`, `Cancel`.
- `<h1>` text exactly `Tìm Chó Mèo Lạc Đà Nẵng`. Section labels exactly `Thể loại`, `Nội dung`, `Bài Viết`.
- Colours, radii, and font sizes only from the spec's Design Tokens section (exempt: MUI ripple, `Drawer` shadow).
- Disabled controls keep their colours at `opacity: 0.45`.
- Every `<textarea>` and `<select>` has `font-size: 16px`.
- Tap heights: 48px bar and sheet-footer buttons; 44px chips and selects; 40px pill buttons.
- Column, action bar, and Assign sheet are at most 480px wide and centred.
- Post output is byte-identical to the old code for the same inputs.
- `@fontsource/roboto` imports (300, 400, 500, 700) stay in `src/components/ctdv.tsx`.
- Formatted with the repository `.prettierrc`.
- `CI=true npm test` passes and `CI=true npm run build` succeeds.

---

### Task 1: Pin the post format before touching the component

**Files:**

- Create: `src/components/ctdv.post.test.tsx`

**Interfaces:**

- Consumes: the current `Ctdv` (first textbox = content, last textbox = post).
- Produces: a characterisation test that later tasks must keep green.

- [ ] Write the default-category test and a replacements-order test (spec section 5, "Post composition"; spec test 13).
- [ ] Run: `CI=true npx react-scripts test --watchAll=false src/components/ctdv.post.test.tsx`. Expected: PASS against the unmodified `ctdv.tsx`.

### Task 2: Theme and shared data

**Files:**

- Create: `src/theme.ts` (spec sections "Design Tokens" and 2)
- Create: `src/components/assignInfo.ts` (spec section 1)
- Modify: `src/App.tsx`; delete `src/App.css`

**Interfaces:**

- Produces: `tokens` and `theme` from `src/theme.ts`; `AssignInfo`, `ContentKeyInfo`, `assignKeys`, `initialAssignInfo`, `generateContent` from `assignInfo.ts`.

- [ ] Create both files; wrap `<Ctdv />` in `<ThemeProvider theme={theme}>`.
- [ ] Run: `CI=true npx react-scripts test --watchAll=false`. Expected: all existing suites PASS.

### Task 3: Presentational components

**Files:**

- Create: `src/components/CategoryChips.tsx` (spec section 4)
- Create: `src/components/ActionBar.tsx` (spec section 5)
- Create: `src/components/AssignSheet.tsx` (spec section 7)

**Interfaces:**

- Produces:

  - `CategoryChips({ value: CategoryOption; onChange(value: CategoryOption): void; disabled: boolean })`, and the type `CategoryOption = 'dog' | 'cat' | 'dogFindOwner' | 'catFindOwner'`.
  - `ActionBar({ isGenerating: boolean; onReplicate(): void; onAiGen(): void; onCopy(): void })`.
  - `AssignSheet({ open: boolean; lines: string[]; value: AssignInfo; onAssign(next: AssignInfo): void; onCancel(): void })`.

- [ ] Create the three components. They are exercised through `Ctdv` in Task 4's tests.

### Task 4: Rewrite `Ctdv` and its stylesheet

**Files:**

- Rewrite: `src/components/ctdv.tsx` (spec sections 3, 5, 6, 7 "Wiring")
- Rewrite: `src/components/ctdv.css` (spec sections 1, 3, 5, 7)
- Modify: `src/components/ctdv.aiFailure.test.tsx` (snackbar text instead of `window.alert`)
- Modify: `src/components/ctdv.post.test.tsx` (add the find-owner test, spec test 14)
- Create: `src/components/ctdv.ui.test.tsx` (spec tests 1–12)
- Create: `src/components/ctdv.generating.test.tsx` (spec test 15)

**Interfaces:**

- Consumes: everything produced by Tasks 2 and 3.

- [ ] Write the new tests first. Run them. Expected: FAIL (chips, sheet, snackbar do not exist yet).
- [ ] Rewrite `ctdv.tsx` and `ctdv.css`.
- [ ] Run: `CI=true npx react-scripts test --watchAll=false`. Expected: every suite PASS, including Task 1's test.

One change from the approved spec, found during browser verification and recorded in the spec as an amendment: the textareas are plain `<textarea>` elements sized by a `fitRows` helper in `ctdv.tsx`, not MUI `TextareaAutosize`. `TextareaAutosize` clipped the last line of the post (it under-counts wrapped lines when the textarea has horizontal padding, measures before the effect writes the new text, and stops resizing an uncontrolled textarea after 20 height changes). The bar buttons also use `padding: 0 6px`, not `0 8px`, so `Replicate` is not cut at 320px.

### Task 5: Page metadata

**Files:**

- Modify: `public/index.html`, `public/manifest.json` (spec section 8)
- Modify: `.gitignore` (add `.blueprint/`, the mockup directory)

- [ ] Apply the values from spec section 8.
- [ ] Run: `CI=true npm run build`. Expected: "Compiled successfully."

### Task 6: Verify

- [ ] `CI=true npm test`. Expected: all suites PASS.
- [ ] `CI=true npm run build`. Expected: "Compiled successfully."
- [ ] Browser check at 375px, 320px, and 1280px widths per the spec's Verification section, step 3.
- [ ] Spec Verification steps 4 (`npx vercel dev`, real AI stream) and 5 (real iPhone) need the user's API keys and device; report them as not run if they were not.
