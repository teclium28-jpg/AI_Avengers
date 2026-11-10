# Database migrations

Apply the four timestamped SQL migrations in filename order, once each, through the Supabase migration runner. They create a private `fairshare` schema and require Supabase's existing `auth.users` table. The seed is separate at `../seed.sql` and requires explicit development opt-in.

See [database guide](../../docs/database.md) for the table map, guarantees, application responsibilities, tests and hosted setup steps. No hosted project has been changed.
