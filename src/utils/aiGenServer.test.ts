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
  generatePost,
  RESET_MARKER as SERVER_RESET_MARKER,
  type Candidate,
  type GenerateEvent,
} from '../../api/_lib/generate';
import { RESET_MARKER as CLIENT_RESET_MARKER } from './aiGen';

type Step = string | 'HANG';

interface Scenario {
  status?: number;
  errorBody?: string;
  /** Treo luôn ở bước fetch, không bao giờ trả response. */
  hangOnFetch?: boolean;
  /** Các mẩu body SSE trả lần lượt; 'HANG' = đứng hình tới khi bị huỷ. */
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

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

/** fetch giả: mỗi lần gọi lấy kịch bản kế tiếp trong hàng đợi của URL đó. */
function fakeFetch(scenariosByUrlPart: Record<string, Scenario[]>) {
  const encoder = new NodeTextEncoder();
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: any;
  }> = [];

  const fetchImpl = jest.fn(async (url: string, init: any) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const key = Object.keys(scenariosByUrlPart).find((part) =>
      url.includes(part),
    );
    const scenario = key ? scenariosByUrlPart[key].shift() : undefined;
    if (!scenario) throw new Error(`Không có kịch bản cho ${url}`);
    if (scenario.hangOnFetch) return untilAborted(init.signal);

    const steps = [...(scenario.steps ?? [])];
    const status = scenario.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => scenario.errorBody ?? '',
      body: {
        getReader: () => ({
          read: async () => {
            const step = steps.shift();
            if (step === undefined) return { done: true, value: undefined };
            if (step === 'HANG') return untilAborted(init.signal);
            return { done: false, value: encoder.encode(step) };
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

async function collect(generator: AsyncGenerator<GenerateEvent>) {
  const events: GenerateEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

/** Áp các sự kiện giống cách browser làm để ra bài viết cuối cùng. */
function finalText(events: GenerateEvent[]): string {
  return events.reduce(
    (text, event) => (event.type === 'reset' ? '' : text + event.text),
    '',
  );
}

const quiet = { log: () => undefined };
const fast = { ...quiet, firstTokenTimeoutMs: 40, idleTimeoutMs: 40 };

describe('generatePost', () => {
  it('streams the first healthy model and stops there', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Xin '), geminiData('chào', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...quiet,
        fetch: fetchImpl,
      }),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Xin ' },
      { type: 'text', text: 'chào' },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('moves to the next model on a quota error without a reset', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/a': [{ status: 429, errorBody: 'quota' }],
      '/b': [{ steps: [geminiData('ok', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...quiet,
        fetch: fetchImpl,
      }),
    );

    expect(events).toEqual([{ type: 'text', text: 'ok' }]);
    expect(calls.map((call) => call.url)).toEqual([
      'https://example.test/a',
      'https://example.test/b',
    ]);
  });

  it('resets and rewrites when a model ends without a finish reason', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Bài bị cụt giữa ch')] }],
      '/b': [{ steps: [geminiData('Bài trọn vẹn', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...quiet,
        fetch: fetchImpl,
      }),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Bài bị cụt giữa ch' },
      { type: 'reset' },
      { type: 'text', text: 'Bài trọn vẹn' },
    ]);
    expect(finalText(events)).toBe('Bài trọn vẹn');
  });

  it('treats MAX_TOKENS as a truncated answer', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Bài bị cắt', 'MAX_TOKENS')] }],
      '/b': [{ steps: [geminiData('Bài đủ', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...quiet,
        fetch: fetchImpl,
      }),
    );

    expect(finalText(events)).toBe('Bài đủ');
  });

  it('gives up on a model that never answers', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ hangOnFetch: true }],
      '/b': [{ steps: [geminiData('nhanh', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...fast,
        fetch: fetchImpl,
      }),
    );

    expect(events).toEqual([{ type: 'text', text: 'nhanh' }]);
  });

  it('gives up on a model that sends headers but no text', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: ['HANG'] }],
      '/b': [{ steps: [geminiData('nhanh', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...fast,
        fetch: fetchImpl,
      }),
    );

    expect(events).toEqual([{ type: 'text', text: 'nhanh' }]);
  });

  it('resets when a model stalls in the middle of the answer', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ steps: [geminiData('Đang viết'), 'HANG'] }],
      '/b': [{ steps: [geminiData('Viết lại', 'STOP')] }],
    });

    const events = await collect(
      generatePost([candidate('a'), candidate('b')], {
        ...fast,
        fetch: fetchImpl,
      }),
    );

    expect(events).toEqual([
      { type: 'text', text: 'Đang viết' },
      { type: 'reset' },
      { type: 'text', text: 'Viết lại' },
    ]);
  });

  it('retries a transient failure on a second pass', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [
        { status: 503, errorBody: 'overloaded' },
        { steps: [geminiData('lần hai được', 'STOP')] },
      ],
    });

    const events = await collect(
      generatePost([candidate('a')], { ...quiet, fetch: fetchImpl }),
    );

    expect(finalText(events)).toBe('lần hai được');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports 429 when every model is out of quota, without retrying', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ status: 429 }],
      '/b': [{ status: 429 }],
    });

    await expect(
      collect(
        generatePost([candidate('a'), candidate('b')], {
          ...quiet,
          fetch: fetchImpl,
        }),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports 503 when models keep failing, leaving the receiver empty', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [
        { steps: [geminiData('cụt lần một')] },
        { steps: [geminiData('cụt lần hai')] },
      ],
    });
    const events: GenerateEvent[] = [];

    await expect(
      (async () => {
        for await (const event of generatePost([candidate('a')], {
          ...quiet,
          fetch: fetchImpl,
        })) {
          events.push(event);
        }
      })(),
    ).rejects.toMatchObject({ status: 503 });

    expect(finalText(events)).toBe('');
    expect(events[events.length - 1]).toEqual({ type: 'reset' });
  });

  it('stops looking for a model once the total time budget is spent', async () => {
    const { fetchImpl } = fakeFetch({
      '/a': [{ hangOnFetch: true }],
      '/b': [{ steps: [geminiData('không kịp', 'STOP')] }],
    });
    let clock = 0;

    await expect(
      collect(
        generatePost([candidate('a'), candidate('b')], {
          ...quiet,
          fetch: fetchImpl,
          firstTokenTimeoutMs: 20,
          totalTimeoutMs: 1500,
          // Mỗi lần hỏi giờ là trôi thêm 400ms: lượt đầu ngốn gần hết quỹ.
          now: () => (clock += 400),
        }),
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

    expect(labels.length).toBeGreaterThan(1);
    expect(labels.every((label) => label.startsWith('gemini:'))).toBe(true);
  });

  it('puts a Groq model within the first three tries when both keys are set', () => {
    const labels = buildCandidates('prompt', {
      GEMINI_API_KEY: 'g',
      GROQ_API_KEY: 'q',
    }).map((item) => item.label);

    expect(labels[0].startsWith('gemini:')).toBe(true);
    expect(labels.slice(0, 3).some((label) => label.startsWith('groq:'))).toBe(
      true,
    );
  });

  it('sends the Gemini key in a header and leaves thinking at its default', async () => {
    const [first] = buildCandidates('PROMPT', { GEMINI_API_KEY: 'secret' });
    const { fetchImpl, calls } = fakeFetch({
      generativelanguage: [{ steps: [geminiData('ok', 'STOP')] }],
    });

    await collect(generatePost([first], { ...quiet, fetch: fetchImpl }));

    expect(calls[0].url).not.toContain('secret');
    expect(calls[0].headers['x-goog-api-key']).toBe('secret');
    expect(calls[0].body.contents[0].parts[0].text).toBe('PROMPT');
    expect(calls[0].body.generationConfig.thinkingConfig).toBeUndefined();
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

    const events = await collect(
      generatePost([first], { ...quiet, fetch: fetchImpl }),
    );

    expect(finalText(events)).toBe('bài');
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

    const events = await collect(
      generatePost([groq], { ...quiet, fetch: fetchImpl }),
    );

    expect(finalText(events)).toBe('Xin chào');
    expect(calls[0].headers.Authorization).toBe('Bearer secret');
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body.messages).toEqual([
      { role: 'user', content: 'PROMPT' },
    ]);
  });
});

test('client and server agree on the reset marker', () => {
  expect(CLIENT_RESET_MARKER).toBe(SERVER_RESET_MARKER);
});
