import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { DeleteConfirmFlow } from './DeleteConfirmFlow';

export const metadata: Metadata = {
  title: 'Confirm deleting your account · oda',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// Reached from the deletion email. The token sits in the URL fragment (#token=…), which never
// reaches the server or its logs (decision #45); the flow checks it, then shows one button.
export default function DeleteConfirmPage() {
  return (
    <AuthShell>
      <DeleteConfirmFlow />
    </AuthShell>
  );
}
