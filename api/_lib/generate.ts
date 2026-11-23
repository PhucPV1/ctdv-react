// Lõi sinh bài viết: thử lần lượt nhiều model free, model nào chậm / lỗi /
// trả bài cụt thì bỏ qua và chuyển sang model kế tiếp.
//
// Thư mục bắt đầu bằng "_" nên Vercel không biến file này thành route.
// File không dùng Request/Response toàn cục để chạy được cả trong Jest.

/**
 * Ký tự điều khiển báo cho browser "xoá hết phần đã nhận, sắp viết lại từ
 * đầu". Chỉ phát ra khi một model đứt giữa chừng sau khi đã stream được một
 * đoạn. Phải khớp với RESET_MARKER trong src/utils/aiGen.ts.
 */
export const RESET_MARKER = '\u0018';

export type GenerateEvent = { type: 'text'; text: string } | { type: 'reset' };

export class GenerationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GenerationError';
    this.status = status;
  }
}

interface ReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?(): Promise<void>;
}

interface ResponseLike {
  ok: boolean;
  status: number;
  body: { getReader(): ReaderLike } | null;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<ResponseLike>;

interface ParsedChunk {
  text: string;
  finishReason?: string;
  usage?: unknown;
}

export interface Candidate {
  /** Tên để ghi log, ví dụ "gemini:gemini-3.5-flash-lite". */
  label: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Bóc text và lý do kết thúc từ một payload SSE của provider. */
  parse(payload: any): ParsedChunk;
  /** Giá trị finishReason khi model viết xong trọn vẹn. */
  okFinish: string;
}

export interface GenerateOptions {
  fetch: FetchLike;
  /** Chờ tối đa bao lâu cho chữ đầu tiên của một model. */
  firstTokenTimeoutMs?: number;
  /** Đang stream mà im lặng quá mức này thì coi như đứng hình. */
  idleTimeoutMs?: number;
  /**
   * Tổng thời gian được phép đi tìm một model chịu trả lời. Phải nhỏ hơn hẳn
   * trần 25s của Vercel Edge để không bao giờ dính 504 của nền tảng.
   */
  totalTimeoutMs?: number;
  now?: () => number;
  log?: (line: string) => void;
}

const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 4000;
const DEFAULT_IDLE_TIMEOUT_MS = 4000;
const DEFAULT_TOTAL_TIMEOUT_MS = 18000;
/** Còn ít hơn chừng này thì không bắt đầu thêm lượt thử nào nữa. */
const MIN_ATTEMPT_MS = 1000;
const MAX_PASSES = 2;

// Hạn mức free tier của Gemini tính riêng cho từng model, nên xếp nhiều model
// cùng một key vẫn có tác dụng khi một model hết quota hoặc quá tải.
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];
// Groq: free, rất nhanh, API tương thích OpenAI. Chỉ dùng khi có GROQ_API_KEY.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

const TEMPERATURE = 0.7;

type FailureKind = 'quota' | 'auth' | 'rejected' | 'transient';

class AttemptError extends Error {
  readonly kind: FailureKind;

  constructor(kind: FailureKind, message: string) {
    super(message);
    this.name = 'AttemptError';
    this.kind = kind;
  }
}

function parseGeminiChunk(payload: any): ParsedChunk {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .filter((part: { thought?: boolean }) => !part?.thought)
        .map((part: { text?: string }) => part?.text ?? '')
        .join('')
    : '';
  const blockReason = payload?.promptFeedback?.blockReason;
  return {
    text,
    finishReason:
      candidate?.finishReason ??
      (blockReason ? `BLOCKED_${blockReason}` : undefined),
    usage: payload?.usageMetadata,
  };
}

function parseOpenAiChunk(payload: any): ParsedChunk {
  const choice = payload?.choices?.[0];
  const content = choice?.delta?.content;
  return {
    text: typeof content === 'string' ? content : '',
    finishReason: choice?.finish_reason ?? undefined,
    usage: payload?.usage ?? payload?.x_groq?.usage,
  };
}

function geminiCandidate(
  model: string,
  apiKey: string,
  prompt: string,
): Candidate {
  return {
    label: `gemini:${model}`,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    headers: { 'x-goog-api-key': apiKey },
    body: {
      contents: [{ parts: [{ text: prompt }] }],
      // Cố ý KHÔNG gửi thinkingConfig. Mặc định của dòng flash-lite đã là mức
      // suy luận thấp nhất (3.x: "minimal", 2.5: tắt hẳn). Ép "low" như trước
      // là bật suy luận CAO hơn mặc định; token suy luận lại tính chung vào
      // maxOutputTokens nên bài bị cắt ngang và có lúc chờ hàng chục giây.
      generationConfig: { temperature: TEMPERATURE, maxOutputTokens: 4096 },
    },
    parse: parseGeminiChunk,
    okFinish: 'STOP',
  };
}

