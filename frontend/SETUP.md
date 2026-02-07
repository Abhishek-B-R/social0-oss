# Setup Instructions

## ✅ Completed Steps

1. **Dependencies installed** - `better-auth` and `zod` have been added to `package.json` and installed
2. **Environment variables** - `.env.local` created with:
   - Database URL (from existing `.env`)
   - Generated `BETTER_AUTH_SECRET` (64-character base64 string)
   - Generated `ENCRYPTION_KEY` (64-character hex string)
   - Placeholders for OAuth credentials

3. **Database migrations** - Drizzle migrations have been run
4. **Better Auth tables SQL** - Created SQL file at `scripts/setup-better-auth.sql` for manual table creation

## ⚠️ Manual Steps Required

### 1. Create Better Auth Tables

The Better Auth CLI is having issues with Drizzle relations. You need to manually create the tables:

**Option A: Using psql**
```bash
psql $DATABASE_URL -f scripts/setup-better-auth.sql
```

**Option B: Using Node.js**
```bash
cd frontend
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('scripts/setup-better-auth.sql', 'utf8');
pool.query(sql).then(() => {
  console.log('Better Auth tables created!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
"
```

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.com/api/auth/callback/google` (production)
7. Copy the **Client ID** and **Client Secret**
8. Update `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your_actual_client_id
   GOOGLE_CLIENT_SECRET=your_actual_client_secret
   ```

### 3. Add Platform OAuth Credentials (as you implement)

For each platform you want to support (LinkedIn, Reddit, etc.):

1. Create OAuth app in the platform's developer console
2. Get Client ID and Client Secret
3. Add to `.env.local`:
   ```
   LINKEDIN_CLIENT_ID=your_linkedin_client_id
   LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
   ```

### 4. Start the Development Server

```bash
cd frontend
npm run dev
# or
bun dev
```

Visit `http://localhost:3000` to see the landing page.

## 📝 Environment Variables Reference

All required variables are documented in `.env.example`. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_URL` - Base URL for Better Auth (usually same as app URL)
- `BETTER_AUTH_SECRET` - Secret for Better Auth (min 32 chars, generated)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `NEXT_PUBLIC_APP_URL` - Public app URL for OAuth redirects
- `ENCRYPTION_KEY` - 64-character hex key for token encryption (generated)
- Platform-specific OAuth credentials (LINKEDIN_CLIENT_ID, etc.)

## 🔧 Troubleshooting

### Better Auth CLI Issues

If you encounter `value.withFieldName is not a function` errors when running Better Auth CLI, this is due to a compatibility issue with Drizzle relations. The workaround is to manually create the tables using the SQL file provided.

### Database Connection

Ensure your PostgreSQL database is running and accessible:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Missing Tables

If tables are missing after migration, run the Better Auth SQL manually:
```bash
psql $DATABASE_URL -f scripts/setup-better-auth.sql
```

## 🚀 Next Steps

1. Create Better Auth tables (see Manual Steps #1)
2. Configure Google OAuth (see Manual Steps #2)
3. Start the dev server and test the sign-up flow
4. Add platform OAuth credentials as you implement each platform
