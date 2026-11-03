import { appFetch } from './http.js';
import React, { useEffect, useState } from 'react';
import './study-sessions.css';

async function api(path, method = 'GET', body) {
  const r = await appFetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error?.message || 'Unable to load study sessions.');
  return data;
}
const when = (value) => new Date(value).toLocaleString();
const localInput = (value) => {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const fresh = () => ({
  title: '',
  topic: '',
  description: '',
  preparationNotes: '',
  startsAt: localInput(Date.now() + 86400000),
  endsAt: localInput(Date.now() + 90000000),
  mode: 'in_person',
  location: '',
  weeks: 1,
  resourceIds: [],
  topicRef: null,
});
export function UpcomingSessions({ groupId, onOpen }) {
  const Heading = groupId ? 'h4' : 'h2';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(
      groupId
        ? `/groups/${groupId}/sessions?pageSize=1`
        : '/me/sessions?pageSize=3',
    )
      .then((d) => setData({ ...d, data: d.data || [] }))
      .catch((e) => setError(e.message));
  }, [groupId]);
  return (
    <section className="card">
      <Heading>
        {groupId ? 'Next study session' : 'Upcoming study sessions'}
      </Heading>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p>Loading sessions…</p>
      ) : !data.data.length ? (
        <p>No upcoming study sessions yet.</p>
      ) : (
        data.data.map((s) => (
          <p key={s.session_id}>
            <button onClick={() => onOpen?.(s.group_id, s.session_id)}>
              {s.title} · {when(s.starts_at)} · {s.topic}
            </button>
            {s.status === 'cancelled' && (
              <span> Cancelled: {s.cancel_reason}</span>
            )}
          </p>
        ))
      )}
    </section>
  );
}
export function Notifications({ onOpen }) {
  const [data, setData] = useState({ data: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () =>
      api('/me/notifications')
        .then((d) => {
          if (live)
            setData({ ...d, data: d.data || [], unread: d.unread || 0 });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div>
      <button
        aria-label={`Notifications: ${data.unread} unread`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zm5 3h4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>{' '}
        Notifications ({data.unread})
      </button>
      {open && (
        <section className="card notification-panel" aria-label="Notifications">
          <h2>Notifications</h2>
          {error && <p role="alert">{error}</p>}
          {!data.data.length && <p>No notifications yet.</p>}
          {data.data.map((n) => (
            <div key={n.notification_id}>
              <p>
                {n.payload.title} · {n.kind.replaceAll('_', ' ')}
              </p>
              <button onClick={() => onOpen(n.payload.groupId, n.session_id)}>
                Open session
              </button>
              {!n.read_at && (
                <button
                  onClick={async () => {
                    try {
                      await api(
                        `/me/notifications/${n.notification_id}/read`,
                        'POST',
                        {},
                      );
                      setData(await api('/me/notifications'));
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Mark as read
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
export function SessionDirectory({ onOpen }) {
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    api(`/groups?page=${page}&pageSize=20`)
      .then((d) => {
        setData(d.data);
        setTotal(d.pagination?.total || d.total || d.data.length);
      })
      .catch((e) => setError(e.message));
  }, [page]);
  return (
    <section className="card">
      <h2>Module group calendars</h2>
      <p>Read-only: only group leaders manage sessions.</p>
      {error && <p role="alert">{error}</p>}
      {!data.length && <p>No groups to display.</p>}
      {data.map((g) => (
        <p key={g.group_id}>
          <button onClick={() => onOpen(g.group_id)}>
            {g.group_name} — open calendar
          </button>
        </p>
      ))}
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Previous page
      </button>
      <button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
        Next page
      </button>
    </section>
  );
}
export function StudySessions({ groupId, sessionId, onBack }) {
  const [data, setData] = useState({ data: [], pagination: { total: 0 } });
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(sessionId || null);
  const [view, setView] = useState('list');
  const [anchor, setAnchor] = useState(new Date());
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resources, setResources] = useState([]);
  const [topics, setTopics] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const base = `/groups/${groupId}/sessions`;
  useEffect(() => {
    let live = true;
    setError('');
    let query = `page=${page}&pageSize=20`;
    if (view !== 'list') {
      const start = new Date(anchor);
      start.setHours(0, 0, 0, 0);
      if (view === 'month') start.setDate(1);
      else start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(start);
      if (view === 'month') end.setMonth(end.getMonth() + 1);
      else end.setDate(end.getDate() + 7);
      query = `page=${page}&pageSize=100&from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
    }
    api(`${base}?${query}`)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [base, page, revision, view, anchor]);
  useEffect(() => {
    api(`${base}/preparation-options`)
      .then((d) => {
        setCanManage(Boolean(d.canManage));
        setResources(d.resources);
        setTopics(d.topics || []);
      })
      .catch(() => {});
  }, [base]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    api(`${base}/${selected}`)
      .then((d) => {
        setDetail(d);
        setCanManage(d.canManage);
      })
      .catch((e) => setError(e.message));
  }, [base, selected, revision]);
  const act = async (path, method, body) => {
    setError('');
    try {
      const result = await api(path, method, body);
      setMessage(
        result.warnings?.length
          ? 'Saved. Warning: this session overlaps another study session.'
          : 'Saved.',
      );
      setRevision((n) => n + 1);
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };
  const openForm = async (s) => {
    setEditing(s?.session_id || null);
    setForm(
      s
        ? {
            title: s.title,
            topic: s.topic,
            description: s.description,
            preparationNotes: s.preparation_notes,
            startsAt: localInput(s.starts_at),
            endsAt: localInput(s.ends_at),
            mode: s.mode,
            location: s.location,
            weeks: 1,
            topicRef: s.topic_ref,
            resourceIds: detail.resources.map((r) => r.resource_id),
          }
        : fresh(),
    );
    try {
      const d = await api(`${base}/preparation-options`);
      setResources(d.resources);
      setCanManage(d.canManage);
    } catch (e) {
      setError(e.message);
    }
  };
  const cells = [];
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (view === 'month') start.setDate(1);
  else start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days =
    view === 'week'
      ? 7
      : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return (
    <section className="card sessions">
      {/* List, month, and week controls share the same session records. */}
      <button onClick={onBack}>Back to study groups</button>
      <h2>Study sessions</h2>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="button-row">
        {['list', 'month', 'week'].map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
              setPage(1);
            }}
          >
            {v[0].toUpperCase() + v.slice(1)} view
          </button>
        ))}
        <a href={`/api/v1${base}/calendar.ics`} download>
          Download group calendar
        </a>
        {canManage && (
          <button onClick={() => openForm(null)}>Plan a session</button>
        )}
      </div>
      {form && (
        /* Leader-only form; recurrence produces individually editable sessions. */
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const startTime = Date.parse(form.startsAt);
            const endTime = Date.parse(form.endsAt);
            if (!Number.isFinite(startTime) || startTime <= Date.now()) {
              setError('Choose a future start time.');
              return;
            }
            if (
              !Number.isFinite(endTime) ||
              endTime <= startTime ||
              endTime - startTime > 8 * 3600000
            ) {
              setError(
                'Sessions must last more than zero and at most eight hours.',
              );
              return;
            }
            const result = await act(
              editing ? `${base}/${editing}` : base,
              editing ? 'PATCH' : 'POST',
              {
                ...form,
                location: form.mode === 'online' ? '' : form.location,
                startsAt: new Date(form.startsAt).toISOString(),
                endsAt: new Date(form.endsAt).toISOString(),
              },
            );
            if (result) setForm(null);
          }}
        >
          <h3>{editing ? 'Edit session' : 'Plan a session'}</h3>
          {!canManage && (
            <p>Only group leaders and co-leaders can save sessions.</p>
          )}
          {[
            ['title', 'Title'],
            ['topic', 'Topic'],
            ['description', 'Description'],
            ['preparationNotes', 'Preparation notes'],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={form[key]}
                required={['title', 'topic', 'location'].includes(key)}
                maxLength={
                  key === 'title'
                    ? 120
                    : key === 'topic'
                      ? 200
                      : key === 'location'
                        ? 500
                        : 2000
                }
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          {form.mode === 'in_person' && (
            <label>
              Room
              <input
                value={form.location}
                required
                maxLength={500}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
          )}
          <label>
            Module topic (optional)
            <select
              value={form.topicRef || ''}
              onChange={(e) =>
                setForm({ ...form, topicRef: e.target.value || null })
              }
            >
              <option value="">No linked topic</option>
              {topics.map((t) => (
                <option key={t.topic_id} value={t.topic_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Starts at
            <input
              type="datetime-local"
              required
              min={localInput(Math.ceil((Date.now() + 1) / 60000) * 60000)}
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>
          <label>
            Ends at
            <input
              type="datetime-local"
              required
              min={
                form.startsAt
                  ? localInput(Date.parse(form.startsAt) + 60000)
                  : localInput(Date.now() + 60000)
              }
              max={
                form.startsAt
                  ? localInput(Date.parse(form.startsAt) + 8 * 3600000)
                  : undefined
              }
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </label>
          <label>
            Mode
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            >
              <option value="in_person">In person</option>
              <option value="online">Online</option>
            </select>
          </label>
          {!editing && (
            <label>
              Weekly occurrences (1–12)
              <input
                type="number"
                min="1"
                max="12"
                value={form.weeks}
                onChange={(e) =>
                  setForm({ ...form, weeks: Number(e.target.value) })
                }
              />
            </label>
          )}
          <fieldset>
            <legend>Preparation resources</legend>
            {resources.map((r) => (
              <label key={r.resource_id}>
                <input
                  type="checkbox"
                  checked={form.resourceIds.includes(r.resource_id)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      resourceIds: e.target.checked
                        ? [...form.resourceIds, r.resource_id]
                        : form.resourceIds.filter((id) => id !== r.resource_id),
                    })
                  }
                />
                {r.title}
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={!canManage}>
            Save session
          </button>
          <button type="button" onClick={() => setForm(null)}>
            Close form
          </button>
        </form>
      )}
      {view === 'list' ? (
        <>
          <ul>
            {data.data.map((s) => (
              <li key={s.session_id}>
                <button onClick={() => setSelected(s.session_id)}>
                  {s.title} · {when(s.starts_at)} · {s.topic}
                </button>
                {s.status === 'cancelled' && (
                  <p>Cancelled: {s.cancel_reason}</p>
                )}
              </li>
            ))}
          </ul>
          {!data.data.length && <p>No upcoming study sessions yet.</p>}
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous page
          </button>
          <span> Page {page} </span>
          <button
            disabled={page * 20 >= data.pagination.total}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </button>
        </>
      ) : (
        <>
          <div className="button-row">
            <button
              onClick={() => {
                const d = new Date(anchor);
                if (view === 'month') d.setMonth(d.getMonth() - 1);
                else d.setDate(d.getDate() - 7);
                setAnchor(d);
              }}
            >
              Previous period
            </button>
            <h3>
              {anchor.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </h3>
            <button
              onClick={() => {
                const d = new Date(anchor);
                if (view === 'month') d.setMonth(d.getMonth() + 1);
                else d.setDate(d.getDate() + 7);
                setAnchor(d);
              }}
            >
              Next period
            </button>
          </div>
          <div className="session-calendar" aria-label={`${view} calendar`}>
            {view === 'month' &&
              Array.from({ length: (start.getDay() + 6) % 7 }, (_, i) => (
                <div
                  key={`blank-${i}`}
                  className="calendar-blank"
                  aria-hidden="true"
                />
              ))}
            {cells.map((day) => (
              <section key={day.toISOString()} aria-label={day.toDateString()}>
                <h4>
                  {day.toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                  })}
                </h4>
                {data.data
                  .filter(
                    (s) =>
                      new Date(s.starts_at).toDateString() ===
                      day.toDateString(),
                  )
                  .map((s) => (
                    <button
                      key={s.session_id}
                      onClick={() => setSelected(s.session_id)}
                    >
                      {s.title} · {new Date(s.starts_at).toLocaleTimeString()}{' '}
                      {s.status === 'cancelled' ? 'Cancelled' : ''}
                    </button>
                  ))}
              </section>
            ))}
          </div>
          {data.pagination.total > 100 && (
            <div>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous calendar page
              </button>
              <span>Page {page}</span>
              <button
                disabled={page * 100 >= data.pagination.total}
                onClick={() => setPage(page + 1)}
              >
                Next calendar page
              </button>
            </div>
          )}
        </>
      )}
      {detail && (
        <section className="card" aria-label="Session details">
          <h3>{detail.session.title}</h3>
          <p>
            {detail.session.status === 'cancelled'
              ? `Cancelled: ${detail.session.cancel_reason}`
              : 'Scheduled'}
          </p>
          <p>
            {when(detail.session.starts_at)} – {when(detail.session.ends_at)}
          </p>
          <p>Topic: {detail.session.topic}</p>
          <p>{detail.session.description}</p>
          <p>
            Preparation:{' '}
            {detail.session.preparation_notes || 'No preparation requested.'}
          </p>
          <p>Leader: {detail.leaders.map((l) => l.full_name).join(', ')}</p>
          <p>
            {detail.session.mode === 'online'
              ? 'Online session'
              : `Room: ${detail.session.location}`}
          </p>
          {detail.resources.map((r) => (
            <p key={r.resource_id}>
              <a href={`/api/v1${base}/${selected}/resources/${r.resource_id}`}>
                {r.title}
              </a>
            </p>
          ))}
          <a href={`/api/v1${base}/${selected}/calendar.ics`} download>
            Download session calendar
          </a>
          <p>
            {detail.counts
              .map((c) => `${c.response.replace('_', ' ')}: ${c.count}`)
              .join(' · ') || 'No RSVPs yet.'}
          </p>
          {detail.names?.map((n, i) => (
            <p key={i}>
              {n.full_name}: {n.response}
            </p>
          ))}
          {!!detail.warnings.length && (
            <p className="warning">
              Warning: this session overlaps another session.
            </p>
          )}
          {detail.canRsvp && detail.session.status === 'scheduled' && (
            <fieldset>
              <legend>Your RSVP</legend>
              {['going', 'maybe', 'not_going'].map((response) => (
                <button
                  key={response}
                  aria-pressed={detail.response === response}
                  onClick={() =>
                    act(`${base}/${selected}/rsvp`, 'PUT', { response })
                  }
                >
                  {response === 'not_going'
                    ? 'Not going'
                    : response === 'going'
                      ? 'Going'
                      : 'Maybe'}
                </button>
              ))}
            </fieldset>
          )}
          {detail.canManage && (
            <div>
              <button
                onClick={() =>
                  act(`/groups/${groupId}/updates`, 'POST', {
                    kind: 'next_up',
                    text: detail.session.title,
                    plannedFor: detail.session.starts_at,
                    sessionId: selected,
                  })
                }
              >
                Link in Next up
              </button>
              <button onClick={() => openForm(detail.session)}>
                Edit session
              </button>
              <button
                onClick={async () => {
                  const result = await act(
                    `${base}/${selected}/duplicate`,
                    'POST',
                    {
                      startsAt: new Date(
                        Date.parse(detail.session.starts_at) + 604800000,
                      ).toISOString(),
                      endsAt: new Date(
                        Date.parse(detail.session.ends_at) + 604800000,
                      ).toISOString(),
                    },
                  );
                  if (result) setSelected(result.sessions[0].session_id);
                }}
              >
                Duplicate next week
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(`${base}/${selected}/cancel`, 'POST', {
                    reason: new FormData(e.currentTarget).get('reason'),
                  });
                }}
              >
                <label>
                  Cancellation reason
                  <input name="reason" required maxLength="500" />
                </label>
                <button>Cancel session</button>
              </form>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
