import { buildCandidates, buildPrompt, generatePost } from './_lib/generate';

// Bắt buộc Edge runtime: handler này dùng Request/Response chuẩn web, Node
// runtime của Vercel không chạy được nó.
export const config = { runtime: 'edge' };

const MAX_CONTENT_CHARS = 4000;
const MAX_TITLE_CHARS = 200;

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(405, 'Chỉ hỗ trợ POST.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Body không phải JSON hợp lệ.');
  }

  const { rawContent, title } = (body ?? {}) as {
    rawContent?: unknown;
    title?: unknown;
  };
  const safeContent = typeof rawContent === 'string' ? rawContent : '';
  const safeTitle = typeof title === 'string' ? title.trim() : '';

  if (!safeTitle) {
    return errorResponse(400, 'Thiếu tiêu đề bài đăng.');
  }
  if (
    safeContent.length > MAX_CONTENT_CHARS ||
    safeTitle.length > MAX_TITLE_CHARS
  ) {
    return errorResponse(413, 'Nội dung quá dài.');
  }

  const candidates = buildCandidates(
    buildPrompt(safeContent, safeTitle),
    process.env,
  );
  if (candidates.length === 0) {
    return errorResponse(
      500,
      'Server chưa cấu hình GEMINI_API_KEY (hoặc GROQ_API_KEY).',
    );
  }

  // Chỉ trả về khi đã có một bài viết xong trọn vẹn. Không stream từng mẩu
  // xuống browser nữa: model free hay bị cắt giữa chừng, stream thẳng thì
  // người dùng nhận bài cụt mà không biết. generatePost tự giới hạn thời gian
  // nên bước chờ này không chạm trần 25s của Edge.
  try {
    const result = await generatePost(candidates, {
      fetch: (url, init) => fetch(url, init),
    });
    return new Response(result.text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-AI-Model': result.label,
      },
    });
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    return errorResponse(
      typeof status === 'number' ? status : 502,
      error instanceof Error ? error.message : 'AI đang lỗi, thử lại sau.',
    );
  }
}
