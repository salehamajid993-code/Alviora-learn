import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { btn, btn2, Card, Empty, fmt, inp, Link2, msg, openFile, Page, q, safeName, useLoad, validateFile } from './ui'
import type { Announcement, Assignment, Attendance, Batch, Note, Profile, Submission } from './types'

const loadStudents = async () => {
  const [p, r, b] = await Promise.all([
    q<Profile[]>(supabase.from('profiles').select('*').order('created_at', { ascending: false })),
    q<{ user_id: string }[]>(supabase.from('user_roles').select('user_id').eq('role', 'admin')),
    q<Batch[]>(supabase.from('batches').select('*').order('created_at', { ascending: false })),
  ])
  const admins = new Set(r.map((x) => x.user_id))
  return { students: p.filter((x) => !admins.has(x.id)), batches: b }
}
const BatchSelect = ({ batches, value, onChange, all }: { batches: Batch[]; value: string; onChange: (v: string) => void; all?: string }) => (
  <select className={inp} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{all ?? 'Select batch'}</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.course_title}</option>)}
  </select>
)
function useForm<T>(init: T) { const [v, setV] = useState<T>(init); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); return { v, setV, err, setErr, busy, setBusy } }

export function Dashboard() {
  const { data, error, loading } = useLoad(async () => {
    const { students } = await loadStudents()
    const [notes, subs, att] = await Promise.all([
      q<{ id: string }[]>(supabase.from('notes').select('id').eq('status', 'published')),
      q<(Submission & { profiles: { full_name: string } | null; assignments: { title: string } | null })[]>(supabase.from('submissions').select('*, profiles(full_name), assignments(title)').order('submitted_at', { ascending: false }).limit(50)),
      q<Attendance[]>(supabase.from('attendance').select('status')),
    ])
    const week = Date.now() - 7 * 864e5
    return { students, notes: notes.length, subs, att, recent: students.filter((s) => s.last_login && new Date(s.last_login).getTime() > week).length }
  })
  const presentPct = data && data.att.length ? Math.round((data.att.filter((a) => a.status === 'present').length / data.att.length) * 100) : null
  const stat = (l: string, v: string | number) => <Card key={l}><p className="text-xs text-slate-400">{l}</p><p className="text-2xl font-semibold">{v}</p></Card>
  return (
    <Page title="Admin Dashboard" loading={loading} error={error}>
      {data && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {stat('Active students', data.students.filter((s) => s.status === 'active').length)}{stat('Registered students', data.students.length)}
          {stat('Awaiting approval', data.students.filter((s) => s.status === 'pending').length)}{stat('Logged in (7 days)', data.recent)}
          {stat('Published notes', data.notes)}{stat('Pending submissions', data.subs.filter((s) => s.status === 'submitted').length)}
          {stat('Attendance (present %)', presentPct === null ? 'no data' : `${presentPct}%`)}
        </div>
        <h2 className="mb-2 mt-4 font-medium">Recent submissions</h2>
        {data.subs.length === 0 ? <Empty text="No submissions yet." /> : data.subs.slice(0, 5).map((s) => <p key={s.id} className="text-sm">{s.profiles?.full_name} · {s.assignments?.title} · {fmt(s.submitted_at)} · {s.status}</p>)}
      </>}
    </Page>
  )
}

