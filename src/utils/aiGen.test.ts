import { generateWithAIStream } from './aiGen';

jest.mock('@google/genai', () => {
  const mockStream = async function* () {
    yield { text: 'Hello ' };
    yield { text: 'world' };
  };
  return {
    GoogleGenAI: class {
      models = {
        generateContentStream: jest.fn(async () => mockStream()),
      };
    },
  };
});

describe('generateWithAIStream', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, REACT_APP_GEMINI_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('yields model chunks concatenated in order', async () => {
    const chunks: string[] = [];
    for await (const chunk of generateWithAIStream('raw input', 'TITLE')) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('Hello world');
  });

  it('throws when API key is missing', async () => {
    process.env = { ...OLD_ENV };
    delete (process.env as { REACT_APP_GEMINI_API_KEY?: string }).REACT_APP_GEMINI_API_KEY;

    await expect(async () => {
      for await (const _ of generateWithAIStream('raw input', 'TITLE')) {
        // drain
      }
    }).rejects.toThrow(/API key/);
  });
});
