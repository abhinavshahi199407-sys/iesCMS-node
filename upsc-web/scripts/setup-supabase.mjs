#!/usr/bin/env node
/**
 * One-shot Supabase setup for this project.
 *
 *   node scripts/setup-supabase.mjs
 *
 * Does whatever the credentials you supply allow, and skips the rest:
 *
 *   SUPABASE_DB_URL          -> applies supabase/schema.sql
 *   SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 *                            -> creates the admin user and allow-lists it
 *
 * Every step is idempotent: re-running it is safe.
 */

import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(ROOT, 'supabase', 'schema.sql');

const c = {
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const ok = (m) => console.log(`${c.green('✓')} ${m}`);
const skip = (m) => console.log(`${c.yellow('–')} ${m}`);
const fail = (m) => console.log(`${c.red('✗')} ${m}`);

/** Loads .env.local into process.env without overriding anything already set. */
async function loadEnvLocal() {
    let text;
    try {
        text = await readFile(join(ROOT, '.env.local'), 'utf8');
    } catch {
        return;
    }
    for (const line of text.split('\n')) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!match) continue;
        const value = match[2].replace(/^['"]|['"]$/g, '');
        if (!process.env[match[1]]) process.env[match[1]] = value;
    }
}

/**
 * Prompts when there is a terminal to prompt on. In a non-interactive run
 * (CI, piped stdin) there is nobody to answer, so the step is skipped rather
 * than crashing on a closed stream.
 */
async function ask(rl, question) {
    if (!rl) return '';
    try {
        return (await rl.question(`${question} `)).trim();
    } catch {
        return '';
    }
}

async function applySchema(dbUrl) {
    let pg;
    try {
        pg = await import('pg');
    } catch {
        fail('The "pg" package is not installed — run `npm install` first.');
        return false;
    }

    const sql = await readFile(SCHEMA_PATH, 'utf8');

    // Supabase terminates TLS with its own CA, so verification is relaxed there.
    // A local/socket Postgres has no TLS at all — don't demand it.
    const isLocal =
        /sslmode=disable/.test(dbUrl) ||
        /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl) ||
        dbUrl.startsWith('postgresql:///') ||
        dbUrl.startsWith('postgres:///');

    const client = new pg.default.Client({
        connectionString: dbUrl,
        ssl: isLocal ? false : { rejectUnauthorized: false },
    });

    try {
        await client.connect();
    } catch (error) {
        fail(`Could not connect to the database: ${error.message}`);
        console.log(
            c.dim(
                '  The connection string is in Supabase → Project Settings → Database →\n' +
                    '  Connection string → URI (use the pooler URI and your database password).',
            ),
        );
        return false;
    }

    try {
        await client.query(sql);
        ok('Schema applied (tables, RLS policies, storage bucket).');
        return true;
    } catch (error) {
        fail(`Schema failed: ${error.message}`);
        return false;
    } finally {
        await client.end();
    }
}

/** fetch that reports a bad URL or dead network as a message, not a stack. */
async function request(url, options) {
    try {
        return await fetch(url, options);
    } catch (error) {
        const cause = error.cause?.code ? ` (${error.cause.code})` : '';
        throw new SetupError(
            `Could not reach ${new URL(url).origin}${cause} — check ` +
                'NEXT_PUBLIC_SUPABASE_URL.',
        );
    }
}

/** An expected, already-explained failure: reported without a stack trace. */
class SetupError extends Error {}

