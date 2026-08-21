# Optimize AI Generation — Implementation Plan

Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "AI gen" feature stream tokens into the Bài Viết textarea as they are produced, removing the perceived freeze and trimming real generation time — without adding a backend.

**Architecture:** Replace the blocking `ai.models.generateContent` call in `src/utils/aiGen.ts` with `ai.models.generateContentStream`, exposed as an async generator `generateWithAIStream`. `src/components/ctdv.tsx` consumes that generator in `handleAiGen`, appending each chunk to the `finalRef` textarea live and keeping the button disabled during the stream.

**Tech Stack:** React 18, TypeScript 4.8, `@google/genai` ^2.16.0, Create React App (`react-scripts` 5.0.1), Jest + `@testing-library/react` (via `react-scripts test`).

## Global Constraints

- **Client-only:** no backend/server may be added; the API key stays in `.env` as `REACT_APP_GEMINI_API_KEY` in the browser. (Spec Q3 = A)
- **Prompt unchanged:** `buildPrompt` in `aiGen.ts` must keep its exact current content; do not edit prompt wording. (Spec Q5 = A)
- **Generation config:** pass `config: { maxOutputTokens: 800, temperature: 0.7 }` via the SDK v2 `config` field of `generateContentStream`. (Spec Q7 = A)
- **Streaming target:** write streamed text directly into the `finalRef` "Bài Viết" textarea (not a separate state/preview). (Spec Q4 = A)
- **Error behavior:** on a mid-stream failure, keep the already-streamed text in the textarea and show an alert; do NOT clear it. (Spec Q6 = A)
- **No dead code:** remove `generateWithAI` entirely; do not keep the old non-streaming function. (Spec Q8 = A)
- **SDK API facts (verified):** `ai.models.generateContentStream(params)` returns `Promise<AsyncGenerator<GenerateContentResponse>>`; params type is `GenerateContentParameters` with fields `model`, `contents`, and `config?: GenerateContentConfig`.

---

## File Structure

- **Modify `src/utils/aiGen.ts`** — Remove `generateWithAI`. Add `generateWithAIStream(rawContent: string, title: string): AsyncGenerator<string>`. Keeps `MODEL_NAME` and `buildPrompt` unchanged.
- **Create `src/utils/aiGen.test.ts`** — Unit test for `generateWithAIStream`: happy path yields concatenated chunks; missing API key throws. Mocks `@google/genai`.
- **Modify `src/components/ctdv.tsx`** — Change the import from `generateWithAI` to `generateWithAIStream`, and rewrite `handleAiGen` to iterate the generator and append chunks to `finalRef.current.value` live with auto-scroll.
- **Modify `src/components/ctdv.test.tsx`** (created if not present) — Integration test: clicking "AI gen" streams text into the second textarea. Mocks `../utils/aiGen`.

---

### Task 1: Streaming generator in `aiGen.ts`

**Files:**
- Modify: `src/utils/aiGen.ts` (replace `generateWithAI`, lines 24–47)
- Create: `src/utils/aiGen.test.ts`

**Interfaces:**
- Consumes: `GoogleGenAI` from `@google/genai` (SDK v2), `ai.models.generateContentStream({ model, contents, config })` returning `Promise<AsyncGenerator<GenerateContentResponse>>` where `chunk.text` is `string | undefined`.
- Produces: `export async function* generateWithAIStream(rawContent: string, title: string): AsyncGenerator<string>` — yields successive non-empty text chunks from the model. Throws `Error` with message containing `"API key"` when `process.env.REACT_APP_GEMINI_API_KEY` is falsy.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/aiGen.test.ts
import { generateWithAIStream } from './aiGen';

jest.mock('@google/genai', () => {
  const mockStream = async function* () {
    yield 'Hello ';
    yield 'world';
  };
  return {
    GoogleGenAI: class {
      models = {
        generateContentStream: jest.fn(async () => mockStream()),
      };
    },
  };
});

