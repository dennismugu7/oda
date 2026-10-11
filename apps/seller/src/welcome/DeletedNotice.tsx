// After Delete account (app/settings/delete.tsx opens Welcome with `deleted=1`): say it's done,
// once, in oda's notice sheet instead of an Android alert (decision #109 a).
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ConfirmSheet } from '@/ui/confirmSheet';

export function DeletedNotice() {
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const [visible, setVisible] = useState(deleted === '1');
  return (
    <ConfirmSheet
      visible={visible}
      notice
      title="Your account is deleted"
      message="Your shop is closed and you’re signed out. Your data is removed after 30 days."
      confirmLabel="OK"
      onClose={() => setVisible(false)}
    />
  );
}
