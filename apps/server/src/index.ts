  import { Hono } from 'hono';
  import { cors } from 'hono/cors';
  import { z } from 'zod';
  import { zValidator } from '@hono/zod-validator';
  import { db } from './db/client';
  import { chats, messages } from './db/schema';
  import { eq } from 'drizzle-orm';
  import { randomUUID } from 'crypto';
  import { generateWithBedrock } from './bedrock';
  import { MODEL_CATALOG, SUPPORTED_MODEL_IDS } from './config/models';

  const app = new Hono();
  app.use('*', cors());

  // Health check
  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/config', (c) => {
    return c.json({ defaultModelId: process.env.DEFAULT_MODEL_ID ?? null });
  });

  // List available Bedrock models
  app.get('/models', (c) => c.json(MODEL_CATALOG));

  // List all chats
  app.get('/chats', async (c) => {
    const allChats = await db.select().from(chats).orderBy(chats.updatedAt);
    return c.json(allChats);
  });

  // Create new chat
  const CreateChatSchema = z.object({
    name: z.string().min(1),
    modelId: z.string().min(1)
  });

  // Optional schema if you want future overrides (e.g., modelId)
const GenerateTitleSchema = z.object({
  modelId: z.string().optional(),
});

app.post('/chats/:id/generate-title', async (c) => {
  const chatId = c.req.param('id');

  // Fetch chat
  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
  if (!chat) return c.json({ error: 'Chat not found' }, 404);

  // Fetch messages
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.createdAt);

  if (history.length === 0) {
    return c.json({ error: 'No messages in chat' }, 400);
  }

  // Choose a fast/default model for titling (or use chat.modelId if you prefer)
  const titlingModelId = 'anthropic.claude-3-haiku-20240307-v1:0';

  // Build a concise titling prompt
  const systemInstruction =
    'You create short, descriptive chat titles. Respond with ONLY the title, 3-6 words, no quotes.';
  const contentSample = history
    .slice(0, 6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const titleText = await generateWithBedrock(titlingModelId, [
    { role: 'system', content: systemInstruction },
    {
      role: 'user',
      content: `Based on this conversation excerpt, generate a concise title:\n\n${contentSample}`,
    },
  ]);

  const title = (titleText || '').trim().replace(/^["']|["']$/g, '').slice(0, 80) || 'New Chat';

  await db
    .update(chats)
    .set({ name: title, updatedAt: new Date() })
    .where(eq(chats.id, chatId));

  return c.json({ title });
  });
  app.post('/chats', zValidator('json', CreateChatSchema), async (c) => {
    const { name, modelId } = c.req.valid('json');
    const chatId = randomUUID();
    const now = new Date();
    
    if (!SUPPORTED_MODEL_IDS.has(modelId)) {
      return c.json({ error: 'Unsupported modelId' }, 400);
    }

    await db.insert(chats).values({
      id: chatId,
      name,
      modelId,
      createdAt: now,
      updatedAt: now
    });
    
    return c.json({ id: chatId, name, modelId });
  });

  // Get messages for a chat
  app.get('/chats/:id/messages', async (c) => {
    const chatId = c.req.param('id');
    const chatMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);
    
    return c.json(chatMessages);
  });

  // Send message (placeholder - we'll add Bedrock integration next)
  const SendMessageSchema = z.object({
    chatId: z.string().uuid(),
    content: z.string().min(1)
  });

  app.post('/messages', zValidator('json', SendMessageSchema), async (c) => {
    const { chatId, content } = c.req.valid('json');

    // Ensure chat exists before inserting messages
    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
    if (!chat) {
      return c.json({ error: 'Chat not found' }, 404);
    }
    
    if (!SUPPORTED_MODEL_IDS.has(chat.modelId)) {
      return c.json({ error: 'Unsupported model for this chat' }, 400);
    }
    const messageId = randomUUID();
    const now = new Date();

    await db.insert(messages).values({
      id: messageId,
      chatId,
      role: 'user',
      content,
      createdAt: now
    });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);

    const assistantText = await generateWithBedrock(
      chat.modelId,
      history.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    );

    const responseId = randomUUID();
    const responseTime = new Date();

    await db.insert(messages).values({
      id: responseId,
      chatId,
      role: 'assistant',
      content: assistantText,
      createdAt: responseTime
    });

    return c.json({ messageId, responseId, text: assistantText });
  });

  export default app;

  // Start the server
  const port = Number(process.env.PORT ?? 3000);

  export const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Server listening on http://localhost:${port}`)