import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuth } from './auth'

export const inp = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400'
export const btn = 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-50'
export const btn2 = 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50'

export const msg = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : 'Unknown error'

export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setLoading(true)
    fn().then((d) => { if (live) { setData(d); setError(null) } })
      .catch((e: unknown) => { console.error(e); if (live) setError(msg(e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, ...deps])
  return { data, error, loading, reload: () => setN((x) => x + 1) }
}

export const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')

export function Page({ title, loading, error, children }: { title: string; loading?: boolean; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      {error && <p className="mb-3 rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      {loading ? <p className="text-slate-400">Loading…</p> : children}
    </div>
  )
}
export const Card = ({ children }: { children: ReactNode }) => <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">{children}</div>
export const Empty = ({ text }: { text: string }) => <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">{text}</p>

const ALLOWED: Record<string, string[]> = {
  pdf: ['application/pdf'],
  ppt: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  note: ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/png', 'image/jpeg', 'image/webp'],
}
export function validateFile(f: File, kind: 'pdf' | 'ppt' | 'note'): string | null {
  const okExt = /\.(pdf|pptx?|png|jpe?g|webp)$/i.test(f.name)
  if (!okExt || !ALLOWED[kind].includes(f.type)) return 'Unsupported file type for this upload.'
  if (kind === 'pdf' && !/\.pdf$/i.test(f.name)) return 'Please choose a .pdf file.'
  if (kind === 'ppt' && !/\.pptx?$/i.test(f.name)) return 'Please choose a .ppt or .pptx file.'
  if (f.size > 20 * 1024 * 1024) return 'File is larger than 20 MB.'
  return null
}
export const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_')

export async function openFile(bucket: 'materials' | 'submissions', path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data) { alert(error?.message ?? 'Could not create download link'); return }
  window.open(data.signedUrl, '_blank', 'noopener')
}
export function isSafeUrl(u: string): boolean { try { return ['http:', 'https:'].includes(new URL(u).protocol) } catch { return false } }
export const Link2 = ({ url, label }: { url: string; label?: string }) =>
  isSafeUrl(url) ? <a className="text-violet-300 underline" href={url} target="_blank" rel="noopener noreferrer">{label ?? url}</a> : <span className="text-red-300">Invalid link</span>

export function Shell({ links, title }: { links: [string, string][]; title: string }) {
  const { profile } = useAuth()
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/70 p-4">
        <p className="mb-1 text-lg font-bold tracking-widest text-violet-300">ALVIORA</p>
        <p className="mb-5 text-xs text-slate-400">{title} · {profile?.full_name}</p>
        <nav className="space-y-1">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to.split('/').length === 2}
              className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-violet-600/30 text-violet-200' : 'text-slate-300 hover:bg-slate-800'}`}>{label}</NavLink>
          ))}
        </nav>
        <button className={btn2 + ' mt-6'} onClick={() => void supabase.auth.signOut()}>Log out</button>
      </aside>
      <main className="flex-1 p-6"><Outlet /></main>
    </div>
  )
}
