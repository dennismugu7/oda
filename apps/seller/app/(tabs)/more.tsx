// More tab (design 20): payments, delivery and settings arrive in M8; Sign out lives here.
import { router } from 'expo-router';
import { useState } from 'react';
import { signOutLocal } from '@/auth/client';
import { useMe } from '@/auth/useMe';
import { clearOnboardingState } from '@/onboarding/useOnboarding';
import { Button } from '@/ui/auth';
import { TabPlaceholder, TabScreen } from '@/ui/tabs';

export default function MoreTab() {
  const me = useMe();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // Works offline too: the stored session is removed either way.
    await signOutLocal();
    clearOnboardingState();
    router.replace('/welcome');
  }

  return (
    <TabScreen title="More" subtitle={me?.email}>
      <TabPlaceholder
        icon="grid"
        title="Your settings"
        line="Payments, delivery and shop settings will show here."
      />
      <Button title="Sign out" variant="secondary" onPress={signOut} loading={signingOut} />
    </TabScreen>
  );
}
