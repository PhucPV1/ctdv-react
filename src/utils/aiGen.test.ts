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

import { generateWithAIStream } from './aiGen';

/** Response giả, chỉ dựng đúng phần bề mặt mà aiGen.ts dùng tới. */
function fakeResponse(options: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  chunks?: string[];
  json?: unknown;
}) {
  const encoder = new NodeTextEncoder();
  const chunks = (options.chunks ?? []).map((chunk) => encoder.encode(chunk));
  let index = 0;

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? options.contentType ?? 'text/plain; charset=utf-8'
          : null,
    },
    json: async () => options.json,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: chunks[index++] }
            : { done: true, value: undefined },
        releaseLock: () => undefined,
      }),
    },
  };
}

async function collect(generator: AsyncGenerator<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

describe('generateWithAIStream', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('yields streamed chunks concatenated in order', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(fakeResponse({ chunks: ['Hello ', 'world'] })) as any;

    await expect(
      collect(generateWithAIStream('raw input', 'TITLE')),
    ).resolves.toBe('Hello world');
  });

  it('posts rawContent and title to the proxy endpoint', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fakeResponse({ chunks: ['ok'] }));
    globalThis.fetch = fetchMock as any;

    await collect(generateWithAIStream('raw input', 'TITLE'));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/gemini');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      rawContent: 'raw input',
      title: 'TITLE',
    });
  });

  it('surfaces the server error message', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 500,
        contentType: 'application/json; charset=utf-8',
        json: { error: 'Server chưa cấu hình GEMINI_API_KEY.' },
      }),
    ) as any;

    await expect(
      collect(generateWithAIStream('raw input', 'TITLE')),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('explains that the API route is missing when the dev server returns HTML', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        fakeResponse({ contentType: 'text/html; charset=utf-8' }),
      ) as any;

    await expect(
      collect(generateWithAIStream('raw input', 'TITLE')),
    ).rejects.toThrow(/vercel dev/);
  });
});
