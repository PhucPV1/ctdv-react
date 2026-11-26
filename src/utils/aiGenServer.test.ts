import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from 'util';

// jsdom không cung cấp sẵn TextDecoder/TextEncoder.
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = NodeTextDecoder;
}
if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = NodeTextEncoder;
}

import {
  buildCandidates,
  buildPrompt,
  cleanPost,
  generatePost,
  type Candidate,
} from '../../api/_lib/generate';

/** Một mẩu body SSE, số mili-giây phải chờ, hoặc 'HANG' = treo tới khi bị huỷ. */
type Step = string | number | 'HANG';

interface Scenario {
  status?: number;
  errorBody?: string;
  /** Chờ chừng này rồi mới trả response. */
  delayMs?: number;
  /** Treo luôn ở bước fetch, không bao giờ trả response. */
  hangOnFetch?: boolean;
  steps?: Step[];
}

const geminiData = (text: string, finishReason?: string) =>
  `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
  })}\n\n`;

const openAiData = (content: string, finishReason: string | null = null) =>
  `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finishReason }],
  })}\n\n`;

function abortable(signal: AbortSignal, ms?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const timer = ms === undefined ? undefined : setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      if (timer) clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });
}

/**
 * fetch giả. Mỗi URL có một hàng kịch bản dùng lần lượt; kịch bản cuối cùng
 * được dùng lại cho mọi lần gọi sau đó.
 */
function fakeFetch(scenariosByUrlPart: Record<string, Scenario[]>) {
  const encoder = new NodeTextEncoder();
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: any;
    signal: AbortSignal;
  }> = [];

  const fetchImpl = jest.fn(async (url: string, init: any) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
      signal: init.signal,
    });
    const key = Object.keys(scenariosByUrlPart).find((part) =>
      url.includes(part),
    );
    const queue = key ? scenariosByUrlPart[key] : undefined;
    if (!queue || queue.length === 0) {
      throw new Error(`Không có kịch bản cho ${url}`);
    }
    const scenario = queue.length > 1 ? (queue.shift() as Scenario) : queue[0];

    if (scenario.hangOnFetch) await abortable(init.signal);
    if (scenario.delayMs) await abortable(init.signal, scenario.delayMs);

    const steps = [...(scenario.steps ?? [])];
    const status = scenario.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => scenario.errorBody ?? '',
      body: {
        getReader: () => ({
          read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
            for (;;) {
              const step = steps.shift();
              if (step === undefined) return { done: true };
              if (step === 'HANG') {
                await abortable(init.signal);
              } else if (typeof step === 'number') {
                await abortable(init.signal, step);
              } else {
                return { done: false, value: encoder.encode(step) };
              }
            }
          },
          cancel: async () => undefined,
        }),
      },
    };
  });

  return { fetchImpl, calls };
}

function candidate(name: string): Candidate {
  return {
    label: name,
    url: `https://example.test/${name}`,
    headers: {},
    body: { name },
    parse: (payload: any) => ({
      text: payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      finishReason: payload?.candidates?.[0]?.finishReason,
    }),
    okFinish: 'STOP',
  };
}

const urlsOf = (calls: Array<{ url: string }>) =>
  calls.map((call) => call.url.replace('https://example.test/', ''));

const whole = (text: string): Scenario => ({
  steps: [geminiData(text, 'STOP')],
});

// Thời gian thu nhỏ để test chạy nhanh; tỉ lệ giữa các mốc giữ như thật.
const base = {
  log: () => undefined,
  initialParallel: 1,
  hedgeDelayMs: 30,
  retryDelayMs: 5,
  firstTokenTimeoutMs: 200,
  stallTimeoutMs: 40,
  totalTimeoutMs: 600,
};