export function Students() {
  const [search, setSearch] = useState(''); const [f, setF] = useState('all')
  const { data, error, loading, reload } = useLoad(loadStudents)
  const upd = async (id: string, patch: Partial<Profile>) => { const { error: e } = await supabase.from('profiles').update(patch).eq('id', id); if (e) alert(e.message); reload() }
  const rows = (data?.students ?? []).filter((s) => (f === 'all' || s.status === f) && `${s.full_name} ${s.email}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <Page title="Students" loading={loading} error={error}>
      <div className="mb-3 flex gap-2"><input className={inp} placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inp + ' !w-40'} value={f} onChange={(e) => setF(e.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="active">Active</option><option value="deactivated">Deactivated</option></select></div>
      {rows.length === 0 && <Empty text="No students match." />}
      {rows.map((s) => (
        <Card key={s.id}>
          <p className="font-medium">{s.full_name || '(no name)'} <span className="text-xs text-slate-400">{s.email} · {s.status} · joined {new Date(s.created_at).toLocaleDateString()} · last login {fmt(s.last_login)}{s.course_completed ? ' · course completed' : ''}</span></p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="w-64"><BatchSelect batches={data?.batches ?? []} value={s.batch_id ?? ''} all="No batch" onChange={(v) => void upd(s.id, { batch_id: v || null })} /></div>
            {s.status !== 'active' && <button className={btn2} onClick={() => void upd(s.id, { status: 'active' })}>{s.status === 'pending' ? 'Approve' : 'Reactivate'}</button>}
            {s.status === 'active' && <button className={btn2} onClick={() => { if (confirm(`Deactivate ${s.full_name}? They will immediately lose access to notes, assignments and uploads.`)) void upd(s.id, { status: 'deactivated' }) }}>Deactivate</button>}
            <button className={btn2} onClick={() => void upd(s.id, { course_completed: !s.course_completed })}>{s.course_completed ? 'Mark in progress' : 'Mark course completed'}</button>
          </div>
        </Card>
      ))}
      <p className="text-xs text-slate-500">Permanent deletion is not implemented in this build; deactivate instead.</p>
    </Page>
  )
}

export function Batches() {
  const { data, error, loading, reload } = useLoad(loadStudents)
  const f = useForm({ name: '', course_title: 'Web Development with AI', start_date: '', end_date: '', status: 'upcoming' })
  const add = async (e: FormEvent) => {
    e.preventDefault(); f.setErr(null); f.setBusy(true)
    try { const { error: x } = await supabase.from('batches').insert({ ...f.v, start_date: f.v.start_date || null, end_date: f.v.end_date || null }); if (x) throw x; f.setV({ ...f.v, name: '' }); reload() }
    catch (x) { f.setErr(msg(x)) } finally { f.setBusy(false) }
  }
  const setStatus = async (id: string, status: string) => { const { error: x } = await supabase.from('batches').update({ status }).eq('id', id); if (x) alert(x.message); reload() }
  return (
    <Page title="Batches" loading={loading} error={error}>
      <form onSubmit={(e) => void add(e)} className="mb-4 grid gap-2 md:grid-cols-5">
        <input className={inp} placeholder="Batch name" required value={f.v.name} onChange={(e) => f.setV({ ...f.v, name: e.target.value })} />
        <input className={inp} placeholder="Course title" required value={f.v.course_title} onChange={(e) => f.setV({ ...f.v, course_title: e.target.value })} />
        <input className={inp} type="date" value={f.v.start_date} onChange={(e) => f.setV({ ...f.v, start_date: e.target.value })} />
        <input className={inp} type="date" value={f.v.end_date} onChange={(e) => f.setV({ ...f.v, end_date: e.target.value })} />
        <button className={btn} disabled={f.busy}>Create batch</button>
      </form>
      {f.err && <p className="mb-2 text-sm text-red-400">{f.err}</p>}
      {data?.batches.length === 0 && <Empty text="No batches yet." />}
      {data?.batches.map((b) => (
        <Card key={b.id}>
          <div className="flex items-center justify-between"><p className="font-medium">{b.name} — {b.course_title} <span className="text-xs text-slate-400">{b.start_date ?? '?'} → {b.end_date ?? '?'}</span></p>
            <select className={inp + ' !w-36'} value={b.status} onChange={(e) => void setStatus(b.id, e.target.value)}><option>upcoming</option><option>active</option><option>completed</option></select></div>
          <p className="mt-1 text-sm text-slate-400">Students: {data.students.filter((s) => s.batch_id === b.id).map((s) => s.full_name || s.email).join(', ') || 'none'}</p>
        </Card>
      ))}
    </Page>
  )
}

export function NotesAdmin() {
  const { data, error, loading, reload } = useLoad(async () => ({ b: (await loadStudents()).batches, n: await q<Note[]>(supabase.from('notes').select('*').order('class_date', { ascending: false })) }))
  const f = useForm({ batch_id: '', title: '', topic: '', class_date: new Date().toISOString().slice(0, 10), body: '', link_url: '', publish: false })
  const [file, setFile] = useState<File | null>(null)
  const save = async (e: FormEvent) => {
    e.preventDefault(); f.setErr(null); f.setBusy(true)
    try {
      if (!f.v.batch_id) throw new Error('Select a batch.')
      let file_path: string | null = null
      if (file) {
        const bad = validateFile(file, 'note'); if (bad) throw new Error(bad)
        file_path = `${f.v.batch_id}/${Date.now()}-${safeName(file.name)}`
        const up = await supabase.storage.from('materials').upload(file_path, file); if (up.error) throw up.error
      }
      const { publish, ...rest } = f.v
      const { error: x } = await supabase.from('notes').insert({ ...rest, topic: rest.topic || null, body: rest.body || null, link_url: rest.link_url || null, file_path, file_name: file?.name ?? null, status: publish ? 'published' : 'draft' })
      if (x) throw x
      f.setV({ ...f.v, title: '', topic: '', body: '', link_url: '' }); setFile(null); reload()
    } catch (x) { f.setErr(msg(x)) } finally { f.setBusy(false) }
  }
  const toggle = async (n: Note) => { const { error: x } = await supabase.from('notes').update({ status: n.status === 'published' ? 'draft' : 'published' }).eq('id', n.id); if (x) alert(x.message); reload() }
  const del = async (n: Note) => {
    if (!confirm('Delete this note and its uploaded file?')) return
    if (n.file_path) await supabase.storage.from('materials').remove([n.file_path])
    const { error: x } = await supabase.from('notes').delete().eq('id', n.id); if (x) alert(x.message); reload()
  }
  return (
    <Page title="Notes & Materials" loading={loading} error={error}>
      <form onSubmit={(e) => void save(e)} className="mb-4 space-y-2 rounded-xl border border-slate-800 p-4">
        <div className="grid gap-2 md:grid-cols-4"><BatchSelect batches={data?.b ?? []} value={f.v.batch_id} onChange={(v) => f.setV({ ...f.v, batch_id: v })} />
          <input className={inp} placeholder="Title" required value={f.v.title} onChange={(e) => f.setV({ ...f.v, title: e.target.value })} />
          <input className={inp} placeholder="Topic" value={f.v.topic} onChange={(e) => f.setV({ ...f.v, topic: e.target.value })} />
          <input className={inp} type="date" required value={f.v.class_date} onChange={(e) => f.setV({ ...f.v, class_date: e.target.value })} /></div>
        <textarea className={inp} rows={5} placeholder="Write notes (plain text)" value={f.v.body} onChange={(e) => f.setV({ ...f.v, body: e.target.value })} />
        <div className="grid gap-2 md:grid-cols-2"><input className={inp} placeholder="External link (optional)" value={f.v.link_url} onChange={(e) => f.setV({ ...f.v, link_url: e.target.value })} />
          <input className={inp} type="file" accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.v.publish} onChange={(e) => f.setV({ ...f.v, publish: e.target.checked })} /> Publish now (otherwise saved as draft)</label>
        {f.err && <p className="text-sm text-red-400">{f.err}</p>}
        <button className={btn} disabled={f.busy}>{f.busy ? 'Uploading…' : 'Save note'}</button>
      </form>
      {data?.n.length === 0 && <Empty text="No notes yet." />}
      {data?.n.map((n) => (
        <Card key={n.id}><p className="font-medium">{n.title} <span className="text-xs text-slate-400">{n.class_date} · {n.status}</span></p>
          <div className="mt-2 flex gap-2">{n.file_path && <button className={btn2} onClick={() => void openFile('materials', n.file_path as string)}>Open file</button>}
            <button className={btn2} onClick={() => void toggle(n)}>{n.status === 'published' ? 'Unpublish' : 'Publish'}</button><button className={btn2} onClick={() => void del(n)}>Delete</button></div></Card>
      ))}
    </Page>
  )
}

export function AssignmentsAdmin() {
  const { data, error, loading, reload } = useLoad(async () => ({ b: (await loadStudents()).batches, a: await q<Assignment[]>(supabase.from('assignments').select('*').order('due_at', { ascending: false })) }))
  const f = useForm({ batch_id: '', title: '', instructions: '', due_at: '', max_marks: '', publish: true })
  const save = async (e: FormEvent) => {
    e.preventDefault(); f.setErr(null); f.setBusy(true)
    try {
      if (!f.v.batch_id) throw new Error('Select a batch.')
      const { publish, max_marks, due_at, ...rest } = f.v
      const { error: x } = await supabase.from('assignments').insert({ ...rest, due_at: new Date(due_at).toISOString(), max_marks: max_marks ? Number(max_marks) : null, status: publish ? 'published' : 'draft' })
      if (x) throw x
      f.setV({ ...f.v, title: '', instructions: '', due_at: '', max_marks: '' }); reload()
    } catch (x) { f.setErr(msg(x)) } finally { f.setBusy(false) }
  }
  const set = async (id: string, status: string) => { const { error: x } = await supabase.from('assignments').update({ status }).eq('id', id); if (x) alert(x.message); reload() }
  const del = async (id: string) => { if (!confirm('Delete this assignment and all its submissions?')) return; const { error: x } = await supabase.from('assignments').delete().eq('id', id); if (x) alert(x.message); reload() }
  return (
    <Page title="Assignments" loading={loading} error={error}>
      <form onSubmit={(e) => void save(e)} className="mb-4 space-y-2 rounded-xl border border-slate-800 p-4">
        <div className="grid gap-2 md:grid-cols-4"><BatchSelect batches={data?.b ?? []} value={f.v.batch_id} onChange={(v) => f.setV({ ...f.v, batch_id: v })} />
          <input className={inp} placeholder="Title" required value={f.v.title} onChange={(e) => f.setV({ ...f.v, title: e.target.value })} />
          <input className={inp} type="datetime-local" required value={f.v.due_at} onChange={(e) => f.setV({ ...f.v, due_at: e.target.value })} />
          <input className={inp} type="number" min="0" placeholder="Max marks (optional)" value={f.v.max_marks} onChange={(e) => f.setV({ ...f.v, max_marks: e.target.value })} /></div>
        <textarea className={inp} rows={3} placeholder="Instructions" value={f.v.instructions} onChange={(e) => f.setV({ ...f.v, instructions: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.v.publish} onChange={(e) => f.setV({ ...f.v, publish: e.target.checked })} /> Publish now</label>
        {f.err && <p className="text-sm text-red-400">{f.err}</p>}<button className={btn} disabled={f.busy}>Create assignment</button>
      </form>
      {data?.a.length === 0 && <Empty text="No assignments yet." />}
      {data?.a.map((a) => (
        <Card key={a.id}><p className="font-medium">{a.title} <span className="text-xs text-slate-400">due {fmt(a.due_at)} · {a.status}</span></p>
          <div className="mt-2 flex gap-2">{a.status !== 'published' && <button className={btn2} onClick={() => void set(a.id, 'published')}>Publish</button>}
            {a.status === 'published' && <button className={btn2} onClick={() => void set(a.id, 'closed')}>Close</button>}<button className={btn2} onClick={() => void del(a.id)}>Delete</button></div></Card>
      ))}
    </Page>
  )
}

type SubRow = Submission & { profiles: { full_name: string; batch_id: string | null } | null; assignments: { title: string; due_at: string } | null }
function Review({ s, onDone }: { s: SubRow; onDone: () => void }) {
  const [fb, setFb] = useState(s.feedback ?? ''); const [marks, setMarks] = useState(s.marks?.toString() ?? '')
  const go = async (status: Submission['status']) => {
    const { error: x } = await supabase.from('submissions').update({ status, feedback: fb || null, marks: marks ? Number(marks) : null }).eq('id', s.id)
    if (x) alert(x.message); onDone()
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2"><input className={inp + ' !w-24'} type="number" placeholder="Marks" value={marks} onChange={(e) => setMarks(e.target.value)} />
      <input className={inp + ' flex-1'} placeholder="Feedback" value={fb} onChange={(e) => setFb(e.target.value)} />
      <button className={btn2} onClick={() => void go('reviewed')}>Mark reviewed</button><button className={btn2} onClick={() => void go('needs_changes')}>Request changes</button></div>
  )
}
export function SubmissionsAdmin() {
  const [search, setSearch] = useState(''); const [st, setSt] = useState('all'); const [batch, setBatch] = useState('')
  const { data, error, loading, reload } = useLoad(async () => ({ b: (await loadStudents()).batches, s: await q<SubRow[]>(supabase.from('submissions').select('*, profiles(full_name, batch_id), assignments(title, due_at)').order('submitted_at', { ascending: false })) }))
  const rows = (data?.s ?? []).filter((s) => (st === 'all' || s.status === st) && (!batch || s.profiles?.batch_id === batch) && `${s.profiles?.full_name} ${s.assignments?.title}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <Page title="Submissions" loading={loading} error={error}>
      <div className="mb-3 grid gap-2 md:grid-cols-3"><input className={inp} placeholder="Search student or assignment" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inp} value={st} onChange={(e) => setSt(e.target.value)}><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="reviewed">Reviewed</option><option value="needs_changes">Needs changes</option></select>
        <BatchSelect all="All batches" batches={data?.b ?? []} value={batch} onChange={setBatch} /></div>
      {rows.length === 0 && <Empty text="No submissions match." />}
      {rows.map((s) => (
        <Card key={s.id}><p className="font-medium">{s.profiles?.full_name} · {s.assignments?.title}</p>
          <p className="text-xs text-slate-400">{fmt(s.submitted_at)} · {s.kind.toUpperCase()} · {s.status}{s.assignments && new Date(s.submitted_at) > new Date(s.assignments.due_at) ? ' · LATE' : ' · on time'}</p>
          <div className="mt-1 text-sm">{s.kind === 'link' && s.url ? <Link2 url={s.url} /> : s.file_path ? <button className={btn2} onClick={() => void openFile('submissions', s.file_path as string)}>Open file</button> : null}</div>
          <Review s={s} onDone={reload} /></Card>
      ))}
    </Page>
  )
}

