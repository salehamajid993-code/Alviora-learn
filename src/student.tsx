import { useState, type FormEvent } from 'react'
import { useAuth } from './auth'
import { supabase } from './lib/supabase'
import { btn, Card, Empty, fmt, inp, isSafeUrl, Link2, msg, openFile, Page, q, safeName, useLoad, validateFile } from './ui'
import type { Announcement, Assignment, Attendance, Batch, Note, Submission } from './types'

const pct = (a: Attendance[]) => (a.length ? Math.round((a.filter((x) => x.status === 'present').length / a.length) * 100) : null)

export function Dashboard() {
  const { profile, session } = useAuth()
  const uid = session?.user.id ?? ''
  const { data, error, loading } = useLoad(async () => {
    const [batch, notes, asg, att, ann] = await Promise.all([
      q<Batch[]>(supabase.from('batches').select('*')),
      q<Note[]>(supabase.from('notes').select('*').order('class_date', { ascending: false }).limit(3)),
      q<Assignment[]>(supabase.from('assignments').select('*').eq('status', 'published').gte('due_at', new Date().toISOString()).order('due_at').limit(3)),
      q<Attendance[]>(supabase.from('attendance').select('*').eq('student_id', uid)),
      q<Announcement[]>(supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(3)),
    ])
    return { batch: batch[0] ?? null, notes, asg, att, ann }
  })
  return (
    <Page title={`Welcome, ${profile?.full_name || 'student'}`} loading={loading} error={error}>
      {data && <>
        <Card><p className="text-sm text-slate-400">Course & batch</p>
          {data.batch ? <p>{data.batch.course_title} — {data.batch.name}</p> : <p className="text-slate-400">No batch assigned yet.</p>}
          <p className="mt-1 text-sm">Course status: {profile?.course_completed ? 'Completed' : 'In progress'} · Attendance: {pct(data.att) === null ? 'no records yet' : `${pct(data.att)}%`}</p></Card>
        <Card><p className="mb-2 font-medium">Recent notes</p>{data.notes.length ? data.notes.map((n) => <p key={n.id} className="text-sm">{n.class_date} · {n.title}</p>) : <Empty text="No published notes yet." />}</Card>
        <Card><p className="mb-2 font-medium">Upcoming assignments</p>{data.asg.length ? data.asg.map((a) => <p key={a.id} className="text-sm">{a.title} — due {fmt(a.due_at)}</p>) : <Empty text="Nothing due." />}</Card>
        <Card><p className="mb-2 font-medium">Announcements</p>{data.ann.length ? data.ann.map((a) => <p key={a.id} className="text-sm"><b>{a.title}</b> — {a.body}</p>) : <Empty text="No announcements." />}</Card>
      </>}
    </Page>
  )
}

export function Notes() {
  const { data, error, loading } = useLoad(() => q<Note[]>(supabase.from('notes').select('*').order('class_date', { ascending: false })))
  return (
    <Page title="Classes & Notes" loading={loading} error={error}>
      {data?.length === 0 && <Empty text="No published notes for your batch yet." />}
      {data?.map((n) => (
        <Card key={n.id}>
          <p className="font-medium">{n.title} <span className="text-xs text-slate-400">· {n.class_date}{n.topic ? ` · ${n.topic}` : ''}</span></p>
          {n.body && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{n.body}</p>}
          <div className="mt-2 flex gap-3 text-sm">
            {n.file_path && <button className={btn2x} onClick={() => void openFile('materials', n.file_path as string)}>Open {n.file_name ?? 'file'}</button>}
            {n.link_url && <Link2 url={n.link_url} label="Resource link" />}
          </div>
        </Card>
      ))}
    </Page>
  )
}
const btn2x = 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800'

