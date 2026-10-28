import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && key)
// Only the public anon key is used in the browser. Never put the service-role key here.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-anon-key')