export function AttendanceAdmin() {
  const [batch, setBatch] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [marks, setMarks] = useState<Record<string, Attendance['status']>>({}); const [msgS, setMsgS] = useState<string | null>(null)
  const { data, error, loading } = useLoad(async () => {
    const { students, batches } = await loadStudents()
    const roster = students.filter((s) => s.batch_id === batch && s.status === 'active')
    const existing = batch ? await q<Attendance[]>(supabase.from('attendance').select('*').eq('batch_id', batch).eq('class_date', date)) : []
    setMarks(Object.fromEntries(existing.map((a) => [a.student_id, a.status])))
    return { batches, roster }
  }, [batch, date])
  const save = async () => {
    setMsgS(null)
    const rows = (data?.roster ?? []).map((s) => ({ batch_id: batch, student_id: s.id, class_date: date, status: marks[s.id] ?? 'absent' }))
    const { error: x } = await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,class_date' })
    setMsgS(x ? x.message : 'Attendance saved.')
  }
  return (
    <Page title="Attendance" loading={loading} error={error}>
      <div className="mb-3 grid gap-2 md:grid-cols-2"><BatchSelect batches={data?.batches ?? []} value={batch} onChange={setBatch} /><input className={inp} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {batch && data?.roster.length === 0 && <Empty text="No active students in this batch." />}
      {data?.roster.map((s) => (
        <div key={s.id} className="flex items-center justify-between border-b border-slate-800 py-2 text-sm"><span>{s.full_name || s.email}</span>
          <select className={inp + ' !w-32'} value={marks[s.id] ?? 'absent'} onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value as Attendance['status'] })}><option value="present">Present</option><option value="absent">Absent</option><option value="leave">Leave</option></select></div>
      ))}
      {!!data?.roster.length && <button className={btn + ' mt-3'} onClick={() => void save()}>Save attendance</button>}
      {msgS && <p className="mt-2 text-sm text-emerald-400">{msgS}</p>}
    </Page>
  )
}

