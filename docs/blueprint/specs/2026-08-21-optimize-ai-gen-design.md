# Optimize AI Generation — Design Spec

- **Date:** 2026-08-21
- **Project:** ctdv-react (Create React App, React 18, `@google/genai` ^2.16.0)
- **Goal:** Reduce the perceived and actual slowness of the "AI gen" feature.

## Context

The app helps write lost-pet Facebook posts. The "AI gen" button (`src/components/ctdv.tsx`, `handleAiGen`) calls `generateWithAI` in `src/utils/aiGen.ts:24`, which uses the **non-streaming** `ai.models.generateContent(...)`.

Because the call is non-streaming, the user sees the button stuck on "Generating..." with no feedback until the entire post is ready (several seconds). This produces both:

- **Perceived slowness** — no visible progress (user choice Q1 = C, both).
- **Real slowness** — full output is generated and buffered before anything is returned.

Constraint (Q3 = A): the solution must stay **client-only**. The API key remains in `.env` (`REACT_APP_GEMINI_API_KEY`) in the browser. No backend proxy is added.

## Chosen Approach

**Streaming output + safe generation config tuning** (user choice Q2 = D: A + C).

Replace the blocking `generateContent` with `generateContentStream`, and stream tokens directly into the "Bài Viết" textarea as they arrive. Add a conservative `config` (`maxOutputTokens`, `temperature`) to trim real generation time without changing prompt content or output quality.

Rejected alternatives:
- **Backend proxy** — hides key / picks faster region, but violates the client-only constraint (Q3 = A) and adds deploy infrastructure.
- **Prompt compression / model swap only** — marginal perceived benefit and risks extraction quality; not chosen as the primary fix.

## Design

### 1. Architecture & Data Flow

- Remains a 2-layer client app: `ctdv.tsx` (UI) → `aiGen.ts` (Gemini call). No new backend.
- `aiGen.ts` exports a new `generateWithAIStream(rawContent, title)` that returns an `AsyncGenerator<string>`, yielding text chunks as Gemini produces them.
- `ctdv.tsx` iterates the generator and appends each chunk to `finalRef.current.value` (the "Bài Viết" textarea) live, auto-scrolls, and keeps the button disabled via `isGenerating` for the whole streaming duration.

### 2. Changes to `src/utils/aiGen.ts`

Remove `generateWithAI`. Add a streaming generator:

```ts
import { GoogleGenAI } from '@google/genai';

const MODEL_NAME = 'gemini-3.6-flash';

function buildPrompt(rawContent: string, title: string): string {
  // UNCHANGED — prompt content is kept as-is (user choice Q5 = A)
  return `Bạn là trợ lý viết bài đăng tìm thú cưng lạc trên Facebook.

TIÊU ĐỀ BÀI ĐĂNG: ${title}

NỘI DUNG NGƯỜI DÙNG NHẬP:
${rawContent.trim() || '(Chưa có thông tin nào)'}

YÊU CẦU:
1. Viết bài đăng Facebook hoàn chỉnh, bắt đầu bằng TIÊU ĐỀ BÀI ĐĂNG ở trên
2. Trích xuất các thông tin có trong nội dung người dùng nhập và trình bày theo cấu trúc: Tên → Giống → Giới tính → Khu vực lạc → Thời gian lạc → Đặc điểm nhận dạng → Sdt liên hệ
3. Chỉ hiển thị các field có thông tin trích xuất được, KHÔNG hiển thị field không có
4. KHÔNG bịa thêm thông tin không có trong nội dung gốc
5. Viết theo văn phong bài đăng Facebook tìm thú cưng, có thể thêm emoji phù hợp
6. Cuối bài đăng thêm: "Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ."

CHỈ TRẢ VỀ NỘI DUNG BÀI ĐĂNG, KHÔNG GIẢI THÍCH.`;
}

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
      maxOutputTokens: 800, // user choice Q7 = A
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

Notes:
- `config` is the v2 SDK field for `maxOutputTokens` / `temperature` (confirmed in `node_modules/@google/genai/dist/genai.d.ts`, example at line 1647).
- `generateContentStream` returns `Promise<AsyncGenerator<GenerateContentResponse>>` (confirmed at `genai.d.ts:10087`); iterate with `for await`.
- `maxOutputTokens: 800` is enough for a typical pet post (< 600 tokens) and trims verbose output to reduce real time (Q7 = A).

### 3. Changes to `src/components/ctdv.tsx` — `handleAiGen`

Replace the current implementation (lines 129–144) with a streaming loop. UI behavior: text appears live in the "Bài Viết" textarea, button stays disabled and shows "Generating..." (existing `isGenerating` state already drives this).

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

- Import changes from `import { generateWithAI } from '../utils/aiGen';` to `import { generateWithAIStream } from '../utils/aiGen';`.
- Streaming target is `finalRef.current.value` directly, matching the current non-streaming assignment (user choice Q4 = A). No new React state for the streamed text — keeps the change minimal and consistent with the existing direct-DOM-write pattern used elsewhere in this component.

### 4. Error Handling & Edge Cases

- **Mid-stream failure (Q6 = A):** if the stream throws, `catch` shows the alert but the text already appended to `finalRef` is kept. The user can copy whatever was produced. The textarea is NOT cleared.
- **Missing API key:** unchanged — guarded before streaming starts, with an `alert`.
- **Overwrite guard:** the existing `useEffect` (lines 162–182) rebuilds `finalRef.current.value` from `contentRef` + title + footer whenever `title`, `isContentChanged`, `isAssigned`, or `assignInfo` change. While streaming, a change to one of those deps could overwrite the streamed text. This is a low-probability interaction (user rarely edits options mid-generation). If desired for safety, add `isGenerating` to the effect's dependency list and early-return when `isGenerating` is true. This guard is optional and out of scope unless the user requests it.

### 5. Testing

- Keep existing `src/App.test.tsx` intact.
- Add a lightweight unit test for `handleAiGen` (or `generateWithAIStream`) that mocks `GoogleGenAI` / `generateContentStream` to return an async generator yielding two chunks, then asserts the textarea value ends up containing the concatenation of both chunks after the handler resolves.
- No network/integration tests required.

## Out of Scope (YAGNI)

- Backend proxy / server deployment.
- Changing the prompt wording or extraction structure.
- Switching models or adding response caching.
- Replacing the direct-DOM-write pattern with React state for the output text.

## Verification

1. `npm start`, open the app, type sample input, click "AI gen".
2. Confirm text appears progressively in "Bài Viết" (not all at once after a pause).
3. Confirm button is disabled and shows "Generating..." during generation, then re-enables.
4. Simulate a failure (e.g., temporarily invalid key) → alert shows, partial text retained.
5. `npm test` passes including the new streaming test.
