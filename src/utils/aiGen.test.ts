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

import { generateWithAIStream, RESET_MARKER } from './aiGen';

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

/** Generator yield toàn bộ bài viết tính tới lúc đó; trả về mọi lần yield. */
async function snapshots(generator: AsyncGenerator<string>): Promise<string[]> {
  const seen: string[] = [];
  for await (const text of generator) {
    seen.push(text);
  }
  return seen;
}

async function collect(generator: AsyncGenerator<string>): Promise<string> {
  const seen = await snapshots(generator);
  return seen[seen.length - 1] ?? '';
}

describe('generateWithAIStream', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('yields the accumulated text after every chunk', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(fakeResponse({ chunks: ['Hello ', 'world'] })) as any;

    await expect(
      snapshots(generateWithAIStream('raw input', 'TITLE')),
    ).resolves.toEqual(['Hello ', 'Hello world']);
  });

  it('drops everything before a reset marker', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      fakeResponse({
        chunks: ['Bài bị cụt', RESET_MARKER, 'Bài ', 'trọn vẹn'],
      }),
    ) as any;

    await expect(
      snapshots(generateWithAIStream('raw input', 'TITLE')),
    ).resolves.toEqual(['Bài bị cụt', '', 'Bài ', 'Bài trọn vẹn']);
  });

  it('handles a reset marker in the same chunk as the new text', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        fakeResponse({ chunks: ['cũ', `thêm${RESET_MARKER}mới`] }),
      ) as any;

    await expect(
      collect(generateWithAIStream('raw input', 'TITLE')),
    ).resolves.toBe('mới');
  });

  it('fails when the stream ends with nothing left after a reset', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        fakeResponse({ chunks: ['Bài bị cụt', RESET_MARKER] }),
      ) as any;

    await expect(
      collect(generateWithAIStream('raw input', 'TITLE')),
    ).rejects.toThrow(/AI đang quá tải/);
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
