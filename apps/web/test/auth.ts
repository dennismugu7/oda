import { eq } from 'drizzle-orm';
import { schema } from '@oda/db';
import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db';

/**
 * A verified seller account with a session, through Better Auth (sign up, mark the email
 * verified as the code would, sign in). For tests that need a signed-in user, not the flow.
 */
export async function signUpVerified(name: string, email: string, password = 'kitenge2026') {
  const auth = getAuth();
  const res = await auth.api.signUpEmail({ body: { name, email, password } });
  await getDb()
    .update(schema.authUser)
    .set({ emailVerified: true })
    .where(eq(schema.authUser.id, res.user.id));
  const signedIn = await auth.api.signInEmail({ body: { email, password } });
  return { userId: res.user.id, token: signedIn.token };
}
