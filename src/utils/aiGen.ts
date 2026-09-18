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
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) yield chunk;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