export function AnnouncementsAdmin() {
  const { data, error, loading, reload } = useLoad(async () => ({ b: (await loadStudents()).batches, a: await q<Announcement[]>(supabase.from('announcements').select('*').order('created_at', { ascending: false })) }))
  const f = useForm({ batch_id: '', title: '', body: '' })
  const save = async (e: FormEvent) => {
    e.preventDefault(); f.setErr(null)
    const { error: x } = await supabase.from('announcements').insert({ batch_id: f.v.batch_id || null, title: f.v.title, body: f.v.body })
    if (x) f.setErr(x.message); else { f.setV({ ...f.v, title: '', body: '' }); reload() }
  }
  const del = async (id: string) => { const { error: x } = await supabase.from('announcements').delete().eq('id', id); if (x) alert(x.message); reload() }
  return (
    <Page title="Announcements" loading={loading} error={error}>
      <form onSubmit={(e) => void save(e)} className="mb-4 space-y-2"><BatchSelect all="All students" batches={data?.b ?? []} value={f.v.batch_id} onChange={(v) => f.setV({ ...f.v, batch_id: v })} />
        <input className={inp} placeholder="Title" required value={f.v.title} onChange={(e) => f.setV({ ...f.v, title: e.target.value })} />
        <textarea className={inp} rows={3} placeholder="Message" required value={f.v.body} onChange={(e) => f.setV({ ...f.v, body: e.target.value })} />
        {f.err && <p className="text-sm text-red-400">{f.err}</p>}<button className={btn}>Publish</button></form>
      {data?.a.length === 0 && <Empty text="No announcements yet." />}
      {data?.a.map((a) => <Card key={a.id}><p className="font-medium">{a.title} <span className="text-xs text-slate-400">{fmt(a.created_at)}</span></p><p className="text-sm">{a.body}</p><button className={btn2 + ' mt-2'} onClick={() => void del(a.id)}>Delete</button></Card>)}
    </Page>
  )
}
