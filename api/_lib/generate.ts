// Lõi sinh bài viết: gọi song song vài model free và chỉ nhận bài của model
// đầu tiên viết xong TRỌN VẸN.
//
// Vì sao phải làm vậy (đo trực tiếp bằng key thật, 23/11/2026): tầng free của
// Gemini flash-lite đang quá tải. Stream hay bị cắt giữa chừng mà không có
// finishReason, hoặc trả 503 "high demand", và thời gian ra chữ đầu tiên dao
// động từ 1s tới hơn 10s. Token suy luận luôn bằng 0 nên thinkingConfig không
// phải nguyên nhân. Một lượt gọi đơn lẻ vì thế không đáng tin; nhiều lượt chạy
// đua nhau thì có.
//
// Thư mục bắt đầu bằng "_" nên Vercel không biến file này thành route.
// File không dùng Request/Response toàn cục để chạy được cả trong Jest.

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
  /** Số model được gọi ngay từ đầu, cùng lúc. */
  initialParallel?: number;
  /** Chưa có bài nào xong sau chừng này thì gọi thêm một model nữa. */
  hedgeDelayMs?: number;
  /** Số lượt gọi tối đa chạy cùng lúc. */
  maxConcurrent?: number;
  /** Tổng số lượt gọi tối đa cho một lần bấm, để không đốt hết quota. */
  maxAttempts?: number;
  /** Lượt vừa hỏng rất nhanh (ví dụ 503) thì chờ chừng này rồi mới gọi thay. */
  retryDelayMs?: number;
  /** Một lượt gọi chưa ra chữ nào sau chừng này thì bỏ, nhường chỗ lượt khác. */
  firstTokenTimeoutMs?: number;
  /** Đang viết mà im lặng quá mức này thì coi như đã bị cắt. */
  stallTimeoutMs?: number;
  /**
   * Hạn chót cho cả quá trình. Phải nhỏ hơn hẳn trần 25s của Vercel Edge để
   * không bao giờ dính 504 của nền tảng.
   */
  totalTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface GenerateResult {
  text: string;
  /** Model đã viết bài này. */
  label: string;
}

const DEFAULTS = {
  initialParallel: 2,
  hedgeDelayMs: 1500,
  maxConcurrent: 3,
  maxAttempts: 10,
  retryDelayMs: 500,
  // Đo thực tế: lượt chậm mà vẫn xong ra chữ đầu ở 7.5s; lượt ra chữ đầu sau
  // 9-12s thì đều bị cắt.
  firstTokenTimeoutMs: 8000,
  // Đo thực tế: lượt trọn vẹn khựng tối đa 1.0s giữa hai chunk; lượt bị cắt
  // khựng từ 3s trở lên.
  stallTimeoutMs: 2500,
  totalTimeoutMs: 20000,
};

const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
// Groq: free, rất nhanh, API tương thích OpenAI. Chỉ dùng khi có GROQ_API_KEY.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

const TEMPERATURE = 0.7;

/** Prompt dùng chung cho mọi model (và cho scripts/probe-models.mjs). */
export function buildPrompt(rawContent: string, title: string): string {
  return `Bạn là người viết content Facebook, đang giúp chủ nhân viết bài đăng tìm thú cưng lạc sao cho CHÂN THẬT, XÚC ĐỘNG và DỄ ĐƯỢC CHIA SẺ, BÌNH LUẬN.

TIÊU ĐỀ BÀI ĐĂNG: ${title}

NỘI DUNG NGƯỜI DÙNG NHẬP:
${rawContent.trim() || '(Chưa có thông tin nào)'}

YÊU CẦU:
1. Bắt đầu bằng đúng TIÊU ĐỀ BÀI ĐĂNG ở trên.
2. Ngay sau tiêu đề, viết 1-2 câu MỞ BÀI chân thành, gợi đồng cảm (tâm trạng chủ, sự khẩn cấp vừa phải). CHỈ dùng cảm xúc từ thông tin thật - KHÔNG thổi phồng, KHÔNG giật gân.
3. Trích xuất thông tin và trình bày khối có cấu trúc: Tên → Giống → Giới tính → Khu vực lạc → Thời gian lạc → Đặc điểm nhận dạng → Sdt liên hệ. CHỈ hiển thị field có thông tin. Field nào nội dung gốc không có (ví dụ không có số điện thoại) thì BỎ HẲN cả dòng đó: KHÔNG để trống, KHÔNG ghi chú thay thế, KHÔNG viết kiểu "(vui lòng nhắn tin)" hay "[điền vào đây]".
4. KHÔNG bịa thêm thông tin không có trong nội dung gốc.
5. Kết bài: cảm ơn, kêu gọi CHIA SẺ bài viết để bé sớm về nhà, và mời người từng thấy bé / có thông tin nhắn tin cho chủ (tạo động lực bình luận). Văn phong tự nhiên, có thể thêm emoji.
6. Cuối cùng thêm dòng HASHTAG địa phương: #ĐàNẵng #ChóLạc (đổi #MèoLạc nếu là mèo) #ThúCưngLạc #ĐàNẵngThúCưng.
7. Viết VĂN BẢN THUẦN để dán thẳng lên Facebook: KHÔNG dùng Markdown, KHÔNG dùng dấu ** hay __ để in đậm, KHÔNG dùng # làm tiêu đề (chỉ dùng # cho hashtag ở dòng cuối).

CHỈ TRẢ VỀ NỘI DUNG BÀI ĐĂNG, KHÔNG GIẢI THÍCH.`;
}

