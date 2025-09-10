import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

type Role = 'user' | 'assistant' | 'system';

type Model = { id: string; name: string };
type Chat = {
  id: string;
  name: string;
  modelId: string;
  createdAt: number | string;
  updatedAt: number | string;
};
type Message = {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  createdAt: number | string;
};

import { API_BASE } from '@/lib/config';

export default function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [newChatName, setNewChatName] = useState('');
  const [newChatModelId, setNewChatModelId] = useState('');
  const [messageText, setMessageText] = useState('');

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [modelsRes, chatsRes] = await Promise.all([
          fetch(`${API_BASE}/models`),
          fetch(`${API_BASE}/chats`),
        ]);
        const [modelsJson, chatsJson] = await Promise.all([modelsRes.json(), chatsRes.json()]);
        setModels(modelsJson);
        // Most recent first
        setChats([...chatsJson].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)));
      } catch (err) {
        console.error('Failed to load initial data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedChatId) return;
      try {
        const res = await fetch(`${API_BASE}/chats/${selectedChatId}/messages`);
        const json = await res.json();
        setMessages(json);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };
    loadMessages();
  }, [selectedChatId]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

  async function handleCreateChat(e: React.FormEvent) {
    e.preventDefault();
    if (!newChatName.trim() || !newChatModelId) return;

    try {
      const res = await fetch(`${API_BASE}/chats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newChatName.trim(), modelId: newChatModelId }),
      });
      if (!res.ok) {
        const detail = await safeJson(res);
        throw new Error(`Create chat failed: ${res.status} ${JSON.stringify(detail)}`);
      }
      const chat: Chat = await res.json();
      setChats((prev) => [chat, ...prev]);
      setSelectedChatId(chat.id);
      setNewChatName('');
      setNewChatModelId('');
      setMessages([]);
    } catch (err) {
      console.error(err);
      alert('Failed to create chat');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChatId || !messageText.trim()) return;

    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    // optimistic user message
    const tempUser: Message = {
      id: `temp-user-${Date.now()}`,
      chatId: selectedChatId,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, tempUser]);

    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: selectedChatId, content: text }),
      });
      if (!res.ok) {
        const detail = await safeJson(res);
        throw new Error(`Send failed: ${res.status} ${JSON.stringify(detail)}`);
      }
      const json = await res.json();
      const assistantText: string | undefined = json?.text;

      // reload from server to get canonical history
      const msgsRes = await fetch(`${API_BASE}/chats/${selectedChatId}/messages`);
      const msgsJson = await msgsRes.json();
      setMessages(msgsJson);

      if (!assistantText) {
        console.warn('No assistant text returned');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send message');
      // rollback optimistic message by refetching
      try {
        const msgsRes = await fetch(`${API_BASE}/chats/${selectedChatId}/messages`);
        const msgsJson = await msgsRes.json();
        setMessages(msgsJson);
      } catch {}
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[320px_1fr]">
      {/* Sidebar */}
      <aside className="border-r p-4 space-y-6">
        <h1 className="text-xl font-semibold">LLM Web Chat</h1>

        <form className="space-y-3" onSubmit={handleCreateChat}>
          <div className="space-y-1">
            <label className="text-sm font-medium">Chat name</label>
            <Input
              placeholder="e.g. Ideas, Debugging"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Model</label>
            <select
              className="w-full rounded border px-3 py-2 bg-white"
              value={newChatModelId}
              onChange={(e) => setNewChatModelId(e.target.value)}
            >
              <option value="">Select a model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!newChatName.trim() || !newChatModelId || loading}
          >
            New Chat
          </Button>
        </form>

        <div className="space-y-2">
          <div className="text-sm font-medium">Chats</div>
          <div className="h-[40vh] overflow-auto divide-y rounded-md border">
            {chats.length === 0 && <div className="p-3 text-sm text-gray-500">No chats yet</div>}
            {chats.map((c) => (
              <Button
                key={c.id}
                variant={selectedChatId === c.id ? "secondary" : "ghost"}
                className="w-full justify-start p-3 h-auto flex-col items-start"
                onClick={() => setSelectedChatId(c.id)}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-500">{c.modelId}</div>
              </Button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="p-4 flex flex-col h-[100svh] md:h-screen">
        {!selectedChat ? (
          <div className="m-auto text-gray-500">Select or create a chat to begin.</div>
        ) : (
          <>
            <div className="flex-1 overflow-auto space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="flex">
                  <Card
                    className={`px-3 py-2 max-w-[80%] whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white ml-auto border-blue-600'
                        : 'bg-gray-100'
                    }`}
                  >
                    {m.content}
                  </Card>
                </div>
              ))}
            </div>

            <form className="mt-4 flex gap-2" onSubmit={handleSendMessage}>
              <Textarea
                className="flex-1 min-h-[60px] resize-none"
                placeholder="Type your message…"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                disabled={!selectedChatId || sending}
                rows={2}
              />
              <Button
                type="submit"
                disabled={!selectedChatId || !messageText.trim() || sending}
              >
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}