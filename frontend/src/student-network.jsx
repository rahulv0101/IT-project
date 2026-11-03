import { appFetch } from './http.js';
import React, { useEffect, useRef, useState } from 'react';
import './student-network.css';
const api = async (path, options = {}) => {
  const r = await appFetch(`/api/v1${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = r.status === 204 ? null : await r.json();
  if (!r.ok)
    throw Error(body?.error?.message || 'Unable to load your conversations.');
  return body;
};
function useDirectory(search, moduleId = '', enabled = true) {
  const [state, setState] = useState({ loading: true, data: [], error: '' });
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, data: [], error: '' });
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, loading: true, error: '' }));
      api(
        `/students?pageSize=20&search=${encodeURIComponent(search)}${moduleId ? `&moduleId=${moduleId}` : ''}`,
      )
        .then(
          (b) =>
            active &&
            setState({ loading: false, data: b.data || [], error: '' }),
        )
        .catch(
          (e) =>
            active && setState({ loading: false, data: [], error: e.message }),
        );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, moduleId, enabled]);
  return state;
}
export function InviteStudent({ group, onInvited }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const students = useDirectory(search, group.module_id, open);
  const send = async (event) => {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/groups/${group.group_id}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ studentId: selected }),
      });
      setMessage(
        'Invitation sent. The student can accept it under Study groups.',
      );
      setSelected('');
      onInvited?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="group-invite">
      <button
        className="secondary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close invitation' : 'Invite a student'}
      </button>
      {open && (
        <form className="invite-form" onSubmit={send}>
          <label>
            Find a student
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              maxLength={100}
            />
          </label>
          <label>
            Student
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              required
            >
              <option value="">Choose a student in this module</option>
              {students.data.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          {students.loading && <p role="status">Finding students…</p>}
          {students.error && (
            <p role="alert" className="field-error">
              {students.error}
            </p>
          )}
          {!students.loading && !students.error && !students.data.length && (
            <p className="muted">
              No other enrolled students match. Students need to enrol in this
              module before they can join its groups.
            </p>
          )}
          <button disabled={busy || !selected}>
            {busy ? 'Inviting…' : 'Send group invitation'}
          </button>
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
export function GroupInvitations({ onJoined }) {
  const [state, setState] = useState({ loading: true, data: [], error: '' });
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    let timer;
    const load = async () => {
      try {
        const b = await api('/group-invitations?pageSize=50');
        if (active) setState({ loading: false, data: b.data || [], error: '' });
      } catch (e) {
        if (active)
          setState((current) => ({
            ...current,
            loading: false,
            error: e.message,
          }));
      } finally {
        if (active) timer = setTimeout(load, 10000);
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const respond = async (invitation, accept) => {
    if (busy) return;
    setBusy(invitation.invitation_id);
    setMessage('');
    try {
      await api(`/group-invitations/${invitation.invitation_id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      });
      setMessage(
        accept
          ? `You joined ${invitation.group_name}.`
          : 'Invitation declined.',
      );
      setRefresh((v) => v + 1);
      if (accept) onJoined?.();
    } catch (e) {
      setState((current) => ({ ...current, error: e.message }));
    } finally {
      setBusy('');
    }
  };
  return (
    <section
      className="card invitations-panel"
      aria-labelledby="invitations-heading"
    >
      <h2 id="invitations-heading">Group invitations</h2>
      {state.loading ? (
        <p role="status">Loading invitations…</p>
      ) : !state.data.length ? (
        <p className="muted">No pending group invitations.</p>
      ) : (
        state.data.map((i) => (
          <article className="invitation-row" key={i.invitation_id}>
            <div>
              <strong>{i.group_name}</strong>
              <p>
                {i.inviter_name} invited you · {i.module_code}
              </p>
            </div>
            <div className="button-row">
              <button
                className="primary"
                disabled={Boolean(busy)}
                onClick={() => respond(i, true)}
              >
                Accept invitation
              </button>
              <button
                className="secondary"
                disabled={Boolean(busy)}
                onClick={() => respond(i, false)}
              >
                Decline invitation
              </button>
            </div>
          </article>
        ))
      )}
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
export function DirectMessages() {
  const [search, setSearch] = useState('');
  const directory = useDirectory(search);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const messageList = useRef(null);
  const followLatest = useRef(true);
  const cursor = useRef('');
  const selectedId = useRef('');
  const initial = useRef(true);
  useEffect(() => {
    if (followLatest.current && messageList.current)
      messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    let active = true;
    let timer;
    const load = async () => {
      try {
        const b = await api('/direct-conversations?pageSize=50');
        if (active) setConversations(b.data || []);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) timer = setTimeout(load, 5000);
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    let timer;
    cursor.current = '';
    followLatest.current = true;
    setHasOlder(false);
    initial.current = true;
    selectedId.current = selected?.conversation_id || '';
    setMessages([]);
    setBody('');
    setError('');
    if (!selected?.conversation_id) {
      setLoading(false);
      return;
    }
    const conversationId = selected.conversation_id;
    setLoading(true);
    const load = async () => {
      try {
        const b = await api(
          `/direct-conversations/${conversationId}/messages${cursor.current ? `?after=${cursor.current}` : ''}`,
        );
        if (!active) return;
        if (initial.current) {
          setHasOlder(Boolean(b.hasMore));
          initial.current = false;
        }
        setSelected((current) =>
          current?.conversation_id === conversationId
            ? { ...current, ...b.conversation }
            : current,
        );
        setMessages((current) => {
          const byId = new Map(current.map((m) => [m.message_id, m]));
          for (const m of b.data || []) byId.set(m.message_id, m);
          return [...byId.values()].sort(
            (a, b) =>
              Number(a.message_order || 0) - Number(b.message_order || 0) ||
              new Date(a.created_at) - new Date(b.created_at) ||
              a.message_id.localeCompare(b.message_id),
          );
        });
        if (b.data?.length) cursor.current = b.data.at(-1).message_id;
        setError('');
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(load, 4000);
        }
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selected?.conversation_id]);
  const start = async (student) => {
    if (starting) return;
    setStarting(student.user_id);
    setError('');
    try {
      const b = await api('/direct-conversations', {
        method: 'POST',
        body: JSON.stringify({ studentId: student.user_id }),
      });
      setSelected({
        ...b.conversation,
        peer_id: student.user_id,
        peer_name: student.full_name,
        peer_status: 'active',
      });
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting('');
    }
  };
  const send = async (event) => {
    event.preventDefault();
    if (sending || !body.trim() || !selected) return;
    setSending(true);
    setError('');
    const id = selected.conversation_id;
    const sentBody = body.trim();
    try {
      const b = await api(`/direct-conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: sentBody }),
      });
      if (selectedId.current === id) {
        followLatest.current = true;
        setMessages((current) =>
          current.some((m) => m.message_id === b.message.message_id)
            ? current
            : [...current, b.message],
        );
        setBody('');
      }
      setRefresh((v) => v + 1);
    } catch (e) {
      if (selectedId.current === id) setError(e.message);
    } finally {
      setSending(false);
    }
  };
  const older = async () => {
    if (loadingOlder || !messages.length) return;
    followLatest.current = false;
    setLoadingOlder(true);
    const id = selected.conversation_id;
    try {
      const b = await api(
        `/direct-conversations/${id}/messages?before=${messages[0].message_id}`,
      );
      if (selectedId.current !== id) return;
      setHasOlder(Boolean(b.hasMore));
      setMessages((current) => {
        const all = new Map(
          [...b.data, ...current].map((m) => [m.message_id, m]),
        );
        return [...all.values()].sort(
          (a, b) =>
            Number(a.message_order || 0) - Number(b.message_order || 0) ||
            new Date(a.created_at) - new Date(b.created_at) ||
            a.message_id.localeCompare(b.message_id),
        );
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOlder(false);
    }
  };
  return (
    <section className="messages-page" aria-label="Student direct messages">
      <div className="messages-sidebar card">
        <h2>Messages</h2>
        <p className="muted">
          Talk privately with another student. Only the two of you can open the
          conversation.
        </p>
        <h3>Your conversations</h3>
        {!conversations.length && (
          <p className="muted">Start a conversation below.</p>
        )}
        <div className="conversation-list">
          {conversations.map((c) => (
            <button
              key={c.conversation_id}
              className={
                selected?.conversation_id === c.conversation_id
                  ? 'conversation active'
                  : 'conversation'
              }
              aria-pressed={selected?.conversation_id === c.conversation_id}
              onClick={() => setSelected(c)}
            >
              <strong>{c.peer_name}</strong>
              {c.unread_count > 0 && (
                <span className="chip">{c.unread_count} unread</span>
              )}
              <small>{c.last_message || 'No messages yet'}</small>
            </button>
          ))}
        </div>
        <h3>Find a student</h3>
        <label>
          Search students
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            maxLength={100}
          />
        </label>
        {directory.loading && <p role="status">Finding students…</p>}
        {directory.error && (
          <p role="alert" className="field-error">
            {directory.error}
          </p>
        )}
        {!directory.loading && !directory.data.length && (
          <p className="muted">No other students match this search.</p>
        )}
        <ul className="student-directory">
          {directory.data.map((s) => (
            <li key={s.user_id}>
              <div>
                <strong>{s.full_name}</strong>
                <small>
                  {s.student_type === 'business' ? 'Business' : 'IT'} · Year{' '}
                  {s.student_year}
                </small>
              </div>
              <button
                className="secondary"
                disabled={Boolean(starting)}
                aria-label={`Message ${s.full_name}`}
                onClick={() => start(s)}
              >
                {starting === s.user_id ? 'Opening…' : 'Message'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <section
        className="card direct-thread"
        aria-label={
          selected
            ? `Conversation with ${selected.peer_name}`
            : 'Choose a conversation'
        }
      >
        {selected ? (
          <>
            <h2>{selected.peer_name}</h2>
            {loading && <p role="status">Loading messages…</p>}
            {hasOlder && (
              <button
                className="secondary"
                onClick={older}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            )}
            <ol
              tabIndex={0}
              aria-label="Conversation messages"
              ref={messageList}
              onScroll={() => {
                const list = messageList.current;
                if (list)
                  followLatest.current =
                    list.scrollHeight - list.scrollTop - list.clientHeight < 80;
              }}
              className="direct-message-list"
              aria-live="polite"
              aria-relevant="additions"
            >
              {messages.map((m) => (
                <li
                  key={m.message_id}
                  className={
                    m.sender_id === selected.peer_id ? 'received' : 'sent'
                  }
                >
                  <strong>
                    {m.sender_id === selected.peer_id
                      ? selected.peer_name
                      : 'You'}
                  </strong>
                  <p>{m.body}</p>
                  <time dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
            {!loading && !messages.length && (
              <p className="empty-state">
                Say hello to start the conversation.
              </p>
            )}
            {selected.peer_status !== 'active' ? (
              <p className="muted">
                This student is no longer available for new messages.
              </p>
            ) : (
              <form className="message-compose" onSubmit={send}>
                <label>
                  Message
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={1000}
                    required
                    placeholder="Write a message"
                  />
                </label>
                <small>{body.length}/1000 characters</small>
                <button
                  className="primary"
                  disabled={
                    sending || !body.trim() || navigator.onLine === false
                  }
                >
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h2>Connect with a classmate</h2>
            <p>Choose a conversation or find a student to start messaging.</p>
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </section>
  );
}

export function GroupMembers({ group, userId, onChanged }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    if (open)
      api(`/groups/${group.group_id}/members`)
        .then((b) => active && setMembers(b.data || []))
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [open, group.group_id, refresh]);
  const leader = members.find((m) => m.user_id === userId)?.role === 'leader';
  const transfer = async (event) => {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    setError('');
    try {
      await api(`/groups/${group.group_id}/leadership`, {
        method: 'POST',
        body: JSON.stringify({ studentId: selected }),
      });
      setMessage(
        'Leadership transferred. You remain a co-leader and can leave the group if needed.',
      );
      setSelected('');
      setRefresh((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="group-members">
      <button
        className="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide members' : 'View members'}
      </button>
      {open && (
        <>
          <ul>
            {members.map((m) => (
              <li key={m.user_id}>
                {m.full_name}
                {m.user_id === userId ? ' (you)' : ''}
                {m.role
                  ? ` · ${m.role === 'leader' ? 'Group leader' : 'Co-leader'}`
                  : ''}
              </li>
            ))}
          </ul>
          {leader && (
            <form onSubmit={transfer}>
              <label>
                New group leader
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  required
                >
                  <option value="">Choose another group member</option>
                  {members
                    .filter((m) => m.user_id !== userId)
                    .map((m) => (
                      <option value={m.user_id} key={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <button disabled={busy || !selected}>
                {busy ? 'Transferring…' : 'Transfer leadership'}
              </button>
            </form>
          )}
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
