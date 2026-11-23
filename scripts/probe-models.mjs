#!/usr/bin/env node
// Đo AI gen bằng key thật, không cần deploy. Chạy từ thư mục gốc của project:
//
//   node --env-file=.env scripts/probe-models.mjs
//       Chạy đúng phần lõi trong api/_lib/generate.ts (gọi song song, chỉ nhận
//       bài trọn vẹn) vài lần liên tiếp và in thời gian, model thắng, lý do các
//       lượt hỏng. Đây là thứ production sẽ làm.
//
//   node --env-file=.env scripts/probe-models.mjs --models
//       Đo riêng từng model Gemini với từng kiểu cấu hình suy luận.
//
// Thêm --show vào chế độ mặc định để in luôn bài viết của lượt thành công cuối
// cùng, tiện đánh giá chất lượng. PROBE_RUNS=<n> đổi số lần chạy.
//
// Script chỉ in tên model, thời gian, finishReason và số token; không in key.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const apiKey = process.env.GEMINI_API_KEY?.trim();
const groqKey = process.env.GROQ_API_KEY?.trim();
if (!apiKey && !groqKey) {
  console.error(
    'Thiếu GEMINI_API_KEY / GROQ_API_KEY. Chạy: node --env-file=.env scripts/probe-models.mjs',
  );
  process.exit(1);
}

const MODE = process.argv.includes('--models') ? 'models' : 'e2e';
const GAP_MS = Number(process.env.PROBE_GAP_MS ?? 4000);
const CALL_TIMEOUT_MS = 30000;

const SAMPLE_TITLE = 'TÌM CHÓ LẠC';
const SAMPLE_CONTENT = `Tên: Milu
Giống: Poodle nâu
Giới tính: đực
Khu vực lạc: Hải Châu
Thời gian lạc: tối 20/11
Đặc điểm: đeo vòng cổ đỏ, chân sau hơi khập khiễng`;

// Lõi thật của production, kèm đúng prompt mà production gửi cho model.
const core = await loadCore();
const PROMPT = core.buildPrompt(SAMPLE_CONTENT, SAMPLE_TITLE);

const ENDS_WITH_HASHTAGS = /#ĐàNẵngThúCưng\s*$/;

