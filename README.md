# ALVIORA LEARN

React + TypeScript (strict) + Vite + Tailwind 3 + React Router + Supabase (Auth, Postgres, private Storage). No payment features.

## Run locally
```bash
npm install
cp .env.example .env.local     # fill in the two values below
npm run dev                    # http://localhost:5173
npm run build                  # typecheck + production build
```
`.env.local` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings > API, **anon** key only; never the service-role key). `.env.local` is git-ignored.

## Supabase setup
1. Create a Supabase project.
2. SQL Editor: run `supabase/migrations/0001_init.sql` once on the fresh project. It creates tables, RLS policies, helper functions, the signup trigger, the two **private** buckets (`materials`, `submissions`) and their storage policies.
3. Authentication > URL Configuration: add `http://localhost:5173` as Site URL / redirect (needed for password reset). Optionally turn email confirmation on or off.
4. Register through the app's sign-up page, then make that account the first admin in the SQL Editor (trusted path, not reachable from the browser):
```sql
update public.user_roles set role = 'admin'
  where user_id = (select id from auth.users where email = 'YOU@EXAMPLE.COM');
update public.profiles set status = 'active'
  where email = 'YOU@EXAMPLE.COM';
```
5. Log in: admins land on `/admin`, students on `/student`.

## Flow
Sign-up creates a `pending` student. Admin approves in Students, assigns a batch, and only then does the student see notes, assignments, uploads and announcements (enforced by RLS, not just the UI). Deactivating revokes access at once.

## Test checklist
- Sign up as a student: lands on "Waiting for approval", cannot open `/admin` or `/student`.
- Admin: approve the student, create a batch, assign the student to it.
- Admin: add a note (text + PDF/image/PPT), publish; student sees it and opens the file.
- Admin: create/publish an assignment; student submits PDF, PPT and link; invalid type / >20 MB is rejected.
- Admin: review a submission (marks, feedback, request changes); student sees it and can resubmit after "needs changes".
- Admin: mark attendance; student sees only their own percentage.
- Deactivate the student: data access stops.
