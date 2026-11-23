const API_ENDPOINT = '/api/gemini';

async function errorMessageFrom(response: Response): Promise<string> {
  // API route trả JSON { error }. Nếu CRA dev server nuốt request thì sẽ là HTML.
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') return data.error;
    } catch {
      // rơi xuống thông báo mặc định
    }
  }
  return `Lỗi máy chủ (${response.status}).`;
}

/**
 * Server gửi ký tự này khi một model đứt giữa chừng và nó sắp viết lại từ đầu
 * bằng model khác: bỏ hết phần đã nhận. Phải khớp với RESET_MARKER trong
 * api/_lib/generate.ts.
 */
export const RESET_MARKER = '\u0018';

const EMPTY_RESULT_MESSAGE =
  'AI đang quá tải, chưa viết được bài. Bấm AI gen lần nữa nhé.';

/**
 * Mỗi lần yield là TOÀN BỘ bài viết tính tới lúc đó (không phải từng mẩu), để
 * nơi gọi chỉ việc gán thẳng vào ô kết quả, kể cả khi server yêu cầu viết lại.
 */
export async function* generateWithAIStream(
  rawContent: string,
  title: string,
): AsyncGenerator<string> {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawContent, title }),
  });

  if (!response.ok) {
    throw new Error(await errorMessageFrom(response));
  }

  // `npm start` (CRA dev server) không chạy /api nên trả về index.html.
  if ((response.headers.get('Content-Type') ?? '').includes('text/html')) {
    throw new Error(
      'API route không chạy. Dùng `npx vercel dev` thay cho `npm start` để test AI gen ở local.',
    );
  }

  if (!response.body) {
    throw new Error('Trình duyệt không hỗ trợ streaming response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const append = (chunk: string) => {
    const resetIndex = chunk.lastIndexOf(RESET_MARKER);
    text = resetIndex === -1 ? text + chunk : chunk.slice(resetIndex + 1);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        append(chunk);
        yield text;
      }
    }
    const tail = decoder.decode();
    if (tail) {
      append(tail);
      yield text;
    }
  } finally {
    reader.releaseLock();
  }

  // Stream đóng mà không còn chữ nào: mọi model đều thất bại giữa chừng.
  if (!text.trim()) {
    throw new Error(EMPTY_RESULT_MESSAGE);
  }
}