/** Creates the admin auth user if absent, then puts its id on the allow-list. */
async function createAdmin(projectUrl, serviceKey, email, password) {
    const base = projectUrl.replace(/\/+$/, '');
    const headers = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
    };

    let userId = null;

    const created = await request(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password, email_confirm: true }),
    });

    if (created.ok) {
        userId = (await created.json()).id;
        ok(`Created admin user ${email}`);
    } else {
        const body = await created.text();
        // Already registered is the expected path on a re-run.
        const existing = await request(
            `${base}/auth/v1/admin/users?page=1&per_page=200`,
            { headers },
        );
        if (existing.ok) {
            const { users = [] } = await existing.json();
            const match = users.find(
                (u) => u.email?.toLowerCase() === email.toLowerCase(),
            );
            if (match) {
                userId = match.id;
                skip(`Admin user ${email} already exists — reusing it.`);
            }
        }
        if (!userId) {
            fail(`Could not create or find the admin user: ${body}`);
            return false;
        }
    }

    const allow = await request(`${base}/rest/v1/admins`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ id: userId }),
    });

    if (!allow.ok) {
        const body = await allow.text();
        fail(`Could not add the user to the admins table: ${body}`);
        console.log(
            c.dim(
                '  If this says the table is missing, apply the schema first\n' +
                    '  (supply SUPABASE_DB_URL, or paste supabase/schema.sql into the SQL editor).',
            ),
        );
        return false;
    }

    ok(`Allow-listed ${email} (${userId}) — this account can now publish.`);
    return true;
}

async function main() {
    await loadEnvLocal();

    console.log(c.bold('\nSupabase setup for the UPSC prep site\n'));

    const interactive = Boolean(process.stdin.isTTY);
    const rl = interactive
        ? createInterface({ input: process.stdin, output: process.stdout })
        : null;

    if (!interactive) {
        console.log(
            c.dim('Non-interactive run — using environment variables only.\n'),
        );
    }

    let schemaDone = false;
    let adminDone = false;

    try {
        // ---- 1. schema -------------------------------------------------
        let dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl && interactive) {
            console.log(
                c.dim(
                    'Database connection string (Supabase → Settings → Database → URI).\n' +
                        'Leave blank to skip and paste supabase/schema.sql in manually instead.',
                ),
            );
            dbUrl = await ask(rl, 'SUPABASE_DB_URL:');
        }

        if (dbUrl) {
            schemaDone = await applySchema(dbUrl);
        } else {
            skip('Schema skipped — paste supabase/schema.sql into the SQL editor.');
        }

        // ---- 2. admin user ---------------------------------------------
        console.log('');
        let projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!projectUrl && interactive) {
            projectUrl = await ask(rl, 'NEXT_PUBLIC_SUPABASE_URL:');
        }

        let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey && interactive) {
            console.log(
                c.dim(
                    'Service role key (Settings → API → service_role). Used only by this\n' +
                        'script, never by the site. Leave blank to skip admin creation.',
                ),
            );
            serviceKey = await ask(rl, 'SUPABASE_SERVICE_ROLE_KEY:');
        }

        if (projectUrl && serviceKey) {
            const email =
                process.env.ADMIN_EMAIL || (await ask(rl, 'Admin email:'));
            const password =
                process.env.ADMIN_PASSWORD ||
                (await ask(rl, 'Admin password (min 6 chars):'));

            if (email && password) {
                try {
                    adminDone = await createAdmin(
                        projectUrl,
                        serviceKey,
                        email,
                        password,
                    );
                } catch (error) {
                    if (!(error instanceof SetupError)) throw error;
                    fail(error.message);
                }
            } else {
                skip('Admin creation skipped — no email/password given.');
            }
        } else {
            skip('Admin creation skipped — no service role key given.');
        }
    } finally {
        rl?.close();
    }

    console.log(c.bold('\nNext:'));
    if (!schemaDone) {
        console.log('  • Paste supabase/schema.sql into the Supabase SQL editor.');
    }
    if (!adminDone) {
        console.log(
            '  • Create a user under Authentication → Users, then run\n' +
                "    insert into public.admins (id) values ('<that-user-uuid>');",
        );
    }
    console.log('  • Put NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    console.log('  • npm run dev, then sign in at /admin/login\n');
}

main().catch((error) => {
    fail(error instanceof SetupError ? error.message : error.stack || String(error));
    process.exit(1);
});
