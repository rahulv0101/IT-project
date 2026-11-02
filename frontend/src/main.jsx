import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { evaluateSpreadsheet } from './spreadsheet.js';
import {
  StudySessions,
  UpcomingSessions,
  Notifications,
  SessionDirectory,
} from './study-sessions.jsx';
import { GroupChat } from './group-chat.jsx';

const api = async (path, options = {}) => {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const failure = new Error(body?.error?.message || 'Something went wrong.');
    failure.details = body?.error?.details || [];
    throw failure;
  }
  return body;
};

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    studentType: 'it',
    studentYear: 1,
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [verification, setVerification] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setError('');
  };
  const passwordRules = [
    ['length', 'At least 10 characters', form.password.length >= 10],
    ['uppercase', 'At least one uppercase letter', /[A-Z]/.test(form.password)],
    ['lowercase', 'At least one lowercase letter', /[a-z]/.test(form.password)],
    ['number', 'At least one number', /[0-9]/.test(form.password)],
    ['special', 'At least one special character', /[^A-Za-z0-9]/.test(form.password)],
  ];
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    if (mode === 'register' && form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    try {
      const body = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'login'
            ? { email: form.email, password: form.password }
            : form,
        ),
      });
      if (mode === 'register') {
        setVerification({ user: body.user, email: form.email });
      } else {
        onLogin(body.user);
      }
    } catch (reason) {
      const mapped = {};
      for (const detail of reason.details || []) mapped[detail.field] = detail.message;
      setFieldErrors(mapped);
      setError(Object.keys(mapped).length ? '' : reason.message);
    }
  };
  const verify = async (event) => {
    event.preventDefault();
    setVerifying(true);
    setVerificationError('');
    try {
      await api('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verificationCode }),
      });
      onLogin({ ...verification.user, email_verified_at: new Date().toISOString(), needs_email_verification: false });
    } catch (reason) {
      setVerificationError(reason.message);
    } finally {
      setVerifying(false);
    }
  };
  const resend = async () => {
    setResending(true);
    setVerificationError('');
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setVerificationError('A new verification code was sent.');
    } catch (reason) {
      setVerificationError(reason.message);
    } finally {
      setResending(false);
    }
  };
  if (verification) {
    return (
      <main className="auth-page">
        <section className="card auth-card" aria-labelledby="verify-heading">
          <span className="eyebrow">EDUQUEST</span>
          <h1 id="verify-heading">Check your email</h1>
          <p className="auth-description">
            We sent a 6-digit verification code to <strong>{verification.email}</strong>.
          </p>
          <form onSubmit={verify}>
            <label>
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength="6"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </label>
            <p className="muted">The code expires in 10 minutes and can only be used once.</p>
            {verificationError && <p className="form-error" role="alert">{verificationError}</p>}
            <button className="primary" type="submit" disabled={verifying || verificationCode.length !== 6}>
              {verifying ? 'Verifying…' : 'Verify email'}
            </button>
            <button className="link-button" type="button" onClick={resend} disabled={resending}>
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </form>
        </section>
      </main>
    );
  }
  const fieldMessage = (name) => fieldErrors[name] && <small className="field-error" role="alert">{fieldErrors[name]}</small>;
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-label="Welcome to EduQuest">
        <span className="intro-label">
          A LITTLE CURIOSITY. A LOT OF POSSIBILITY.
        </span>
        <h2>
          Your next
          <br />
          lightbulb moment
          <br />
          <em>starts here.</em>
        </h2>
        <p>
          Bring your notes, your questions, and your ambition. Make room for a
          better way to learn.
        </p>
        <div className="intro-tags">
          <span>Learn together</span>
          <span>Build confidence</span>
        </div>
        <div className="intro-orbit" aria-hidden="true">
          <span>EQ</span>
        </div>
      </section>
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">EDUQUEST</span>
        <h1>
          {mode === 'login' ? 'Welcome back' : 'Create your student account'}
        </h1>
        <p className="auth-description">
          {mode === 'login'
            ? 'Your learning journey, all in one place.'
            : 'A fresh start for your next big idea.'}
        </p>
        {mode === 'register' && (
          <label>
            First name
            <input
              value={form.firstName}
              onChange={(event) => setField('firstName', event.target.value)}
              aria-invalid={Boolean(fieldErrors.firstName)}
              required
            />
            {fieldMessage('firstName')}
          </label>
        )}
        {mode === 'register' && (
          <label>
            Last name
            <input
              value={form.lastName}
              onChange={(event) => setField('lastName', event.target.value)}
              aria-invalid={Boolean(fieldErrors.lastName)}
              required
            />
            {fieldMessage('lastName')}
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setField('email', event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            required
          />
          {fieldMessage('email')}
        </label>
        <label>
          Password
          <span className="password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(event) => setField('password', event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              required
              minLength="10"
            />
            <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
          {mode === 'register' && (
            <ul className="password-rules" aria-label="Password requirements">
              {passwordRules.map(([, label, met]) => <li key={label} className={met ? 'met' : 'unmet'}>{met ? '✓' : '○'} {label}</li>)}
            </ul>
          )}
          {fieldMessage('password')}
        </label>
        {mode === 'register' && (
          <>
            <label>
              Confirm password
              <span className="password-input-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(event) => setField('confirmPassword', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  required
                />
                <button className="password-toggle" type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </span>
              {fieldMessage('confirmPassword')}
            </label>
            <label>
              Student type
              <select
                value={form.studentType}
                onChange={(event) =>
                  setForm({ ...form, studentType: event.target.value })
                }
              >
                <option value="it">IT</option>
                <option value="business">Business</option>
              </select>
            </label>
            <label>
              Year of study
              <select
                value={form.studentYear}
                onChange={(event) =>
                  setForm({ ...form, studentYear: Number(event.target.value) })
                }
              >
                <option value={1}>Year 1</option>
                <option value={2}>Year 2</option>
                <option value={3}>Year 3</option>
              </select>
            </label>
            <p className="muted">Registration creates a student account.</p>
          </>
        )}
        <button className="primary" type="submit">
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>
        <button
          className="link-button"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'Create an account' : 'I already have an account'}
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </main>
  );
}

