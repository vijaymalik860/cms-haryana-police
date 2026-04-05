# Haryana Police CMS — AI Agent Instructions

Welcome, Artificial Intelligence Coder! You are assisting a developer on the Haryana Police CMS project. Please read these strict rules before making any code modifications.

## 1. Database Migrations (CRITICAL)
- **Never edit an existing Supabase migration file.**
- If you need to change the DB schema or add reference data, you MUST create a new migration file in `supabase/migrations/` using the naming convention `YYYYMMDDHHMMSS_description.sql`.
- We use a shared database model where the structure is version-controlled.
- Test data (fake names, bogus complaints) MUST NOT be seeded into production. It goes into a separate test seed file or is applied only locally.

## 2. Tech Stack and Patterns
- **Frontend**: React 19 + Vite (NO Next.js, NO Server-Side Rendering)
- **UI Framework**: Ant Design (antd) + Lucide React icons
- **CSS**: Vanilla CSS modules or global overrides. Avoid Tailwind unless absolutely necessary.
- **Backend/DB**: Supabase (Postgres). Database queries from the UI should use `@supabase/supabase-js`.
- **Complex Logic**: For things like AI API calls or generating documents, use Supabase Edge Functions.

## 3. Code Quality
- Deliver **COMPLETE, working code**. No placeholders like `// Add your logic here`.
- Ensure mobile-first responsiveness. Police officers will use this predominately on tablets and mobile phones.
- Use Role-Based Access Control logic (e.g. `<RoleGate allowedRoles={['io', 'sho']}>`) to show/hide features appropriately.

## 4. UI/UX Expectations
- Focus on premium aesthetics using the Ant Design components. Avoid plain HTML tables or generic inputs.
- Keep the interface simple and easy for non-technical users.

Thank you for helping us build the Haryana Police Smart CMS!
