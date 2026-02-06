# Database Schema

This directory contains the Drizzle ORM schema definitions for social0.

## Schema Overview

- **user**: Referenced from Better Auth (Better Auth creates this table)
- **connected_accounts**: Platform OAuth connections with encrypted tokens
- **media_uploads**: Media files with lifecycle management and deduplication
- **posts**: Scheduled posts with versioned content (original vs AI-enhanced)
- **post_publications**: Per-platform publication tracking with retry logic
- **user_settings**: User preferences and subscription info
- **platform_rate_limits**: Optional rate limit tracking per platform account

## Important Notes

### Better Auth Integration

The `user` table is defined here for type safety and foreign key relationships, but **Better Auth creates and owns this table**. Make sure Better Auth migrations run before app migrations.

### Post Content Validation

The `posts` table has a CHECK constraint ensuring at least one of:
- `final_content` is non-empty (text content), OR
- `media_ids` array has at least one element (media content)

This is enforced at the database level. App-level validation should also check this before insert/update.

### Media Cleanup Index

After running migrations, add this index for efficient media cleanup:

```sql
CREATE INDEX idx_media_cleanup 
ON media_uploads(created_at, is_attached_to_post, expires_at)
WHERE status = 'ready' AND is_attached_to_post = false;
```

This index helps the cleanup cron job find orphaned media efficiently.

### Encryption

OAuth tokens are encrypted in the backend only (never in frontend). See backend encryption documentation for details on:
- Algorithm: AES-256-GCM
- Key derivation: HKDF with per-account salt
- Key rotation: Version field + multiple active keys
- Storage format: `version:salt:iv:ciphertext:authTag`

## Migration Commands

```bash
# Generate migrations from schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

## Environment Variables

See `.env.example` for required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
