import { GoogleGenAI } from '@google/genai';

const MODEL_NAME = 'gemini-3.6-flash';

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

export async function* generateWithAIStream(
  rawContent: string,
  title: string
): AsyncGenerator<string> {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'API key chưa được cấu hình. Vui lòng tạo file .env với REACT_APP_GEMINI_API_KEY=<your-key>'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const stream = await ai.models.generateContentStream({
    model: MODEL_NAME,
    contents: buildPrompt(rawContent, title),
    config: {
      temperature: 0.7,
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
