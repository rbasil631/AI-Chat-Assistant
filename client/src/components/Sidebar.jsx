import { useState } from 'react';
import { Highlight } from './Highlight.jsx';
import { CloseIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from './Icons.jsx';
import { relativeTime } from '../lib/format.js';

function ThreadItem({ item, active, onOpen, onRename, onDelete }) {
  const [mode, setMode] = useState('view'); // view | rename | confirm
  const [draft, setDraft] = useState(item.title);
  const [err, setErr] = useState(null);

  const saveRename = async () => {
    const title = draft.trim();
    if (!title || title === item.title) return setMode('view');
    try {
      await onRename(item.id, title);
      setMode('view');
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  };

  if (mode === 'rename') {
    return (
      <li className="thread is-editing">
        <input
          className="thread__input"
          value={draft}
          autoFocus
          maxLength={120}
          aria-label="Conversation title"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveRename();
            if (e.key === 'Escape') { setDraft(item.title); setMode('view'); }
          }}
          onBlur={saveRename}
        />
        {err && <p className="thread__err">{err}</p>}
      </li>
    );
  }

  if (mode === 'confirm') {
    return (
      <li className="thread is-confirm">
        <p>Delete “{item.title}”?</p>
        <div className="thread__confirm">
          <button type="button" className="danger" onClick={() => onDelete(item.id)}>Delete</button>
          <button type="button" onClick={() => setMode('view')}>Keep</button>
        </div>
      </li>
    );
  }

  return (
    <li className={`thread${active ? ' is-active' : ''}`} data-tone={item.tone}>
      <button type="button" className="thread__main" onClick={() => onOpen(item.id)} aria-current={active ? 'page' : undefined}>
        <span className="thread__title">{item.title}</span>
        <span className="thread__sub">
          <span>{relativeTime(item.updatedAt)}</span>
          <span>{item.exchangeCount} {item.exchangeCount === 1 ? 'message' : 'messages'}</span>
        </span>
      </button>
      <div className="thread__actions">
        <button type="button" onClick={() => { setDraft(item.title); setMode('rename'); }} aria-label={`Rename ${item.title}`}><PencilIcon /></button>
        <button type="button" onClick={() => setMode('confirm')} aria-label={`Delete ${item.title}`}><TrashIcon /></button>
      </div>
    </li>
  );
}

function SearchResults({ results, searching, error, onPick }) {
  if (error) return <p className="side-note">{error}</p>;
  if (searching && !results.length) return <p className="side-note">Searching…</p>;
  if (!results.length) return <p className="side-note">No messages match. Try a different word.</p>;
  return (
    <ul className="results">
      {results.map((r) => (
        <li key={r.conversationId}>
          <button type="button" className="result" onClick={() => onPick(r.conversationId, r.matches[0]?.exchangeId)}>
            <span className="result__title"><Highlight text={r.title} ranges={r.titleHighlights} /></span>
            {r.matches.slice(0, 2).map((m) => (
              <span key={`${m.exchangeId}-${m.field}`} className="result__snippet">
                <span className="result__who">{m.field === 'prompt' ? 'You' : 'AI'}</span>
                <Highlight text={m.snippet.text} ranges={m.snippet.highlights} />
              </span>
            ))}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Sidebar({
  open, onClose, threads, activeId, onNew, onOpen, onRename, onDelete,
  query, onQuery, search, health,
}) {
  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Conversation history">
      <div className="sidebar__top">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span>AI Chat Assistant</span>
        </div>
        <button type="button" className="sidebar__close" onClick={onClose} aria-label="Close history"><CloseIcon /></button>
      </div>

      <button type="button" className="new-chat" onClick={onNew}><PlusIcon /> New chat</button>

      <label className="search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search all chats"
          aria-label="Search all chats"
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>

      <nav className="sidebar__scroll">
        {search.active ? (
          <SearchResults {...search} onPick={onOpen} />
        ) : threads.loading ? (
          <p className="side-note">Loading chats…</p>
        ) : threads.error ? (
          <p className="side-note">{threads.error}</p>
        ) : threads.items.length === 0 ? (
          <p className="side-note">Your conversations will appear here.</p>
        ) : (
          <>
            <ul className="threads">
              {threads.items.map((item) => (
                <ThreadItem
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  onOpen={onOpen}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </ul>
            {threads.nextCursor && (
              <button type="button" className="load-more" onClick={threads.loadMore}>Show older chats</button>
            )}
          </>
        )}
      </nav>

      {health && (
        <footer className="sidebar__foot">
          <span className={`dot${health.status === 'ok' ? ' is-ok' : ''}`} aria-hidden="true" />
          {health.provider === 'mock' ? 'Offline demo model (no API key)' : `Model: ${health.model}`}
        </footer>
      )}
    </aside>
  );
}
