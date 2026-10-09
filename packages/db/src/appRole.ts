// The app's least-privilege database role (decision #93 D5, hardening report S11).
//
// The web app connects as `oda_app`: rows only (SELECT / INSERT / UPDATE / DELETE), no DDL, no
// TRUNCATE, owns nothing, member of no role. Migrations, backups and this script keep the
// owner role. The role is created here in SQL, never in the Neon console: console roles join
// `neon_superuser`. Elsewhere the password reaches Postgres only as a SCRAM verifier computed
// here. Neon refuses verifiers ("Neon only supports being given plaintext passwords"), so on a
// Neon host the password is sent as-is, over TLS, and Neon stores its own SCRAM hash.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { Pool } from 'pg';

export const APP_ROLE = 'oda_app';

const ROLE_NAME = /^[a-z_][a-z0-9_]*$/;

/** Grants for `role`, run by the owner role (the one that runs migrations). Safe to re-run. */
export function appRoleGrants(role: string): string {
  if (!ROLE_NAME.test(role)) throw new Error('Invalid role name');
  return `
    grant usage on schema public to ${role};
    revoke create on schema public from ${role};
    grant select, insert, update, delete on all tables in schema public to ${role};
    grant usage, select, update on all sequences in schema public to ${role};
    grant execute on all functions in schema public to ${role};
    alter default privileges in schema public grant select, insert, update, delete on tables to ${role};
    alter default privileges in schema public grant usage, select, update on sequences to ${role};
    alter default privileges in schema public grant execute on functions to ${role};
  `;
}