function SubmitForm({ a, onDone }: { a: Assignment; onDone: () => void }) {
  const { session } = useAuth()
  const [kind, setKind] = useState<'pdf' | 'ppt' | 'link'>('pdf')
  const [file, setFile] = useState<File | null>(null); const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const go = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    const uid = session?.user.id
    if (!uid) return
    try {
      setBusy(true)
      let row: { assignment_id: string; student_id: string; kind: string; file_path?: string; url?: string }
      if (kind === 'link') {
        if (!isSafeUrl(url)) throw new Error('Enter a valid http(s) link.')
        row = { assignment_id: a.id, student_id: uid, kind, url }
      } else {
        if (!file) throw new Error('Choose a file first.')
        const bad = validateFile(file, kind); if (bad) throw new Error(bad)
        const path = `${uid}/${a.id}/${Date.now()}-${safeName(file.name)}`
        const up = await supabase.storage.from('submissions').upload(path, file, { upsert: false })
        if (up.error) throw up.error
        row = { assignment_id: a.id, student_id: uid, kind, file_path: path }
      }
      const ins = await supabase.from('submissions').insert(row)
      if (ins.error) throw ins.error
      setFile(null); setUrl(''); onDone()
    } catch (x) { setErr(msg(x)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={(e) => void go(e)} className="mt-3 space-y-2">
      <select className={inp} value={kind} onChange={(e) => setKind(e.target.value as 'pdf' | 'ppt' | 'link')}>
        <option value="pdf">Upload PDF</option><option value="ppt">Upload PowerPoint (PPT/PPTX)</option><option value="link">Submit a link</option>
      </select>
      {kind === 'link' ? <input className={inp} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        : <input className={inp} type="file" accept={kind === 'pdf' ? '.pdf' : '.ppt,.pptx'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className={btn} disabled={busy}>{busy ? 'Uploading…' : 'Submit'}</button>
    </form>
  )
}

export function Assignments() {
  const { data, error, loading, reload } = useLoad(async () => ({
    a: await q<Assignment[]>(supabase.from('assignments').select('*').order('due_at')),
    s: await q<Submission[]>(supabase.from('submissions').select('*').order('submitted_at', { ascending: false })),
  }))
  return (
    <Page title="Assignments & Submissions" loading={loading} error={error}>
      {data?.a.length === 0 && <Empty text="No assignments for your batch yet." />}
      {data?.a.map((a) => {
        const subs = data.s.filter((s) => s.assignment_id === a.id); const last = subs[0]
        const late = last ? new Date(last.submitted_at) > new Date(a.due_at) : false
        const status = !last ? 'Not Started' : last.status === 'reviewed' ? 'Reviewed' : last.status === 'needs_changes' ? 'Needs Changes' : 'Submitted (awaiting review)'
        const canSubmit = a.status === 'published' && (!last || last.status === 'needs_changes')
        return (
          <Card key={a.id}>
            <p className="font-medium">{a.title} <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs">{status}{late ? ' · Late' : ''}</span></p>
            <p className="text-xs text-slate-400">Due {fmt(a.due_at)}{a.max_marks ? ` · Max marks ${a.max_marks}` : ''}{a.status === 'closed' ? ' · Closed' : ''}</p>
            {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{a.instructions}</p>}
            {subs.map((s) => (
              <div key={s.id} className="mt-2 rounded-lg bg-slate-800/60 p-2 text-sm">
                {fmt(s.submitted_at)} · {s.kind.toUpperCase()} · {s.status}{s.marks !== null ? ` · ${s.marks} marks` : ''}
                {s.kind === 'link' && s.url ? <> · <Link2 url={s.url} /></> : s.file_path ? <> · <button className="underline" onClick={() => void openFile('submissions', s.file_path as string)}>Open</button></> : null}
                {s.feedback && <p className="text-slate-300">Feedback: {s.feedback}</p>}
              </div>
            ))}
            {canSubmit && <SubmitForm a={a} onDone={reload} />}
          </Card>
        )
      })}
    </Page>
  )
}

export function AttendancePage() {
  const { session } = useAuth()
  const { data, error, loading } = useLoad(() => q<Attendance[]>(supabase.from('attendance').select('*').eq('student_id', session?.user.id ?? '').order('class_date', { ascending: false })))
  return (
    <Page title="My Attendance" loading={loading} error={error}>
      {data?.length === 0 ? <Empty text="No attendance recorded yet." /> : data && <>
        <p className="mb-3">Attendance: <b>{pct(data)}%</b> ({data.filter((x) => x.status === 'present').length}/{data.length} classes present)</p>
        {data.map((r) => <p key={r.id} className="border-b border-slate-800 py-1 text-sm">{r.class_date} — {r.status}</p>)}
      </>}
    </Page>
  )
}

export function Announcements() {
  const { data, error, loading } = useLoad(() => q<Announcement[]>(supabase.from('announcements').select('*').order('created_at', { ascending: false })))
  return (
    <Page title="Announcements" loading={loading} error={error}>
      {data?.length === 0 && <Empty text="No announcements." />}
      {data?.map((a) => <Card key={a.id}><p className="font-medium">{a.title}</p><p className="text-xs text-slate-400">{fmt(a.created_at)}</p><p className="mt-1 text-sm">{a.body}</p></Card>)}
    </Page>
  )
}
