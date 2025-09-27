// apps/server/src/bedrock.ts
import { BedrockRuntimeClient, 
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

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
      "Return EXACTLY ONE conversational andfriendly sentence (<= 12 words) that introduces the reply, like 'Here is some information about <topic>.' No quotes, no lists, no markdown, no extra text. End with a period. Do not prefix the summary with phrases like 'Here is a summary of' or 'Here is a brief overview of'.",
    },
    { role: 'user', content: text.slice(0, 40) }
  ];
  const raw = await generateWithBedrock(modelForSummary, prompt, ctx);
  return enforceOneSentenceSummary(raw);

}

export async function* generateWithBedrockStream(
  modelId: string, 
  conversation: ChatMessage[], 
  ctx?: { reqId?: string; chatId?: string; messageId?: string; }
): AsyncGenerator<string, void, unknown> {

  // Mock mode for testing
  if (MOCK_MODE) {
    const lastMessage = conversation[conversation.length - 1];
    const mockResponse = `[Mock Streaming Response] I received your message: "${lastMessage?.content}"`;
    const words = mockResponse.split(' ');
    
    for (const word of words) {
      yield word + ' ';
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return;
  }

  if (!modelId) {
    yield 'Model ID is missing.';
    return;
  }

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

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: targetModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(requestBody)),
    } as any);

    try {
      const response = await bedrockClient.send(command);

      if (response.body) {
        for await (const chunk of response.body) {
          try {
            // Handle different chunk structures from AWS SDK
            let chunkData;
            if ((chunk as any).chunk?.bytes) {
              chunkData = JSON.parse(new TextDecoder().decode((chunk as any).chunk.bytes));
            } else if ((chunk as any).Bytes) {
              chunkData = JSON.parse(new TextDecoder().decode((chunk as any).Bytes));
            } else {
              // Try to decode the chunk directly as a fallback
              chunkData = JSON.parse(new TextDecoder().decode(chunk as unknown as Uint8Array));
            }

            if (chunkData.type === 'content_block_delta' && chunkData.delta?.type === 'text_delta') {
              const textDelta = chunkData.delta.text;
              yield textDelta;
            }
          } catch (error) {
            console.warn('Failed to parse chunk:', error);
          }
        }
      }
    } catch (error) {
      console.error('Bedrock streaming error:', error);
      yield 'Error occurred during streaming response.';
    }
  } else {
    yield 'This model is not yet supported for streaming in the server. Try an Anthropic model.';
  }
} 