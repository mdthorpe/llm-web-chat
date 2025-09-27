  import { Hono } from 'hono';
  import { cors } from 'hono/cors';
  import { z } from 'zod';
  import { zValidator } from '@hono/zod-validator';
  import { db } from './db/client';
  import { chats, messages } from './db/schema';
  import { eq } from 'drizzle-orm';
  import { randomUUID } from 'crypto';
  import { generateWithBedrock, generateWithBedrockStream } from './bedrock';
  import { summarizeText } from './bedrock';
  import { MODEL_CATALOG, SUPPORTED_MODEL_IDS } from './config/models';
  import { synthesizeToMp3 } from './tts';
  import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from '@aws-sdk/client-transcribe-streaming';
  import type { ServerWebSocket } from 'bun';

  type AppBindings = { Variables: { reqId: string } };
  
  const transcribe = new TranscribeStreamingClient({ region: process.env.AWS_REGION });
  type Ws = ServerWebSocket<any>;
  
  const app = new Hono<AppBindings>();
  app.use('*', cors());

  app.use('*', async (c, next) => {
    const startedAt = Date.now();
    const reqId = randomUUID();
    c.set('reqId', reqId);
    await next();
    const durationMs = Date.now() - startedAt;
  
    // attach request id to response
    try { c.res.headers.set('x-request-id', reqId); } catch {}
  
    // structured log
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'http.request',
      reqId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs,
    }));
  });

  // Health check
  app.get('/health', (c) => c.json({ ok: true }));

  // (intentionally no Hono route for /ws/stt) — handled by Bun.serve upgrade below

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

    function firstSentenceOf(text: string): string {
      const m = text.trim().match(/^(.+?[.!?])( |\n|$)/s);
      return (m?.[1] ?? text.trim()).replace(/\s+/g, ' ').trim();
    }
    
    function isDecentSummary(s: string): boolean {
      const len = s.length;
      const words = s.split(/\s+/).filter(Boolean).length;
      // widen bounds: allow detailed first sentences
      if (words < 3 || words > 60) return false;
      if (len < 15 || len > 300) return false;
      if (s.includes('```') || s.includes('http')) return false;      // still avoid code/urls
      if (/[{};]/.test(s)) return false;                               // code-ish
      if (!/^[A-Z]/.test(s)) return false;
      return true;
    }

    function stripMarkdownInline(s: string): string {
      return s.replace(/\*\*/g, '').replace(/[_`]/g, '');
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

    const reqId = c.get('reqId'); // set by the middleware
    
    const assistantText = await generateWithBedrock(
      chat.modelId,
      history.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { reqId, chatId, messageId } // pass context
    );

    const responseId = randomUUID();
    const responseTime = new Date();

    let summary: string | undefined;
    
    const candidate = firstSentenceOf(assistantText);
    if (isDecentSummary(candidate)) {
      summary = candidate.endsWith('.') ? candidate : `${candidate}.`;
    } else {
      summary = await summarizeText(assistantText, undefined, { reqId: c.get('reqId') });
    }

    await db.insert(messages).values({ 
      id: responseId, 
      chatId, 
      role: 'assistant', 
      content: assistantText, 
      summary, 
      createdAt: responseTime });

    return c.json({ messageId, responseId, text: assistantText, summary });
  });

  const SummarizeSchema = z.object({
    text: z.string().min(1),
    modelId: z.string().optional(), // optional override
  });
  
  app.post('/summarize', zValidator('json', SummarizeSchema), async (c) => {
    const { text, modelId } = c.req.valid('json');
    try {
      const summary = await summarizeText(text, modelId, { reqId: c.get('reqId') });
      return c.json({ summary });
    } catch (err) {
      console.error('Summarize error', err);
      return c.json({ error: 'Summarize failed' }, 502);
    }
  });

  app.delete('/chats/:id', async (c) => {
    const chatId = c.req.param('id');
    // messages have ON DELETE CASCADE, so this removes the chat and its messages
    await db.delete(chats).where(eq(chats.id, chatId));
    return c.json({ ok: true });
  });

  // Text to speech
  const TtsSchema = z.object({
    text: z.string().min(1),
    voiceId: z.string().optional(),
  });

  app.post('/tts', zValidator('json', TtsSchema), async (c) => {
    const { text, voiceId } = c.req.valid('json');
    const bytes = await synthesizeToMp3(text, voiceId);
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    return new Response(ab, {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'no-store',
      },
    });
  });

  
  // Start the server
  const port = Number(process.env.PORT ?? 3001);

  function wsToAudioStream(ws: Ws) {
    const queue: Uint8Array[] = [];
    let done = false;
    return {
      async *[Symbol.asyncIterator]() {
        while (!done || queue.length) {
          const chunk = queue.shift();
          if (chunk) yield { AudioEvent: { AudioChunk: chunk } };
          else await new Promise(r => setTimeout(r, 10));
        }
      },
      push(b: Uint8Array) { queue.push(b); },
      end() { done = true; }
    };
  }

  async function handleStreamingChat(ws: Ws, data: any) {
    const { chatId, content } = data;

    if (!chatId || !content) {
      ws.send(JSON.stringify({ type: 'error', error: 'Missing chatId or content' }));
      return;
    }

    try {
      // Ensure chat exists and get modelId
      const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
      if (!chat) {
        ws.send(JSON.stringify({ type: 'error', error: 'Chat not found' }));
        return;
      }

      if (!SUPPORTED_MODEL_IDS.has(chat.modelId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Unsupported model for this chat' }));
        return;
      }

      // Insert user message
      const messageId = randomUUID();
      const now = new Date();
      await db.insert(messages).values({
        id: messageId,
        chatId,
        role: 'user',
        content,
        createdAt: now
      }); 

      // Get conversation history
      const history = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);

      // Send start signal
      ws.send(JSON.stringify({ type: 'start', messageId }));
      let fullResponse = '';

      const streamGenerator = generateWithBedrockStream(
        chat.modelId,
        history,
        { reqId: randomUUID(), chatId, messageId }
      );
  
      for await (const chunk of streamGenerator) {
        fullResponse += chunk;
        ws.send(JSON.stringify({ type: 'chunk', messageId, text: chunk }));
      }
  
      // Insert assistant message
      const responseId = randomUUID();
      const responseTime = new Date();

      
      // Generate summary (this could also be streamed in the future)
      let summary: string | undefined;
      const firstSentence = fullResponse.trim().match(/^(.+?[.!?])( |\n|$)/s)?.[1] ?? fullResponse.trim();

      if (firstSentence && firstSentence.length >= 15 && firstSentence.length <= 300 &&
          firstSentence.split(/\s+/).filter(Boolean).length >= 3 &&
          firstSentence.split(/\s+/).filter(Boolean).length <= 60 &&
          !firstSentence.includes('```') && !firstSentence.includes('http') &&
          !/[{};]/.test(firstSentence) && /^[A-Z]/.test(firstSentence)) {
        summary = firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
      } else {
        summary = await summarizeText(fullResponse, undefined, { reqId: randomUUID() });
      }

      // Insert assistant message once with the final summary
      await db.insert(messages).values({
        id: responseId,
        chatId,
        role: 'assistant',
        content: fullResponse,
        summary,
        createdAt: responseTime
      });

      // Send completion signal
      ws.send(JSON.stringify({ type: 'complete', messageId, responseId, summary }));

    } catch (error) {
      console.error('Streaming chat error:', error);
      ws.send(JSON.stringify({ type: 'error', error: String(error) }));
    }
  }
  
  export const server = Bun.serve({
    port,
    websocket: {
      async open(ws: Ws) {
        const connectionType = ws.data?.type; // This comes from the fetch handler

        if (connectionType === 'stt') {
          const audio = wsToAudioStream(ws);
          // stash on ws for use in message/close
          // @ts-expect-error
          ws.audio = audio;
    
          // Send a ready event so clients can verify the connection upgraded
          try { ws.send(JSON.stringify({ type: 'ready' })); } catch {}

          try {
            const cmd = new StartStreamTranscriptionCommand({
              LanguageCode: 'en-US',
              MediaEncoding: 'pcm',
              MediaSampleRateHertz: 16000,
              AudioStream: audio as any,
              EnablePartialResultsStabilization: true,
              PartialResultsStability: 'medium',
            });
            const res = await transcribe.send(cmd);
            for await (const evt of res.TranscriptResultStream!) {
              const results = (evt as any).TranscriptEvent?.Transcript?.Results || [];
              for (const r of results) {
                const text = (r.Alternatives?.[0]?.Transcript || '').trim();
                if (text) {
                  ws.send(JSON.stringify({ type: r.IsPartial ? 'partial' : 'final', text }));
                }
              }
            }
          } catch (e) {
            ws.send(JSON.stringify({ type: 'error', error: String(e) }));
          } finally {
            ws.close();
          }
        } else if (connectionType === 'chat') {
          // Handle streaming chat connections  
          // Just send ready signal, no audio setup needed
          try { ws.send(JSON.stringify({ type: 'ready' })); } catch {}
        }
      },
      message(ws: Ws, data) {
        // binary PCM chunks (Int16 at 16kHz)
        if (data instanceof Uint8Array) {
          // @ts-expect-error
          ws.audio?.push(data);
        } else if (typeof data === 'string' && data === 'END') {
          // @ts-expect-error
          ws.audio?.end();
        } else if (typeof data === 'string' && data === 'PING') {
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch {}
        } else if (typeof data === 'string') {
          // Handle streaming chat requests
          try {
            const parsedData = JSON.parse(data);
            if (parsedData.type === 'chat') {
              void handleStreamingChat(ws, parsedData);
            }
          } catch (e) {
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
          }
        }
      },
      close(ws: Ws) {
        // @ts-expect-error
        ws.audio?.end();
      },
    },
    fetch(req, srv) {
      const { pathname } = new URL(req.url);
      if (pathname === '/ws/stt') {
        if (srv.upgrade(req, { data: { type: 'stt' } })) return;
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      if (pathname === '/ws/chat') {
        if (srv.upgrade(req, { data: { type: 'chat' } })) return;
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      return app.fetch(req);
    },
  });

  console.log(`Server listening on http://localhost:${port}`)