/**
 * Facebook không hiển thị Markdown, nên dấu ** hay # đầu dòng sẽ hiện nguyên
 * văn trong bài đăng. Prompt đã dặn không dùng; hàm này là lớp chặn cuối vì
 * model vẫn có lúc quên (đo thực tế: cả Gemini lẫn gpt-oss đều từng in đậm).
 */
export function cleanPost(text: string): string {
  return (
    text
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/__([^_\n]+)__/g, '$1')
      .replace(/\*\*/g, '')
      // Tiêu đề Markdown có khoảng trắng sau dấu #; hashtag thì không.
      .replace(/^#{1,6}[ \t]+/gm, '')
      .trim()
  );
}

type FailureKind = 'quota' | 'auth' | 'rejected' | 'transient';

class AttemptError extends Error {
  readonly kind: FailureKind;
  /** Model từ chối ngay bằng mã lỗi HTTP, chưa viết được chữ nào. */
  readonly refused: boolean;

  constructor(kind: FailureKind, message: string, refused = false) {
    super(message);
    this.name = 'AttemptError';
    this.kind = kind;
    this.refused = refused;
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
      generationConfig: {
        temperature: TEMPERATURE,
        maxOutputTokens: 4096,
        // "minimal" là mức suy luận thấp nhất của dòng 3.x flash-lite. Tác vụ
        // chỉ sắp xếp lại thông tin có sẵn nên không cần hơn.
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
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
 * Danh sách model theo thứ tự ưu tiên, xen kẽ provider: hai model đầu được gọi
 * cùng lúc, nên khi có cả hai key thì đó là một Gemini và một Groq.
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

  const ordered: Candidate[] = [];
  for (let i = 0; i < Math.max(gemini.length, groq.length); i++) {
    if (gemini[i]) ordered.push(gemini[i]);
    if (groq[i]) ordered.push(groq[i]);
  }
  return ordered;
}

/**
 * Chờ promise nhưng không quá `ms`. Hết giờ thì reject bằng lỗi "transient".
 */
function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  reason: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AttemptError('transient', reason)),
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
  const summary = `HTTP ${status} ${detail
    .replace(/\s+/g, ' ')
    .slice(0, 300)}`.trim();
  if (status === 429) return new AttemptError('quota', summary, true);
  // Gemini báo key sai bằng 400 chứ không phải 401.
  const badKey = status === 400 && /api key/i.test(detail);
  if (status === 401 || status === 403 || badKey) {
    return new AttemptError('auth', summary, true);
  }
  if (status === 400 || status === 404) {
    return new AttemptError('rejected', summary, true);
  }
  return new AttemptError('transient', summary, true);
}

interface AttemptStats {
  firstTokenMs?: number;
  usage?: unknown;
}

/**
 * Gọi một model và trả về toàn bộ bài viết. Ném AttemptError nếu model không
 * viết xong trọn vẹn; bài dở dang không bao giờ được trả ra ngoài.
 */
