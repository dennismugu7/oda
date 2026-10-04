// Privacy (placeholder, owner Step 63): section headings + the facts already decided,
// including the oda_v visit cookie (decision #59).
import type { Metadata } from 'next';
import { LegalPage, SUPPORT_EMAIL } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy · oda (placeholder)' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <section>
        <h2>Who we are</h2>
        <p>oda gives sellers in Kenya a free shop link. Contact: {SUPPORT_EMAIL}.</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <p>
          Sellers: email, shop details and the products they add. Buyers: the details needed for an
          order (name, phone, delivery) when they place one.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>
          Shop pages set one small cookie, <code>oda_v</code>, so a visit to a shop is counted once
          a day. It holds today&apos;s date and short shop codes, nothing about you, and expires
          after two days. Your cart and favourites stay on your device (local storage).
        </p>
      </section>
      <section>
        <h2>Payments</h2>
        <p>Buyers pay sellers directly on M-Pesa. oda never holds your money.</p>
      </section>
      <section>
        <h2>Who sees your data</h2>
        <p>Order details are visible only to that shop&apos;s seller and to oda admins.</p>
      </section>
      <section>
        <h2>Your rights and deleting your data</h2>
        <p>Under Kenya&apos;s Data Protection Act you can ask to see or delete your data.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>This page will be replaced by the final policy before launch.</p>
      </section>
    </LegalPage>
  );
}
