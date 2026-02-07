# Pinterest & TikTok OAuth Setup Guide

## Pinterest OAuth Setup

### Step 1: Create a Pinterest Developer Account
1. Go to [https://developers.pinterest.com/](https://developers.pinterest.com/)
2. Sign in with your Pinterest business account (or create one)
3. Navigate to **My apps** → **Create app**

### Step 2: Register Your App
1. Fill in app details:
   - **App name**: Your app name (e.g., "Social0")
   - **App description**: Brief description of your app
   - **Website URL**: Your app URL (e.g., `https://localhost:3000` for dev)
   - **Redirect URI**: `https://localhost:3000/api/connect/pinterest/callback`
     - Note: Pinterest requires HTTPS even for localhost
     - The code will auto-convert to `http://localhost:3000` for actual redirects

### Step 3: Get Your Credentials
1. After creating the app, go to **Settings** → **App credentials**
2. Copy:
   - **App ID** → This is your `PINTEREST_CLIENT_ID`
   - **App secret** → This is your `PINTEREST_CLIENT_SECRET`

### Step 4: Configure Scopes
1. Go to **Settings** → **Permissions**
2. Request the following scopes:
   - `boards:read` - Read boards
   - `boards:write` - Create/update boards
   - `pins:read` - Read pins
   - `pins:write` - Create pins

### Step 5: Add to .env.local
```bash
PINTEREST_CLIENT_ID=your_app_id_here
PINTEREST_CLIENT_SECRET=your_app_secret_here
```

### Important Notes:
- Pinterest requires a **business account** (not personal)
- Your app needs to be **approved** before it can be used in production
- For development, you can use the app immediately but with limited features
- Redirect URIs must match exactly (including protocol and trailing slashes)

---

## TikTok OAuth Setup

### Step 1: Create a TikTok Developer Account
1. Go to [https://developers.tiktok.com/](https://developers.tiktok.com/)
2. Sign in with your TikTok account
3. Navigate to **My Apps** → **Create an app**

### Step 2: Register Your App
1. Fill in app details:
   - **App name**: Your app name (e.g., "Social0")
   - **App description**: Brief description of your app
   - **Category**: Select appropriate category
   - **Website URL**: Your app URL (e.g., `https://localhost:3000`)
   - **Redirect URI**: `https://localhost:3000/api/connect/tiktok/callback`
     - Note: TikTok requires HTTPS even for localhost
     - The code will auto-convert to `http://localhost:3000` for actual redirects

### Step 3: Get Your Credentials
1. After creating the app, go to **Basic Information**
2. Copy:
   - **Client Key** → This is your `TIKTOK_CLIENT_ID`
   - **Client Secret** → This is your `TIKTOK_CLIENT_SECRET`

### Step 4: Configure Scopes
1. Go to **Scopes** section in your app settings
2. Request the following scopes:
   - `user.info.basic` - Read user profile (avatar, display name)
   - `video.publish` - Post videos to user's profile
   - Optionally: `video.upload` - Upload videos as drafts
   - Optionally: `user.info.profile` - Extended profile info

### Step 5: Add to .env.local
```bash
TIKTOK_CLIENT_ID=your_client_key_here
TIKTOK_CLIENT_SECRET=your_client_secret_here
```

### Important Notes:
- TikTok apps require **approval** before they can be used
- You can test in **Sandbox mode** during development
- For production, you need to submit your app for review
- Redirect URIs must match exactly
- TikTok uses OAuth 2.0 with PKCE (handled automatically by the code)

---

## Testing the Integration

### After Adding Credentials:

1. **Restart your Next.js dev server**:
   ```bash
   npm run dev
   ```

2. **Test Pinterest**:
   - Go to your dashboard
   - Click "Connect" on Pinterest card
   - You should be redirected to Pinterest OAuth
   - After authorization, you'll be redirected back

3. **Test TikTok**:
   - Go to your dashboard
   - Click "Connect" on TikTok card
   - You should be redirected to TikTok OAuth
   - After authorization, you'll be redirected back

### Troubleshooting:

**Pinterest Issues:**
- Make sure you're using a **business account**
- Verify redirect URI matches exactly (including `https://`)
- Check that scopes are approved in your app settings

**TikTok Issues:**
- Make sure your app is in **Sandbox mode** for testing
- Verify redirect URI matches exactly
- Check that requested scopes are available for your app type
- TikTok may require additional verification for production use

---

## Current Configuration

Both platforms are already configured in the codebase:

- **Pinterest**: `lib/platforms.ts` → OAuth endpoints and scopes set
- **TikTok**: `lib/platforms.ts` → OAuth endpoints and scopes set
- **Callback handlers**: `app/api/connect/[platform]/callback/route.ts` → User info fetching implemented

You just need to add the credentials to `.env.local` and restart your server!
