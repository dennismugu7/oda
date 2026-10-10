// Terms of use (M11 CP3, decisions #93 D9, #98), written from how oda works (spec,
// order-lifecycle.md, reviews #73, suspension #81 d / #82). The owner approves the wording.
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, OPERATOR, SUPPORT_EMAIL } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms · oda',
  description: 'The rules for selling and buying on oda.',
};

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="10 October 2026">
      <section>
        <h2>About oda</h2>
        <p>
          oda is run by {OPERATOR}, Kenya (&ldquo;we&rdquo;). It gives sellers in Kenya a free shop
          link and an Android app to run it, and lets buyers order from those shops. By using oda
          you agree to these terms and to our{' '}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
        <p>oda is free. If we ever introduce fees, we will tell sellers well before they apply.</p>
      </section>

      <section>
        <h2>Seller accounts</h2>
        <ul>
          <li>You must be 18 or older and give true details.</li>
          <li>
            One shop per account. Keep your password private: you are responsible for what is done
            with your account.
          </li>
          <li>
            The WhatsApp number and M-Pesa details on your shop must be yours, and buyers must be
            able to reach you on them.
          </li>
        </ul>
      </section>

      <section>
        <h2>Running your shop</h2>
        <p>You are the seller. You are responsible for:</p>
        <ul>
          <li>your products, photos, descriptions, prices and stock being true and lawful;</li>
          <li>delivering what was ordered, as described, and handling returns and refunds;</li>
          <li>following Kenyan law, including consumer protection and tax.</li>
        </ul>
        <p>You must not:</p>
        <ul>
          <li>
            sell anything illegal, counterfeit, stolen or dangerous, or use photos you have no right
            to use;
          </li>
          <li>mislead buyers, or take payment for orders you don&apos;t intend to deliver;</li>
          <li>
            use buyers&apos; details for anything other than their orders with you and your own
            customer contact, or share them with others.
          </li>
        </ul>
      </section>

      <section>
        <h2>Orders and payments</h2>
        <ul>
          <li>
            A sale is between the buyer and the seller. oda is not a party to it and never receives,
            holds or refunds money.
          </li>
          <li>
            Buyers pay the seller directly on M-Pesa (Till, Paybill or Pochi) or on delivery, as the
            shop allows. The seller confirms a payment after checking their own M-Pesa messages.
          </li>
          <li>
            An order waiting for an M-Pesa payment is cancelled automatically if it isn&apos;t paid
            within 48 hours.
          </li>
          <li>
            Buyers can cancel before the seller accepts the order. Sellers can cancel with a reason.
            If money was already paid, the seller refunds it directly.
          </li>
          <li>Buyers: only pay the number shown on your order&apos;s pay page.</li>
        </ul>
      </section>

      <section>
        <h2>Reviews</h2>
        <p>
          Buyers can review an order once it is delivered, once per order, and edit it for 7 days.
          Reviews must be honest and about the order. Links and phone numbers are removed. We may
          hide photos or remove reviews that break these terms. Sellers can reply and can report a
          review to us.
        </p>
      </section>

      <section>
        <h2>What we may do</h2>
        <ul>
          <li>
            Suspend or remove a shop that breaks these terms or the law, for example suspected
            fraud. A suspended shop is hidden from buyers and can&apos;t take new orders; the seller
            can still finish orders already placed.
          </li>
          <li>Change, pause or stop parts of oda. If we close oda, we will tell sellers first.</li>
        </ul>
      </section>

      <section>
        <h2>No guarantees</h2>
        <p>
          We work to keep oda running, but it is provided as it is, free of charge, and may
          sometimes be unavailable or slow (for example, photo uploads can be paused). As far as
          Kenyan law allows, we are not responsible for sales between buyers and sellers, for what
          sellers list, or for indirect losses. Nothing here limits rights that the law does not
          allow us to limit.
        </p>
      </section>

      <section>
        <h2>Ending</h2>
        <p>
          Sellers can delete their account at any time in the app or on the{' '}
          <Link href="/delete-account" className="underline">
            delete-account page
          </Link>
          . We may close an account that breaks these terms.
        </p>
      </section>

      <section>
        <h2>Law and changes</h2>
        <p>
          These terms are governed by the laws of Kenya, and the courts of Kenya decide any dispute.
          When we change them we update this page and its date, and tell sellers in the app or by
          email if the change matters. Questions:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