function groqCandidate(
  model: string,
  apiKey: string,
  prompt: string,
): Candidate {
  return {
    label: `groq:${model}`,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: TEMPERATURE,
      max_completion_tokens: 2048,
      stream: true,
      // gpt-oss luôn suy luận; "low" là mức thấp nhất được hỗ trợ và
      // include_reasoning=false để phần suy luận không lẫn vào bài viết.
      reasoning_effort: 'low',
      include_reasoning: false,
    },
    parse: parseOpenAiChunk,
    okFinish: 'stop',
  };
}

/**
 * Danh sách model sẽ thử, theo thứ tự ưu tiên. Xen kẽ provider để nếu cả
 * Gemini trục trặc thì chỉ mất tối đa hai lượt chờ trước khi sang Groq.
 */
export function buildCandidates(
  prompt: string,
  env: Record<string, string | undefined>,
): Candidate[] {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const groqKey = env.GROQ_API_KEY?.trim();

  const gemini = geminiKey
    ? GEMINI_MODELS.map((model) => geminiCandidate(model, geminiKey, prompt))
    : [];
  const groq = groqKey
    ? GROQ_MODELS.map((model) => groqCandidate(model, groqKey, prompt))
    : [];

  return [
    ...gemini.slice(0, 2),
    ...groq.slice(0, 1),
    ...gemini.slice(2),
    ...groq.slice(1),
  ];
}

/**
 * Chờ promise nhưng không quá `ms`. Hết giờ thì gọi onTimeout (để huỷ request)
 * và reject bằng lỗi "transient" để model kế tiếp được thử.
 */
function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => void,
  reason: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        onTimeout();
        reject(new AttemptError('transient', reason));
      },
      Math.max(0, ms),
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorForStatus(status: number, detail: string): AttemptError {
  const summary = `HTTP ${status} ${detail.slice(0, 300)}`.trim();
  if (status === 429) return new AttemptError('quota', summary);
  if (status === 401 || status === 403)
    return new AttemptError('auth', summary);
  if (status === 400 || status === 404) {
    return new AttemptError('rejected', summary);
  }
  return new AttemptError('transient', summary);
}

interface AttemptStats {
  firstTokenMs?: number;
  usage?: unknown;
}

/** Stream text từ một model. Ném AttemptError nếu model không viết xong trọn vẹn. */
async function* streamCandidate(
  candidate: Candidate,
  fetchImpl: FetchLike,
  timing: { firstTokenTimeoutMs: number; idleTimeoutMs: number },
  deadlineAt: number,
  now: () => number,
  stats: AttemptStats,
): AsyncGenerator<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const startedAt = now();
  const firstTokenAt = Math.min(
    startedAt + timing.firstTokenTimeoutMs,
    deadlineAt,
  );
  let reader: ReaderLike | undefined;

  try {
    const response = await raceTimeout(
      fetchImpl(candidate.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...candidate.headers },
        body: JSON.stringify(candidate.body),
        signal: controller.signal,
      }),
      firstTokenAt - now(),
      abort,
      'quá hạn chờ phản hồi',
    );

    if (!response.ok || !response.body) {
      const detail = await raceTimeout(
        response.text(),
        1500,
        abort,
        'quá hạn đọc lỗi',
      ).catch(() => '');
      throw errorForStatus(response.status, detail);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawText = false;
    let finishReason: string | undefined;

    const takeLine = (line: string): string => {
      if (!line.startsWith('data:')) return '';
      const payload = line.slice('data:'.length).trim();
      if (!payload || payload === '[DONE]') return '';
      let parsed: ParsedChunk;
      try {
        parsed = candidate.parse(JSON.parse(payload));
      } catch {
        // Dòng SSE hỏng thì bỏ qua; nếu vì thế mà thiếu finishReason thì cả
        // lượt thử sẽ bị coi là không trọn vẹn ở bước kiểm tra bên dưới.
        return '';
      }
      if (parsed.finishReason) finishReason = parsed.finishReason;
      if (parsed.usage) stats.usage = parsed.usage;
      return parsed.text.split(RESET_MARKER).join('');
    };

    for (;;) {
      // Khi chữ đã chảy thì chỉ canh khoảng lặng giữa hai chunk; hạn tổng chỉ
      // áp cho việc tìm model, không cắt ngang một bài đang viết ngon lành.
      const waitMs = sawText ? timing.idleTimeoutMs : firstTokenAt - now();
      const { done, value } = await raceTimeout(
        reader.read(),
        waitMs,
        abort,
        sawText ? 'đứng hình giữa chừng' : 'quá hạn chờ chữ đầu tiên',
      );
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const text = takeLine(buffer.slice(0, newlineIndex).trim());
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (text) {
          if (!sawText) stats.firstTokenMs = now() - startedAt;
          sawText = true;
          yield text;
        }
      }
    }

    const tail = takeLine((buffer + decoder.decode()).trim());
    if (tail) {
      sawText = true;
      yield tail;
    }

    if (finishReason !== candidate.okFinish) {
      // Không có finishReason = stream đứt; MAX_TOKENS / length = bài bị cắt.
      // Hai trường hợp đó thử lại có thể được, còn bị chặn nội dung thì không.
      const truncated =
        finishReason === undefined ||
        finishReason === 'MAX_TOKENS' ||
        finishReason === 'length';
      throw new AttemptError(
        truncated ? 'transient' : 'rejected',
        `kết thúc không trọn vẹn (finishReason=${finishReason ?? 'không có'})`,
      );
    }
    if (!sawText) {
      throw new AttemptError('transient', 'không trả về nội dung');
    }
  } finally {
    abort();
    reader?.cancel?.().catch(() => undefined);
  }
}