describe('generateWithAIStream', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, REACT_APP_GEMINI_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('yields model chunks concatenated in order', async () => {
    const chunks: string[] = [];
    for await (const chunk of generateWithAIStream('raw input', 'TITLE')) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('Hello world');
  });

  it('throws when API key is missing', async () => {
    process.env = { ...OLD_ENV };
    delete (process.env as { REACT_APP_GEMINI_API_KEY?: string }).REACT_APP_GEMINI_API_KEY;

    await expect(async () => {
      for await (const _ of generateWithAIStream('raw input', 'TITLE')) {
        // drain
      }
    }).rejects.toThrow(/API key/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/aiGen.test.ts`
Expected: FAIL — `generateWithAIStream` is not exported / `generateWithAI` does not match.

- [ ] **Step 3: Write minimal implementation**

Replace the entire `generateWithAI` function (current `src/utils/aiGen.ts:24-47`) with:

```ts
export async function* generateWithAIStream(
  rawContent: string,
  title: string
): AsyncGenerator<string> {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'API key chưa được cấu hình. Vui lòng tạo file .env với REACT_APP_GEMINI_API_KEY=<your-key>'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const stream = await ai.models.generateContentStream({
    model: MODEL_NAME,
    contents: buildPrompt(rawContent, title),
    config: {
      maxOutputTokens: 800,
      temperature: 0.7,
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
```

`MODEL_NAME` and `buildPrompt` above this function stay exactly as they are.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/aiGen.test.ts`
Expected: PASS (both tests green).

---

### Task 2: Wire streaming into `ctdv.tsx` `handleAiGen`

**Files:**
- Modify: `src/components/ctdv.tsx:17` (import) and `src/components/ctdv.tsx:129-144` (`handleAiGen`)

**Interfaces:**
- Consumes: `generateWithAIStream(rawContent: string, title: string): AsyncGenerator<string>` from `../utils/aiGen` (defined in Task 1).
- Produces: UI behavior — while streaming, button shows "Generating..." and is disabled (driven by existing `isGenerating` state); text appears progressively in the `finalRef` textarea; on error an `alert` shows and partial text is retained.

- [ ] **Step 1: Update the import**

Replace line 17:
```ts
import { generateWithAI } from '../utils/aiGen';
```
with:
```ts
import { generateWithAIStream } from '../utils/aiGen';
```

- [ ] **Step 2: Replace `handleAiGen` implementation**

Replace the current `handleAiGen` (lines 129–144) with:

```ts
  async function handleAiGen() {
    if (!process.env.REACT_APP_GEMINI_API_KEY) {
      alert('API key chưa được cấu hình. Vui lòng tạo file .env với REACT_APP_GEMINI_API_KEY=<your-key>');
      return;
    }

    setIsGenerating(true);
    finalRef.current.value = '';
    try {
      for await (
        const chunk of generateWithAIStream(contentRef.current.value, title)
      ) {
        finalRef.current.value += chunk;
        finalRef.current.scrollTop = finalRef.current.scrollHeight;
      }
    } catch (error) {
      alert(`Lỗi AI gen: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm start` (or `npx tsc --noEmit`)
Expected: no TypeScript errors; the "AI gen" button still renders and is wired to `handleAiGen`. (Full streaming behavior is asserted in Task 3.)

---

### Task 3: Integration test for streaming UI

**Files:**
- Create: `src/components/ctdv.test.tsx` (if a `ctdv` test file does not already exist; otherwise add the test below to it)

**Interfaces:**
- Consumes: `generateWithAIStream` from `../utils/aiGen` (mocked here). The component reads content from `contentRef.current.value` and writes streamed output to `finalRef.current.value` (the second `textarea` rendered).
- Produces: confidence that clicking "AI gen" streams text into the Bài Viết textarea and that the button is disabled during generation.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ctdv.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Ctdv from './ctdv';

jest.mock('../utils/aiGen', () => ({
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    yield 'A';
    yield 'B';
  },
}));

test('AI gen streams tokens into the Bài Viết textarea', async () => {
  render(<Ctdv />);

  const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  const contentArea = textareas[0];
  const resultArea = textareas[textareas.length - 1];

  fireEvent.change(contentArea, { target: { value: 'some pet info' } });

  const aiButton = screen.getByText(/AI gen/i);
  fireEvent.click(aiButton);

  await waitFor(() => expect(resultArea).toHaveValue('AB'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ctdv.test.tsx`
Expected: FAIL — either `generateWithAIStream` import mismatch or the textarea value is not `'AB'` (old code does nothing on click).

- [ ] **Step 3: Implement (already done in Task 2) — confirm wiring is correct**

Task 2 already replaced the import and `handleAiGen`. No further code change is needed here; this task exists to prove the wiring works end-to-end. If the test still fails, return to Task 2 and check: (a) import name is `generateWithAIStream`, (b) `handleAiGen` iterates the generator and appends to `finalRef.current.value`, (c) the "AI gen" button's `onClick` is `handleAiGen`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ctdv.test.tsx`
Expected: PASS — `resultArea` value becomes `'AB'` after clicking.

---

### Task 4: Manual verification

**Files:** none (verification only)

**Interfaces:** Consumes the built app from Task 2/3.

- [ ] **Step 1: Run the dev server**

Run: `npm start`
Expected: app opens at the local dev URL.

- [ ] **Step 2: Verify progressive streaming**

Type sample input in the "Nội dung" textarea, click **AI gen**.
Expected: text appears progressively in "Bài Viết" (not all at once after a pause); button shows "Generating..." and is disabled during generation, then re-enables.

- [ ] **Step 3: Verify error retention**

Temporarily set `REACT_APP_GEMINI_API_KEY` to an invalid value (or break the network), click **AI gen**.
Expected: an alert shows the error, and any text already streamed remains in "Bài Viết" (not cleared). Restore the valid key after.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including `aiGen.test.ts` and `ctdv.test.tsx`.

---

## Self-Review Notes

- **Spec coverage:** streaming generator (Task 1) ✔, client-only/no backend (Global Constraints) ✔, prompt unchanged (Task 1 keeps `buildPrompt`) ✔, `config` maxOutputTokens 800 / temperature 0.7 (Task 1) ✔, stream into `finalRef` (Task 2) ✔, keep partial text on error (Task 2 `catch` does not clear; Task 4 Step 3) ✔, remove `generateWithAI` (Task 1) ✔, component test (Task 3) ✔.
- **Placeholders:** none — every step has concrete code or exact commands.
- **Type consistency:** `generateWithAIStream(rawContent: string, title: string): AsyncGenerator<string>` is the exact signature used in Task 1 (definition), Task 2 (import + call), and Task 3 (mock). `finalRef` / `contentRef` / `isGenerating` / `title` are existing identifiers in `ctdv.tsx` referenced unchanged.
