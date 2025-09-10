import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from './db/client';
import { chats, messages } from './db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { generateWithBedrock } from './bedrock';

const app = new Hono();
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ ok: true }));

// List available Bedrock models
app.get('/models', (c) => {
  const models = [
    { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet' },
    { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku' },
    { id: 'meta.llama-3.1-405b-instruct-v1:0', name: 'Llama 3.1 405B' }
  ];
  return c.json(models);
});

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

app.post('/chats', zValidator('json', CreateChatSchema), async (c) => {
  const { name, modelId } = c.req.valid('json');
  const chatId = randomUUID();
  const now = new Date();
  
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