function finalError(kinds: FailureKind[]): GenerationError {
  if (kinds.length > 0 && kinds.every((kind) => kind === 'quota')) {
    return new GenerationError(
      429,
      'Đã hết hạn mức miễn phí của các model AI. Thử lại sau ít phút.',
    );
  }
  if (kinds.length > 0 && kinds.every((kind) => kind === 'auth')) {
    return new GenerationError(
      502,
      'API key AI không hợp lệ hoặc đã bị vô hiệu hoá. Cần cập nhật GEMINI_API_KEY / GROQ_API_KEY.',
    );
  }
  return new GenerationError(
    503,
    'AI đang quá tải, chưa viết được bài. Bấm AI gen lần nữa nhé.',
  );
}

/**
 * Sinh bài viết bằng model đầu tiên chịu trả lời trọn vẹn.
 *
 * Phát ra các đoạn text theo thứ tự. Nếu một model đứt sau khi đã phát text,
 * phát thêm sự kiện "reset" rồi mới chuyển sang model kế tiếp. Khi mọi model
 * đều thất bại thì ném GenerationError; lúc đó phía nhận luôn đang ở trạng
 * thái rỗng (chưa có text, hoặc text đã bị reset).
 */
export async function* generatePost(
  candidates: Candidate[],
  options: GenerateOptions,
): AsyncGenerator<GenerateEvent> {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.log(line));
  const timing = {
    firstTokenTimeoutMs:
      options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS,
    idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
  const deadlineAt =
    now() + (options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);

  const kinds: FailureKind[] = [];
  let queue = candidates;

  for (let pass = 0; pass < MAX_PASSES && queue.length > 0; pass++) {
    const retryable: Candidate[] = [];

    for (const candidate of queue) {
      if (deadlineAt - now() < MIN_ATTEMPT_MS) {
        throw finalError(kinds);
      }

      const startedAt = now();
      const stats: AttemptStats = {};
      let emitted = false;

      try {
        for await (const text of streamCandidate(
          candidate,
          options.fetch,
          timing,
          deadlineAt,
          now,
          stats,
        )) {
          emitted = true;
          yield { type: 'text', text };
        }
        log(
          `[ai-gen] ok ${candidate.label} ttft=${stats.firstTokenMs}ms total=${
            now() - startedAt
          }ms usage=${JSON.stringify(stats.usage ?? null)}`,
        );
        return;
      } catch (error) {
        const kind: FailureKind =
          error instanceof AttemptError ? error.kind : 'transient';
        const reason = error instanceof Error ? error.message : String(error);
        kinds.push(kind);
        log(
          `[ai-gen] fail ${candidate.label} after=${
            now() - startedAt
          }ms kind=${kind} emitted=${emitted} reason=${reason} usage=${JSON.stringify(
            stats.usage ?? null,
          )}`,
        );
        if (emitted) yield { type: 'reset' };
        if (kind === 'transient') retryable.push(candidate);
      }
    }

    queue = retryable;
  }

  throw finalError(kinds);
}
