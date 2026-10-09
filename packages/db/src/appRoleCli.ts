// `pnpm --filter @oda/db db:app-role`: creates / updates the app role and its grants, then checks
// them (decision #93 D5). Run by the db-app-role and migrate-staging workflows with the owner's
// direct string in DATABASE_URL_UNPOOLED; ODA_APP_DB_PASSWORD (optional) sets the role's
// password and lets it test a login. Without the password and without the role it does
// nothing. Prints host names and counts, never a password or connection string.
import { appendFileSync } from 'node:fs';
import { appRoleOk, appRoleUrl, checkAppLogin, ensureAppRole, neonPooledHost } from './appRole';

const ownerUrl = process.env.DATABASE_URL_UNPOOLED;
if (!ownerUrl) throw new Error('DATABASE_URL_UNPOOLED is not set (the owner role, direct string)');
const password = process.env.ODA_APP_DB_PASSWORD || undefined;

const report = await ensureAppRole({ ownerUrl, password });
const lines: string[] = [];

if (!report.exists) {
  lines.push(`Role \`${report.role}\` doesn't exist and no password was given: nothing to do.`);
} else {
  lines.push(
    `Role \`${report.role}\`: ${report.created ? 'created' : 'already there'}` +
      `${report.passwordSet ? ', password set' : ''}.`,
    `- tables with full read/write: ${report.tables - report.missingGrants.length} of ${report.tables}` +
      (report.missingGrants.length ? ` (missing: ${report.missingGrants.join(', ')})` : ''),
    `- member of: ${report.memberOf.join(', ') || 'no role'}`,
    `- elevated attributes: ${report.elevated.join(', ') || 'none'}`,
    `- can create in schema public: ${report.canCreateInPublic ? 'yes' : 'no'}`,
    `- objects owned: ${report.ownsObjects}`,
  );

  if (password) {
    const direct = new URL(ownerUrl);
    const targets: [string, string][] = [['direct', appRoleUrl(ownerUrl, password)]];
    const pooled = neonPooledHost(direct.hostname);
    if (pooled) {
      const url = new URL(appRoleUrl(ownerUrl, password));
      url.hostname = pooled;
      targets.push(['pooled', url.toString()]);
    }
    lines.push(`- database: \`${decodeURIComponent(direct.pathname.slice(1))}\``);
    for (const [label, url] of targets) {
      const check = await checkAppLogin(url);
      const ok = check.user === report.role && Object.values(check.refused).every(Boolean);
      if (!ok) process.exitCode = 1;
      lines.push(
        `- login (${label}, host \`${new URL(url).hostname}\`): as \`${check.user}\`; ` +
          `create table ${check.refused.createTable ? 'refused' : 'ALLOWED'}, ` +
          `drop table ${check.refused.dropTable ? 'refused' : 'ALLOWED'}, ` +
          `truncate ${check.refused.truncate ? 'refused' : 'ALLOWED'}`,
      );
    }
  }
  if (!appRoleOk(report)) process.exitCode = 1;
}

const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### App database role\n\n${text}\n`);
}
