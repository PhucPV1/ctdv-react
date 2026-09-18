// Bắt buộc Edge runtime: handler này dùng Request/Response chuẩn web và
// stream qua ReadableStream. Node runtime của Vercel không chạy được nó.
export const config = { runtime: 'edge' };

const MODEL_NAME = 'gemini-3.6-flash';
const MAX_CONTENT_CHARS = 4000;
const MAX_TITLE_CHARS = 200;
// gemini-3.6-flash là thinking model và maxOutputTokens tính gộp cả token
// suy luận nội bộ (đo được ~1000-1250) lẫn nội dung trả về. Đặt thấp thì
// suy luận ăn hết hạn mức và bài viết bị cắt giữa chừng (finishReason
// MAX_TOKENS). 4096 đủ chỗ cho cả hai; bài thực tế chỉ ~220 token.
const MAX_OUTPUT_TOKENS = 4096;

function buildPrompt(rawContent: string, title: string): string {
  return `Bạn là người viết content Facebook, đang giúp chủ nhân viết bài đăng tìm thú cưng lạc sao cho CHÂN THẬT, XÚC ĐỘNG và DỄ ĐƯỢC CHIA SẺ, BÌNH LUẬN.

TIÊU ĐỀ BÀI ĐĂNG: ${title}

NỘI DUNG NGƯỜI DỤNG NHẬP:
${rawContent.trim() || '(Chưa có thông tin nào)'}

YÊU CẦU:
1. Bắt đầu bằng đúng TIÊU ĐỀ BÀI ĐĂNG ở trên.
2. Ngay sau tiêu đề, viết 1-2 câu MỞ BÀI chân thành, gợi đồng cảm (tâm trạng chủ, sự khẩn cấp vừa phải). CHỈ dùng cảm xúc từ thông tin thật - KHÔNG thổi phồng, KHÔNG giật gân.
3. Trích xuất thông tin và trình bày khối có cấu trúc: Tên → Giống → Giới tính → Khu vực lạc → Thời gian lạc → Đặc điểm nhận dạng → Sdt liên hệ. CHỈ hiển thị field có thông tin, bỏ field trống.
4. KHÔNG bịa thêm thông tin không có trong nội dung gốc.
5. Kết bài: cảm ơn, kêu gọi CHIA SẺ bài viết để bé sớm về nhà, và mời người từng thấy bé / có thông tin nhắn tin cho chủ (tạo động lực bình luận). Văn phong tự nhiên, có thể thêm emoji.
6. Cuối cùng thêm dòng HASHTAG địa phương: #ĐàNẵng #ChóLạc (đổi #MèoLạc nếu là mèo) #ThúCưngLạc #ĐàNẵngThúCưng.

CHỈ TRẢ VỀ NỘI DUNG BÀI ĐĂNG, KHÔNG GIẢI THÍCH.`;
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Google trả lỗi kèm chi tiết project / service account, không nên đẩy nguyên
 * văn xuống browser. Map sang thông báo ngắn, chi tiết thật ghi vào log.
 */
function messageForUpstreamStatus(status: number): string {
  if (status === 400) return 'Yêu cầu gửi lên Gemini không hợp lệ.';
  if (status === 401 || status === 403)
    return 'API key Gemini không hợp lệ hoặc đã bị vô hiệu hoá. Cần tạo key mới và cập nhật GEMINI_API_KEY.';
  if (status === 404)
    return `Model "${MODEL_NAME}" không tồn tại hoặc key không có quyền dùng.`;
  if (status === 429) return 'Đã vượt hạn mức Gemini. Thử lại sau ít phút.';
  return 'Gemini đang lỗi, thử lại sau.';
}

/** Gemini stream trả SSE; hàm này bóc lấy phần text và bỏ phần metadata. */
function textFromSsePayload(payload: string): string {
  const parsed = JSON.parse(payload);
  const parts = parsed?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part: { text?: string }) => part?.text ?? '').join('');
}

function sseToPlainText(
  upstreamBody: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');

            if (!line.startsWith('data:')) continue;
            const payload = line.slice('data:'.length).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const text = textFromSsePayload(payload);
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // Dòng SSE hỏng thì bỏ qua, giữ stream chạy tiếp.
            }
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(405, 'Chỉ hỗ trợ POST.');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(500, 'Server chưa cấu hình GEMINI_API_KEY.');
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

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(safeContent, safeTitle) }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Tắt suy luận nội bộ: tác vụ này chỉ sắp xếp lại thông tin có sẵn nên
          // không cần, mà bật thì TTFB tăng từ ~1.5s lên hàng chục giây và dễ
          // chạm trần 25s của Edge Function.
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });
  } catch (error) {
    console.error('Không gọi được Gemini:', error);
    return errorResponse(502, 'Không kết nối được tới Gemini.');
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error(`Gemini trả ${upstream.status}:`, detail);
    return errorResponse(
      upstream.status === 429 ? 429 : 502,
      messageForUpstreamStatus(upstream.status),
    );
  }

  return new Response(sseToPlainText(upstream.body), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
