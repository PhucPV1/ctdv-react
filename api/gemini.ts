import {
  buildCandidates,
  generatePost,
  RESET_MARKER,
  type GenerateEvent,
} from './_lib/generate';

// Bắt buộc Edge runtime: handler này dùng Request/Response chuẩn web và
// stream qua ReadableStream. Node runtime của Vercel không chạy được nó.
export const config = { runtime: 'edge' };

const MAX_CONTENT_CHARS = 4000;
const MAX_TITLE_CHARS = 200;

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

function encodeEvent(event: GenerateEvent, encoder: TextEncoder): Uint8Array {
  return encoder.encode(event.type === 'reset' ? RESET_MARKER : event.text);
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

  const events = generatePost(candidates, {
    fetch: (url, init) => fetch(url, init),
  });

  // Chờ tới khi có chữ đầu tiên rồi mới trả response: nếu mọi model đều thất
  // bại trước lúc đó thì còn trả được mã lỗi HTTP tử tế. generatePost tự giới
  // hạn thời gian tìm model nên bước chờ này không chạm trần 25s của Edge.
  let first: IteratorResult<GenerateEvent>;
  try {
    first = await events.next();
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    return errorResponse(
      typeof status === 'number' ? status : 502,
      error instanceof Error ? error.message : 'AI đang lỗi, thử lại sau.',
    );
  }
  if (first.done) {
    return errorResponse(502, 'AI không trả về nội dung.');
  }

  const encoder = new TextEncoder();
  const firstChunk = encodeEvent(first.value, encoder);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(firstChunk);
    },
    async pull(controller) {
      try {
        const next = await events.next();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(encodeEvent(next.value, encoder));
        }
      } catch {
        // Mọi model đều đứt sau khi đã stream một đoạn. generatePost đã phát
        // "reset" trước khi ném lỗi nên browser đang giữ chuỗi rỗng và sẽ tự
        // hiểu là thất bại; ở đây chỉ cần đóng stream.
        controller.close();
      }
    },
    async cancel() {
      // Người dùng đóng tab / huỷ request: dừng luôn request tới model.
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
