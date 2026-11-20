import { useCallback, useEffect, useState } from 'react';
import { api } from './api/http.js';
import { useChat } from './hooks/useChat.js';
import { useConversations, useSearch } from './hooks/useConversations.js';
import { useTones } from './hooks/useTones.js';
import { Sidebar } from './components/Sidebar.jsx';
import { ToneToggle } from './components/ToneToggle.jsx';
import { MessageList } from './components/MessageList.jsx';
import { Composer } from './components/Composer.jsx';
import { EmptyState } from './components/EmptyState.jsx';
import { MenuIcon, CloseIcon } from './components/Icons.jsx';
import './styles/global.css';

export default function App() {
  const { tones, defaultTone, error: tonesError } = useTones();
  const threads = useConversations();
  const chat = useChat({ onThreadUpdated: threads.refresh });

  const [tone, setTone] = useState(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusExchangeId, setFocusExchangeId] = useState(null);
  const [health, setHealth] = useState(null);
  const search = useSearch(query);

  useEffect(() => { if (!tone && defaultTone) setTone(defaultTone); }, [defaultTone, tone]);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ status: 'down' })); }, []);

  const activeTone = tones.find((t) => t.id === tone);
  const { conversation } = chat;

  const openThread = useCallback(async (id, exchangeId) => {
    setSidebarOpen(false);
    setFocusExchangeId(exchangeId ?? null);
    await chat.open(id);
  }, [chat]);

  // A reopened thread restores the tone it last used.
  useEffect(() => {
    if (conversation?.id && conversation.tone && !chat.isStreaming) setTone(conversation.tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const newChat = () => {
    chat.startNew();
    setDraft('');
    setFocusExchangeId(null);
    setSidebarOpen(false);
  };

  const submit = async (text = draft) => {
    const prompt = text.trim();
    if (!prompt || !tone) return;
    setDraft('');
    setFocusExchangeId(null);
    const started = await chat.send(prompt, tone);
    if (!started) setDraft(prompt); // rejected before streaming: give the text back
  };

  const deleteThread = async (id) => {
    await threads.remove(id);
    if (conversation?.id === id) chat.startNew();
  };

  const hasMessages = Boolean(conversation?.exchanges?.length);
  const fatal = tonesError ? 'Cannot reach the server. Start the API and reload the page.' : null;

  return (
    <div className="app" data-tone={tone ?? 'professional'}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        threads={threads}
        activeId={conversation?.id}
        onNew={newChat}
        onOpen={openThread}
        onRename={threads.rename}
        onDelete={deleteThread}
        query={query}
        onQuery={setQuery}
        search={search}
        health={health}
      />
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <main className="main">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open history">
            <MenuIcon />
          </button>
          <h2 className="topbar__title">{hasMessages ? conversation.title : 'New conversation'}</h2>
          <ToneToggle tones={tones} value={tone} onChange={setTone} />
        </header>

        {chat.loading ? (
          <div className="messages"><p className="loading">Opening conversation…</p></div>
        ) : (
          <MessageList
            conversation={conversation}
            tones={tones}
            tone={tone}
            streamingId={chat.streamingId}
            isLive={chat.isLive}
            focusExchangeId={focusExchangeId}
            onRegenerate={(exchangeId) => chat.regenerate(exchangeId, tone)}
          >
            {!hasMessages && <EmptyState toneLabel={activeTone?.label} onPick={(s) => submit(s)} />}
          </MessageList>
        )}

        {(chat.error || fatal) && (
          <div className="banner" role="alert">
            <span>{fatal ?? chat.error}</span>
            {!fatal && (
              <button type="button" onClick={chat.dismissError} aria-label="Dismiss"><CloseIcon /></button>
            )}
          </div>
        )}

        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => submit()}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
          disabled={!tone || Boolean(fatal)}
          toneLabel={activeTone?.label}
        />
      </main>
    </div>
  );
}
