import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ResetFlow } from './ResetFlow';

export const metadata: Metadata = {
  title: 'Choose a new password · oda',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// 07: reached from the reset email (06). The token sits in the URL fragment (#token=…),
// which never reaches the server or its logs (decision #45); ResetFlow reads it in the
// browser, checks it, then shows the form or "This link has expired".
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetFlow />
    </AuthShell>
  );
}
