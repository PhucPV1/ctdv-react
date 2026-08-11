import { GoogleGenAI } from '@google/genai';

const MODEL_NAME = 'gemini-3.6-flash';

function buildPrompt(rawContent: string, title: string): string {
  return `Bạn là trợ lý viết bài đăng tìm thú cưng lạc trên Facebook.

TIÊU ĐỀ BÀI ĐĂNG: ${title}

NỘI DUNG NGƯỜI DÙNG NHẬP:
${rawContent.trim() || '(Chưa có thông tin nào)'}

YÊU CẦU:
1. Viết bài đăng Facebook hoàn chỉnh, bắt đầu bằng TIÊU ĐỀ BÀI ĐĂNG ở trên
2. Trích xuất các thông tin có trong nội dung người dùng nhập và trình bày theo cấu trúc: Tên → Giống → Giới tính → Khu vực lạc → Thời gian lạc → Đặc điểm nhận dạng → Sdt liên hệ
3. Chỉ hiển thị các field có thông tin trích xuất được, KHÔNG hiển thị field không có
4. KHÔNG bịa thêm thông tin không có trong nội dung gốc
5. Viết theo văn phong bài đăng Facebook tìm thú cưng, có thể thêm emoji phù hợp
6. Cuối bài đăng thêm: "Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ."

CHỈ TRẢ VỀ NỘI DUNG BÀI ĐĂNG, KHÔNG GIẢI THÍCH.`;
}

export async function generateWithAI(rawContent: string, title: string): Promise<string> {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'API key chưa được cấu hình. Vui lòng tạo file .env với REACT_APP_GEMINI_API_KEY=<your-key>'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(rawContent, title);

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
  });

  const text = response.text;
  if (!text) {
    throw new Error('Không nhận được kết quả từ AI');
  }

  return text;
}
