// Terms (placeholder, owner Step 63): section headings only, plus the payment model.
import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms · oda (placeholder)' };

export default function Terms() {
  return (
    <LegalPage title="Terms">
      <section>
        <h2>Using oda</h2>
        <p>Final terms for sellers and buyers will be published here before launch.</p>
      </section>
      <section>
        <h2>Sellers</h2>
        <p>Sellers are responsible for their products, prices and deliveries.</p>
      </section>
      <section>
        <h2>Buyers and payments</h2>
        <p>
          Buyers pay the seller directly on M-Pesa or on delivery. oda never receives or holds
          payments.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>See below.</p>
      </section>
    </LegalPage>
  );
}
