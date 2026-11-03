import { appFetch } from './http.js';
import React, { useEffect, useRef, useState } from 'react';
import './group-chat.css';

const api = async (path, options = {}) => {
  const response = await appFetch(`/api/v1${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  if (response.status === 304) return { data: [] };
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || 'Unable to load group chat.');
  return data;
};

function MessageBody({ body }) {
  const parts = String(body || '').split(/(https:\/\/[^\s]+)/g);
  return (
    <span>
      {parts.map((part, index) =>
        part.startsWith('https://') ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        ),
      )}
    </span>
  );
}

export function GroupChat({ groupId, readOnly = false, canModerate = false }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('message');
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const currentGroup = useRef(groupId);
  const etag = useRef('');
  const failureCount = useRef(0);
  const mounted = useRef(false);

  const load = async () => {
    try {
      const response = await appFetch(`/api/v1/groups/${groupId}/messages`, {
        credentials: 'include',
        headers: etag.current ? { 'If-None-Match': etag.current } : {},
      });
      if (response.status === 304) return;
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || 'Unable to load group chat.');
      if (!mounted.current || currentGroup.current !== groupId) return;
      etag.current = response.headers.get('etag') || etag.current;
      setMessages(data.data || []);
      failureCount.current = 0;
      setError('');
    } catch (reason) {
      if (!mounted.current || currentGroup.current !== groupId) return;
      failureCount.current += 1;
      setError(reason.message);
    } finally {
      if (mounted.current && currentGroup.current === groupId)
        setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    let timer;
    mounted.current = true;
    currentGroup.current = groupId;
    etag.current = '';
    failureCount.current = 0;
    setMessages([]);
    setReports([]);
    setBody('');
    setError('');
    setNotice('');
    setLoading(true);
    const schedule = (delay) => {
      timer = setTimeout(async () => {
        if (!active) return;
        if (!document.hidden) await load();
        const backoff = Math.min(32000, 4000 * 2 ** failureCount.current);
        schedule(document.hidden ? 1000 : backoff);
      }, delay);
    };
    load().then(() => {
      if (active) schedule(4000);
    });
    const onVisibility = () => {
      if (!document.hidden && active) load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // Refresh the latest page with an ETag so edits, removals and pins stay current.
  }, [groupId]);
  useEffect(() => {
    if (canModerate)
      api(`/groups/${groupId}/reports`)
        .then((data) => setReports(data.data || []))
        .catch(() => {});
  }, [canModerate, groupId]);

  const post = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      const data = await api(`/groups/${groupId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), kind }),
      });
      setMessages((current) => [
        ...new Map(
          [data, ...current].map((item) => [item.message_id, item]),
        ).values(),
      ]);
      setBody('');
      setKind('message');
      setNotice('Message posted.');
    } catch (reason) {
      setError(reason.message);
    }
  };
  const remove = async (messageId) => {
    try {
      await api(`/groups/${groupId}/messages/${messageId}`, {
        method: 'DELETE',
      });
      setMessages((current) =>
        current.map((item) =>
          item.message_id === messageId
            ? { ...item, body: 'Message removed by a leader', deleted_at: true }
            : item,
        ),
      );
    } catch (reason) {
      setError(reason.message);
    }
  };
  return (
    <section className="group-chat card" aria-labelledby={`chat-${groupId}`}>
      {/* Group-scoped heading and polling status. */}
      <div className="group-chat-heading">
        <div>
          <span className="eyebrow">GROUP CHAT</span>
          <h4 id={`chat-${groupId}`}>Messages and announcements</h4>
        </div>
        <span className="status-label">Updates every 4 seconds</span>
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {/* Messages render as text; user HTML and Markdown are never executed. */}
      <div className="group-chat-list" aria-live="polite">
        {loading && <p>Loading messages…</p>}
        {!loading && !messages.length && (
          <p className="empty-state">No messages yet.</p>
        )}
        {messages.map((message) => (
          <article
            className={message.pinned ? 'chat-message pinned' : 'chat-message'}
            key={message.message_id}
          >
            <div className="chat-message-meta">
              <strong>{message.author_name}</strong>
              <span>
                {message.kind === 'announcement' ? 'Announcement' : 'Message'}
              </span>
              {message.edited_at && <span>Edited</span>}
            </div>
            <p>
              <MessageBody body={message.body} />
            </p>
            {!readOnly && !message.deleted_at && (
              <button type="button" onClick={() => remove(message.message_id)}>
                Remove
              </button>
            )}
          </article>
        ))}
      </div>
      {!readOnly && (
        /* Members compose messages; leaders may additionally announce. */
        <form className="group-chat-composer" onSubmit={post}>
          <label htmlFor={`message-${groupId}`}>Write a message</label>
          {canModerate && (
            <label>
              <input
                type="checkbox"
                checked={kind === 'announcement'}
                onChange={(event) =>
                  setKind(event.target.checked ? 'announcement' : 'message')
                }
              />{' '}
              Post as announcement
            </label>
          )}
          <textarea
            id={`message-${groupId}`}
            maxLength="1000"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button className="primary" type="submit">
            Post {kind === 'announcement' ? 'announcement' : 'message'}
          </button>
        </form>
      )}
      {readOnly && (
        <p className="muted">
          You can read this group chat, but only members can post.
        </p>
      )}
      {canModerate && (
        /* Moderators receive actionable content without exposing reporters. */
        <aside className="chat-reports" aria-label="Open message reports">
          <h5>Open reports</h5>
          {!reports.length && <p>No open reports.</p>}
          {reports.map((report) => (
            <p key={report.report_id}>
              {report.reason}: {report.body}
            </p>
          ))}
        </aside>
      )}
    </section>
  );
}
