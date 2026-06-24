# No database changes or execution

Unless the user **explicitly** asks you to, do not:

- Create, edit, or delete migration files (`db/migrations/**`, `_journal.json`, etc.)
- Change database schema (`db/schema.ts`, SQL DDL, enums, tables, columns, indexes)
- Run any database-related commands or scripts (e.g. `db:generate`, `db:migrate`, `drizzle-kit`, `psql`, repair/migrate scripts)
- Execute SQL against a database, or run code whose primary purpose is to read/write/migrate the database

If a task would normally require a schema change or migration, **stop and ask the user** instead of doing it yourself.

When the user explicitly requests a database change, only perform exactly what they asked for — do not run migrations or DB commands unless they also explicitly asked you to run them.