/** A SCRAM-SHA-256 verifier for `password`, as Postgres stores it (RFC 5802 / 7677). */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096): string {
  // Printable ASCII only, so no SASLprep normalisation is needed.
  if (!/^[\x21-\x7e]{24,128}$/.test(password)) {
    throw new Error('The role password must be 24–128 printable ASCII characters');
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

export interface AppRoleReport {
  role: string;
  /** False when the role doesn't exist and no password was given (nothing was done). */
  exists: boolean;
  created: boolean;
  passwordSet: boolean;
  tables: number;
  /** Tables the role can't fully read and write (must be empty). */
  missingGrants: string[];
  /** Roles it is a member of, e.g. neon_superuser (must be empty). */
  memberOf: string[];
  /** Superuser, createdb, createrole, replication, bypassrls (all must be false). */
  elevated: string[];
  canCreateInPublic: boolean;
  ownsObjects: number;
  /** Open connections to this database per role (evidence of which role the app uses). */
  connections: Record<string, number>;
}

/** True when the report shows a role with exactly the rights it should have. */
export function appRoleOk(r: AppRoleReport): boolean {
  return (
    r.exists &&
    r.missingGrants.length === 0 &&
    r.memberOf.length === 0 &&
    r.elevated.length === 0 &&
    !r.canCreateInPublic &&
    r.ownsObjects === 0
  );
}

/**
 * Creates or updates the role (when `password` is given), applies the grants and reports what
 * the role can do. Without a password and without the role, it does nothing (`exists: false`).
 * `ownerUrl` must be the direct (unpooled) owner connection.
 */
export async function ensureAppRole(opts: {
  ownerUrl: string;
  password?: string;
  role?: string;
  /** Send the password itself instead of a SCRAM verifier (needed on Neon). */
  plaintextPassword?: boolean;
}): Promise<AppRoleReport> {
  const role = opts.role ?? APP_ROLE;
  if (!ROLE_NAME.test(role)) throw new Error('Invalid role name');
  const verifier = opts.password ? scramVerifier(opts.password) : null;
  // scramVerifier checked the password (24–128 printable ASCII); quotes are doubled.
  const secret = opts.plaintextPassword ? opts.password?.replaceAll("'", "''") : verifier;
  const pool = new Pool({ connectionString: opts.ownerUrl, max: 1 });
  try {
    const found = await pool.query('select 1 from pg_roles where rolname = $1', [role]);
    let exists = found.rowCount === 1;
    let created = false;
    if (verifier) {
      // The verifier is base64 plus `$` and `:`; checked before it goes into the statement.
      if (!/^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier)) {
        throw new Error('Unexpected verifier format');
      }
      const attrs = 'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit';
      if (!exists) {
        await pool.query(`create role ${role} with ${attrs} password '${secret}'`);
        exists = true;
        created = true;
      } else {
        await pool.query(`alter role ${role} with ${attrs} password '${secret}'`);
      }
    }
    if (!exists) return emptyReport(role);
    await pool.query(appRoleGrants(role));
    return { ...(await inspect(pool, role)), created, passwordSet: verifier !== null };
  } finally {
    await pool.end();
  }
}

function emptyReport(role: string): AppRoleReport {
  return {
    role,
    exists: false,
    created: false,
    passwordSet: false,
    tables: 0,
    missingGrants: [],
    memberOf: [],
    elevated: [],
    canCreateInPublic: false,
    ownsObjects: 0,
    connections: {},
  };
}

async function inspect(
  pool: Pool,
  role: string,
): Promise<Omit<AppRoleReport, 'created' | 'passwordSet'>> {
  const attrs = await pool.query<Record<string, boolean>>(
    `select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       from pg_roles where rolname = $1`,
    [role],
  );
  const elevated = Object.entries(attrs.rows[0] ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name.replace(/^rol/, ''));
  const memberOf = await pool.query<{ name: string }>(
    `select g.rolname as name from pg_auth_members m
       join pg_roles g on g.oid = m.roleid
       join pg_roles r on r.oid = m.member
      where r.rolname = $1 order by 1`,
    [role],
  );
  const tables = await pool.query<{ name: string; ok: boolean }>(
    // A comma list in has_table_privilege means "any of"; every one is needed, so check each.
    `select quote_ident(tablename) as name,
            (select bool_and(has_table_privilege($1, format('public.%I', tablename), p))
               from unnest(array['select', 'insert', 'update', 'delete']) p) as ok
       from pg_tables where schemaname = 'public' order by 1`,
    [role],
  );
  const create = await pool.query<{ ok: boolean }>(
    `select has_schema_privilege($1, 'public', 'create') as ok`,
    [role],
  );
  const owns = await pool.query<{ n: string }>(
    `select count(*) as n from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = $1`,
    [role],
  );
  const conns = await pool.query<{ name: string; n: string }>(
    `select usename as name, count(*) as n from pg_stat_activity
      where datname = current_database() and usename is not null and pid <> pg_backend_pid()
      group by 1 order by 1`,
  );
  return {
    role,
    exists: true,
    connections: Object.fromEntries(conns.rows.map((r) => [r.name, Number(r.n)])),
    tables: tables.rowCount ?? 0,
    missingGrants: tables.rows.filter((t) => !t.ok).map((t) => t.name),
    memberOf: memberOf.rows.map((r) => r.name),
    elevated,
    canCreateInPublic: create.rows[0]?.ok ?? true,
    ownsObjects: Number(owns.rows[0]?.n ?? 0),
  };
}

/** `ownerUrl` with the app role's user and password (same host and database). */
export function appRoleUrl(ownerUrl: string, password: string, role = APP_ROLE): string {
  const url = new URL(ownerUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

/** True for a Neon host (which needs `plaintextPassword`). */
export function isNeonHost(host: string): boolean {
  return host.endsWith('.neon.tech');
}

/** Neon's pooled host for a direct host (`ep-x.region.aws.neon.tech` → `ep-x-pooler.…`). */
export function neonPooledHost(host: string): string | null {
  const m = /^(ep-[a-z0-9-]+?)(-pooler)?(\..+\.neon\.tech)$/.exec(host);
  return m ? `${m[1]}-pooler${m[3]}` : null;
}

export interface LoginCheck {
  user: string;
  /** Each must be refused (42501 insufficient privilege, or 42P01 for a missing table). */
  refused: Record<'createTable' | 'dropTable' | 'truncate', boolean>;
}

/** Logs in as the app role and checks it can read but can't create, drop or truncate. */
export async function checkAppLogin(appUrl: string): Promise<LoginCheck> {
  const pool = new Pool({ connectionString: appUrl, max: 1 });
  try {
    const who = await pool.query<{ user: string }>('select current_user as user');
    await pool.query('select count(*) from shops');
    const refused = async (statement: string) => {
      try {
        await pool.query('begin');
        await pool.query(statement);
        return false;
      } catch (error) {
        const code = (error as { code?: string }).code;
        return code === '42501';
      } finally {
        await pool.query('rollback');
      }
    };
    return {
      user: who.rows[0]?.user ?? '',
      refused: {
        createTable: await refused('create table oda_app_probe (x int)'),
        dropTable: await refused('drop table ops_events'),
        truncate: await refused('truncate ops_events'),
      },
    };
  } finally {
    await pool.end();
  }
}