describe('generatePost', () => {
  it('returns the whole post from the first healthy model', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Xin '), geminiData('chào', 'STOP')] }],
      '/b': [whole('không dùng tới')],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result).toEqual({ text: 'Xin chào', label: 'a' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never returns a post that ended without a finish reason', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Bài bị cụt giữa ch')] }],
      '/b': [whole('Bài trọn vẹn')],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result).toEqual({ text: 'Bài trọn vẹn', label: 'b' });
  });

  it('treats MAX_TOKENS as a truncated answer', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Bài bị cắt', 'MAX_TOKENS')] }],
      '/b': [whole('Bài đủ')],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result.text).toBe('Bài đủ');
  });

  it('starts the first models together and aborts the loser', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/a': [{ hangOnFetch: true }],
      '/b': [whole('b xong trước')],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      initialParallel: 2,
      hedgeDelayMs: 500,
      fetch: fetchImpl,
    });

    expect(result.label).toBe('b');
    expect(urlsOf(calls)).toEqual(['a', 'b']);
    expect(calls[0].signal.aborted).toBe(true);
  });

  it('hedges with another model when the first one is slow', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/a': [{ delayMs: 150, steps: [geminiData('a chậm', 'STOP')] }],
      '/b': [whole('b nhanh')],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result).toEqual({ text: 'b nhanh', label: 'b' });
    expect(urlsOf(calls)).toEqual(['a', 'b']);
  });

  it('keeps a slow model alive while the hedge fails', async () => {
    // Đúng tình huống đã làm hỏng bản trước: model chậm nhưng vẫn trả lời.
    const { fetchImpl } = fakeFetch({
      '/a': [{ delayMs: 120, steps: [geminiData('a chậm mà xong', 'STOP')] }],
      '/b': [{ status: 503, errorBody: 'high demand' }],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result).toEqual({ text: 'a chậm mà xong', label: 'a' });
  });

  it('abandons a model that stalls in the middle of the answer', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/a': [{ steps: [geminiData('Đang viết'), 'HANG'] }],
      '/b': [{ delayMs: 60, steps: [geminiData('Viết xong', 'STOP')] }],
    });

    const result = await generatePost([candidate('a'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result.label).toBe('b');
    expect(calls[0].signal.aborted).toBe(true);
  });

  it('runs the same model again in parallel when it is the only one', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/a': [{ hangOnFetch: true }, whole('lượt hai xong')],
    });

    const result = await generatePost([candidate('a')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result).toEqual({ text: 'lượt hai xong', label: 'a' });
    expect(urlsOf(calls)).toEqual(['a', 'a']);
  });

  it('calls a failing model less often than a healthy one', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/bad': [{ status: 503, errorBody: 'high demand' }],
      '/slow': [
        { hangOnFetch: true },
        { hangOnFetch: true },
        { hangOnFetch: true },
        whole('cuối cùng cũng xong'),
      ],
    });

    const result = await generatePost([candidate('bad'), candidate('slow')], {
      ...base,
      hedgeDelayMs: 15,
      maxConcurrent: 4,
      fetch: fetchImpl,
    });

    const urls = urlsOf(calls);
    expect(result.label).toBe('slow');
    expect(urls.filter((url) => url === 'bad').length).toBeLessThan(
      urls.filter((url) => url === 'slow').length,
    );
  });

  it('rarely retries a model that answers 503 while another keeps trying', async () => {
    // Hồ sơ đo được: một model luôn 503, model kia viết dở rồi bị cắt.
    const { fetchImpl, calls } = fakeFetch({
      '/refuses': [{ status: 503, errorBody: 'high demand' }],
      '/cuts': [{ steps: [geminiData('viết dở')] }],
    });

    await expect(
      generatePost([candidate('cuts'), candidate('refuses')], {
        ...base,
        initialParallel: 2,
        maxAttempts: 10,
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 503 });

    const urls = urlsOf(calls);
    expect(urls).toHaveLength(10);
    expect(urls.filter((url) => url === 'refuses').length).toBeLessThanOrEqual(
      2,
    );
  });

  it('drops a model that rejects the request and does not call it again', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/gone': [{ status: 404, errorBody: 'no longer available' }],
      '/b': [{ status: 503 }, { status: 503 }, whole('lần ba được')],
    });

    const result = await generatePost([candidate('gone'), candidate('b')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result.label).toBe('b');
    expect(urlsOf(calls).filter((url) => url === 'gone')).toHaveLength(1);
  });

  it('reports 429 when every model is out of quota', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ status: 429 }],
      '/b': [{ status: 429 }],
    });

    await expect(
      generatePost([candidate('a'), candidate('b')], {
        ...base,
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops after maxAttempts and reports 503', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('lúc nào cũng cụt')] }],
    });

    await expect(
      generatePost([candidate('a')], {
        ...base,
        maxAttempts: 4,
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('gives up at the deadline and aborts everything still running', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/a': [{ hangOnFetch: true }],
    });
    const startedAt = Date.now();

    await expect(
      generatePost([candidate('a')], {
        ...base,
        firstTokenTimeoutMs: 5000,
        totalTimeoutMs: 120,
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 503 });

    expect(Date.now() - startedAt).toBeLessThan(400);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
  });

  it('reports an error when there is no model to call', async () => {
    const { fetchImpl } = fakeFetch({});

    await expect(
      generatePost([], { ...base, fetch: fetchImpl }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('buildCandidates', () => {
  it('returns nothing when no key is configured', () => {
    expect(buildCandidates('prompt', {})).toEqual([]);
  });

  it('uses only Gemini models when only the Gemini key is set', () => {
    const labels = buildCandidates('prompt', { GEMINI_API_KEY: 'g' }).map(
      (item) => item.label,
    );

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((label) => label.startsWith('gemini:'))).toBe(true);
  });

  it('makes the first two tries one Gemini and one Groq when both keys are set', () => {
    const labels = buildCandidates('prompt', {
      GEMINI_API_KEY: 'g',
      GROQ_API_KEY: 'q',
    }).map((item) => item.label);

    expect(labels[0].startsWith('gemini:')).toBe(true);
    expect(labels[1].startsWith('groq:')).toBe(true);
  });

  it('sends the Gemini key in a header, never in the URL', async () => {
    const [first] = buildCandidates('PROMPT', { GEMINI_API_KEY: 'secret' });
    const { fetchImpl, calls } = fakeFetch({
      generativelanguage: [whole('ok')],
    });

    await generatePost([first], { ...base, fetch: fetchImpl });

    expect(calls[0].url).not.toContain('secret');
    expect(calls[0].headers['x-goog-api-key']).toBe('secret');
    expect(calls[0].body.contents[0].parts[0].text).toBe('PROMPT');
    expect(calls[0].body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'minimal',
    });
  });

  it('ignores Gemini thought parts', async () => {
    const [first] = buildCandidates('PROMPT', { GEMINI_API_KEY: 'secret' });
    const thought = `data: ${JSON.stringify({
      candidates: [
        { content: { parts: [{ text: 'suy nghĩ...', thought: true }] } },
      ],
    })}\n\n`;
    const { fetchImpl } = fakeFetch({
      generativelanguage: [{ steps: [thought, geminiData('bài', 'STOP')] }],
    });

    const result = await generatePost([first], { ...base, fetch: fetchImpl });

    expect(result.text).toBe('bài');
  });

  it('reads an OpenAI-compatible stream from Groq', async () => {
    const [groq] = buildCandidates('PROMPT', { GROQ_API_KEY: 'secret' });
    const { fetchImpl, calls } = fakeFetch({
      'api.groq.com': [
        {
          steps: [
            openAiData('Xin '),
            openAiData('chào'),
            openAiData('', 'stop'),
            'data: [DONE]\n\n',
          ],
        },
      ],
    });

    const result = await generatePost([groq], { ...base, fetch: fetchImpl });

    expect(result.text).toBe('Xin chào');
    expect(calls[0].headers.Authorization).toBe('Bearer secret');
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body.messages).toEqual([
      { role: 'user', content: 'PROMPT' },
    ]);
  });
});

describe('cleanPost', () => {
  it('removes Markdown bold markers but keeps the words', () => {
    expect(cleanPost('**TÌM CHÓ LẠC**\n\n- **Tên:** Milu')).toBe(
      'TÌM CHÓ LẠC\n\n- Tên: Milu',
    );
  });

  it('removes Markdown headings but keeps hashtags', () => {
    expect(cleanPost('# TÌM CHÓ LẠC\n## Thông tin\n#ĐàNẵng #ChóLạc')).toBe(
      'TÌM CHÓ LẠC\nThông tin\n#ĐàNẵng #ChóLạc',
    );
  });

  it('removes a stray unmatched bold marker', () => {
    expect(cleanPost('Tên: **Milu')).toBe('Tên: Milu');
  });

  it('leaves plain text, bullets and emoji alone', () => {
    const post = 'TÌM CHÓ LẠC\n\n• Tên: Milu\n- Giống: Poodle 🙏\n* Ghi chú';
    expect(cleanPost(post)).toBe(post);
  });

  it('drops a field whose value only says there is no information', () => {
    const post = [
      'TÌM CHÓ LẠC',
      '',
      'Tên: Milu',
      'Giống: (không có)',
      '- Giới tính: Không rõ',
      '• Khu vực lạc: Hải Châu',
      '🕒 Thời gian lạc: (Chưa có thông tin)',
      '**Sdt liên hệ:** [điền vào đây]',
      'Đặc điểm nhận dạng: N/A.',
    ].join('\n');

    expect(cleanPost(post)).toBe(
      'TÌM CHÓ LẠC\n\nTên: Milu\n• Khu vực lạc: Hải Châu',
    );
  });

  it('keeps a field that merely mentions something is missing', () => {
    const post = [
      'Đặc điểm nhận dạng: không có vòng cổ',
      'Thời gian lạc: 10:30 tối qua (không rõ chính xác)',
      'Tên: Na',
      'Bé không có ở nhà từ hôm qua.',
    ].join('\n');

    expect(cleanPost(post)).toBe(post);
  });

  it('does not leave a gap where a whole block of fields was dropped', () => {
    expect(
      cleanPost('Mở bài\n\nSdt liên hệ: (không có)\n\nCảm ơn mọi người'),
    ).toBe('Mở bài\n\nCảm ơn mọi người');
  });

  it('drops an empty field written with decomposed Vietnamese accents', () => {
    expect(
      cleanPost(`Tên: Milu\nGiống: ${'(không có)'.normalize('NFD')}`),
    ).toBe('Tên: Milu');
  });

  it('is applied to what generatePost returns', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [whole('**TÌM CHÓ LẠC**\n\n**Tên:** Milu\n')],
    });

    const result = await generatePost([candidate('a')], {
      ...base,
      fetch: fetchImpl,
    });

    expect(result.text).toBe('TÌM CHÓ LẠC\n\nTên: Milu');
  });
});

describe('buildPrompt', () => {
  it('carries the title and the content the user typed', () => {
    const prompt = buildPrompt('  Tên: Milu  ', 'TÌM CHÓ LẠC');

    expect(prompt).toContain('TIÊU ĐỀ BÀI ĐĂNG: TÌM CHÓ LẠC');
    expect(prompt).toContain('\nTên: Milu\n');
  });

  it('says so when the user typed nothing', () => {
    expect(buildPrompt('   ', 'TÌM MÈO LẠC')).toContain(
      '(Chưa có thông tin nào)',
    );
  });

  it('tells the model to drop fields it has no information for', () => {
    const prompt = buildPrompt('x', 'TÌM CHÓ LẠC');

    expect(prompt).toMatch(/BỎ HẲN cả dòng đó/);
    expect(prompt).toContain('"(không có)"');
  });

  it('asks for plain text without Markdown', () => {
    expect(buildPrompt('x', 'TÌM CHÓ LẠC')).toMatch(/KHÔNG dùng Markdown/);
  });
});
