# Platform OAuth Setup Guide

## Instagram Graph API

**⚠️ Important**: Instagram Basic Display API was deprecated on December 4, 2024. You must use Instagram Graph API.

### Setup Steps

1. **Go to Meta for Developers**: https://developers.facebook.com/
2. **Create/Select App**: Create a new app or select existing one
3. **Add Use Cases** (you've already done this):
   - ✅ **"Manage messaging & content on Instagram"** - This gives you Instagram Graph API access
   - ✅ **"Access the Threads API"** - For Threads integration (optional)
4. **Configure OAuth Redirect URIs**:
   - Go to **Instagram** → **Basic Display** (or **Instagram Graph API**) → **Settings**
   - Add **Valid OAuth Redirect URIs**:
     - `http://localhost:3000/api/connect/instagram/callback` (development)
     - `https://your-domain.com/api/connect/instagram/callback` (production)
5. **Get Credentials**:
   - Go to **Settings** → **Basic**
   - **App ID** → Use as `INSTAGRAM_CLIENT_ID`
   - **App Secret** → Use as `INSTAGRAM_CLIENT_SECRET` (click "Show" to reveal)
6. **Add to `.env.local`**:
   ```
   INSTAGRAM_CLIENT_ID=your_app_id
   INSTAGRAM_CLIENT_SECRET=your_app_secret
   ```

### Important Requirements

- ✅ **Instagram Graph API** - You have this (via "Manage messaging & content on Instagram")
- ⚠️ **Instagram Business or Creator Account** - Users must have a business/creator account (not personal)
- ⚠️ **Facebook Page** - Instagram account must be linked to a Facebook Page
- **Scope**: `instagram_business_basic` (for reading profile, media, insights)
- **For Posting**: You'll need additional permissions like `instagram_content_publish` (requires app review)
- Tokens expire in **1 hour** initially, then can be exchanged for **60-day** tokens
- Instagram appends `#_` to redirect URI (handled automatically in code)

---

## YouTube Data API v3

### Setup Steps

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create/Select Project**: Create new project or select existing
3. **Enable YouTube Data API v3**:
   - Go to **APIs & Services** → **Library**
   - Search for **YouTube Data API v3**
   - Click **Enable**
4. **Create OAuth Credentials**:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Select **Web application**
   - Add **Authorized redirect URIs**:
     - `http://localhost:3000/api/connect/youtube/callback` (development)
     - `https://your-domain.com/api/connect/youtube/callback` (production)
5. **Get Credentials**:
   - **Client ID** → Use as `YOUTUBE_CLIENT_ID`
   - **Client Secret** → Use as `YOUTUBE_CLIENT_SECRET`
6. **Add to `.env.local`**:
   ```
   YOUTUBE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=your_client_secret
   ```

### Important Notes

- YouTube uses **Google OAuth** (separate from Google sign-in)
- Scopes used:
  - `https://www.googleapis.com/auth/youtube.upload` - Upload videos
  - `https://www.googleapis.com/auth/youtube` - Full access
- Tokens can be refreshed using refresh_token
- YouTube API has **quota limits** (10,000 units per day by default)

---

## Testing

After adding credentials to `.env.local`:

1. **Restart dev server**: `npm run dev` or `bun dev`
2. **Go to dashboard**: `http://localhost:3000/dashboard`
3. **Click "Connect"** on Instagram or YouTube card
4. **Authorize** the app in the OAuth flow
5. **Check dashboard** - should show "Connected as @username"

---

## Troubleshooting

### Instagram
- **"Invalid redirect_uri"**: Make sure URI matches exactly (including trailing slash if Meta added it)
- **"Invalid client_id"**: Verify App ID is correct
- **"Invalid code"**: Code expires quickly, try connecting again

### YouTube
- **"redirect_uri_mismatch"**: Verify redirect URI matches exactly in Google Console
- **"access_denied"**: User denied permissions
- **"invalid_grant"**: Code expired or already used