export function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('Dashboard');
  const [quizId, setQuizId] = useState(null);
  const [gameQuizId, setGameQuizId] = useState(null);
  const [studySession, setStudySession] = useState(null);
  const openStudySession = (groupId, sessionId) => {
    setStudySession({ groupId, sessionId });
    setScreen('Study sessions');
  };
  useEffect(() => {
    api('/auth/me')
      .then((body) => setUser(body.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return <main className="center-state">Loading your workspace…</main>;
  if (!user) return <Auth onLogin={setUser} />;
  const studentScreens = [
    'Dashboard',
    'Modules',
    'Resources',
    'Study groups',
    'Leaderboard',
    'Quizzes',
    'Games',
    'Practice Labs',
    'Profile',
  ];
  const lecturerScreens = [
    'Study calendar',
    'Modules',
    'Resources',
    'Quizzes',
    'Games',
    'Practice Labs',
    'Analytics',
    'Profile',
  ];
  const screens = user.role === 'student' ? studentScreens : lecturerScreens;
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };
  return (
    <div className="shell">
      <aside>
        <div className="brand">EduQuest</div>
        <p className="sidebar-user">
          {user.full_name || user.fullName}
          <br />
          <small>{user.role}</small>
        </p>
        {screens.map((item) => (
          <button
            className={`nav ${screen === item ? 'active' : ''}`}
            key={item}
            aria-label={item}
            aria-current={screen === item ? 'page' : undefined}
            onClick={() => setScreen(item)}
          >
            {item}
          </button>
        ))}
        <button className="nav logout" onClick={logout}>
          Log out
        </button>
      </aside>
      <main>
        <header>
          <Notifications onOpen={openStudySession} />
          <div>
            <span className="eyebrow">
              {user.role === 'student' ? 'LEARNING HUB' : 'LECTURER HUB'}
            </span>
            <h1>{screen}</h1>
            <p className="page-description">
              {screen === 'Dashboard'
                ? 'A little progress, every day.'
                : screen === 'Resources'
                  ? 'Good ideas start with great material.'
                  : screen === 'Quizzes'
                    ? 'Turn what you know into what you can do.'
                    : screen === 'Analytics'
                      ? 'Understand progress. Plan what comes next.'
                      : screen === 'Games'
                        ? 'Choose a practice game and a quiz to play.'
                        : screen === 'Leaderboard'
                          ? 'Celebrate the work behind every achievement.'
                          : 'Everything you need, thoughtfully organised.'}
            </p>
          </div>
          <span className="avatar">
            {(user.full_name || user.fullName || 'EQ')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <button
            className="link-button profile-header-link"
            onClick={() => setScreen('Profile')}
          >
            Edit profile
          </button>
        </header>
        {screen === 'Dashboard' && (
          <>
            <UpcomingSessions onOpen={openStudySession} />
            <Dashboard user={user} />
          </>
        )}
        {screen === 'Study sessions' && studySession && (
          <StudySessions
            {...studySession}
            onBack={() =>
              setScreen(
                user.role === 'lecturer' ? 'Study calendar' : 'Study groups',
              )
            }
          />
        )}
        {screen === 'Modules' && <Modules user={user} />}
        {screen === 'Resources' && <Resources user={user} />}
        {screen === 'Study groups' && (
          <Groups user={user} onSession={openStudySession} />
        )}
        {screen === 'Study calendar' && user.role === 'lecturer' && (
          <SessionDirectory onOpen={openStudySession} />
        )}
        {screen === 'Leaderboard' && <Leaderboard user={user} />}
        {screen === 'Analytics' && <Analytics user={user} />}
        {screen === 'Profile' && (
          <ProfilePage user={user} onUserChange={setUser} />
        )}
        {screen === 'Games' && (
          <GamesPage
            user={user}
            onStartGame={(key, id) => {
              setGameQuizId(id);
              const screensByKey = {
                infected: 'Infected',
                island_escape: 'Island Escape',
                memory_match: 'Memory Match',
                boss_battle: 'Boss Battle',
                pixel_racer: 'Pixel Car Racer',
                timer_trivia: 'Timer Trivia',
              };
              setScreen(screensByKey[key] || 'Games');
            }}
          />
        )}
        {screen === 'Practice Labs' && <PracticeLabs user={user} />}
        {screen === 'Quizzes' && (
          <Quizzes
            user={user}
            onTake={(id) => {
              setQuizId(id);
              setScreen('Quiz');
            }}
            onPlayInfected={(id) => {
              setGameQuizId(id);
              setScreen('Infected');
            }}
            onPlayIslandEscape={(id) => {
              setGameQuizId(id);
              setScreen('Island Escape');
            }}
            onPlayMemoryMatch={(id) => {
              setGameQuizId(id);
              setScreen('Memory Match');
            }}
            onPlayBossBattle={(id) => {
              setGameQuizId(id);
              setScreen('Boss Battle');
            }}
            onPlayPixelRacer={(id) => {
              setGameQuizId(id);
              setScreen('Pixel Car Racer');
            }}
            onPlayTimerTrivia={(id) => {
              setGameQuizId(id);
              setScreen('Timer Trivia');
            }}
          />
        )}
        {screen === 'Quiz' && <QuizTaking quizId={quizId} />}
        {screen === 'Infected' && (
          <InfectedGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Island Escape' && (
          <IslandEscapeGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Memory Match' && (
          <MemoryMatchGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Boss Battle' && (
          <BossBattleGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Pixel Car Racer' && (
          <PixelRacerGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
        {screen === 'Timer Trivia' && (
          <TimerTriviaGame
            quizId={gameQuizId}
            onBack={() => setScreen('Quizzes')}
          />
        )}
      </main>
    </div>
  );
}

function useData(path) {
  const [state, setState] = useState({ loading: true, error: '', data: [] });
  useEffect(() => {
    if (!path) {
      setState({ loading: false, error: '', data: [] });
      return undefined;
    }
    let live = true;
    api(path)
      .then(
        (body) =>
          live &&
          setState({
            loading: false,
            error: '',
            ...body,
            data: body.data || body.weakTopics || [],
          }),
      )
      .catch(
        (reason) =>
          live && setState({ loading: false, error: reason.message, data: [] }),
      );
    return () => {
      live = false;
    };
  }, [path]);
  return state;
}
function State({ state, empty = 'Nothing here yet.' }) {
  if (state.loading) return <p className="muted">Loading…</p>;
  if (state.error) return <p className="field-error">{state.error}</p>;
  if (!state.data.length) return <p className="empty-state">{empty}</p>;
  return null;
}

const labSrcDoc = (
  html,
  css,
  js,
  checks = [],
) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"><style>${css}</style></head><body>${html}<script>
(() => {
  const send = (message) => parent.postMessage(message, '*');
  const safe = (value) => { try { return String(value); } catch (_) { return '[unprintable]'; } };
  const originalLog = console.log, originalError = console.error;
  console.log = (...args) => { send({ type: 'console', level: 'log', text: args.map(safe).join(' ') }); originalLog(...args); };
  console.error = (...args) => { send({ type: 'console', level: 'error', text: args.map(safe).join(' ') }); originalError(...args); };
  const checks = ${JSON.stringify(checks)};
  const runChecks = () => checks.map((check) => { try {
    const node = check.selector ? document.querySelector(check.selector) : null;
    if (check.type === 'element_exists') return { passed: Boolean(node) };
    if (check.type === 'text_contains') return { passed: Boolean(node && node.textContent.includes(check.text)) };
    if (check.type === 'attribute_equals') return { passed: Boolean(node && node.getAttribute(check.attribute) === String(check.expected)) };
    if (check.type === 'computed_style_equals') return { passed: Boolean(node && getComputedStyle(node)[check.property] === String(check.expected)) };
    if (check.type === 'element_count') return { passed: document.querySelectorAll(check.selector).length === Number(check.expected) };
    if (check.type === 'function_returns') { const fn = window[check.functionName]; return { passed: typeof fn === 'function' && fn(...(check.args || [])) === check.expected }; }
    return { passed: false };
  } catch (_) { return { passed: false }; } });
  window.addEventListener('message', (event) => { if (event.source !== parent || event.data?.type !== 'run-checks') return; send({ type: 'checks', results: runChecks() }); });
  const beat = () => send({ type: 'heartbeat' }); setInterval(beat, 500); beat();
  try { ${js} } catch (error) { console.error(error?.message || 'Your script could not run.'); }
})();</script></body></html>`;

export function CodeLabPlayer({ lab, onBack }) {
  const [tab, setTab] = useState('html');
  const [code, setCode] = useState({
    html: lab.config?.starterHtml || '',
    css: lab.config?.starterCss || '',
    js: lab.config?.starterJs || '',
  });
  const [frameKey, setFrameKey] = useState(0);
  const [ran, setRan] = useState(false);
  const [logs, setLogs] = useState([]);
  const [checks, setChecks] = useState([]);
  const [slow, setSlow] = useState(false);
  const [message, setMessage] = useState('');
  const frameRef = useRef(null);
  const lastBeat = useRef(Date.now());
  const original = {
    html: lab.config?.starterHtml || '',
    css: lab.config?.starterCss || '',
    js: lab.config?.starterJs || '',
  };
  useEffect(() => {
    const listener = (event) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow)
        return;
      if (event.data?.type === 'heartbeat') lastBeat.current = Date.now();
      if (event.data?.type === 'console')
        setLogs((items) => [...items.slice(-19), event.data]);
      if (event.data?.type === 'checks') setChecks(event.data.results);
    };
    window.addEventListener('message', listener);
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastBeat.current > 3000) {
        setSlow(true);
        setFrameKey((value) => value + 1);
        lastBeat.current = Date.now();
      }
    }, 500);
    return () => {
      window.removeEventListener('message', listener);
      window.clearInterval(watchdog);
    };
  }, []);
  const run = () => {
    setSlow(false);
    setRan(true);
    setLogs([]);
    setChecks([]);
    setFrameKey((value) => value + 1);
  };
  useEffect(() => {
    if (!ran) return;
    const timer = window.setTimeout(
      () =>
        frameRef.current?.contentWindow?.postMessage(
          { type: 'run-checks' },
          '*',
        ),
      100,
    );
    return () => window.clearTimeout(timer);
  }, [ran, frameKey]);
  const save = async () => {
    try {
      const result = await api(`/labs/${lab.lab_id}/attempt`, {
        method: 'PUT',
        body: JSON.stringify({
          submission: code,
          checksPassed: checks.filter((item) => item.passed).length,
          checksTotal: checks.length,
          completed: checks.length > 0 && checks.every((item) => item.passed),
        }),
      });
      setMessage(
        result.attempt?.completed
          ? 'Completed — your self-checked progress is saved.'
          : 'Draft saved. Checks run in your browser.',
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  const update = (value) =>
    setCode((current) => ({ ...current, [tab]: value.slice(0, 20000) }));
  return (
    <section className="practice-lab-page">
      <button className="link-button" onClick={onBack}>
        ← Back to Practice Labs
      </button>
      <div className="lab-heading">
        <div>
          <span className="eyebrow">
            CODE LAB · DIFFICULTY {lab.difficulty}
          </span>
          <h2>{lab.title}</h2>
          <p>{lab.instructions}</p>
        </div>
        <div className="lab-actions">
          <button className="secondary" onClick={() => setCode(original)}>
            Reset
          </button>
          <button
            className="secondary"
            onClick={() =>
              setMessage(
                'Try changing one small thing, then run your check again.',
              )
            }
          >
            Show hint
          </button>
          <button className="primary" onClick={save}>
            Save draft
          </button>
        </div>
      </div>
      {message && (
        <p className="success-message" aria-live="polite">
          {message}
        </p>
      )}
      {slow && (
        <p className="field-error" role="alert">
          Your code ran too long and was stopped.
        </p>
      )}
      <div className="lab-workbench">
        <article className="card code-editor">
          <div className="lab-tabs" role="tablist">
            {['html', 'css', 'js'].map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={tab === item}
                className={tab === item ? 'active' : ''}
                onClick={() => setTab(item)}
              >
                {item === 'js' ? 'JavaScript' : item.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="editor-wrap">
            <div className="line-numbers" aria-hidden="true">
              {code[tab].split('\n').map((_, index) => (
                <span key={index}>{index + 1}</span>
              ))}
            </div>
            <textarea
              aria-label={`${tab} code`}
              value={code[tab]}
              onChange={(event) => update(event.target.value)}
              spellCheck="false"
            />
          </div>
          <button className="primary" onClick={run}>
            Run
          </button>
        </article>
        <article className="card lab-preview">
          <h2>Live preview</h2>
          <iframe
            key={frameKey}
            ref={frameRef}
            title="Code preview"
            sandbox="allow-scripts"
            srcDoc={labSrcDoc(
              code.html,
              code.css,
              code.js,
              lab.config?.checks || [],
            )}
          />
          <h2>Console</h2>
          <div className="lab-console" aria-live="polite">
            {logs.length ? (
              logs.map((log, index) => (
                <p key={index} className={log.level}>
                  {log.text}
                </p>
              ))
            ) : (
              <p className="muted">Run your code to see messages.</p>
            )}
          </div>
        </article>
      </div>
      <article className="card lab-checks">
        <h2>Progress</h2>
        <p>
          {checks.filter((item) => item.passed).length} of{' '}
          {checks.length || lab.config?.checks?.length || 0} checks passed{' '}
          <span className="self-checked">Self-checked in your browser</span>
        </p>
        {checks.map((check, index) => (
          <div className="check-row" key={index}>
            <span aria-hidden="true">{check.passed ? '✓' : '○'}</span> Check{' '}
            {index + 1}: {check.passed ? 'passed' : 'not yet'}
          </div>
        ))}
      </article>
    </section>
  );
}

export function SpreadsheetLabPlayer({ lab, onBack }) {
  const initial = lab.config?.startingGrid || {};
  const [grid, setGrid] = useState(initial);
  const [active, setActive] = useState('A1');
  const [message, setMessage] = useState('');
  const [checkResults, setCheckResults] = useState([]);
  const columns = Array.from({ length: 26 }, (_, index) =>
    String.fromCharCode(65 + index),
  );
  const rows = Array.from({ length: 50 }, (_, index) => index + 1);
  const update = (cell, value) =>
    setGrid((current) => ({ ...current, [cell]: value.slice(0, 500) }));
  const save = async () => {
    try {
      const saved = await api(`/labs/${lab.lab_id}/attempt`, {
        method: 'PUT',
        body: JSON.stringify({
          submission: { grid },
          checksPassed: 0,
          checksTotal: lab.config?.checks?.length || 0,
          completed: false,
        }),
      });
      setCheckResults(saved.checkResults || []);
      setMessage(
        'Draft saved. Spreadsheet checks are self-checked in your browser.',
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  useEffect(() => {
    api(`/labs/${lab.lab_id}/attempt`)
      .then((body) => {
        const savedGrid = body.attempt?.submission?.grid;
        if (savedGrid) setGrid(savedGrid);
        setCheckResults(body.checkResults || []);
      })
      .catch(() => {});
  }, [lab.lab_id]);
  const result = evaluateSpreadsheet(grid, active);
  const activeFormula = grid[active] ?? '';
  const moveFocus = (column, row, key) => {
    const columnIndex = columns.indexOf(column);
    const rowIndex = rows.indexOf(row);
    const nextColumn =
      key === 'ArrowLeft'
        ? columnIndex - 1
        : key === 'ArrowRight'
          ? columnIndex + 1
          : columnIndex;
    const nextRow =
      key === 'ArrowUp'
        ? rowIndex - 1
        : key === 'ArrowDown'
          ? rowIndex + 1
          : rowIndex;
    if (
      nextColumn >= 0 &&
      nextColumn < columns.length &&
      nextRow >= 0 &&
      nextRow < rows.length
    ) {
      document
        .querySelector(`[aria-label="${columns[nextColumn]}${rows[nextRow]}"]`)
        ?.focus();
    }
  };
  return (
    <section className="practice-lab-page">
      <button className="link-button" onClick={onBack}>
        ← Back to Practice Labs
      </button>
      <div className="lab-heading">
        <div>
          <span className="eyebrow">
            SPREADSHEET LAB · LEVEL {lab.difficulty}
          </span>
          <h2>{lab.title}</h2>
          <p>{lab.instructions}</p>
        </div>
        <button className="primary" onClick={save}>
          Save draft
        </button>
      </div>
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <article className="card spreadsheet-card">
        <label className="formula-bar">
          Formula bar
          <input aria-label="Formula bar" value={activeFormula} readOnly />
        </label>
        <p>
          Active cell: <strong>{active}</strong> · Computed value:{' '}
          <strong>{String(result.value)}</strong>
          {result.error && (
            <span className="field-error"> · {result.error}</span>
          )}
        </p>
        <div className="spreadsheet-wrap">
          <table className="spreadsheet-grid">
            <thead>
              <tr>
                <th aria-label="corner">
                  <span className="sr-only">Cell corner</span>
                </th>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row}>
                  <th scope="row">{row}</th>
                  {columns.map((column) => {
                    const cell = `${column}${row}`;
                    const locked = (lab.config?.lockedCells || []).includes(
                      cell,
                    );
                    return (
                      <td key={cell}>
                        <input
                          aria-label={cell}
                          disabled={locked}
                          value={grid[cell] ?? ''}
                          onFocus={() => setActive(cell)}
                          onChange={(event) => update(cell, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key.startsWith('Arrow')) {
                              event.preventDefault();
                              moveFocus(column, row, event.key);
                            } else if (
                              event.key === 'Enter' ||
                              event.key === 'Tab'
                            ) {
                              event.preventDefault();
                              const nextRow =
                                event.key === 'Enter'
                                  ? Math.min(row + 1, rows.length)
                                  : row;
                              const nextColumn =
                                event.key === 'Enter'
                                  ? column
                                  : columns[
                                      Math.min(
                                        columns.indexOf(column) + 1,
                                        columns.length - 1,
                                      )
                                    ];
                              const next = `${nextColumn}${nextRow}`;
                              document
                                .querySelector(`[aria-label="${next}"]`)
                                ?.focus();
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Errors are shown as text: #CIRC! circular reference, #DIV/0! division
          by zero, #NAME? unknown function, #REF! invalid reference.
        </p>
        <p>
          <span className="self-checked">Self-checked in your browser</span> ·{' '}
          {lab.config?.checks?.length || 0} checks configured
        </p>
        <section aria-labelledby="check-results-heading" className="lab-checks">
          <h3 id="check-results-heading">Check results</h3>
          {lab.config?.checks?.length ? (
            lab.config.checks.map((check, index) => (
              <p key={`${check.cell}-${index}`}>
                <strong>
                  {checkResults[index]?.passed ? 'Passed' : 'Not yet'}
                </strong>{' '}
                — {checkResults[index]?.hint || check.hint}
              </p>
            ))
          ) : (
            <p>No checks configured.</p>
          )}
        </section>
      </article>
    </section>
  );
}

export function CalculatorLabPlayer({ lab, onBack }) {
  const inputs = Object.fromEntries(
    (lab.config?.inputs || []).map((input) => [input.key, input.defaultValue]),
  );
  const [values, setValues] = useState(inputs);
  const outputs = (lab.config?.outputs || []).map((output) => {
    const expression = String(output.formula).replace(
      /\{([a-z][a-z0-9_]*)\}/gi,
      (_match, key) => String(values[key] ?? 0),
    );
    const evaluated = evaluateSpreadsheet(
      { A1: expression.startsWith('=') ? expression : `=${expression}` },
      'A1',
    );
    return { ...output, value: evaluated.error || evaluated.value };
  });
  return (
    <section className="practice-lab-page">
      <button className="link-button" onClick={onBack}>
        ← Back to Practice Labs
      </button>
      <article className="card calculator-card">
        <span className="eyebrow">BUSINESS CALCULATOR</span>
        <h2>{lab.title}</h2>
        <p>{lab.instructions}</p>
        {(lab.config?.inputs || []).map((input) => (
          <label key={input.key}>
            {input.label}
            <input
              type="number"
              value={values[input.key]}
              onChange={(event) =>
                setValues({
                  ...values,
                  [input.key]: Number(event.target.value),
                })
              }
            />
          </label>
        ))}
        <div className="calculator-results">
          {outputs.map((output) => (
            <div className="card" key={output.key}>
              <strong>{output.label}</strong>
              <p>{output.formula}</p>
              <output>{output.value}</output>
              <small>{output.explanation}</small>
            </div>
          ))}
        </div>
        {lab.config?.template === 'break_even' && (
          <svg
            className="break-even-chart"
            viewBox="0 0 320 180"
            role="img"
            aria-label="Break-even chart showing revenue and costs"
          >
            <line x1="35" y1="145" x2="300" y2="145" stroke="currentColor" />
            <line x1="35" y1="145" x2="35" y2="20" stroke="currentColor" />
            <polyline
              points="35,135 120,105 210,70 295,35"
              fill="none"
              stroke="#2f8f5b"
              strokeWidth="4"
            />
            <polyline
              points="35,125 120,112 210,96 295,80"
              fill="none"
              stroke="#c77700"
              strokeWidth="4"
            />
            <text x="45" y="168">
              Units
            </text>
            <text x="45" y="18">
              Value
            </text>
          </svg>
        )}
      </article>
    </section>
  );
}

export function ScenarioLabPlayer({ lab, onBack }) {
  const nodes = lab.config?.nodes || [];
  const [nodeId, setNodeId] = useState(nodes[0]?.id);
  const [meters, setMeters] = useState(
    Object.fromEntries(
      (lab.config?.meters || []).map((meter) => [meter.key, meter.initial]),
    ),
  );
  const [summary, setSummary] = useState('');
  const node = nodes.find((item) => item.id === nodeId) || nodes[0];
  const save = async (nextNode, nextMeters) => {
    await api(`/labs/${lab.lab_id}/attempt`, {
      method: 'PUT',
      body: JSON.stringify({
        submission: { nodeId: nextNode, meters: nextMeters },
        checksPassed: 0,
        checksTotal: 0,
        completed: Boolean(
          nodes.find((item) => item.id === nextNode)?.terminal,
        ),
      }),
    });
  };
  useEffect(() => {
    api(`/labs/${lab.lab_id}/attempt`)
      .then((body) => {
        const saved = body.attempt?.submission;
        if (saved?.nodeId) setNodeId(saved.nodeId);
        if (saved?.meters) setMeters(saved.meters);
      })
      .catch(() => {});
  }, [lab.lab_id]);
  const choose = async (choice) => {
    const nextMeters = { ...meters };
    Object.entries(choice.changes || {}).forEach(([key, value]) => {
      nextMeters[key] = (nextMeters[key] || 0) + value;
    });
    setMeters(nextMeters);
    setNodeId(choice.next);
    if (nodes.find((item) => item.id === choice.next)?.terminal)
      setSummary(
        nodes.find((item) => item.id === choice.next)?.reflection ||
          'You reached the end of this scenario.',
      );
    await save(choice.next, nextMeters);
  };
  const restart = () => {
    const initial = Object.fromEntries(
      (lab.config?.meters || []).map((meter) => [meter.key, meter.initial]),
    );
    setMeters(initial);
    setNodeId(nodes[0]?.id);
    setSummary('');
    save(nodes[0]?.id, initial).catch(() => {});
  };
  return (
    <section className="practice-lab-page scenario-player">
      <button className="link-button" onClick={onBack}>
        ← Back to Practice Labs
      </button>
      <article className="card">
        <span className="eyebrow">DECISION SCENARIO</span>
        <h2>{lab.title}</h2>
        <p>{lab.instructions}</p>
        <section aria-label="Scenario meters" className="scenario-meters">
          {(lab.config?.meters || []).map((meter) => (
            <div key={meter.key}>
              <strong>
                {meter.label}: {meters[meter.key]}
              </strong>
              <progress
                max="100"
                value={Math.max(0, Math.min(100, meters[meter.key] || 0))}
                aria-label={`${meter.label} meter`}
              />
            </div>
          ))}
        </section>
        {summary ? (
          <div role="status" aria-live="polite">
            <h3>Reflection summary</h3>
            <p>{summary}</p>
            <button className="primary" onClick={restart}>
              Restart scenario
            </button>
          </div>
        ) : (
          <div aria-live="polite">
            <h3>{node?.text}</h3>
            <div className="scenario-choices">
              {(node?.choices || []).map((choice) => (
                <button key={choice.label} onClick={() => choose(choice)}>
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

function LabAuthoringPanel({ modules, onCreated }) {
  const [kind, setKind] = useState('spreadsheet');
  const [moduleId, setModuleId] = useState(modules[0]?.module_id || '');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    try {
      const body = await api('/labs', {
        method: 'POST',
        body: JSON.stringify({
          moduleId,
          kind,
          title,
          instructions,
          difficulty: 1,
          status: 'draft',
          config: JSON.parse(configText),
        }),
      });
      setMessage(`Draft created: ${body.lab.title}`);
      onCreated?.(body.lab);
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <form className="card lab-authoring" onSubmit={submit}>
      <span className="eyebrow">LECTURER AUTHORING</span>
      <h2>Create a Business Lab</h2>
      <label>
        Module
        <select
          value={moduleId}
          onChange={(event) => setModuleId(event.target.value)}
        >
          {modules.map((module) => (
            <option key={module.module_id} value={module.module_id}>
              {module.module_code} — {module.module_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Kind
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="spreadsheet">Spreadsheet exercise</option>
          <option value="calculator">Calculator template</option>
          <option value="scenario">Decision scenario</option>
        </select>
      </label>
      <label>
        Title
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        Instructions
        <textarea
          required
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </label>
      <label>
        Configuration JSON
        <textarea
          aria-label="Lab configuration JSON"
          value={configText}
          onChange={(event) => setConfigText(event.target.value)}
        />
      </label>
      <button className="primary" type="submit">
        Save draft
      </button>
      {message && <p role="status">{message}</p>}
      <p className="muted">
        Use the validated schema for the selected kind. Student code is never
        executed on the server.
      </p>
    </form>
  );
}

export function PracticeLabs({ user }) {
  const state = useData('/labs?page=1&pageSize=50');
  const moduleState = useData(
    user.role === 'lecturer'
      ? '/me/modules?page=1&pageSize=50'
      : '/labs?page=1&pageSize=1',
  );
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const labs = state.data.filter((lab) =>
    lab.title.toLowerCase().includes(search.toLowerCase()),
  );
  if (selected) {
    if (selected.kind === 'spreadsheet')
      return (
        <SpreadsheetLabPlayer lab={selected} onBack={() => setSelected(null)} />
      );
    if (selected.kind === 'calculator')
      return (
        <CalculatorLabPlayer lab={selected} onBack={() => setSelected(null)} />
      );
    if (selected.kind === 'scenario')
      return (
        <ScenarioLabPlayer lab={selected} onBack={() => setSelected(null)} />
      );
    return <CodeLabPlayer lab={selected} onBack={() => setSelected(null)} />;
  }
  return (
    <section className="practice-labs-page">
      {user.role === 'lecturer' && (
        <LabAuthoringPanel modules={moduleState.data} onCreated={() => {}} />
      )}
      <div className="card hero">
        <span className="eyebrow">PRACTICE LABS</span>
        <h2>Learn by building</h2>
        <p>
          Experiment safely in your browser. Your code never leaves this page
          until you save a draft.
        </p>
        <input
          aria-label="Search practice labs"
          placeholder="Search labs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <State
        state={state}
        empty="No published practice labs are available yet."
      />
      <div className="lab-grid">
        {labs.map((lab) => (
          <article className="card lab-card" key={lab.lab_id}>
            <span className="lab-icon" aria-hidden="true">
              &lt;/&gt;
            </span>
            <span className="eyebrow">
              {lab.kind} · Level {lab.difficulty}
            </span>
            <h3>{lab.title}</h3>
            <p>{lab.instructions}</p>
            <span className="tag">Practice only</span>
            {user.role === 'student' ? (
              <button className="primary" onClick={() => setSelected(lab)}>
                Open lab
              </button>
            ) : (
              <span className="tag">Authoring only</span>
            )}
          </article>
        ))}
      </div>
      {user.role === 'lecturer' && (
        <p className="muted">
          Lecturer view: create and publish labs through the lab authoring API;
          student code is never executed on the server.
        </p>
      )}
    </section>
  );
}
function Dashboard({ user }) {
  const state = useData('/modules');
  const labs = useData('/labs?page=1&pageSize=3');
  return (
    <section className="grid">
      <article className="card hero">
        <span className="eyebrow">
          {user.role === 'student' ? 'YOUR LEARNING' : 'YOUR TEACHING'}
        </span>
        <h2>
          {user.role === 'student'
            ? 'Small steps. Big discoveries.'
            : 'Inspire the next discovery.'}
        </h2>
        <p>
          Use the navigation to manage modules, study groups, quizzes and
          results.
        </p>
      </article>
      <article className="card stat">
        <strong>{state.data.length}</strong>
        <span>Visible modules</span>
      </article>
      <article className="card stat amber">
        <strong>{user.role === 'student' ? 'Practice' : 'Insights'}</strong>
        <span>Next focus</span>
      </article>
      <article className="card dashboard-labs">
        <span className="eyebrow">PRACTICE LAB</span>
        <h2>Keep building</h2>
        {labs.loading ? (
          <p className="muted">Loading lab progress…</p>
        ) : labs.data.length ? (
          labs.data.map((lab) => (
            <div className="list-row" key={lab.lab_id}>
              <span>
                <strong>{lab.title}</strong>
                <small>
                  {lab.kind} ·{' '}
                  {lab.attempt_completed ? 'Completed' : 'Not started'}
                </small>
              </span>
              <span className="tag">
                {lab.attempt_completed ? 'Done' : 'Try it'}
              </span>
            </div>
          ))
        ) : (
          <p className="empty-state">
            No practice labs yet. Enrol in a module to see recommended labs.
          </p>
        )}
      </article>
    </section>
  );
}
export function Modules({ user }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('code');
  const state = useData(
    `/me/modules?page=1&pageSize=20&search=${encodeURIComponent(search)}&sort=${sort}`,
  );
  const lookahead = useData(
    user.role === 'student' ? '/me/modules/lookahead' : '/me/modules',
  );
  const [createdModules, setCreatedModules] = useState([]);
  const [moduleCode, setModuleCode] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const createModule = async (event) => {
    event.preventDefault();
    setCreateMessage('');
    try {
      const body = await api('/modules', {
        method: 'POST',
        body: JSON.stringify({ moduleCode, moduleName }),
      });
      setCreatedModules((items) => [body.module, ...items]);
      setModuleCode('');
      setModuleName('');
      setCreateMessage(
        `Module created. Share JoinCode ${body.module.join_code} with students.`,
      );
    } catch (reason) {
      setCreateMessage(reason.message);
    }
  };
  const join = async (event) => {
    event.preventDefault();
    try {
      await api('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ joinCode }),
      });
      setMessage('Enrolled successfully.');
      setJoinCode('');
    } catch (reason) {
      setMessage(reason.message);
    }
  };
  return (
    <section className="modules-page">
      <article className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MODULES</span>
            <h2>{user.role === 'student' ? 'My modules' : 'Your modules'}</h2>
          </div>
          <div className="catalogue-controls">
            <label className="sr-only" htmlFor="module-search">
              Search modules
            </label>
            <input
              id="module-search"
              placeholder="Search modules"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label className="sr-only" htmlFor="module-sort">
              Sort modules
            </label>
            <select
              id="module-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="code">Sort by code</option>
              <option value="name">Sort by name</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        </div>
        <State state={state} empty="You are not enrolled in any modules yet." />
        <div className="module-card-grid">
          {[...createdModules, ...state.data].map((module) => (
            <article className="module-card" key={module.module_id}>
              <span className="eyebrow">{module.module_code}</span>
              <h3>{module.module_name}</h3>
              <p className="muted">
                Lecturer: {module.lecturer_name || 'Your teaching team'}
              </p>
              <p>
                {module.year ? `Year ${module.year} · ${module.offering}` : ''}
              </p>
              <div className="module-card-stats">
                <span>{module.quizzes_available || 0} quizzes available</span>
                <span>{module.new_resources_count || 0} new resources</span>
              </div>
              {module.has_in_progress_game && (
                <span className="resume-badge">Game in progress</span>
              )}
              {module.join_code && <small>JoinCode: {module.join_code}</small>}
            </article>
          ))}
        </div>
      </article>
      {user.role === 'student' && lookahead.data.length > 0 && (
        <article className="card lookahead-card">
          <span className="eyebrow">LOOK AHEAD</span>
          <h2>Next year preview</h2>
          <p className="muted">
            Preview: not enrolled. This read-only view contains no quizzes,
            resources or enrolment actions.
          </p>
          <div className="module-card-grid">
            {lookahead.data.map((module) => (
              <article className="module-card" key={module.module_id}>
                <span className="eyebrow">
                  {module.module_code} · Year {module.year}
                </span>
                <h3>{module.module_name}</h3>
                <p>
                  {module.description ||
                    'Module information will be available when you enrol.'}
                </p>
                <p className="muted">
                  Topics:{' '}
                  {module.topics?.length
                    ? module.topics.join(', ')
                    : 'To be announced'}
                </p>
                <small>
                  Prerequisites:{' '}
                  {module.prerequisite_hints?.length
                    ? module.prerequisite_hints.join(', ')
                    : 'Check with your programme coordinator.'}
                </small>
              </article>
            ))}
          </div>
        </article>
      )}
      {user.role === 'lecturer' && (
        <form className="card" onSubmit={createModule}>
          <span className="eyebrow">LECTURER TOOLS</span>
          <h2>Create a module</h2>
          <p className="muted">
            Add a module first, then upload resources and generate quizzes from
            them.
          </p>
          <label>
            Module code
            <input
              value={moduleCode}
              onChange={(event) => setModuleCode(event.target.value)}
              placeholder="e.g. CS101"
              required
            />
          </label>
          <label>
            Module name
            <input
              value={moduleName}
              onChange={(event) => setModuleName(event.target.value)}
              placeholder="e.g. Introduction to Computing"
              required
            />
          </label>
          <button className="primary" type="submit">
            Create module
          </button>
          {createMessage && <p className="muted">{createMessage}</p>}
        </form>
      )}
      {user.role === 'student' && (
        <form className="card" onSubmit={join}>
          <h2>Enrol with a JoinCode</h2>
          <label>
            JoinCode
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              required
            />
          </label>
          <button className="primary">Enrol</button>
          {message && <p className="muted">{message}</p>}
        </form>
      )}
    </section>
  );
}
export function Resources({ user }) {
  const modules = useData('/me/modules?page=1&pageSize=50&sort=code');
  const tiles = useData('/resources/modules?page=1&pageSize=50&sort=code');
  const [moduleId, setModuleId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const state = useData(
    moduleId
      ? `/modules/${moduleId}/resources?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`
      : '/modules',
  );
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const upload = async (event) => {
    event.preventDefault();
    setError('');
    const file = event.target.file.files[0];
    const form = new FormData();
    form.append('title', title);
    form.append('file', file);
    try {
      await fetch(`/api/v1/modules/${moduleId}/resources`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      }).then(async (response) => {
        if (!response.ok)
          throw new Error((await response.json()).error.message);
      });
      setTitle('');
    } catch (reason) {
      setError(reason.message);
    }
  };
  return (
    <section className="resources-page">
      <article className="card">
        <span className="eyebrow">RESOURCES</span>
        <h2>Choose a module</h2>
        <p className="muted">Every tile belongs to a module you can access.</p>
        <div className="resource-module-grid">
          {tiles.data.map((module) => (
            <button
              className={`resource-module-tile ${moduleId === module.module_id ? 'selected' : ''}`}
              key={module.module_id}
              onClick={() => {
                setModuleId(module.module_id);
                setPage(1);
              }}
            >
              <span className="eyebrow">{module.module_code}</span>
              <strong>{module.module_name}</strong>
              <span>{module.resource_count} resources</span>
              <small>
                {module.last_updated
                  ? `Updated ${new Date(module.last_updated).toLocaleDateString()}`
                  : 'No resources yet'}
              </small>
            </button>
          ))}
        </div>
        {!tiles.loading && !tiles.data.length && (
          <p className="empty-state">No module resources are visible yet.</p>
        )}
        <label htmlFor="resource-module">Jump to module</label>
        <select
          id="resource-module"
          value={moduleId}
          onChange={(event) => {
            setModuleId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Choose a module</option>
          {modules.data.map((module) => (
            <option key={module.module_id} value={module.module_id}>
              {module.module_name}
            </option>
          ))}
        </select>
        {moduleId && (
          <>
            <label htmlFor="resource-search">Search resource titles</label>
            <input
              id="resource-search"
              placeholder="Search this module"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </>
        )}
        <State
          state={moduleId ? state : { loading: false, error: '', data: [] }}
          empty="No resources are visible for this module."
        />
        {moduleId &&
          state.data.map((resource) => (
            <ResourceRow
              key={resource.resource_id}
              resource={resource}
              lecturer={user.role === 'lecturer'}
            />
          ))}
        {moduleId && state.pagination?.pageCount > 1 && (
          <div className="pagination-controls">
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {state.pagination.pageCount}
            </span>
            <button
              className="secondary"
              disabled={page >= state.pagination.pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        )}
      </article>
      {user.role === 'lecturer' && (
        <form className="card" onSubmit={upload}>
          <h2>Upload resource</h2>
          <label>
            Module
            <select
              value={moduleId}
              onChange={(event) => setModuleId(event.target.value)}
              required
            >
              <option value="">Choose</option>
              {modules.data.map((module) => (
                <option key={module.module_id} value={module.module_id}>
                  {module.module_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label>
            File
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              required
            />
          </label>
          <button className="primary">Upload</button>
          {error && <p className="field-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

export function ResourceRow({ resource, lecturer }) {
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState('mixed');
  const [quizMode, setQuizMode] = useState('practice');
  const [quizTitle, setQuizTitle] = useState(resource.title);
  const [closesAt, setClosesAt] = useState('');
  const [job, setJob] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const generate = async () => {
    setError('');
    setQuiz(null);
    try {
      const body = await api(
        `/resources/${resource.resource_id}/generation-jobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            questionCount: Number(questionCount),
            difficulty,
            quizMode,
            title: quizTitle,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          }),
        },
      );
      setJob(body.job);
    } catch (reason) {
      setError(reason.message);
    }
  };
  useEffect(() => {
    if (!lecturer) return undefined;
    api('/ai-status')
      .then((body) => setAiStatus(body))
      .catch(() => setAiStatus({ configured: false, reachable: false }));
    return undefined;
  }, [lecturer]);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return undefined;
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = async () => {
      try {
        const body = await api(`/ai-generation-jobs/${job.job_id}`);
        setJob(body.job);
        if (body.job.status === 'succeeded' && body.job.quiz_id)
          setQuiz((await api(`/quizzes/${body.job.quiz_id}`)).quiz);
      } catch (reason) {
        setError(reason.message);
      }
    };
    const timer = setInterval(poll, 1000);
    poll();
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [job?.job_id, job?.status]);
  const cancel = async () => {
    const body = await api(`/ai-generation-jobs/${job.job_id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setJob(body.job);
  };
  const retry = async () => {
    const body = await api(`/ai-generation-jobs/${job.job_id}/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setJob(body.job);
    setError('');
  };
  const publish = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = await api(`/quizzes/${quiz.quiz_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: quiz.title,
          isCompetitive: quiz.is_competitive,
          closesAt: quiz.closes_at,
          status: 'published',
          questions: (quiz.questions || []).map((question) => ({
            questionId: question.questionId,
            difficultyLevel: question.difficultyLevel,
            explanation: question.explanation,
          })),
        }),
      });
      setQuiz(body.quiz);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };
  if (!lecturer)
    return (
      <div className="list-row">
        <span>{resource.title}</span>
        <small>{resource.resource_type}</small>
        <a
          className="secondary resource-open-link"
          href={`/api/v1/resources/${resource.resource_id}/file`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open resource
        </a>
      </div>
    );
  return (
    <div className="card resource-generation">
      <div className="list-row">
        <span>
          <b>{resource.title}</b>
          <small>{resource.resource_type}</small>
        </span>
        <a
          className="secondary resource-open-link"
          href={`/api/v1/resources/${resource.resource_id}/file`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open resource
        </a>
      </div>
      <div className="generation-controls">
        <label>
          Questions
          <input
            type="number"
            min="1"
            max="50"
            value={questionCount}
            onChange={(event) => setQuestionCount(event.target.value)}
          />
        </label>
        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="mixed">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Quiz mode
          <select
            value={quizMode}
            onChange={(event) => setQuizMode(event.target.value)}
            required
          >
            <option value="practice">Practice</option>
            <option value="competitive">Competitive</option>
          </select>
          <small>
            {quizMode === 'practice'
              ? 'Revision with unlimited attempts and no leaderboard.'
              : 'One scored attempt; appears on the leaderboard.'}
          </small>
        </label>
        <label>
          Quiz title
          <input
            value={quizTitle}
            onChange={(event) => setQuizTitle(event.target.value)}
            required
          />
        </label>
        <label>
          Closing date and time (optional)
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(event) => setClosesAt(event.target.value)}
          />
        </label>
        {(aiStatus && !aiStatus.configured) ||
        (aiStatus && !aiStatus.reachable) ? (
          <p className="field-error">
            AI service is not reachable or is misconfigured. Check the{' '}
            <a href="#ai-status">AI status indicator</a> before generating.
          </p>
        ) : null}
        <p id="ai-status" className="muted" aria-live="polite">
          AI status:{' '}
          {aiStatus
            ? aiStatus.configured && aiStatus.reachable
              ? 'ready'
              : 'unavailable'
            : 'checking'}
        </p>
        <button
          className="primary"
          onClick={generate}
          disabled={Boolean(
            aiStatus && (!aiStatus.configured || !aiStatus.reachable),
          )}
        >
          Generate quiz
        </button>
      </div>
      {job && (
        <p className="job-status" aria-live="polite">
          Generation status: <b>{job.status}</b>
          {job.created_at && job.status === 'queued' && (
            <span>
              {' '}
              queued for{' '}
              {Math.max(
                0,
                Math.floor((now - new Date(job.created_at).getTime()) / 1000),
              )}{' '}
              seconds
            </span>
          )}
          {job.providerMode === 'mock' && (
            <span className="demo-banner">
              Demo mode: questions are simulated
            </span>
          )}
          {job.status === 'queued' &&
            (job.queuedMessage ||
              (job.created_at &&
                now - new Date(job.created_at).getTime() >= 60000)) && (
              <span className="field-error">
                This is taking longer than expected. The AI service may be
                unreachable, the model may be slow, or the worker may not be
                running.
              </span>
            )}
          {['queued', 'running'].includes(job.status) && (
            <button className="link-button" onClick={cancel}>
              Cancel
            </button>
          )}
          {job.status === 'failed' && (
            <>
              <span className="field-error">
                Quiz generation failed. Please try again.
              </span>
              <button className="link-button" onClick={retry}>
                Try again
              </button>
            </>
          )}
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
      {quiz && (
        <form onSubmit={publish} className="generated-quiz">
          <h3>Generated draft</h3>
          <label>
            Draft quiz title
            <input
              value={quiz.title}
              onChange={(event) =>
                setQuiz({ ...quiz, title: event.target.value })
              }
            />
          </label>
          <label>
            Mode
            <select
              value={quiz.is_competitive ? 'competitive' : 'practice'}
              onChange={(event) =>
                setQuiz({
                  ...quiz,
                  is_competitive: event.target.value === 'competitive',
                })
              }
            >
              <option value="practice">Practice</option>
              <option value="competitive">Competitive</option>
            </select>
          </label>
          <label>
            Closing date and time (optional)
            <input
              type="datetime-local"
              value={
                quiz.closes_at
                  ? new Date(quiz.closes_at).toISOString().slice(0, 16)
                  : ''
              }
              onChange={(event) =>
                setQuiz({
                  ...quiz,
                  closes_at: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
          <div className="draft-questions">
            {quiz.questions?.map((question) => (
              <fieldset key={question.questionId}>
                <legend>{question.questionText}</legend>
                <small>{question.topic || 'No topic'}</small>
                <label>
                  Difficulty
                  <select
                    value={question.difficultyLevel}
                    onChange={(event) =>
                      setQuiz({
                        ...quiz,
                        questions: quiz.questions.map((item) =>
                          item.questionId === question.questionId
                            ? {
                                ...item,
                                difficultyLevel: Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="1">Level 1 — Easy</option>
                    <option value="2">Level 2 — Easy</option>
                    <option value="3">Level 3 — Medium</option>
                    <option value="4">Level 4 — Hard</option>
                    <option value="5">Level 5 — Hard</option>
                  </select>
                </label>
                <label>
                  Explanation
                  <textarea
                    maxLength="300"
                    value={question.explanation || ''}
                    onChange={(event) =>
                      setQuiz({
                        ...quiz,
                        questions: quiz.questions.map((item) =>
                          item.questionId === question.questionId
                            ? { ...item, explanation: event.target.value }
                            : item,
                        ),
                      })
                    }
                    required
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <button className="primary" disabled={saving}>
            {saving ? 'Publishing…' : 'Publish quiz'}
          </button>
        </form>
      )}
    </div>
  );
}
export function Groups({ user, onSession }) {
  const modules = useData('/me/modules?page=1&pageSize=50&sort=code');
  const [search, setSearch] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [language, setLanguage] = useState('');
  const [recommended, setRecommended] = useState(false);
  const [sort, setSort] = useState('recommended');
  const [refresh, setRefresh] = useState(0);
  const groups = useData(
    `/groups?page=1&pageSize=20&search=${encodeURIComponent(search)}${moduleId ? `&moduleId=${moduleId}` : ''}${language ? `&language=${encodeURIComponent(language)}` : ''}${recommended ? '&recommended=true' : ''}&sort=${sort}&refresh=${refresh}`,
  );
  const [form, setForm] = useState({
    moduleId: '',
    groupName: '',
    focus: '',
    description: '',
    languages: [],
  });
  const [message, setMessage] = useState('');
  const [chatGroup, setChatGroup] = useState(null);
  const languages = [
    'JavaScript',
    'TypeScript',
    'Python',
    'Java',
    'C#',
    'SQL',
    'HTML/CSS',
    'PHP',
    'C',
    'C++',
  ];
  const submit = async (event) => {
    event.preventDefault();
    try {
      await api('/groups', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Study group created.');
      setForm({
        moduleId: '',
        groupName: '',
        focus: '',
        description: '',
        languages: [],
      });
      setRefresh((value) => value + 1);
    } catch (reason) {
      setMessage(reason.message);
    }
  };
  const act = async (group) => {
    try {
      await api(
        `/groups/${group.group_id}/${group.is_member ? 'leave' : 'join'}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setRefresh((value) => value + 1);
    } catch (reason) {
      setMessage(reason.message);
    }
  };
  return (
    <section className="groups-page">
      <div className="card">
        <span className="eyebrow">COLLABORATE</span>
        <h2>Study groups</h2>
        <p className="muted">
          Find classmates studying the same topics, languages and modules.
        </p>
        <div className="catalogue-controls">
          <input
            aria-label="Search groups"
            placeholder="Search groups"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter by module"
            value={moduleId}
            onChange={(event) => setModuleId(event.target.value)}
          >
            <option value="">All modules</option>
            {modules.data.map((module) => (
              <option key={module.module_id} value={module.module_id}>
                {module.module_name}
              </option>
            ))}
          </select>
          <input
            aria-label="Filter by language"
            placeholder="Language, e.g. Python"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          />
          <select
            aria-label="Sort groups"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="recommended">Recommended</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
          </select>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={recommended}
              onChange={(event) => setRecommended(event.target.checked)}
            />{' '}
            Recommended for me
          </label>
        </div>
      </div>
      {user.role === 'student' && (
        <form className="card group-create-form" onSubmit={submit}>
          <h3>Create a study group</h3>
          <select
            aria-label="Group module"
            required
            value={form.moduleId}
            onChange={(event) =>
              setForm({ ...form, moduleId: event.target.value })
            }
          >
            <option value="">Choose an enrolled module</option>
            {modules.data.map((module) => (
              <option key={module.module_id} value={module.module_id}>
                {module.module_name}
              </option>
            ))}
          </select>
          <input
            aria-label="Group name"
            placeholder="Group name"
            required
            value={form.groupName}
            onChange={(event) =>
              setForm({ ...form, groupName: event.target.value })
            }
          />
          <input
            aria-label="Group focus"
            placeholder="Current focus"
            value={form.focus}
            onChange={(event) =>
              setForm({ ...form, focus: event.target.value })
            }
          />
          <textarea
            aria-label="Group description"
            maxLength="500"
            placeholder="Short description"
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
          <label>
            Languages
            <select
              multiple
              aria-label="Group languages"
              value={form.languages}
              onChange={(event) =>
                setForm({
                  ...form,
                  languages: [...event.target.selectedOptions].map(
                    (option) => option.value,
                  ),
                })
              }
            >
              {languages.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="primary">Create group</button>
          {message && <p className="field-error">{message}</p>}
        </form>
      )}
      {groups.loading && <p className="muted">Loading groups…</p>}
      {groups.error && <p className="field-error">{groups.error}</p>}
      {!groups.loading && !groups.data.length && (
        <p className="empty-state">No study groups match these filters.</p>
      )}
      <div className="group-grid">
        {groups.data.map((group) => (
          <article className="card group-card" key={group.group_id}>
            <span className="eyebrow">
              {group.module_code} · {group.module_name}
            </span>
            <h3>{group.group_name}</h3>
            {(group.is_member || user.role === 'lecturer') && (
              <>
                <button
                  onClick={() =>
                    setChatGroup(
                      chatGroup === group.group_id ? null : group.group_id,
                    )
                  }
                >
                  {chatGroup === group.group_id
                    ? 'Close group chat'
                    : 'Group chat'}
                </button>
                <button onClick={() => onSession?.(group.group_id)}>
                  Study sessions
                </button>
                <UpcomingSessions groupId={group.group_id} onOpen={onSession} />
                {chatGroup === group.group_id && (
                  <GroupChat
                    groupId={group.group_id}
                    readOnly={user.role === 'lecturer' && !group.is_member}
                    canModerate={Boolean(group.is_leader)}
                  />
                )}
              </>
            )}
            <p>{group.description || 'A focused study group.'}</p>
            <p>
              <strong>Leaders:</strong>{' '}
              {group.leaders
                .map((leader) => `${leader.name} (${leader.role})`)
                .join(', ') || 'Being organised'}
            </p>
            <div className="chip-row">
              {group.languages.map((item) => (
                <span className="chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
            <p>
              <strong>Focus:</strong> {group.focus || 'Not set'}
            </p>
            <p>
              <strong>{group.member_count}</strong> members
            </p>
            {group.latest_doing_now && (
              <p className="update-line">
                <strong>Doing now:</strong> {group.latest_doing_now.text}
              </p>
            )}
            {!!group.next_up.length && (
              <div>
                <strong>Next up</strong>
                {group.next_up.map((item) => (
                  <small className="update-line" key={item.update_id}>
                    {item.text}
                    {item.session_id &&
                      (group.is_member || user.role === 'lecturer') && (
                        <button
                          onClick={() =>
                            onSession(group.group_id, item.session_id)
                          }
                        >
                          Open study session
                        </button>
                      )}
                    {item.planned_for
                      ? ` · ${new Date(item.planned_for).toLocaleDateString()}`
                      : ''}
                  </small>
                ))}
              </div>
            )}
            <p className="recommendation">
              Why recommended: {group.recommendation_reason}
            </p>
            <button className="secondary" onClick={() => act(group)}>
              {group.is_member ? 'Leave' : 'Join'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
function Leaderboard({ user }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const state = useData(
    moduleId ? `/modules/${moduleId}/leaderboard` : '/modules',
  );
  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <select
        value={moduleId}
        onChange={(event) => setModuleId(event.target.value)}
      >
        <option value="">Choose a module</option>
        {modules.data.map((module) => (
          <option key={module.module_id} value={module.module_id}>
            {module.module_name}
          </option>
        ))}
      </select>
      {moduleId ? (
        <>
          <State state={state} empty="No completed scored attempts yet." />
          <ol className="ranking">
            {state.data.map((row) => (
              <li key={`${row.student_id}-${row.completion_time}`}>
                <span>
                  {row.rank}. {row.full_name}
                </span>
                <b>{row.score}</b>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="empty-state">Choose a module to view rankings.</p>
      )}
    </section>
  );
}
function Analytics({ user }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const state = useData(
    moduleId ? `/modules/${moduleId}/analytics` : '/modules',
  );
  if (user.role !== 'lecturer')
    return <p className="field-error">You do not have access to analytics.</p>;
  return (
    <section className="card">
      <h2>Analytics</h2>
      <select
        value={moduleId}
        onChange={(event) => setModuleId(event.target.value)}
      >
        <option value="">Choose a module</option>
        {modules.data.map((module) => (
          <option key={module.module_id} value={module.module_id}>
            {module.module_name}
          </option>
        ))}
      </select>
      <State state={state} empty="No scored data yet." />
      {state.data.map((topic) => (
        <div className="list-row" key={topic.topic_id}>
          <span>{topic.name}</span>
          <b>
            {topic.correctness_percentage ?? 'No answers yet'}
            {topic.correctness_percentage !== null ? '%' : ''}
          </b>
        </div>
      ))}
    </section>
  );
}
export function QuizAuthoring({ onDone }) {
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('practice');
  const [startingPoint, setStartingPoint] = useState('manual');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [correct, setCorrect] = useState(0);
  const [type, setType] = useState('multiple_choice');
  const [message, setMessage] = useState('');
  const [quizId, setQuizId] = useState('');
  const submit = async (status = 'draft') => {
    setMessage('');
    try {
      const result = await api('/quizzes/manual', {
        method: 'POST',
        body: JSON.stringify({
          moduleId,
          title,
          status: status === 'published' ? 'draft' : status,
          isCompetitive: mode === 'competitive',
          questions: [
            {
              questionType: type,
              questionText,
              marks: 1,
              difficultyLevel: 3,
              options:
                type === 'multiple_choice'
                  ? options.map((optionText, index) => ({
                      optionText,
                      isCorrect: index === correct,
                    }))
                  : [],
              acceptedAnswers:
                type === 'short_answer' ? [options[0] || ''] : [],
            },
          ],
        }),
      });
      const createdQuizId = result.quiz.quiz_id;
      setQuizId(createdQuizId);
      if (status === 'published') {
        const check = await api(`/quizzes/${createdQuizId}/publish-check`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (!check.checklist.ok) {
          setMessage(
            `Publish blocked: ${check.checklist.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          );
          return;
        }
        await api(`/quizzes/${createdQuizId}/publish`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      }
      setMessage(status === 'published' ? 'Quiz published.' : 'Draft saved.');
      if (status === 'published') onDone?.();
      else onDone?.(createdQuizId);
    } catch (reason) {
      setMessage(reason.message || 'Please check the fields.');
    }
  };
  const dryRun = async () => {
    if (!quizId) {
      setMessage('Save the draft first to run the publish checklist.');
      return;
    }
    try {
      const check = await api(`/quizzes/${quizId}/publish-check`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMessage(
        check.checklist.ok
          ? 'Dry run passed: this quiz can be published.'
          : `Dry run blocked: ${check.checklist.issues
              .map((issue) => issue.message)
              .join('; ')}`,
      );
    } catch (reason) {
      setMessage(reason.message || 'Dry run failed.');
    }
  };
  return (
    <section
      className="card quiz-authoring"
      aria-labelledby="create-quiz-title"
    >
      <h2 id="create-quiz-title">Create quiz</h2>
      <p className="muted">
        Build a quiz manually, start with an AI draft, or combine both.
      </p>
      <label>
        Starting point
        <select
          value={startingPoint}
          onChange={(e) => setStartingPoint(e.target.value)}
        >
          <option value="manual">Write questions manually</option>
          <option value="ai">Generate with AI</option>
          <option value="both">AI draft, then edit manually</option>
        </select>
      </label>
      <label>
        Quiz title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Web foundations"
        />
      </label>
      <label>
        Module
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          <option value="">Choose a module</option>
          {modules.data.map((m) => (
            <option key={m.module_id} value={m.module_id}>
              {m.module_name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Quiz mode</legend>
        <label>
          <input
            type="radio"
            checked={mode === 'practice'}
            onChange={() => setMode('practice')}
          />{' '}
          Practice <small>Unlimited attempts; no leaderboard.</small>
        </label>
        <label>
          <input
            type="radio"
            checked={mode === 'competitive'}
            onChange={() => setMode('competitive')}
          />{' '}
          Competitive{' '}
          <small>One scored attempt; appears on the leaderboard.</small>
        </label>
      </fieldset>
      <label>
        Question type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="multiple_choice">Multiple choice</option>
          <option value="true_false">True or false</option>
          <option value="short_answer">Short answer</option>
          <option value="code">Code question</option>
        </select>
      </label>
      <label>
        Question text
        <textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
        />
      </label>
      {(type === 'multiple_choice' ||
        type === 'true_false' ||
        type === 'short_answer') && (
        <div className="author-options">
          <label>Answer options / accepted answer</label>
          {options.map((value, index) => (
            <div className="list-row" key={index}>
              <input
                aria-label={`Answer ${index + 1}`}
                value={value}
                onChange={(e) =>
                  setOptions((current) =>
                    current.map((item, i) =>
                      i === index ? e.target.value : item,
                    ),
                  )
                }
              />
              {type === 'multiple_choice' && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCorrect(index)}
                  aria-pressed={correct === index}
                >
                  {correct === index ? 'Correct' : 'Set correct'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      <aside
        className="card quiz-student-preview"
        aria-label="Preview as a student"
      >
        <h3>Preview as a student</h3>
        <p>{questionText || 'Your question will appear here.'}</p>
        {type === 'short_answer' ? (
          <input
            aria-label="Preview short answer"
            placeholder="Student answer"
            readOnly
          />
        ) : type === 'code' ? (
          <pre>{'Before\n' + (questionText || 'Code prompt')}</pre>
        ) : (
          options.map((option, index) => (
            <label key={index}>
              <input type="radio" disabled />
              {option || `Option ${index + 1}`}
            </label>
          ))
        )}
        <p className="muted">
          Pre-publish dry run: questions must have valid answer data before
          publishing.
        </p>
      </aside>
      <div className="button-row">
        <button onClick={() => submit('draft')}>Save draft</button>
        <button className="secondary" onClick={dryRun}>
          Run publish checklist
        </button>
        <button className="secondary" onClick={() => submit('published')}>
          Publish quiz
        </button>
        <button className="link-button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function blankQuestion(questionType = 'multiple_choice') {
  return {
    question_type: questionType,
    question_text: '',
    marks: 1,
    difficulty_level: 3,
    explanation: '',
    accepted_answers: questionType === 'short_answer' ? [''] : [],
    ignore_punctuation: false,
    code_before: '',
    code_after: '',
    expected_output: '',
    options: [
      { optionText: 'Option A', isCorrect: true },
      { optionText: 'Option B', isCorrect: false },
    ],
  };
}

export function QuizEditor({ quizId, onDone }) {
  const [state, setState] = useState({ loading: true, error: '', quiz: null });
  const [open, setOpen] = useState({});
  const [saved, setSaved] = useState({});
  const [message, setMessage] = useState('');
  const saveQueues = useRef(new Map());
  const nextDisplayOrder = useRef(0);
  useEffect(() => {
    api(`/quizzes/${quizId}`)
      .then((body) => {
        const quiz = body.quiz;
        setState({ loading: false, error: '', quiz });
        nextDisplayOrder.current = quiz.questions.length;
        setOpen(
          Object.fromEntries(
            (quiz.questions || []).map((q) => [q.questionId, true]),
          ),
        );
      })
      .catch((reason) =>
        setState({ loading: false, error: reason.message, quiz: null }),
      );
  }, [quizId]);
  if (state.loading) return <p className="muted">Loading quiz editor…</p>;
  if (state.error) return <p className="field-error">{state.error}</p>;
  const quiz = state.quiz;
  const questions = quiz.questions || [];
  const updateQuestion = (questionId, patch) =>
    setState((current) => ({
      ...current,
      quiz: {
        ...current.quiz,
        questions: current.quiz.questions.map((question) =>
          question.questionId === questionId
            ? { ...question, ...patch }
            : question,
        ),
      },
    }));
  const saveQuestion = async (question) => {
    setSaved((current) => ({ ...current, [question.questionId]: 'saving' }));
    const previous =
      saveQueues.current.get(question.questionId) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() =>
        api(`/quizzes/${quizId}/questions/${question.questionId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            questionId: question.questionId,
            questionType:
              question.questionType ||
              question.question_type ||
              'multiple_choice',
            questionText: question.questionText || question.question_text,
            marks: Number(question.marks || 1),
            difficultyLevel: Number(
              question.difficultyLevel || question.difficulty_level || 3,
            ),
            explanation: question.explanation || null,
            options: (question.options || []).map((option) => ({
              optionText: option.optionText,
              isCorrect: option.isCorrect ?? option.correct ?? false,
            })),
            acceptedAnswers:
              question.acceptedAnswers || question.accepted_answers || [],
            ignorePunctuation:
              question.ignorePunctuation ||
              question.ignore_punctuation ||
              false,
            codeLanguage:
              question.codeLanguage || question.code_language || null,
            codeBefore: question.codeBefore || question.code_before || null,
            codeAfter: question.codeAfter || question.code_after || null,
            expectedOutput:
              question.expectedOutput || question.expected_output || null,
            displayOrder: question.displayOrder || question.display_order || 0,
          }),
        }),
      );
    saveQueues.current.set(question.questionId, next);
    try {
      await next;
      setSaved((current) => ({ ...current, [question.questionId]: 'saved' }));
    } catch (reason) {
      setSaved((current) => ({ ...current, [question.questionId]: 'error' }));
      setMessage(reason.message);
    } finally {
      if (saveQueues.current.get(question.questionId) === next)
        saveQueues.current.delete(question.questionId);
    }
  };
  const addQuestion = async (event) => {
    const questionType = event.target.value;
    event.target.value = '';
    if (!questionType) return;
    try {
      const result = await api(`/quizzes/${quizId}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          questionType,
          questionText: 'New question',
          marks: 1,
          difficultyLevel: 3,
          displayOrder: nextDisplayOrder.current++,
          acceptedAnswers: questionType === 'short_answer' ? ['Answer'] : [],
          options:
            questionType === 'short_answer' ? [] : blankQuestion().options,
        }),
      });
      const refreshed = await api(`/quizzes/${quizId}`);
      setState((current) => ({ ...current, quiz: refreshed.quiz }));
      setOpen((current) => ({
        ...current,
        [result.question.question_id || result.question.questionId]: true,
      }));
      setMessage('Question added.');
    } catch (reason) {
      setMessage(reason.message);
    }
  };
  const moveQuestion = async (index, direction) => {
    const next = [...questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setState((current) => ({
      ...current,
      quiz: { ...current.quiz, questions: next },
    }));
    await api(`/quizzes/${quizId}/questions/reorder`, {
      method: 'POST',
      body: JSON.stringify({
        questionIds: next.map((question) => question.questionId),
      }),
    });
    setMessage('Question order saved.');
  };
  const duplicateQuestion = async (question) => {
    const result = await api(
      `/quizzes/${quizId}/questions/${question.questionId}/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    setState((current) => ({
      ...current,
      quiz: {
        ...current.quiz,
        questions: [...current.quiz.questions, result.question],
      },
    }));
  };
  const deleteQuestion = async (question) => {
    await api(`/quizzes/${quizId}/questions/${question.questionId}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    setState((current) => ({
      ...current,
      quiz: {
        ...current.quiz,
        questions: current.quiz.questions.filter(
          (item) => item.questionId !== question.questionId,
        ),
      },
    }));
  };
  const publishCheck = async () => {
    const incomplete = questions
      .map((question, index) => ({ question, index }))
      .filter(
        ({ question }) =>
          !(question.questionText || question.question_text)?.trim(),
      );
    if (incomplete.length) {
      setMessage(
        `Publish blocked: Question ${incomplete[0].index + 1} is incomplete.`,
      );
      return;
    }
    const result = await api(`/quizzes/${quizId}/publish-check`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setMessage(
      result.checklist.ok
        ? 'Publish checklist passed.'
        : `Publish blocked: ${result.checklist.issues.map((issue) => issue.message).join('; ')}`,
    );
  };
  const publish = async () => {
    const result = await api(`/quizzes/${quizId}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setMessage(result.checklist?.ok ? 'Quiz published.' : 'Quiz published.');
  };
  const completeCount = questions.filter(
    (question) => question.questionText || question.question_text,
  ).length;
  const totalMarks = questions.reduce(
    (sum, question) => sum + Number(question.marks || 0),
    0,
  );
  return (
    <section className="card quiz-editor" aria-labelledby="quiz-editor-title">
      <div className="section-heading">
        <div>
          <h2 id="quiz-editor-title">Quiz editor</h2>
          <p className="muted">Edit the whole quiz in one place.</p>
        </div>
        <button className="link-button" onClick={onDone}>
          Back to quizzes
        </button>
      </div>
      <div className="editor-settings">
        <label>
          Quiz title
          <input
            value={quiz.title || ''}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                quiz: { ...current.quiz, title: event.target.value },
              }))
            }
            onBlur={() =>
              api(`/quizzes/${quizId}`, {
                method: 'PUT',
                body: JSON.stringify({
                  title: quiz.title,
                  isCompetitive: quiz.is_competitive,
                  closesAt: quiz.closes_at,
                  status: quiz.status,
                }),
              }).then(() => setMessage('Settings saved.'))
            }
          />
        </label>
        <fieldset>
          <legend>Mode</legend>
          <label>
            <input
              type="radio"
              checked={!quiz.is_competitive}
              onChange={() =>
                setState((current) => ({
                  ...current,
                  quiz: { ...current.quiz, is_competitive: false },
                }))
              }
            />{' '}
            Practice
          </label>
          <label>
            <input
              type="radio"
              checked={quiz.is_competitive}
              onChange={() =>
                setState((current) => ({
                  ...current,
                  quiz: { ...current.quiz, is_competitive: true },
                }))
              }
            />{' '}
            Competitive
          </label>
        </fieldset>
        <label>
          Closing time
          <input
            type="datetime-local"
            value={quiz.closes_at ? quiz.closes_at.slice(0, 16) : ''}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                quiz: {
                  ...current.quiz,
                  closes_at: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                },
              }))
            }
          />
        </label>
      </div>
      <div className="list-row">
        <strong>
          {completeCount} of {questions.length} questions have text ·{' '}
          {totalMarks} total marks
        </strong>
        <select
          aria-label="Add question"
          defaultValue=""
          onChange={addQuestion}
        >
          <option value="">Add question</option>
          <option value="multiple_choice">Multiple choice</option>
          <option value="true_false">True or false</option>
          <option value="short_answer">Short answer</option>
          <option value="code">Code question</option>
        </select>
      </div>
      {questions.map((question, index) => {
        const id = question.questionId;
        const type =
          question.questionType || question.question_type || 'multiple_choice';
        const textValue = question.questionText || question.question_text || '';
        const complete =
          Boolean(textValue) &&
          (type === 'short_answer'
            ? (question.acceptedAnswers || question.accepted_answers || [])
                .length > 0
            : (question.options || []).length >= 2);
        return (
          <article
            className="card quiz-question-card"
            key={id}
            id={`question-${id}`}
          >
            <div className="list-row">
              <button
                className="secondary"
                aria-expanded={Boolean(open[id])}
                onClick={() =>
                  setOpen((current) => ({ ...current, [id]: !current[id] }))
                }
              >
                Question {index + 1}: {complete ? 'Complete' : 'Incomplete'}
              </button>
              <span>
                {Number(question.marks || 0)} marks ·{' '}
                {saved[id] === 'saved'
                  ? 'Saved'
                  : saved[id] === 'saving'
                    ? 'Saving…'
                    : 'Unsaved changes'}
              </span>
              <button
                className="secondary"
                aria-label={`Move question ${index + 1} up`}
                disabled={!index}
                onClick={() => moveQuestion(index, -1)}
              >
                ↑
              </button>
              <button
                className="secondary"
                aria-label={`Move question ${index + 1} down`}
                disabled={index === questions.length - 1}
                onClick={() => moveQuestion(index, 1)}
              >
                ↓
              </button>
              <button
                className="secondary"
                onClick={() => duplicateQuestion(question)}
              >
                Duplicate
              </button>
              <button
                className="secondary"
                onClick={() => deleteQuestion(question)}
              >
                Delete
              </button>
            </div>
            {open[id] && (
              <div className="question-editor-fields">
                <label>
                  Question type
                  <select
                    value={type}
                    onChange={(event) =>
                      updateQuestion(id, { questionType: event.target.value })
                    }
                  >
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="true_false">True or false</option>
                    <option value="short_answer">Short answer</option>
                    <option value="code">Code question</option>
                  </select>
                </label>
                <label>
                  Question text
                  <textarea
                    value={textValue}
                    onChange={(event) =>
                      updateQuestion(id, { questionText: event.target.value })
                    }
                    onBlur={() =>
                      saveQuestion({ ...question, questionText: textValue })
                    }
                  />
                </label>
                <label>
                  Marks
                  <input
                    type="number"
                    min="1"
                    value={question.marks || 1}
                    onChange={(event) =>
                      updateQuestion(id, { marks: Number(event.target.value) })
                    }
                    onBlur={() =>
                      saveQuestion({
                        ...question,
                        marks: Number(question.marks || 1),
                      })
                    }
                  />
                </label>
                {type === 'short_answer' ? (
                  <label>
                    Accepted answer
                    <input
                      value={
                        (question.acceptedAnswers ||
                          question.accepted_answers || [''])[0] || ''
                      }
                      onChange={(event) =>
                        updateQuestion(id, {
                          acceptedAnswers: [event.target.value],
                        })
                      }
                      onBlur={(event) =>
                        saveQuestion({
                          ...question,
                          acceptedAnswers: [event.target.value],
                        })
                      }
                    />
                  </label>
                ) : type !== 'code' ? (
                  <fieldset>
                    <legend>Answer options</legend>
                    {(question.options || []).map((option, optionIndex) => (
                      <div className="list-row" key={optionIndex}>
                        <input
                          aria-label={`Question ${index + 1} option ${optionIndex + 1}`}
                          value={option.optionText || ''}
                          onChange={(event) => {
                            const options = [...(question.options || [])];
                            options[optionIndex] = {
                              ...options[optionIndex],
                              optionText: event.target.value,
                            };
                            updateQuestion(id, { options });
                          }}
                          onBlur={(event) =>
                            saveQuestion({
                              ...question,
                              options: (question.options || []).map(
                                (item, itemIndex) =>
                                  itemIndex === optionIndex
                                    ? {
                                        ...item,
                                        optionText: event.target.value,
                                      }
                                    : item,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="secondary"
                          aria-pressed={Boolean(
                            option.isCorrect ?? option.correct,
                          )}
                          onClick={() =>
                            updateQuestion(id, {
                              options: (question.options || []).map(
                                (item, itemIndex) => ({
                                  ...item,
                                  isCorrect: itemIndex === optionIndex,
                                }),
                              ),
                            })
                          }
                        >
                          {(option.isCorrect ?? option.correct)
                            ? 'Correct'
                            : 'Set correct'}
                        </button>
                      </div>
                    ))}
                  </fieldset>
                ) : (
                  <>
                    <label>
                      Code before
                      <textarea
                        value={
                          question.code_before || question.codeBefore || ''
                        }
                        onChange={(event) =>
                          updateQuestion(id, { codeBefore: event.target.value })
                        }
                        onBlur={(event) =>
                          saveQuestion({
                            ...question,
                            codeBefore: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Code after
                      <textarea
                        value={question.code_after || question.codeAfter || ''}
                        onChange={(event) =>
                          updateQuestion(id, { codeAfter: event.target.value })
                        }
                        onBlur={(event) =>
                          saveQuestion({
                            ...question,
                            codeAfter: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Expected output
                      <textarea
                        value={
                          question.expected_output ||
                          question.expectedOutput ||
                          ''
                        }
                        onChange={(event) =>
                          updateQuestion(id, {
                            expectedOutput: event.target.value,
                          })
                        }
                        onBlur={(event) =>
                          saveQuestion({
                            ...question,
                            expectedOutput: event.target.value,
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <aside
                  className="card quiz-student-preview"
                  aria-label={`Preview question ${index + 1}`}
                >
                  <h3>Preview as a student</h3>
                  <p>{textValue || 'Question text will appear here.'}</p>
                  {type === 'short_answer' ? (
                    <input
                      aria-label={`Preview answer ${index + 1}`}
                      readOnly
                      placeholder="Student answer"
                    />
                  ) : type === 'code' ? (
                    <pre>{question.code_before || 'Code before'}</pre>
                  ) : (
                    (question.options || []).map((option, optionIndex) => (
                      <label key={optionIndex}>
                        <input type="radio" disabled />
                        {option.optionText || `Option ${optionIndex + 1}`}
                      </label>
                    ))
                  )}
                </aside>
              </div>
            )}
          </article>
        );
      })}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      <div className="button-row">
        <button className="secondary" onClick={publishCheck}>
          Run publish checklist
        </button>
        <button className="primary" onClick={publish}>
          Publish quiz
        </button>
      </div>
    </section>
  );
}

export function Quizzes({
  user,
  onTake,
  onPlayInfected,
  onPlayIslandEscape,
  onPlayMemoryMatch,
  onPlayBossBattle,
  onPlayPixelRacer,
  onPlayTimerTrivia,
}) {
  const [creating, setCreating] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState('');
  const modules = useData('/modules');
  const [moduleId, setModuleId] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const quizzes = useData(
    moduleId
      ? `/modules/${moduleId}/quizzes?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`
      : '/modules',
  );
  if (editingQuizId && user?.role === 'lecturer')
    return (
      <QuizEditor quizId={editingQuizId} onDone={() => setEditingQuizId('')} />
    );
  if (creating && user?.role === 'lecturer')
    return (
      <QuizAuthoring
        onDone={(id) => (id ? setEditingQuizId(id) : setCreating(false))}
      />
    );
  return (
    <section className="card">
      <h2>Quizzes</h2>
      {user?.role === 'lecturer' && (
        <button onClick={() => setCreating(true)}>Create quiz</button>
      )}
      <p className="muted">
        Published quizzes are loaded from the API. AI generation progress is
        reported by the job status endpoint.
      </p>
      <select
        value={moduleId}
        onChange={(event) => {
          setModuleId(event.target.value);
          setPage(1);
        }}
      >
        <option value="">Choose a module</option>
        {modules.data.map((module) => (
          <option key={module.module_id} value={module.module_id}>
            {module.module_name}
          </option>
        ))}
      </select>
      {moduleId ? (
        <>
          <label htmlFor="quiz-search">Search quizzes</label>
          <input
            id="quiz-search"
            value={search}
            placeholder="Search by title"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <State state={quizzes} empty="No published quizzes yet." />
          {quizzes.data.map((quiz) => (
            <div className="quiz-entry" key={quiz.quiz_id}>
              <div className="list-row">
                <span>
                  {quiz.title}
                  <small>
                    {quiz.is_competitive
                      ? 'One scored attempt only.'
                      : 'Practice quiz'}
                  </small>
                </span>
                <button
                  className="secondary"
                  onClick={() => onTake(quiz.quiz_id)}
                >
                  Open quiz
                </button>
              </div>
              <QuizGames
                quizId={quiz.quiz_id}
                onPlayInfected={() => onPlayInfected(quiz.quiz_id)}
                onPlayIslandEscape={() => onPlayIslandEscape(quiz.quiz_id)}
                onPlayMemoryMatch={() => onPlayMemoryMatch(quiz.quiz_id)}
                onPlayBossBattle={() => onPlayBossBattle(quiz.quiz_id)}
                onPlayPixelRacer={() => onPlayPixelRacer(quiz.quiz_id)}
                onPlayTimerTrivia={() => onPlayTimerTrivia(quiz.quiz_id)}
              />
            </div>
          ))}
          {quizzes.pagination && quizzes.pagination.pages > 1 ? (
            <div className="list-row pagination" aria-label="Quiz pages">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page {quizzes.pagination.page} of {quizzes.pagination.pages}
              </span>
              <button
                className="secondary"
                disabled={page >= quizzes.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty-state">Choose a module to view quizzes.</p>
      )}
    </section>
  );
}

const gameIcons = {
  infected: '☣',
  island_escape: '⌁',
  memory_match: '▦',
  boss_battle: '◆',
  pixel_racer: '▰',
  timer_trivia: '◷',
};

function GameIcon({ gameKey, label }) {
  return (
    <svg
      className="game-icon"
      viewBox="0 0 80 80"
      role="img"
      aria-label={`${label} icon`}
    >
      <circle cx="40" cy="40" r="34" />
      <path d="M24 48 Q40 22 56 48 Q40 62 24 48Z" />
      <path d="M30 40h20M40 30v20" />
      <text x="40" y="45" textAnchor="middle">
        {gameIcons[gameKey] || '✦'}
      </text>
    </svg>
  );
}

export function GamesPage({ user, onStartGame }) {
  const catalogue = useData('/games/catalogue');
  const inProgress = useData('/games/in-progress');
  const [selectedKey, setSelectedKey] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const picker = useData(
    selectedKey
      ? `/games/quiz-picker?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`
      : '/games/quiz-picker?page=1&pageSize=20&search=',
  );
  const selected = catalogue.data.find((game) => game.key === selectedKey);
  const resumeFor = (key, quizId) =>
    inProgress.data.find(
      (play) => play.game_key === key && play.quiz_id === quizId,
    );
  return (
    <section className="games-page" aria-labelledby="games-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRACTICE ARCADE</span>
          <h2 id="games-heading">Choose a game</h2>
          <p className="muted">
            {user.role === 'lecturer'
              ? 'Read-only preview of the games available in your modules.'
              : 'Pick a format, then choose a quiz from your enrolled modules.'}
          </p>
        </div>
      </div>
      {catalogue.loading && <p className="muted">Loading games…</p>}
      {catalogue.error && <p className="field-error">{catalogue.error}</p>}
      <div className="game-catalogue-grid">
        {catalogue.data.map((game) => {
          const resume = inProgress.data.find(
            (play) => play.game_key === game.key,
          );
          return (
            <article
              className={`card game-catalogue-card ${selectedKey === game.key ? 'selected' : ''}`}
              key={game.key}
            >
              <GameIcon gameKey={game.key} label={game.display_name} />
              <div className="game-card-heading">
                <h3>{game.display_name}</h3>
                {resume && <span className="resume-badge">Resume</span>}
              </div>
              <p>{game.description}</p>
              <div className="tag-row">
                <span>Solo</span>
                <span>Practice only</span>
                <span>Needs {game.minimum_questions} questions</span>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setSelectedKey(game.key);
                  setPage(1);
                }}
              >
                Choose
              </button>
              {resume && user.role === 'student' && (
                <button
                  className="link-button"
                  onClick={() => onStartGame(game.key, resume.quiz_id)}
                >
                  Continue {resume.title}
                </button>
              )}
            </article>
          );
        })}
        <article
          className="card game-catalogue-card coming-soon"
          aria-label="Multiplayer games coming soon"
        >
          <GameIcon gameKey="multiplayer" label="Multiplayer" />
          <h3>Multiplayer rooms</h3>
          <p>Play together with a group in a shared room.</p>
          <div className="tag-row">
            <span>Coming soon</span>
          </div>
          <button className="secondary" disabled>
            Coming soon
          </button>
        </article>
      </div>
      {selected && (
        <section className="card game-picker" aria-labelledby="picker-heading">
          <div className="section-heading compact-heading">
            <div>
              <span className="eyebrow">
                {selected.display_name.toUpperCase()}
              </span>
              <h2 id="picker-heading">Choose a quiz</h2>
            </div>
            <button className="secondary" onClick={() => setSelectedKey('')}>
              Back to games
            </button>
          </div>
          <label htmlFor="game-quiz-search">Search quizzes</label>
          <input
            id="game-quiz-search"
            value={search}
            placeholder="Search by quiz title"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          {picker.loading && <p className="muted">Loading quizzes…</p>}
          {picker.error && <p className="field-error">{picker.error}</p>}
          {!picker.loading && !picker.error && !picker.data.length && (
            <p className="empty-state">No quizzes match your search.</p>
          )}
          <div className="quiz-picker-list">
            {picker.data.map((quiz) => {
              const game = quiz.games.find((item) => item.key === selectedKey);
              const resume = resumeFor(selectedKey, quiz.quiz_id);
              return (
                <article className="quiz-picker-row" key={quiz.quiz_id}>
                  <div>
                    <span className="eyebrow">{quiz.module_name}</span>
                    <h3>{quiz.title}</h3>
                    <p className="muted">
                      {quiz.is_competitive
                        ? 'Competitive · one scored attempt'
                        : 'Practice quiz'}
                    </p>
                  </div>
                  <div className="quiz-picker-status">
                    {resume && <span className="resume-badge">Resume</span>}
                    <span
                      className={
                        game?.available ? 'status-good' : 'status-warning'
                      }
                    >
                      {game?.available ? 'Available' : game?.reason}
                    </span>
                    {user.role === 'student' && game?.available && (
                      <button
                        className="primary"
                        onClick={() => onStartGame(selectedKey, quiz.quiz_id)}
                      >
                        {resume ? 'Continue' : 'Choose quiz'}
                      </button>
                    )}
                    {user.role === 'lecturer' && (
                      <span className="muted">Read-only preview</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {picker.pagination && picker.pagination.pages > 1 && (
            <div className="list-row pagination" aria-label="Game quiz pages">
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page {picker.pagination.page} of {picker.pagination.pages}
              </span>
              <button
                className="secondary"
                disabled={page >= picker.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

export function QuizGames({
  quizId,
  onPlayInfected,
  onPlayIslandEscape,
  onPlayMemoryMatch,
  onPlayBossBattle,
  onPlayPixelRacer,
  onPlayTimerTrivia,
}) {
  const games = useData(quizId ? `/quizzes/${quizId}/games` : '');
  if (games.loading) return <p className="muted">Loading games…</p>;
  if (games.error) return <p className="field-error">{games.error}</p>;
  if (!games.data.length)
    return <p className="empty-state compact">Games coming soon.</p>;
  return (
    <section className="games-area" aria-label="Games">
      <h3>Games</h3>
      {games.data.map((game) => (
        <div className="game-entry" key={game.game_id}>
          <div>
            <b>{game.display_name}</b>
            {!game.available && <small>{game.reason}</small>}
          </div>
          {game.key === 'infected' && game.available && (
            <button className="primary" onClick={onPlayInfected}>
              Play Infected
            </button>
          )}
          {game.key === 'island_escape' && game.available && (
            <button className="primary" onClick={onPlayIslandEscape}>
              Play Island Escape
            </button>
          )}
          {game.key === 'memory_match' && game.available && (
            <button className="primary" onClick={onPlayMemoryMatch}>
              Play Memory Match
            </button>
          )}
          {game.key === 'boss_battle' && game.available && (
            <button className="primary" onClick={onPlayBossBattle}>
              Play Boss Battle
            </button>
          )}
          {game.key === 'pixel_racer' && game.available && (
            <button className="primary" onClick={onPlayPixelRacer}>
              Play Pixel Car Racer
            </button>
          )}
          {game.key === 'timer_trivia' && game.available && (
            <button className="primary" onClick={onPlayTimerTrivia}>
              Play Timer Trivia
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function BossCharacter({ hp }) {
  const damageState = hp > 75 ? 0 : hp > 50 ? 1 : hp > 25 ? 2 : 3;
  const labels = ['Unhurt', 'Bruised', 'Cracked', 'Critical'];
  return (
    <figure className={`boss-character damage-${damageState}`}>
      <svg
        viewBox="0 0 260 210"
        role="img"
        aria-label={`Boss condition: ${labels[damageState]}`}
      >
        <path
          className="boss-shadow"
          d="M52 188 Q130 215 208 188 Q170 169 130 174 Q90 169 52 188Z"
        />
        <path
          className="boss-horn"
          d="M72 68 Q31 28 51 92 L86 103ZM188 68 Q229 28 209 92 L174 103Z"
        />
        <path
          className="boss-body"
          d="M51 119 Q52 58 130 50 Q208 58 209 119 L195 179 Q130 202 65 179Z"
        />
        <path className="boss-brow" d="M78 103 L111 113 M182 103 L149 113" />
        <circle className="boss-eye" cx="96" cy="120" r="8" />
        <circle className="boss-eye" cx="164" cy="120" r="8" />
        <path className="boss-mouth" d="M99 157 Q130 135 161 157" />
        {damageState >= 1 && (
          <path className="boss-crack" d="M116 69 L106 89 L120 100 L110 120" />
        )}
        {damageState >= 2 && (
          <path
            className="boss-crack"
            d="M181 134 L164 143 L173 158 L153 174"
          />
        )}
        {damageState >= 3 && (
          <>
            <path className="boss-crack" d="M72 126 L90 139 L78 157 L99 177" />
            <path className="boss-bandage" d="M136 75 L166 88" />
          </>
        )}
      </svg>
      <figcaption>{labels[damageState]} boss</figcaption>
    </figure>
  );
}

export function BossBattleGame({ quizId, onBack }) {
  const [battle, setBattle] = useState(null);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelected('');
    try {
      const body = await api('/games/boss-battle/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setBattle(body.data);
    } catch (reason) {
      setBattle(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const answer = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/boss-battle/plays/${battle.play.playId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId: selected }),
        },
      );
      setBattle({
        play: body.data.play,
        question: body.data.question,
        outcome: body.data.outcome,
      });
      setFeedback(body.data);
      setSelected('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Summoning the boss…</p>;
  if (error && !battle)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const terminal = battle.play.status !== 'in_progress';
  const terminalCopy = {
    won: ['Boss defeated', 'You brought the boss down.'],
    lost: ['The boss prevailed', 'Your team ran out of health.'],
    exhausted: [
      'Questions exhausted',
      'The battle ended before either side fell.',
    ],
  };

  return (
    <section className="boss-game">
      <div className="boss-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>BOSS BATTLE</h2>
        <span>Score {battle.play.score}</span>
      </div>
      <div className="boss-arena">
        <div className="boss-health" aria-label="Boss health">
          <div className="health-copy">
            <strong>Boss HP</strong>
            <span>{battle.play.bossHp}%</span>
          </div>
          <div
            className="health-track boss-hp-track"
            role="progressbar"
            aria-label="Boss HP"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={battle.play.bossHp}
          >
            <span style={{ width: `${battle.play.bossHp}%` }} />
          </div>
        </div>
        <BossCharacter hp={battle.play.bossHp} />
        <div className="player-health" aria-label="Player health">
          <div className="health-copy">
            <strong>Player HP</strong>
            <span>{battle.play.playerHp}%</span>
          </div>
          <div
            className="health-track player-hp-track"
            role="progressbar"
            aria-label="Player HP"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={battle.play.playerHp}
          >
            <span style={{ width: `${battle.play.playerHp}%` }} />
          </div>
        </div>
      </div>

      {feedback ? (
        <section
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
          aria-atomic="true"
        >
          <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            {feedback.damageDealt > 0
              ? `Boss damage: ${feedback.damageDealt}.`
              : `Player damage: ${feedback.damageTaken}.`}
          </p>
          <p>
            Correct answer: <strong>{feedback.correctOption.optionText}</strong>
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={() => setFeedback(null)}>
            Continue
          </button>
        </section>
      ) : terminal ? (
        <section
          className={`terminal-screen ${battle.play.status}`}
          aria-live="polite"
        >
          <h3>{terminalCopy[battle.play.status][0]}</h3>
          <p>{terminalCopy[battle.play.status][1]}</p>
          <p>
            Final score {battle.play.score} · Boss HP {battle.play.bossHp}% ·
            Player HP {battle.play.playerHp}%
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </section>
      ) : (
        <form className="boss-question" onSubmit={answer}>
          <span className={`difficulty ${battle.question.difficulty}`}>
            {battle.question.difficulty} · Level{' '}
            {battle.question.difficultyLevel}
          </span>
          <p className="eyebrow">{battle.question.topic}</p>
          <h3>{battle.question.questionText}</h3>
          <div className="option-list">
            {battle.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="boss-option"
                  value={option.optionId}
                  checked={selected === option.optionId}
                  onChange={() => setSelected(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </div>
          <button className="primary" disabled={!selected || busy}>
            {busy ? 'Applying answer…' : 'Submit answer'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function PixelCar({ label, distance, player = false }) {
  const lanePosition = Math.min(92, Math.max(4, (distance / 500) * 88));
  return (
    <div className="pixel-lane" aria-label={`${label}: ${distance} distance`}>
      <span className="pixel-lane-label">{label}</span>
      <span
        className={`pixel-car ${player ? 'player-car' : 'bot-car'}`}
        style={{ left: `${lanePosition}%` }}
        role="img"
        aria-label={`${label} car at ${distance}`}
      >
        <i />
        <b />
        <em />
      </span>
      <span className="finish-line" aria-hidden="true" />
    </div>
  );
}

export function PixelRacerGame({ quizId, onBack }) {
  const [race, setRace] = useState(null);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelected('');
    try {
      const body = await api('/games/pixel-racer/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setRace(body.data);
    } catch (reason) {
      setRace(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const answer = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/pixel-racer/plays/${race.play.playId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId: selected }),
        },
      );
      setRace({
        play: body.data.play,
        question: body.data.question,
        outcome: body.data.outcome,
      });
      setFeedback(body.data);
      setSelected('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Starting the engines…</p>;
  if (error && !race)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const terminal = race.play.status === 'finished';
  const resultTitle =
    race.outcome?.winner === 'player'
      ? 'You won the race!'
      : race.outcome?.winner === 'bot'
        ? 'Bot wins this race'
        : 'Photo finish — shared result';

  return (
    <section className="pixel-racer-game">
      <div className="pixel-racer-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>PIXEL CAR RACER</h2>
        <span>Points {race.play.points}</span>
      </div>

      <div className="pixel-track" aria-label="Race positions">
        <PixelCar label="You" distance={race.play.distance} player={true} />
        <PixelCar label="Bot" distance={race.play.bot.distance} />
      </div>

      <div className="pixel-racer-stats" aria-label="Race statistics">
        <span>Speed {race.play.speed} of 5</span>
        <span>Streak {race.play.streak}</span>
        <span>
          Question slots {race.play.slotsUsed} of 10 · Answers{' '}
          {race.play.answersUsed}
        </span>
        <strong className={race.play.nitroActive ? 'nitro-active' : ''}>
          {race.play.nitroActive
            ? 'NITRO ACTIVE, answers worth double'
            : 'Nitro inactive'}
        </strong>
      </div>

      {feedback ? (
        <section
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
          aria-atomic="true"
        >
          <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            Distance gained: {feedback.distanceGained} · Points earned:{' '}
            {feedback.pointsEarned} · Slots used: {feedback.slotsConsumed}
          </p>
          <p>
            Correct answer: <strong>{feedback.correctOption.optionText}</strong>
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={() => setFeedback(null)}>
            Continue
          </button>
        </section>
      ) : terminal ? (
        <section className="pixel-racer-result" aria-live="polite">
          <div className="pixel-trophy" aria-hidden="true">
            ★
          </div>
          <h3>{resultTitle}</h3>
          <p>
            You: {race.outcome.playerDistance} distance ·{' '}
            {race.outcome.playerPoints} points
          </p>
          <p>
            Bot: {race.outcome.botDistance} distance · {race.outcome.botPoints}{' '}
            points
          </p>
          <p>Answers used: {race.outcome.answersUsed}</p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Race again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </section>
      ) : (
        <form className="pixel-racer-question" onSubmit={answer}>
          <p className="eyebrow">{race.question.topic}</p>
          <h3>{race.question.questionText}</h3>
          <div className="option-list">
            {race.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="pixel-option"
                  value={option.optionId}
                  checked={selected === option.optionId}
                  onChange={() => setSelected(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </div>
          <button className="primary" disabled={!selected || busy}>
            {busy ? 'Racing…' : 'Submit answer'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

export function TimerTriviaGame({ quizId, onBack }) {
  const [play, setPlay] = useState(null);
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [countdownAnnouncement, setCountdownAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previousRemainingRef = useRef(null);

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelected('');
    try {
      const body = await api('/games/timer-trivia/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setPlay(body.data);
    } catch (reason) {
      setPlay(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (quizId) start();
  }, [quizId]);
  useEffect(() => {
    const deadlineAt = play?.play.deadlineAt;
    const playId = play?.play.playId;
    if (!deadlineAt || !playId) {
      previousRemainingRef.current = null;
      setCountdownAnnouncement('');
      return undefined;
    }
    const storageKey = `eduquest:timer-trivia:announcements:${playId}:${deadlineAt}`;
    let seen = new Set();
    try {
      seen = new Set(
        JSON.parse(window.localStorage.getItem(storageKey) || '[]'),
      );
    } catch {
      seen = new Set();
    }
    const persist = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...seen]));
      } catch {
        // Announcement persistence is best effort when storage is unavailable.
      }
    };
    const update = () => {
      const remainingMs = Date.parse(deadlineAt) - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      const previousRemaining = previousRemainingRef.current;
      setSeconds(remainingSeconds);
      for (const threshold of [10, 5]) {
        if (
          remainingMs >= 0 &&
          previousRemaining !== null &&
          previousRemaining > threshold * 1000 &&
          remainingMs <= threshold * 1000 &&
          !seen.has(threshold)
        ) {
          seen.add(threshold);
          persist();
          setCountdownAnnouncement(`${threshold} seconds remaining`);
        } else if (remainingMs < threshold * 1000 && !seen.has(threshold)) {
          seen.add(threshold);
          persist();
        }
      }
      previousRemainingRef.current = remainingMs;
    };
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [play?.play.deadlineAt]);

  const choose = async (cell) => {
    if (busy || cell.disabled || play.play.activeCellId) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/timer-trivia/plays/${play.play.playId}/choose`,
        { method: 'POST', body: JSON.stringify({ cellId: cell.cellId }) },
      );
      setPlay(body.data);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const answer = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/timer-trivia/plays/${play.play.playId}/answer`,
        { method: 'POST', body: JSON.stringify({ optionId: selected }) },
      );
      setPlay(body.data);
      setFeedback(body.data);
      setSelected('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Loading the trivia board…</p>;
  if (error && !play)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );
  const terminal = play.play.status === 'finished';
  return (
    <section className="timer-trivia-game">
      <div className="timer-trivia-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>TIMER TRIVIA</h2>
        <span>Score {play.play.score}</span>
      </div>
      <div className="timer-trivia-meta" aria-label="Trivia status">
        <span>Round {play.play.roundsCompleted + 1} of 10</span>
        {play.play.deadlineAt && <strong>Time remaining: {seconds}s</strong>}
        {play.play.extendedTime && <span>Extended time enabled</span>}
      </div>
      <p
        className="timer-trivia-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {countdownAnnouncement}
      </p>
      {feedback ? (
        <section
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
        >
          <h3>
            {feedback.timedOut
              ? 'Time is up'
              : feedback.isCorrect
                ? 'Correct'
                : 'Incorrect'}
          </h3>
          <p>Points earned: {feedback.pointsEarned}</p>
          <p>
            Correct answer: <strong>{feedback.correctOption.optionText}</strong>
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={() => setFeedback(null)}>
            Continue
          </button>
        </section>
      ) : terminal ? (
        <section className="timer-trivia-result" aria-live="polite">
          <div className="trivia-trophy" aria-hidden="true">
            ✦
          </div>
          <h3>Board complete</h3>
          <p>
            Final score: {play.play.score} points across{' '}
            {play.play.roundsCompleted} rounds.
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </section>
      ) : play.question ? (
        <form className="timer-trivia-question" onSubmit={answer}>
          <p className="eyebrow">
            {play.question.topic} · Level {play.question.difficultyLevel}
          </p>
          <h3>{play.question.questionText}</h3>
          <div className="option-list">
            {play.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="timer-option"
                  value={option.optionId}
                  checked={selected === option.optionId}
                  onChange={() => setSelected(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </div>
          <button className="primary" disabled={!selected || busy}>
            {busy ? 'Checking…' : 'Submit answer'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <section className="timer-board" aria-label="Timer Trivia board">
          <p className="muted">
            Choose an open topic and point value. Each cell can be used once.
          </p>
          <div className="trivia-board">
            {play.play.board.map((cell) => (
              <button
                key={cell.cellId}
                className={`trivia-cell ${cell.disabled ? 'disabled' : ''}`}
                disabled={cell.disabled || busy}
                onClick={() => choose(cell)}
                aria-label={`${cell.topic}, ${cell.points} points${cell.disabled ? ', used' : ''}`}
              >
                <span>{cell.topic}</span>
                <strong>{cell.points}</strong>
              </button>
            ))}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </section>
  );
}

export function MemoryMatchGame({ quizId, onBack }) {
  const [play, setPlay] = useState(null);
  const [hiddenMismatch, setHiddenMismatch] = useState(() => new Set());
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mismatchTimer = useRef(null);

  const start = async () => {
    if (mismatchTimer.current) clearTimeout(mismatchTimer.current);
    setLoading(true);
    setError('');
    setAnnouncement('');
    setHiddenMismatch(new Set());
    try {
      const body = await api('/games/memory-match/plays', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      setPlay(body.data);
    } catch (reason) {
      setPlay(null);
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
    return () => {
      if (mismatchTimer.current) clearTimeout(mismatchTimer.current);
    };
  }, [quizId]);

  const flip = async (card) => {
    if (busy || card.matched) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(`/games/memory-match/plays/${play.playId}/flip`, {
        method: 'POST',
        body: JSON.stringify({ cardId: card.cardId }),
      });
      const next = body.data;
      setHiddenMismatch(new Set());
      setPlay(next);
      if (next.status === 'finished') {
        setAnnouncement(
          `All pairs matched. Final score ${next.score} in ${next.moves} moves.`,
        );
        setBusy(false);
      } else if (next.matched === true) {
        setAnnouncement(
          `Match found. ${next.matchedPairs} pairs found. Score ${next.score}.`,
        );
        setBusy(false);
      } else if (next.matched === false) {
        setAnnouncement('Not a match. The cards will turn face down.');
        const mismatchIds = next.cards
          .filter((item) => item.faceUp && !item.matched)
          .map((item) => item.cardId);
        const reducedMotion =
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
          false;
        mismatchTimer.current = setTimeout(
          () => {
            setHiddenMismatch(new Set(mismatchIds));
            setBusy(false);
          },
          reducedMotion ? 0 : 1000,
        );
      } else {
        setAnnouncement(`${card.kind} card revealed.`);
        setBusy(false);
      }
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Shuffling the cards…</p>;
  if (error && !play)
    return (
      <section className="card game-error">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const revealed = new Map(
    (play.revealed || []).map((card) => [card.cardId, card]),
  );
  if (play.status === 'finished')
    return (
      <section className="memory-game">
        <div className="memory-topbar">
          <button className="link-button" onClick={onBack}>
            ← Back
          </button>
          <h2>MEMORY MATCH</h2>
          <span>Complete</span>
        </div>
        <div className="memory-finished" aria-live="polite">
          <span className="memory-finished-mark" aria-hidden="true">
            ✓
          </span>
          <h3>Every pair matched</h3>
          <p>
            Final score {play.score} · {play.moves} moves · {play.matchedPairs}{' '}
            pairs found
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </div>
      </section>
    );

  return (
    <section className="memory-game">
      <div className="memory-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back
        </button>
        <h2>MEMORY MATCH</h2>
        <div className="memory-stats" aria-label="Game statistics">
          <span>Score {play.score}</span>
          <span>Moves {play.moves}</span>
          <span>Pairs found {play.matchedPairs}</span>
        </div>
      </div>
      <p className="memory-instructions">
        Match each question card with its correct answer card.
      </p>
      <div className="memory-grid" aria-label="Memory Match cards">
        {play.cards.map((card, index) => {
          const visible =
            (card.faceUp || card.matched) && !hiddenMismatch.has(card.cardId);
          const content = revealed.get(card.cardId);
          return (
            <button
              type="button"
              key={card.cardId}
              className={`memory-card memory-${card.kind} ${visible ? 'is-face-up' : ''} ${card.matched ? 'is-matched' : ''}`}
              disabled={busy || card.matched || (visible && !card.matched)}
              onClick={() => flip(card)}
              aria-label={
                card.matched
                  ? `Matched ${card.kind} card ${index + 1}: ${content?.text}`
                  : visible
                    ? `Face-up ${card.kind} card ${index + 1}: ${content?.text}`
                    : `Flip ${card.kind} card ${index + 1}`
              }
            >
              <span className="memory-card-inner">
                <span className="memory-card-back" aria-hidden={visible}>
                  <span className="memory-card-symbol">
                    {card.kind === 'question' ? '?' : 'A'}
                  </span>
                  <small>
                    {card.kind === 'question' ? 'Question' : 'Answer'}
                  </small>
                </span>
                {visible && content && (
                  <span className="memory-card-front">
                    <small>
                      {card.kind === 'question' ? 'Question' : 'Answer'}
                    </small>
                    <b>{content.text}</b>
                    {card.matched && <em>Matched</em>}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </p>
      {error && (
        <p className="field-error memory-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const difficultyMeta = {
  easy: { icon: '●', label: 'Easy' },
  medium: { icon: '◆', label: 'Medium' },
  hard: { icon: '▲', label: 'Hard' },
};

function InfectedCharacter({ cure }) {
  const band = Math.min(4, Math.floor(cure / 20));
  const colours = ['#B3261E', '#C77700', '#F2A93B', '#688A62', '#2F8F5B'];
  const expressions = [
    'M34 66 Q50 52 66 66',
    'M34 64 Q50 56 66 64',
    'M34 62 L66 62',
    'M34 60 Q50 70 66 60',
    'M32 58 Q50 75 68 58',
  ];
  return (
    <svg
      className="infected-character"
      viewBox="0 0 100 120"
      role="img"
      aria-label={`Character health state ${band + 1} of 5`}
    >
      <circle cx="50" cy="50" r="38" fill={colours[band]} opacity="0.18" />
      <path
        d="M28 44 Q50 10 72 44 L68 84 Q50 103 32 84 Z"
        fill={colours[band]}
      />
      <circle cx="40" cy="50" r="4" fill="#14213D" />
      <circle cx="60" cy="50" r="4" fill="#14213D" />
      <path
        d={expressions[band]}
        fill="none"
        stroke="#14213D"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M31 34 L23 23 M69 34 L77 23"
        stroke={colours[band]}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InfectedGame({ quizId, onBack }) {
  const [state, setState] = useState(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelectedOption('');
    try {
      setState(
        await api('/games/infected/sessions', {
          method: 'POST',
          body: JSON.stringify({ quizId }),
        }),
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const choose = async (cardId) => {
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/infected/sessions/${state.session.sessionId}/choose`,
        { method: 'POST', body: JSON.stringify({ cardId }) },
      );
      setState((current) => ({ ...current, question: body.question }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const answer = async () => {
    if (!selectedOption) return;
    setBusy(true);
    setError('');
    try {
      const body = await api(
        `/games/infected/sessions/${state.session.sessionId}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId: selectedOption }),
        },
      );
      setFeedback(body);
      setState((current) => ({ ...current, session: body.session }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const continueGame = () => {
    setState((current) => ({
      ...current,
      cards: feedback.cards,
      question: null,
    }));
    setFeedback(null);
    setSelectedOption('');
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Preparing Infected…</p>;
  if (error && !state)
    return (
      <section className="card game-error">
        <p className="field-error">{error}</p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );
  const session = feedback?.session || state.session;
  const terminal = ['won', 'lost', 'exhausted'].includes(session.status);
  return (
    <section className="infected-game">
      <div className="infected-topbar">
        <button
          className="link-button"
          onClick={onBack}
          aria-label="Back to quiz"
        >
          ← Back
        </button>
        <h2>INFECTED</h2>
        <div className="game-stats">
          <span aria-label={`${session.hearts} of 3 hearts`}>
            {'♥'.repeat(session.hearts)}
            {'♡'.repeat(3 - session.hearts)} {session.hearts} of 3 hearts
          </span>
          <b>Score {session.score}</b>
        </div>
      </div>
      <div className="infected-stage">
        <InfectedCharacter cure={session.cure} />
        <div className="cure-copy">
          Cure {session.cure}% · Infection {100 - session.cure}%
        </div>
        <div
          className="cure-track"
          role="progressbar"
          aria-label="Cure progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={session.cure}
        >
          <span style={{ width: `${session.cure}%` }} />
        </div>
      </div>

      {terminal ? (
        <div className={`terminal-screen ${session.status}`} aria-live="polite">
          <h3>
            {session.status === 'won'
              ? 'Cure complete — you win!'
              : session.status === 'lost'
                ? 'No hearts left'
                : 'Questions exhausted'}
          </h3>
          <p>
            Final cure: {session.cure}% · Final score: {session.score}
          </p>
          <div className="terminal-actions">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button className="secondary" onClick={onBack}>
              Back to quiz
            </button>
          </div>
        </div>
      ) : feedback ? (
        <div
          className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
          aria-live="assertive"
        >
          <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            <b>Correct answer:</b> {feedback.correctOption.optionText}
          </p>
          <p>{feedback.explanation}</p>
          <button className="primary" onClick={continueGame}>
            Continue
          </button>
        </div>
      ) : state.question ? (
        <div className="infected-question">
          <span className={`difficulty ${state.question.difficulty}`}>
            {difficultyMeta[state.question.difficulty].icon}{' '}
            {difficultyMeta[state.question.difficulty].label}
          </span>
          <h3>{state.question.questionText}</h3>
          <fieldset>
            <legend>Choose one answer</legend>
            {state.question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name="infected-answer"
                  value={option.optionId}
                  checked={selectedOption === option.optionId}
                  onChange={() => setSelectedOption(option.optionId)}
                />
                {option.optionText}
              </label>
            ))}
          </fieldset>
          <button
            className="primary"
            disabled={!selectedOption || busy}
            onClick={answer}
          >
            Submit answer
          </button>
        </div>
      ) : state.cards?.length ? (
        <div className="infected-cards" aria-label="Choose a question card">
          {state.cards.map((card) => (
            <button
              key={card.cardId}
              className={`infected-card ${card.difficulty}`}
              disabled={busy}
              onClick={() => choose(card.cardId)}
              aria-label={`${card.difficulty} card about ${card.topic}, plus ${card.reward} or minus ${card.penalty}`}
            >
              <span className="card-icon" aria-hidden="true">
                {difficultyMeta[card.difficulty].icon}
              </span>
              <b>{difficultyMeta[card.difficulty].label}</b>
              <span>{card.topic}</span>
              <strong>
                +{card.reward} / −{card.penalty}
              </strong>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-state">No cards are available.</p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const islandSetbacks = {
  tools_lost: {
    title: 'Your tools were lost',
    text: 'Phase 1 restarts and the materials from this attempt are gone.',
  },
  boat_broken: {
    title: 'The boat broke',
    text: 'Phase 2 restarts. Your gathered materials are safe.',
  },
  sharks: {
    title: 'Sharks damaged the boat',
    text: 'Return to Phase 2 and rebuild. Your Phase 1 materials are safe.',
  },
};

function IslandScene({ play }) {
  const progress =
    play.phase === 1
      ? play.materials.length
      : play.phase === 2
        ? play.boatParts.length
        : play.sailProgress;
  const boatX = 82 + Math.min(10, progress) * 14;
  return (
    <svg
      className="island-scene"
      viewBox="0 0 260 150"
      role="img"
      aria-label={`${play.phaseName}; ${progress} progress items collected`}
    >
      <rect width="260" height="150" rx="18" fill="#dcecf4" />
      <circle cx="218" cy="30" r="15" fill="#f2a93b" />
      <path d="M0 105 Q65 88 130 105 T260 105 V150 H0Z" fill="#4d91b8" />
      <path d="M0 112 Q48 87 92 110 L74 128 H0Z" fill="#d8bd72" />
      <path d="M26 104 Q40 62 48 36" stroke="#795b38" strokeWidth="6" />
      <path d="M47 39 Q17 29 12 49 Q35 48 47 39" fill="#2f8f5b" />
      <path d="M47 39 Q76 22 87 42 Q62 48 47 39" fill="#2f8f5b" />
      {play.phase >= 2 && (
        <g transform={`translate(${boatX} 84)`}>
          <path d="M0 30 L50 30 L41 45 L10 45Z" fill="#9b633d" />
          <path d="M25 30 V0" stroke="#5f402a" strokeWidth="4" />
          <path d="M28 2 L28 25 L49 25Z" fill="#f6f4ef" />
        </g>
      )}
      <path d="M226 92 Q242 70 258 92 V112 H226Z" fill="#7ea36f" />
      <text x="205" y="130" fill="#14213d" fontSize="10">
        MAINLAND
      </text>
    </svg>
  );
}

export function IslandEscapeGame({ quizId, onBack }) {
  const [state, setState] = useState(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setFeedback(null);
    setSelectedOption('');
    try {
      setState(
        await api('/games/island-escape/plays', {
          method: 'POST',
          body: JSON.stringify({ quizId }),
        }),
      );
    } catch (reason) {
      setError(reason.message);
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quizId) start();
  }, [quizId]);

  const answer = async () => {
    if (!selectedOption || busy) return;
    setBusy(true);
    setError('');
    try {
      setFeedback(
        await api(`/games/island-escape/plays/${state.play.playId}/answer`, {
          method: 'POST',
          body: JSON.stringify({ optionId: selectedOption }),
        }),
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const continueGame = () => {
    setState({
      play: feedback.play,
      question: feedback.question,
      personalBest: feedback.personalBest,
    });
    setFeedback(null);
    setSelectedOption('');
  };

  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (loading) return <p className="center-state">Preparing your escape…</p>;
  if (!state)
    return (
      <section className="card game-error">
        <p className="field-error">{error}</p>
        <button className="secondary" onClick={onBack}>
          Back to quiz
        </button>
      </section>
    );

  const play = feedback?.play || state.play;
  const terminal = ['won', 'lost', 'exhausted'].includes(play.status);
  const setback = feedback && islandSetbacks[feedback.event];
  return (
    <section className="island-game">
      <div className="island-topbar">
        <button className="link-button" onClick={onBack}>
          ← Back to quiz
        </button>
        <div>
          <span className="eyebrow">SOLO ADVENTURE</span>
          <h2>Island Escape</h2>
        </div>
        <b>Score {play.score}</b>
      </div>

      <div className="island-layout">
        <div className="island-visual">
          <IslandScene play={play} />
          <div className="phase-strip" aria-label="Escape phases">
            {[1, 2, 3].map((phase) => (
              <span
                key={phase}
                className={phase === play.phase ? 'active' : ''}
                aria-current={phase === play.phase ? 'step' : undefined}
              >
                {phase}. {['Gather', 'Build', 'Sail'][phase - 1]}
              </span>
            ))}
          </div>
          <p className="phase-copy">
            Phase {play.phase} of 3 · Question{' '}
            {Math.min(10, play.phaseQuestionNumber + 1)} of 10
          </p>
          <div className="island-stats">
            <span>
              Wrong answers {play.wrongInPhase} of 5{' '}
              <span aria-hidden="true">
                {'●'.repeat(play.wrongInPhase)}
                {'○'.repeat(5 - play.wrongInPhase)}
              </span>
            </span>
            <span>Streak {play.streak}</span>
            <span>Retries remaining {play.retriesRemaining}</span>
          </div>
          {play.doubleActive && (
            <strong className="double-active">DOUBLE POINTS ACTIVE</strong>
          )}
          <div className="island-inventory">
            <span>Materials: {play.materials.join(', ') || 'None yet'}</span>
            <span>Boat parts: {play.boatParts.join(', ') || 'None yet'}</span>
            <span>Sailing progress: {play.sailProgress} steps</span>
          </div>
        </div>

        {feedback ? (
          <div
            className={`feedback-panel ${feedback.isCorrect ? 'correct' : 'incorrect'}`}
            aria-live="assertive"
          >
            <h3>{feedback.isCorrect ? 'Correct' : 'Incorrect'}</h3>
            <p>
              <b>Correct answer:</b> {feedback.correctOption.optionText}
            </p>
            <p>{feedback.explanation}</p>
            <p>
              Points earned: {feedback.pointsEarned}. Score: {play.score}.
            </p>
            {setback && (
              <div className="setback-callout">
                <h3>{setback.title}</h3>
                <p>{setback.text}</p>
                <p>{play.retriesRemaining} retries remain.</p>
              </div>
            )}
            <button className="primary" onClick={continueGame}>
              Continue
            </button>
          </div>
        ) : terminal ? (
          <div className={`terminal-screen ${play.status}`} aria-live="polite">
            <h3>
              {play.status === 'won'
                ? 'You reached the mainland'
                : play.status === 'lost'
                  ? 'Stranded'
                  : 'No more questions are available'}
            </h3>
            <p>
              Final score: {play.score} · Personal best:{' '}
              {state.personalBest ?? play.score}
            </p>
            <div className="terminal-actions">
              <button className="primary" onClick={start}>
                Play again
              </button>
              <button className="secondary" onClick={onBack}>
                Back to quiz
              </button>
            </div>
          </div>
        ) : state.question ? (
          <div className="island-question">
            <span className={`difficulty ${state.question.difficulty}`}>
              Level {state.question.difficultyLevel} ·{' '}
              {state.question.difficulty}
            </span>
            <small>{state.question.topic}</small>
            <h3>{state.question.questionText}</h3>
            <fieldset>
              <legend>Choose one answer</legend>
              {state.question.options.map((option) => (
                <label key={option.optionId}>
                  <input
                    type="radio"
                    name="island-answer"
                    checked={selectedOption === option.optionId}
                    onChange={() => setSelectedOption(option.optionId)}
                  />
                  {option.optionText}
                </label>
              ))}
            </fieldset>
            <button
              className="primary"
              disabled={!selectedOption || busy}
              onClick={answer}
            >
              Submit answer
            </button>
          </div>
        ) : (
          <p className="empty-state">No Island Escape question is ready.</p>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function ProfilePage({ user, onUserChange }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [passwords, setPasswords] = useState({
    password: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [email, setEmail] = useState({ password: '', email: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mfaMessage, setMfaMessage] = useState('');
  const [mfaFactor, setMfaFactor] = useState({ password: '', code: '' });
  const dirty = form && JSON.stringify(form) !== JSON.stringify(data?.profile);
  useEffect(() => {
    api('/me/profile')
      .then((body) => {
        setData(body);
        setForm({
          ...body.profile,
          preferredLanguages: body.profile.preferred_languages || [],
        });
      })
      .catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (!data || !form) return <p className="muted">Loading your profile…</p>;
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submitProfile = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const body = await api('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: form.first_name,
          lastName: form.last_name || null,
          ...(user.role === 'student'
            ? {
                studentType: form.student_type,
                studentYear: form.student_year,
              }
            : {}),
          preferredLanguages: form.preferredLanguages,
        }),
      });
      setData({ ...data, profile: body.profile });
      setForm({
        ...body.profile,
        preferredLanguages: body.profile.preferred_languages || [],
      });
      onUserChange({ ...user, ...body.profile });
      setMessage(body.message);
    } catch (reason) {
      setError(reason.message);
    }
  };
  const submitPassword = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const body = await api('/me/password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      });
      setMessage(body.message);
      setPasswords({ password: '', newPassword: '', confirmPassword: '' });
    } catch (reason) {
      setError(reason.message);
    }
  };
  const submitEmail = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const body = await api('/me/email', {
        method: 'POST',
        body: JSON.stringify(email),
      });
      setMessage(body.message);
      setEmail({ password: '', email: '' });
    } catch (reason) {
      setError(reason.message);
    }
  };
  const enrolMfa = async () => {
    try {
      const body = await api('/mfa/enrol', { method: 'POST', body: '{}' });
      setMfaMessage(`Setup key: ${body.setupKey}`);
    } catch (reason) {
      setError(reason.message);
    }
  };
  const mfaAction = async (path) => {
    try {
      const body = await api(path, {
        method: 'POST',
        body: JSON.stringify(mfaFactor),
      });
      setMfaMessage(
        body.recoveryCodes
          ? `Recovery codes: ${body.recoveryCodes.join(', ')}`
          : body.message || 'MFA updated.',
      );
      if (path === '/mfa/disable')
        setData((current) => ({
          ...current,
          profile: { ...current.profile, mfa_enabled: false },
        }));
      setMfaFactor({ password: '', code: '' });
    } catch (reason) {
      setError(reason.message);
    }
  };
  return (
    <section className="profile-grid">
      <form className="card" onSubmit={submitProfile}>
        <span className="eyebrow">ACCOUNT</span>
        <h2>Edit profile</h2>
        {dirty && (
          <p className="warning" role="status">
            You have unsaved changes.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        <label>
          First name
          <input
            value={form.first_name || ''}
            onChange={(e) => update('first_name', e.target.value)}
          />
        </label>
        <label>
          Last name
          <input
            value={form.last_name || ''}
            onChange={(e) => update('last_name', e.target.value)}
          />
        </label>
        {user.role === 'student' && (
          <label>
            Student type
            <select
              value={form.student_type || 'it'}
              onChange={(e) => update('student_type', e.target.value)}
            >
              <option value="it">IT</option>
              <option value="business">Business</option>
            </select>
          </label>
        )}
        <fieldset>
          <legend>Preferred languages</legend>
          <div className="language-grid">
            {data.languages.map((language) => (
              <label key={language}>
                <input
                  type="checkbox"
                  checked={form.preferredLanguages.includes(language)}
                  onChange={(e) =>
                    update(
                      'preferredLanguages',
                      e.target.checked
                        ? [...form.preferredLanguages, language]
                        : form.preferredLanguages.filter(
                            (item) => item !== language,
                          ),
                    )
                  }
                />
                {language}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary" type="submit">
          Save profile
        </button>
      </form>
      <div className="profile-stack">
        <form className="card" onSubmit={submitEmail}>
          <h2>Change email</h2>
          <p className="muted">
            Your current email stays active until the new address is verified.
          </p>
          <label>
            New email
            <input
              type="email"
              value={email.email}
              onChange={(e) => setEmail({ ...email, email: e.target.value })}
              required
            />
          </label>
          <label>
            Current password
            <input
              type="password"
              value={email.password}
              onChange={(e) => setEmail({ ...email, password: e.target.value })}
              required
            />
          </label>
          <button className="secondary" type="submit">
            Send verification
          </button>
        </form>
        <form className="card" onSubmit={submitPassword}>
          <h2>Change password</h2>
          <label>
            Current password
            <input
              type="password"
              value={passwords.password}
              onChange={(e) =>
                setPasswords({ ...passwords, password: e.target.value })
              }
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={passwords.newPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, newPassword: e.target.value })
              }
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={passwords.confirmPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, confirmPassword: e.target.value })
              }
              required
            />
          </label>
          <p className="muted">
            Use 10+ characters with uppercase, lowercase, number and special
            character.
          </p>
          <button className="secondary" type="submit">
            Change password
          </button>
        </form>
        <section className="card">
          <h2>Multi-factor authentication</h2>
          <p>
            {data.profile.mfa_enabled
              ? 'MFA is enabled.'
              : 'MFA is not enabled.'}
          </p>
          {mfaMessage && <p className="success">{mfaMessage}</p>}
          {!data.profile.mfa_enabled && (
            <button className="secondary" onClick={enrolMfa}>
              Enrol MFA
            </button>
          )}
          {data.profile.mfa_enabled && (
            <>
              <label>
                MFA password
                <input
                  type="password"
                  value={mfaFactor.password}
                  onChange={(e) =>
                    setMfaFactor({ ...mfaFactor, password: e.target.value })
                  }
                />
              </label>
              <label>
                Authenticator or recovery code
                <input
                  value={mfaFactor.code}
                  onChange={(e) =>
                    setMfaFactor({ ...mfaFactor, code: e.target.value })
                  }
                />
              </label>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => mfaAction('/mfa/disable')}
                >
                  Disable MFA
                </button>
                <button
                  className="secondary"
                  onClick={() => mfaAction('/mfa/recovery-codes/regenerate')}
                >
                  Regenerate recovery codes
                </button>
              </div>
            </>
          )}
          <p className="muted">Never share your setup key or recovery codes.</p>
        </section>
      </div>
    </section>
  );
}

export function QuizTaking({ quizId }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    attempt: null,
    quiz: null,
    questions: [],
  });
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!quizId) return;
    api(`/quizzes/${quizId}/attempts`, { method: 'POST' })
      .then((body) => setState({ loading: false, error: '', ...body }))
      .catch((reason) =>
        setState((current) => ({
          ...current,
          loading: false,
          error: reason.message,
        })),
      );
  }, [quizId]);
  if (!quizId) return <p className="empty-state">Choose a quiz first.</p>;
  if (state.loading) return <p className="muted">Loading quiz…</p>;
  if (state.error) return <p className="field-error">{state.error}</p>;
  if (result)
    return (
      <section className="card">
        <h2>Result</h2>
        <p>Your score: {result.result.score}</p>
        <p>{result.unansweredCount} unanswered.</p>
        {result.feedback?.map((item) => (
          <div key={item.question_id} aria-live="polite">
            <strong>
              Correct answer:{' '}
              {item.correct_answer || 'See lecturer explanation'}
            </strong>
            {item.explanation && <p>{item.explanation}</p>}
            {item.code_after && (
              <pre aria-label="Code after">{item.code_after}</pre>
            )}
            {item.expected_output && (
              <p>Expected output: {item.expected_output}</p>
            )}
          </div>
        ))}
      </section>
    );
  const submit = async () => {
    const answeredCount = state.questions.filter((question) => {
      const value = answers[question.question_id];
      return (
        value !== undefined &&
        (question.question_type !== 'short_answer' ||
          String(value).trim() !== '')
      );
    }).length;
    const unanswered = state.questions.length - answeredCount;
    if (
      unanswered &&
      !window.confirm(
        `${unanswered} question(s) are unanswered. Submit anyway?`,
      )
    )
      return;
    setSubmitting(true);
    try {
      setResult(
        await api(`/attempts/${state.attempt.attempt_id}/submit`, {
          method: 'POST',
          body: JSON.stringify({
            answers: Object.entries(answers)
              .filter(([, value]) => String(value).trim() !== '')
              .map(([questionId, value]) => {
                const question = state.questions.find(
                  (item) => item.question_id === questionId,
                );
                return question?.question_type === 'short_answer'
                  ? { questionId, answerText: String(value) }
                  : { questionId, optionId: value };
              }),
          }),
        }),
      );
    } catch (reason) {
      setState((current) => ({ ...current, error: reason.message }));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="card">
      {state.quiz.is_competitive && (
        <div className="warning">One scored attempt only.</div>
      )}
      <h2>{state.quiz.title}</h2>
      {state.questions.map((question) => (
        <fieldset key={question.question_id}>
          <legend>{question.question_text}</legend>
          {question.question_type === 'short_answer' ? (
            <label>
              Short answer
              <input
                aria-label={`Answer for ${question.question_text}`}
                value={answers[question.question_id] || ''}
                maxLength={2000}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.question_id]: event.target.value,
                  }))
                }
              />
            </label>
          ) : question.question_type === 'code' ? (
            <div className="code-question">
              {question.code_before && (
                <pre aria-label="Code before">{question.code_before}</pre>
              )}
              {question.options?.map((option) => (
                <label key={option.optionId}>
                  <input
                    type="radio"
                    name={question.question_id}
                    checked={answers[question.question_id] === option.optionId}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.question_id]: option.optionId,
                      }))
                    }
                  />
                  {option.optionText}
                </label>
              ))}
            </div>
          ) : (
            question.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name={question.question_id}
                  checked={answers[question.question_id] === option.optionId}
                  onChange={() =>
                    setAnswers((current) => ({
                      ...current,
                      [question.question_id]: option.optionId,
                    }))
                  }
                />
                {option.optionText}
              </label>
            ))
          )}
        </fieldset>
      ))}
      {state.error && <p className="field-error">{state.error}</p>}
      <button className="primary" disabled={submitting} onClick={submit}>
        {submitting ? 'Submitting…' : 'Submit attempt'}
      </button>
    </section>
  );
}

if (document.getElementById('root'))
  createRoot(document.getElementById('root')).render(<App />);
