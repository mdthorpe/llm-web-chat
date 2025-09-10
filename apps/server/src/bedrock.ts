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

export async function generateWithBedrock(modelId: string, conversation: ChatMessage[]): Promise<string> {

  // Mock mode for testing without AWS credentials
  if (MOCK_MODE) {
    const lastMessage = conversation[conversation.length - 1];
    return `[Mock Response] I received your message: "${lastMessage?.content}"\n\nThis is a mock response. To use real AI responses, set MOCK_BEDROCK=false and configure AWS credentials.`;
  }

  if (!modelId) return 'Model ID is missing.';

  if (modelId.startsWith('anthropic.')) {
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

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(requestBody)),
    });

    const response = await bedrockClient.send(command);
    const json = JSON.parse(new TextDecoder().decode(response.body));
    const text: string | undefined = json?.content?.[0]?.text;
    return text ?? '';
  }

  // TODO: Add Llama/other providers via Bedrock request shapes
  return 'This model is not yet supported in the server. Try an Anthropic model.';
}