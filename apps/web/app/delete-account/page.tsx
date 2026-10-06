import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { DeleteRequestForm } from './DeleteRequestForm';

export const metadata: Metadata = {
  title: 'Delete your oda account · oda',
  description: 'Close your oda shop and delete your account and data.',
  referrer: 'no-referrer',
};

// Self-serve account deletion on the web (decision #72 c; Google Play asks for one): the
// account email → a confirm link by email → the confirm page. The answer is the same whether
// or not the email has an account.
export default function DeleteAccountPage() {
  return (
    <AuthShell>
      <DeleteRequestForm />
    </AuthShell>
  );
}
