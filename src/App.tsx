import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { configured, supabase } from './lib/supabase'
import { btn, inp, msg, Shell } from './ui'
import * as S from './student'
import * as A from './admin'

function Guard({ role, children }: { role: 'admin' | 'student'; children: ReactNode }) {
  const { session, profile, isAdmin, loading } = useAuth()
  if (loading) return <p className="p-8 text-slate-400">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (role === 'admin' && !isAdmin) return <Navigate to="/app" replace />
  if (role === 'student') {
    if (isAdmin) return <Navigate to="/admin" replace />
    if (profile?.status !== 'active') return <Navigate to="/pending" replace />
  }
  return <>{children}</>
}

function AppHome() {
  const { session, profile, isAdmin, loading } = useAuth()
  if (loading) return <p className="p-8 text-slate-400">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  return <Navigate to={profile?.status === 'active' ? '/student' : '/pending'} replace />
}

function Landing() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-3 text-sm tracking-[0.4em] text-violet-300">ALVIORA LEARN</p>
      <h1 className="mb-4 text-4xl font-bold">Web Development with AI — your class, in one place.</h1>
      <p className="mb-8 text-slate-400">Class notes, assignments, submissions, attendance and feedback for enrolled students. New accounts are activated after admin approval.</p>
      <div className="flex gap-3"><Link className={btn} to="/signup">Create student account</Link><Link className={btn + ' !bg-slate-800'} to="/login">Log in</Link></div>
    </div>
  )
}

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const nav = useNavigate()
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'signup') {
        if (pw.length < 8) throw new Error('Password must be at least 8 characters.')
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name } } })
        if (error) throw error
        if (data.session) nav('/app'); else setInfo('Account created. Confirm your email if asked, then log in. An admin must approve your account before you can access classes.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
        await supabase.rpc('touch_login')
        nav('/app')
      }
    } catch (x) { setErr(msg(x)) } finally { setBusy(false) }
  }
  const reset = async () => {
    if (!email) { setErr('Enter your email first.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login' })
    if (error) setErr(error.message); else setInfo('If that email exists, a reset link has been sent.')
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-xl font-semibold">{mode === 'login' ? 'Log in' : 'Student sign-up'}</h1>
        {mode === 'signup' && <input className={inp} placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />}
        <input className={inp} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inp} type="password" placeholder="Password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p className="text-sm text-red-400">{err}</p>}
        {info && <p className="text-sm text-emerald-400">{info}</p>}
        <button className={btn + ' w-full'} disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        {mode === 'login' && <button type="button" className="text-xs text-slate-400 underline" onClick={() => void reset()}>Forgot password?</button>}
        <p className="text-xs text-slate-400">{mode === 'login' ? <Link to="/signup" className="underline">Need an account?</Link> : <Link to="/login" className="underline">Already registered?</Link>}</p>
      </form>
    </div>
  )
}

function Pending() {
  const { session, profile, loading, refresh } = useAuth()
  if (loading) return <p className="p-8 text-slate-400">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (profile?.status === 'active') return <Navigate to="/app" replace />
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{profile?.status === 'deactivated' ? 'Account deactivated' : 'Waiting for approval'}</h1>
      <p className="text-slate-400">{profile?.status === 'deactivated' ? 'Your access has been turned off. Contact your instructor.' : 'An administrator needs to approve your account before you can see classes and assignments.'}</p>
      <div className="flex gap-2"><button className={btn} onClick={() => void refresh()}>Check again</button><button className={btn + ' !bg-slate-800'} onClick={() => void supabase.auth.signOut()}>Log out</button></div>
    </div>
  )
}

export default function App() {
  if (!configured) return <div className="p-8"><h1 className="text-xl font-semibold">Supabase is not configured</h1><p className="mt-2 text-slate-400">Copy <code>.env.example</code> to <code>.env.local</code>, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server. See README.md.</p></div>
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthForm mode="login" />} />
      <Route path="/signup" element={<AuthForm mode="signup" />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/app" element={<AppHome />} />
      <Route path="/student" element={<Guard role="student"><Shell title="Student" links={[['/student', 'Dashboard'], ['/student/notes', 'Classes & Notes'], ['/student/assignments', 'Assignments & Submissions'], ['/student/attendance', 'Attendance'], ['/student/announcements', 'Announcements']]} /></Guard>}>
        <Route index element={<S.Dashboard />} /><Route path="notes" element={<S.Notes />} /><Route path="assignments" element={<S.Assignments />} />
        <Route path="attendance" element={<S.AttendancePage />} /><Route path="announcements" element={<S.Announcements />} />
      </Route>
      <Route path="/admin" element={<Guard role="admin"><Shell title="Admin" links={[['/admin', 'Dashboard'], ['/admin/students', 'Students'], ['/admin/batches', 'Batches'], ['/admin/notes', 'Notes & Materials'], ['/admin/assignments', 'Assignments'], ['/admin/submissions', 'Submissions'], ['/admin/attendance', 'Attendance'], ['/admin/announcements', 'Announcements']]} /></Guard>}>
        <Route index element={<A.Dashboard />} /><Route path="students" element={<A.Students />} /><Route path="batches" element={<A.Batches />} />
        <Route path="notes" element={<A.NotesAdmin />} /><Route path="assignments" element={<A.AssignmentsAdmin />} /><Route path="submissions" element={<A.SubmissionsAdmin />} />
        <Route path="attendance" element={<A.AttendanceAdmin />} /><Route path="announcements" element={<A.AnnouncementsAdmin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
