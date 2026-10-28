import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './types'

interface Ctx { session: Session | null; profile: Profile | null; isAdmin: boolean; loading: boolean; refresh: () => Promise<void> }
const C = createContext<Ctx | null>(null)
export function useAuth(): Ctx { const c = useContext(C); if (!c) throw new Error('AuthProvider missing'); return c }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async (s: Session | null) => {
    if (!s) { setProfile(null); setIsAdmin(false); return }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.rpc('is_admin'),
    ])
    if (p.error) console.error('profile load failed', p.error.message)
    if (r.error) console.error('role check failed', r.error.message)
    setProfile((p.data as Profile | null) ?? null)
    setIsAdmin(r.data === true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await load(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setTimeout(() => { void load(s) }, 0) })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <C.Provider value={{ session, profile, isAdmin, loading, refresh: () => load(session) }}>{children}</C.Provider>
}
