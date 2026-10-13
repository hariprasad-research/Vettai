# VETTAI — Supabase-connected frontend

This bundle preserves the existing `index.html` and `styles.css` design and connects the app's login and primary academy/participant/referee/age-group data operations to Supabase.

## Files
- `index.html` — loads Supabase JS v2 and the app.
- `styles.css` — original styling, unchanged.
- `app.js` — Supabase Auth + database integration; browser localStorage/sessionStorage demo persistence and demo-login shortcuts removed.
- `vettai-supabase-setup.sql` — signup trigger required to create an academy and its `profiles` row automatically.

## Setup before testing
1. In Supabase Dashboard → SQL Editor, run `vettai-supabase-setup.sql` once.
2. Confirm Authentication → Users contains the existing organiser account and `public.profiles` has the same user ID with role `organiser`. Do not create a duplicate organiser.
3. Confirm the `age_groups` and `weight_groups` tables contain enabled rows; the app loads enabled rows from those tables.
4. Serve the files from a local web server or static host (not by opening `index.html` as a `file://` URL).
5. Sign in with the existing organiser's email and password through Supabase Auth.
6. Test academy signup using a separate email address. If email confirmation is enabled, confirm the email before signing in.

## Security notes
- The browser uses only the project's publishable key. Never put a `service_role` or secret key in frontend code.
- Existing RLS policies remain in place and are expected to enforce access. Test with both organiser and academy accounts.
- The SQL trigger uses `SECURITY DEFINER` so it can create the initial academy/profile rows when a new academy user is created. Review it before production use.
- The organiser's “Create academy record” action creates a directory record, not another Auth user. The academy owner must sign up separately to get secure credentials. Browser-side code must not create users by storing passwords in the database.

## Current schema constraints / limitations
- The supplied schema has no persistent match-settings table, so the open/closed registration toggle is session-only until a settings table is added.
- The supplied schema has no pitches table, so generated pitch rosters are calculated in the current page session and are not saved to Supabase.
- `participants.weight` is numeric. The UI now expects a numeric weight (for example `42 KG`); ranges such as `41–45 KG` cannot be represented faithfully by this column without a schema change.
- The app maps the existing `age_groups`, `weight_groups`, `academies`, `profiles`, `participants`, and `referees` tables; it does not create or rename these tables.

## Validation performed
- `node --check app.js` passes JavaScript syntax validation.
- A live sign-in/database round trip was not run from this build environment. Test in your Supabase project and review any RLS/schema error shown in the toast.
