// apps/server/src/bedrock.ts
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION
});

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Add this before the generateWithBedrock function
const MOCK_MODE = process.env.MOCK_BEDROCK === 'true';
const DEFAULT_SUMMARIZER_MODEL_ID = process.env.SUMMARIZER_MODEL_ID ?? 'anthropic.claude-3-haiku-20240307-v1:0';

export async function generateWithBedrock(
  modelId: string, 
  conversation: ChatMessage[], 
  ctx?: { reqId?: string; chatId?: string; messageId?: `${string}-${string}-${string}-${string}-${string}`; }): Promise<string> {

  // Mock mode for testing without AWS credentials
  if (MOCK_MODE) {
    const lastMessage = conversation[conversation.length - 1];
    return `[Mock Response] I received your message: "${lastMessage?.content}"\n\nThis is a mock response. To use real AI responses, set MOCK_BEDROCK=false and configure AWS credentials.`;
  }

  if (!modelId) return 'Model ID is missing.';

  if ((process.env.BEDROCK_INFERENCE_PROFILE_ARN) || modelId.startsWith('anthropic.')) {
    const systemPrompt = conversation
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const nonSystemMessages = conversation.filter((m) => m.role !== 'system');

    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: [
          {
            type: 'text',
            text: m.content,
          },
        ],
      })),
      ...(systemPrompt ? { system: systemPrompt } : {}),
    } as const;

    const inferenceProfileArn = process.env.BEDROCK_INFERENCE_PROFILE_ARN;
    const targetModelId = inferenceProfileArn || modelId;

    const command = new InvokeModelCommand({
      modelId: targetModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(requestBody)),
    } as any);
    
    const response = await bedrockClient.send(command);
    const json = JSON.parse(new TextDecoder().decode(response.body));
    const text: string | undefined = json?.content?.[0]?.text;
    return text ?? '';
  }

  // TODO: Add Llama/other providers via Bedrock request shapes
  return 'This model is not yet supported in the server. Try an Anthropic model.';
}

function enforceOneSentenceSummary(s: string): string {
  const firstSentence = s.split(/[.!?]/, 1)[0] ?? '';
  const words = firstSentence.trim().split(/\s+/).slice(0, 12);
  const out = words.join(' ').replace(/["'`]+/g, '').trim();
  if (!out) return 'Here is a brief overview.';
  return out.endsWith('.') ? out : `${out}.`;
}

export async function summarizeText(
  text: string,
  modelIdOverride?: string,
  ctx?: { reqId?: string; chatId?: string; messageId?: `${string}-${string}-${string}-${string}-${string}`; }
): Promise<string> {
  const modelForSummary = modelIdOverride ?? DEFAULT_SUMMARIZER_MODEL_ID;
  const prompt: ChatMessage[] = [
    {
      role: 'system',
      content:
      "Return EXACTLY ONE friendly sentence (<= 12 words) that introduces the reply, like 'Here is some information about <topic>.' No quotes, no lists, no markdown, no extra text. End with a period.",
    },
    { role: 'user', content: text.slice(0, 40) }
  ];
  const raw = await generateWithBedrock(modelForSummary, prompt, ctx);
  return enforceOneSentenceSummary(raw);

}