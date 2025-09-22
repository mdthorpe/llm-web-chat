import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings';


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
  summary?: string | undefined;
};

import { API_BASE } from '@/lib/config';

export default function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [newChatModelId, setNewChatModelId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [startMessage, setStartMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const speakSummaries = settings.speakSummaries;

  const toMs = (v: number | string) =>
    typeof v === 'number' ? v : (Number.isFinite(Number(v)) ? Number(v) : new Date(v).getTime() || 0);

  // on mount, load from localStorage
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // remove previous
    Array.from(root.classList)
      .filter(c => c.startsWith('theme-'))
      .forEach(c => root.classList.remove(c));
    if (settings.colorScheme && settings.colorScheme !== 'default') {
      root.classList.add(`theme-${settings.colorScheme}`);
    }
  }, [settings.colorScheme]);

    // Apply theme to <html> using the .dark class
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    root.classList.toggle('dark', isDark);
  }, [settings.theme]);

  // Keep in sync when theme = system and OS preference changes
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => document.documentElement.classList.toggle('dark', mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

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

  const sortedChats = useMemo(() => {
    const copy = [...chats];
    copy.sort((a, b) =>
      sortDesc ? toMs(b.updatedAt) - toMs(a.updatedAt) : toMs(a.updatedAt) - toMs(b.updatedAt)
    );
    return copy;
  }, [chats, sortDesc]);

  async function doSendMessage() {
    if (!selectedChatId || !messageText.trim()) return;

    const text = messageText.trim();
    setMessageText('');
    setSending(true);

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
      const assistantSummary: string | undefined = json?.summary;
      const responseId: string | undefined = json?.responseId;

      console.debug('json:', json);
      console.debug('assistantSummary:', json?.summary);
      console.debug('speakSummaries:', speakSummaries);

      if (assistantSummary && speakSummaries) {
        void playTts(assistantSummary);
      }

      const msgsRes = await fetch(`${API_BASE}/chats/${selectedChatId}/messages`);
      const msgsJson = await msgsRes.json();
      setMessages(msgsJson);

      if (!assistantText) {
        console.warn('No assistant text returned');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send message');
      try {
        const msgsRes = await fetch(`${API_BASE}/chats/${selectedChatId}/messages`);
        const msgsJson = await msgsRes.json();
        setMessages(msgsJson);
      } catch {}
    } finally {
      setSending(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    await doSendMessage();
  }

  async function playTts(text: string) {
    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }), // optionally: { text, voiceId: 'Joanna' }
      });
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (err) {
      console.error('TTS error', err);
      alert('Failed to play TTS');
    }
  }

  async function handleStartChat() {
    const text = startMessage.trim();
    if (!text || !newChatModelId) return;
    setLoading(true);
    try {
      const createRes = await fetch(`${API_BASE}/chats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New Chat', modelId: newChatModelId }),
      });
      if (!createRes.ok) throw new Error('Create chat failed');
      const chat: Chat = await createRes.json();
      setChats((prev) => [chat, ...prev]);
      setSelectedChatId(chat.id);

      const sendRes = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: chat.id, content: text }),
      });
      if (!sendRes.ok) throw new Error('Send message failed');

      const msgsRes = await fetch(`${API_BASE}/chats/${chat.id}/messages`);
      setMessages(await msgsRes.json());

      // Try to auto-generate a title (endpoint may not exist yet)
      const titleRes = await fetch(`${API_BASE}/chats/${chat.id}/generate-title`, { method: 'POST' });
      if (titleRes.ok) {
        const { title } = await titleRes.json();
        if (title) {
          setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, name: title, updatedAt: Date.now() } : c)));
        }
      }

      setStartMessage('');
    } catch (err) {
      console.error(err);
      alert('Failed to start chat');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteChat(id: string) {
    const ok = window.confirm('Delete this chat? This cannot be undone.');
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/chats/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (selectedChatId === id) {
        setSelectedChatId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete chat');
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [configRes, modelsRes, chatsRes] = await Promise.all([
          fetch(`${API_BASE}/config`),
          fetch(`${API_BASE}/models`),
          fetch(`${API_BASE}/chats`),
        ]);
        const [{ defaultModelId }, modelsJson, chatsJson] = await Promise.all([
          configRes.json(), modelsRes.json(), chatsRes.json()
        ]);
  
        setModels(modelsJson);
        setChats([...chatsJson].sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt)));
  
        if (!newChatModelId && defaultModelId && modelsJson.some((m: any) => m.id === defaultModelId)) {
          setNewChatModelId(defaultModelId);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[320px_1fr] bg-background text-foreground">
      {/* Sidebar */}
      <aside className="border-r border-border p-4 space-y-6">
        <h1 className="text-xl font-semibold text-primary">LLM Web Chat</h1>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setSelectedChatId(null);
            setStartMessage('');
          }}
        >
          New Chat
        </Button>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Chats</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortDesc((v) => !v)}
              title={sortDesc ? 'Sorting: Newest first' : 'Sorting: Oldest first'}
            >
              {sortDesc ? 'Newest' : 'Oldest'}
            </Button>
          </div>
          <div className="h-[40vh] overflow-auto divide-y divide-border rounded-md border border-border">
            {chats.length === 0 && <div className="p-3 text-sm text-muted-foreground">No chats yet</div>}
            {sortedChats.map((c) => (
              <div key={c.id} className="relative">
                <Button
                  variant={selectedChatId === c.id ? "secondary" : "ghost"}
                  className="w-full justify-start p-3 h-auto flex-col items-start"
                  onClick={() => setSelectedChatId(c.id)}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.modelId}</div>
                </Button>
                <button
                  aria-label="Delete chat"
                  title="Delete chat"
                  className="absolute right-2 top-2 text-muted-foreground opacity-50 transition-opacity transition-colors
                            group-hover:opacity-100 hover:text-red-600 focus-visible:opacity-100
                            hover:ring-1 hover:ring-red-200 hover:bg-red-50 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteChat(c.id);
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
          <div className="pt-2">Settings</div>
          <div className="pt-3">
              <label className="text-sm font-medium">Chat Model</label>
              <Select
                value={newChatModelId}
                onValueChange={(v) => setNewChatModelId(v)}
              >
                <SelectTrigger className="w-full bg-secondary text-secondary-foreground border-border focus:ring-ring">
                  <SelectValue placeholder="Select a model…" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          <div className="pt-3">
            <label className="text-sm font-medium block mb-1">Theme</label>
            <Select
              value={settings.theme}
              onValueChange={(v) =>
                setSettings(saveSettings({ theme: v as 'light' | 'dark' | 'system' }))
              }
            >
              <SelectTrigger className="w-full bg-secondary text-secondary-foreground border-border focus:ring-ring">
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pt-3">
            <label className="text-sm font-medium block mb-1">Color scheme</label>
            <Select
              value={settings.colorScheme}
              onValueChange={(v) =>
                setSettings(saveSettings({ colorScheme: v as 'default' | 'sky' | 'emerald' | 'rose' }))
              }
            >
              <SelectTrigger className="w-full bg-secondary text-secondary-foreground border-border focus:ring-ring">
                <SelectValue placeholder="Color scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="sky">Sky</SelectItem>
                <SelectItem value="emerald">Emerald</SelectItem>
                <SelectItem value="rose">Rose</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pt-3 flex items-center justify-between">
            <span className="text-sm">Speak summaries</span>
            <Switch
              checked={settings.speakSummaries}
              onCheckedChange={(v) =>
                setSettings(saveSettings({ speakSummaries: v }))
              }
              aria-label="Toggle speak summaries"
            />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="p-4 flex flex-col h-[100svh] md:h-screen">
        {!selectedChat ? (
          <div className="m-auto max-w-2xl w-full space-y-4">
            <h2 className="text-2xl font-semibold text-center">Start a new chat</h2>
            <Textarea
              className="min-h-[160px] resize-y"
              placeholder="Type your first message to start the conversation…"
              value={startMessage}
              onChange={(e) => setStartMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (newChatModelId && startMessage.trim() && !loading) {
                    void handleStartChat();
                  }
                }
              }}
            />
            <div className="flex justify-end">
              <Button onClick={handleStartChat} disabled={!startMessage.trim() || !newChatModelId || loading}>
                Start chat
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="flex">
                  {m.role !== 'user' && m.summary && (
                    <div className="mb-1 mr-2 inline-block rounded-lg bg-secondary text-secondary-foreground px-3 py-2 shadow-sm min-w-[30ch] max-w-[30ch] whitespace-normal break-words">
                      {m.summary}
                    </div>
                  )}
                  <Card
                    className={`px-4 py-2 max-w-[80%] whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground ml-auto border border-primary'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {m.content}
                  </Card>
                  {m.role !== 'user' && (
                <div className="ml-2 self-center">
                  <Button variant="ghost" size="sm" onClick={() => playTts(m.content)}>
                    ▶︎ Play
                  </Button>
                </div>
              )}
                </div>
              ))}
            </div>

            <form className="mt-4 flex gap-2" onSubmit={handleSendMessage}>
              <Textarea
                className="flex-1 min-h-[60px] resize-none"
                placeholder="Type your message…"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void doSendMessage();
                }
              }}
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