async function runAttempt(
  candidate: Candidate,
  fetchImpl: FetchLike,
  controller: AbortController,
  timing: { firstTokenTimeoutMs: number; stallTimeoutMs: number },
  stats: AttemptStats,
): Promise<string> {
  const startedAt = Date.now();
  const firstTokenAt = startedAt + timing.firstTokenTimeoutMs;
  let reader: ReaderLike | undefined;

  try {
    const response = await raceTimeout(
      fetchImpl(candidate.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...candidate.headers },
        body: JSON.stringify(candidate.body),
        signal: controller.signal,
      }),
      firstTokenAt - Date.now(),
      'quá hạn chờ phản hồi',
    );

    if (!response.ok || !response.body) {
      const detail = await raceTimeout(
        response.text(),
        1500,
        'quá hạn đọc lỗi',
      ).catch(() => '');
      throw errorForStatus(response.status, detail);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let finishReason: string | undefined;

    const takeLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const payload = line.slice('data:'.length).trim();
      if (!payload || payload === '[DONE]') return;
      let parsed: ParsedChunk;
      try {
        parsed = candidate.parse(JSON.parse(payload));
      } catch {
        // Dòng SSE hỏng thì bỏ qua; nếu vì thế mà thiếu finishReason thì cả
        // lượt gọi sẽ bị coi là không trọn vẹn ở bước kiểm tra bên dưới.
        return;
      }
      if (parsed.finishReason) finishReason = parsed.finishReason;
      if (parsed.usage) stats.usage = parsed.usage;
      if (parsed.text) {
        if (!text) stats.firstTokenMs = Date.now() - startedAt;
        text += parsed.text;
      }
    };

    for (;;) {
      const { done, value } = await raceTimeout(
        reader.read(),
        text ? timing.stallTimeoutMs : firstTokenAt - Date.now(),
        text ? 'đứng hình giữa chừng' : 'quá hạn chờ chữ đầu tiên',
      );
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        takeLine(buffer.slice(0, newlineIndex).trim());
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
      }
    }
    takeLine((buffer + decoder.decode()).trim());

    if (finishReason !== candidate.okFinish) {
      // Không có finishReason = stream bị cắt; MAX_TOKENS / length = bài bị
      // cắt. Hai trường hợp đó gọi lại có thể được, bị chặn nội dung thì không.
      const truncated =
        finishReason === undefined ||
        finishReason === 'MAX_TOKENS' ||
        finishReason === 'length';
      throw new AttemptError(
        truncated ? 'transient' : 'rejected',
        `kết thúc không trọn vẹn (finishReason=${finishReason ?? 'không có'}, ${
          text.length
        } ký tự)`,
      );
    }
    if (!text.trim()) {
      throw new AttemptError('transient', 'không trả về nội dung');
    }
    return text;
  } finally {
    // Dù xong, lỗi hay bị bỏ rơi cũng đóng kết nối tới model.
    controller.abort();
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

/** Lượt hỏng nhanh hơn mức này được coi là "hỏng ngay" (503, 404...). */
const FAST_FAILURE_MS = 1000;

interface Slot {
  candidate: Candidate;
  launches: number;
  /** Tổng điểm phạt từ các lượt hỏng. */
  penalty: number;
}

// Model viết được một đoạn rồi bị cắt vẫn đáng thử lại; model trả thẳng 503
// thì gần như chắc chắn lượt sau cũng 503, nên bị phạt nặng hơn hẳn. Đo thực
// tế với mức phạt đều nhau: 5/8 lượt gọi bị đốt vào model đang 503.
const PENALTY_CUT_SHORT = 2;
const PENALTY_REFUSED = 10;

/**
 * Trả về bài viết của model đầu tiên viết xong trọn vẹn.
 *
 * Cách chạy: gọi ngay `initialParallel` lượt. Cứ mỗi `hedgeDelayMs` mà chưa có
 * bài nào xong thì gọi thêm một lượt, và lượt nào hỏng thì gọi thay lượt khác.
 * Lượt chậm KHÔNG bị huỷ khi có lượt mới, vì model chậm vẫn có thể là model
 * duy nhất trả lời.
 *
 * Mỗi lượt mới chọn model có điểm thấp nhất (số lần đã gọi + điểm phạt), nên
 * model nào đang hỏng nhiều sẽ tự được gọi thưa đi, và cùng một model có
 * thể chạy nhiều lượt song song khi chỉ có nó dùng được. Model hết quota hoặc
 * bị từ chối thì loại hẳn.
 */
export function generatePost(
  candidates: Candidate[],
  options: GenerateOptions,
): Promise<GenerateResult> {
  const settings = {
    initialParallel: options.initialParallel ?? DEFAULTS.initialParallel,
    hedgeDelayMs: options.hedgeDelayMs ?? DEFAULTS.hedgeDelayMs,
    maxConcurrent: options.maxConcurrent ?? DEFAULTS.maxConcurrent,
    maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
    retryDelayMs: options.retryDelayMs ?? DEFAULTS.retryDelayMs,
    totalTimeoutMs: options.totalTimeoutMs ?? DEFAULTS.totalTimeoutMs,
  };
  const timing = {
    firstTokenTimeoutMs:
      options.firstTokenTimeoutMs ?? DEFAULTS.firstTokenTimeoutMs,
    stallTimeoutMs: options.stallTimeoutMs ?? DEFAULTS.stallTimeoutMs,
  };
  const log = options.log ?? ((line: string) => console.log(line));

  return new Promise<GenerateResult>((resolve, reject) => {
    const startedAt = Date.now();
    let slots: Slot[] = candidates.map((candidate) => ({
      candidate,
      launches: 0,
      penalty: 0,
    }));
    const inFlight = new Set<AbortController>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const kinds: FailureKind[] = [];
    let launched = 0;
    let pendingRetries = 0;
    let settled = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const later = (run: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);
      timers.add(timer);
      return timer;
    };

    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      inFlight.forEach((controller) => controller.abort());
      inFlight.clear();
      finish();
    };

    const fail = (why: string) => {
      log(
        `[ai-gen] gave up after=${
          Date.now() - startedAt
        }ms attempts=${launched} why=${why}`,
      );
      settle(() => reject(finalError(kinds)));
    };

    const pickSlot = (): Slot | undefined => {
      let best: Slot | undefined;
      let bestScore = Infinity;
      for (const slot of slots) {
        const score = slot.launches + slot.penalty;
        if (score < bestScore) {
          best = slot;
          bestScore = score;
        }
      }
      return best;
    };

    const launch = () => {
      if (settled) return;
      const slot =
        launched < settings.maxAttempts &&
        inFlight.size < settings.maxConcurrent
          ? pickSlot()
          : undefined;
      if (!slot) {
        // Không gọi thêm được nữa. Còn lượt đang chạy thì chờ nó; không còn
        // lượt nào (và cũng không có lượt gọi lại nào đang hẹn giờ) thì bỏ cuộc.
        if (inFlight.size === 0 && pendingRetries === 0) {
          fail(slots.length === 0 ? 'no usable model' : 'attempts exhausted');
        }
        return;
      }

      const { candidate } = slot;
      const controller = new AbortController();
      const attemptStartedAt = Date.now();
      const stats: AttemptStats = {};
      slot.launches++;
      launched++;
      inFlight.add(controller);

      if (hedgeTimer) {
        clearTimeout(hedgeTimer);
        timers.delete(hedgeTimer);
      }
      hedgeTimer = later(() => {
        hedgeTimer = undefined;
        launch();
      }, settings.hedgeDelayMs);

      runAttempt(candidate, options.fetch, controller, timing, stats).then(
        (text) => {
          if (settled) return;
          log(
            `[ai-gen] ok ${candidate.label} ttft=${stats.firstTokenMs}ms took=${
              Date.now() - attemptStartedAt
            }ms total=${
              Date.now() - startedAt
            }ms attempts=${launched} usage=${JSON.stringify(
              stats.usage ?? null,
            )}`,
          );
          settle(() =>
            resolve({ text: cleanPost(text), label: candidate.label }),
          );
        },
        (error) => {
          inFlight.delete(controller);
          if (settled) return;
          const took = Date.now() - attemptStartedAt;
          const kind: FailureKind =
            error instanceof AttemptError ? error.kind : 'transient';
          const reason = error instanceof Error ? error.message : String(error);
          kinds.push(kind);
          slot.penalty +=
            error instanceof AttemptError && error.refused
              ? PENALTY_REFUSED
              : PENALTY_CUT_SHORT;
          log(
            `[ai-gen] fail ${candidate.label} took=${took}ms kind=${kind} reason=${reason}`,
          );
          if (kind !== 'transient') {
            slots = slots.filter((other) => other !== slot);
          }
          // Hỏng ngay tức thì thì nghỉ một nhịp, tránh dội liên tục vào một
          // model đang quá tải.
          pendingRetries++;
          later(
            () => {
              pendingRetries--;
              launch();
            },
            took < FAST_FAILURE_MS ? settings.retryDelayMs : 0,
          );
        },
      );
    };

    later(() => fail('deadline'), settings.totalTimeoutMs);

    const initial = Math.max(1, settings.initialParallel);
    for (let i = 0; i < initial && !settled; i++) launch();
  });
}