const seconds = (ms) => (ms === undefined ? '-' : `${(ms / 1000).toFixed(1)}s`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Bỏ các dãy số dài (mã project) khỏi thông báo trước khi in. */
const scrub = (text, max = 110) =>
  String(text)
    .replace(/\d{6,}/g, '…')
    .slice(0, max);

// ---------------------------------------------------------------------------
// Chế độ mặc định: chạy phần lõi thật.
// ---------------------------------------------------------------------------

/** Nạp api/_lib/generate.ts, biên dịch tạm bằng TypeScript của project. */
async function loadCore() {
  const { default: ts } = await import('typescript');
  const source = readFileSync(
    new URL('../api/_lib/generate.ts', import.meta.url),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const file = join(mkdtempSync(join(tmpdir(), 'ai-gen-')), 'generate.mjs');
  writeFileSync(file, outputText);
  return import(pathToFileURL(file).href);
}

async function probeEndToEnd() {
  const { buildCandidates, generatePost } = core;
  const runs = Number(process.env.PROBE_RUNS ?? 6);
  const labels = buildCandidates(PROMPT, process.env).map((item) => item.label);
  console.log(`Model sẽ dùng: ${labels.join(', ')}\n`);

  const outcomes = [];
  let sample;
  for (let run = 1; run <= runs; run++) {
    if (run > 1) await sleep(GAP_MS);
    const attempts = [];
    const startedAt = Date.now();
    try {
      const result = await generatePost(buildCandidates(PROMPT, process.env), {
        fetch: (url, init) => fetch(url, init),
        log: (line) => attempts.push(line),
      });
      const took = Date.now() - startedAt;
      const complete = ENDS_WITH_HASHTAGS.test(result.text);
      outcomes.push({ ok: true, took, complete });
      sample = result;
      console.log(
        `lần ${run}: XONG sau ${seconds(took)} | ${result.label} | ${
          result.text.length
        } ký tự | ${complete ? 'TRỌN VẸN' : 'THIẾU HASHTAG CUỐI'}`,
      );
    } catch (error) {
      const took = Date.now() - startedAt;
      outcomes.push({ ok: false, took });
      console.log(
        `lần ${run}: THẤT BẠI sau ${seconds(took)} | HTTP ${error?.status} | ${
          error?.message
        }`,
      );
    }
    for (const line of attempts) {
      console.log(`    ${scrub(line.replace('[ai-gen] ', ''), 190)}`);
    }
  }

  const ok = outcomes.filter((outcome) => outcome.ok);
  const times = ok.map((outcome) => outcome.took).sort((a, b) => a - b);
  console.log('\n===== TÓM TẮT =====');
  console.log(`Thành công: ${ok.length}/${outcomes.length}`);
  console.log(
    `Trọn vẹn (có hashtag cuối): ${
      ok.filter((outcome) => outcome.complete).length
    }/${outcomes.length}`,
  );
  if (times.length > 0) {
    console.log(
      `Thời gian: nhanh nhất ${seconds(times[0])}, giữa ${seconds(
        times[Math.floor(times.length / 2)],
      )}, chậm nhất ${seconds(times[times.length - 1])}`,
    );
  }
  if (sample && process.argv.includes('--show')) {
    console.log(`\n===== BÀI MẪU (${sample.label}) =====\n${sample.text}`);
  }
}

// ---------------------------------------------------------------------------
// Chế độ --models: đo riêng từng model Gemini.
// ---------------------------------------------------------------------------

async function callGeminiOnce({ model, thinkingConfig }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  const startedAt = Date.now();
  const result = { chars: 0 };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
        signal: controller.signal,
      },
    );
    result.http = response.status;

    if (!response.ok) {
      const raw = await response.text();
      try {
        const parsed = JSON.parse(raw);
        const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
        result.error = `${error?.status ?? ''} ${scrub(
          error?.message ?? raw,
        )}`.trim();
      } catch {
        result.error = scrub(raw);
      }
      return result;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let lastChunkAt = Date.now();
    result.maxGapMs = 0;

    for await (const bytes of response.body) {
      buffer += decoder.decode(bytes, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        let payload;
        try {
          payload = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        const candidate = payload?.candidates?.[0];
        const piece = (candidate?.content?.parts ?? [])
          .filter((part) => !part?.thought)
          .map((part) => part?.text ?? '')
          .join('');
        if (piece) {
          if (result.ttftMs === undefined) {
            result.ttftMs = Date.now() - startedAt;
          } else {
            result.maxGapMs = Math.max(
              result.maxGapMs,
              Date.now() - lastChunkAt,
            );
          }
          lastChunkAt = Date.now();
          text += piece;
        }
        if (candidate?.finishReason)
          result.finishReason = candidate.finishReason;
        if (payload?.promptFeedback?.blockReason) {
          result.finishReason = `BLOCKED_${payload.promptFeedback.blockReason}`;
        }
        if (payload?.modelVersion) result.modelVersion = payload.modelVersion;
        if (payload?.usageMetadata) {
          result.thoughts = payload.usageMetadata.thoughtsTokenCount ?? 0;
          result.output = payload.usageMetadata.candidatesTokenCount ?? 0;
        }
      }
    }

    result.chars = text.length;
    result.complete =
      result.finishReason === 'STOP' && ENDS_WITH_HASHTAGS.test(text);
    return result;
  } catch (error) {
    result.error = controller.signal.aborted
      ? `quá ${CALL_TIMEOUT_MS / 1000}s, đã huỷ`
      : scrub(error?.message ?? error);
    return result;
  } finally {
    clearTimeout(timer);
    result.totalMs = Date.now() - startedAt;
  }
}

function describe(result) {
  if (result.error && result.http !== 200) {
    return `HTTP ${result.http ?? '-'} sau ${seconds(result.totalMs)} | ${
      result.error
    }`;
  }
  return [
    `HTTP ${result.http}`,
    `chữ đầu ${seconds(result.ttftMs)}`,
    `xong ${seconds(result.totalMs)}`,
    `khựng dài nhất ${seconds(result.maxGapMs)}`,
    `finish=${result.finishReason ?? 'KHÔNG CÓ'}`,
    `token suy luận=${result.thoughts ?? '-'}`,
    `token bài=${result.output ?? '-'}`,
    `${result.chars} ký tự`,
    result.complete ? 'TRỌN VẸN' : 'CỤT',
    result.modelVersion ? `model thật=${result.modelVersion}` : '',
    result.error ? `lỗi: ${result.error}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

async function probeModels() {
  if (!apiKey) {
    console.error('Chế độ --models cần GEMINI_API_KEY.');
    process.exit(1);
  }

  const runsPerConfig = Number(process.env.PROBE_RUNS ?? 2);
  const limit = Number(process.env.PROBE_LIMIT ?? Infinity);
  const models = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
  ];
  const thinking = {
    'mặc định': undefined,
    minimal: { thinkingLevel: 'minimal' },
    'budget=0': { thinkingBudget: 0 },
    low: { thinkingLevel: 'low' },
  };
  const configs = models.flatMap((model) =>
    Object.entries(thinking).map(([name, thinkingConfig]) => ({
      model,
      name,
      thinkingConfig,
    })),
  );

  const summary = [];
  let calls = 0;

  for (const config of configs) {
    const label = `${config.model} [${config.name}]`;
    const results = [];
    for (let run = 1; run <= runsPerConfig; run++) {
      if (calls >= limit) break;
      if (calls > 0) await sleep(GAP_MS);
      calls++;
      const result = await callGeminiOnce(config);
      results.push(result);
      console.log(`${label} #${run}: ${describe(result)}`);
      // Model không tồn tại hoặc tham số bị từ chối thì chạy lại cũng vậy.
      if (result.http === 400 || result.http === 404) break;
    }
    if (results.length === 0) continue;
    const complete = results.filter((result) => result.complete);
    summary.push({
      label,
      ok: `${complete.length}/${results.length}`,
      ttft: complete.map((result) => seconds(result.ttftMs)).join(', ') || '-',
      total:
        complete.map((result) => seconds(result.totalMs)).join(', ') || '-',
    });
  }

  console.log('\n===== TÓM TẮT (chỉ tính lượt trọn vẹn) =====');
  for (const row of summary) {
    console.log(
      `${row.ok.padEnd(4)} ${row.label.padEnd(40)} chữ đầu: ${row.ttft.padEnd(
        12,
      )} xong: ${row.total}`,
    );
  }
}

await (MODE === 'models' ? probeModels() : probeEndToEnd());
