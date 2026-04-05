# Haryana Police CMS

A mobile-first, AI-assisted case management system for the Haryana Police.

## Developer Quickstart

This project uses React, Vite, Ant Design, and Supabase.
All backend logic, database tables, and authentication rely on Supabase.
For development, we use a local Supabase instance via Docker.

### Prerequisites
- Node.js (v24+)
- **Docker Desktop** (must be running for local Supabase)

### Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Local Database**
   Ensure Docker Desktop is running, then run:
   ```bash
   npx supabase start
   ```
   *This command spins up the Postgres database, API gateway, and Auth service. It will automatically apply all the initial migration files located in `supabase/migrations/`.*

3. **Start Development Server**
   ```bash
   npm run dev
   ```

### Accessing the System
- **React App:** `http://localhost:5173`
- **Supabase Studio (Local DB Editor):** `http://localhost:54323`

**Test User:** There is a test user automatically seeded into the database that you can use to log in:
- Email: `test_admin@police.haryana.gov.in`
- Password: `admin123`

### Rule: Database Migrations
**NEVER edit an existing migration file.** If you need to make changes to the schema, use:
```bash
npx supabase migration new your_migration_name
```
Then add your SQL to the newly generated file and run `npx supabase db reset` or `npx supabase start` to restart the stack.

Please read `AGENT_INSTRUCTIONS.md` if you are using AI agents.
