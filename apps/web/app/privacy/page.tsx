// Privacy policy (M11 CP3, decisions #93 D9, #98), written from what the code does (the data
// inventory in progress.md, 2026-10-10). Keep it true: when a feature starts collecting,
// sharing or keeping data differently, change this page in the same PR. The oda_v cookie must
// stay described (decision #59 a). The owner approves the wording.
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, OPERATOR, SUPPORT_EMAIL } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy · oda',
  description: 'What oda collects, why, who sees it, how long it is kept and your rights.',
};

const mail = (
  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-navy underline">
    {SUPPORT_EMAIL}
  </a>
);

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="11 October 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          oda gives sellers in Kenya a free shop link. It is run by {OPERATOR}, Kenya
          (&ldquo;we&rdquo;). We decide how the data on this page is used (we are the data
          controller under Kenya&apos;s Data Protection Act, 2019). Contact: {mail}.
        </p>
        <p>
          This policy covers the oda seller app, this website and every shop page on it. Each seller
          runs their own shop and is responsible for how they use their buyers&apos; details outside
          oda.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <h3>If you sell on oda</h3>
        <ul>
          <li>
            Your email and password. The password is stored only in scrambled form (hashed), never
            as you typed it.
          </li>
          <li>
            If you sign in with Google: your Google account&apos;s email and the ID Google gives us
            for it. We don&apos;t receive your Google password or contacts, and we don&apos;t keep
            your Google name or photo.
          </li>
          <li>Your name and a recovery phone number, if you add them.</li>
          <li>
            Your shop: its name, link, logo, description, location, WhatsApp number, social handles,
            pickup details, delivery areas and fees, and the products and photos you add.
          </li>
          <li>
            Your M-Pesa details (Till, Paybill or Pochi number and name), so buyers know where to
            pay.
          </li>
          <li>Your answers during setup (what you sell, where you sell).</li>
          <li>Feedback you send us, with a screenshot if you add one.</li>
          <li>
            A notification token for your phone, and for each sign-in the time, IP address and
            device type, to keep your account secure.
          </li>
        </ul>
        <h3>If you order from a shop</h3>
        <ul>
          <li>
            Your name, phone number, whether you use WhatsApp, and your email if you give one (for
            receipts).
          </li>
          <li>Your delivery area and address, or that you will pick up.</li>
          <li>What you ordered and how you chose to pay.</li>
          <li>
            The M-Pesa code you enter after paying. We keep only the code, not the rest of the
            message.
          </li>
          <li>
            A review, if you leave one: your rating, words and photos, shown with your first name
            and last initial.
          </li>
          <li>A problem report, if you send one, with a contact number if you add it.</li>
        </ul>
        <p>
          If a seller records an order for you by hand, the seller gives us your name and phone
          number.
        </p>
        <h3>Everyone</h3>
        <ul>
          <li>
            Your IP address, for a short time, to stop abuse (for example too many sign-in tries or
            orders).
          </li>
          <li>
            How many people visit each shop each day, and from where (WhatsApp, TikTok and so on).
            This count holds nothing about you.
          </li>
        </ul>
        <p>
          Photos are checked when uploaded, and photos with location data are refused. We do not use
          advertising, analytics or tracking tools, and we never sell your data.
        </p>
      </section>

      <section>
        <h2>Cookies and your device</h2>
        <p>
          Shop pages set one small cookie, <code>oda_v</code>, so a visit to a shop is counted once
          a day. It holds today&apos;s date and short shop codes, nothing about you, and expires
          after two days. Your cart, favourites and the link you came from stay on your device
          (local storage) and never reach us until you order. The seller app keeps you signed in
          with a token stored securely on your phone. If Android closes the app, unsaved form text
          stays encrypted on your phone for up to 12 hours.
        </p>
      </section>

      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>
            To run oda for you: shops, orders, order pages, emails and notifications. This is needed
            to provide the service you asked for.
          </li>
          <li>
            To give sellers their own figures: sales, visits, and a list of their customers built
            from their orders.
          </li>
          <li>
            To keep oda safe and working: limiting abuse, investigating fraud and fixing errors.
            This is our legitimate interest.
          </li>
          <li>To answer support requests, reports and feedback.</li>
          <li>When the law requires it.</li>
        </ul>
      </section>

      <section>
        <h2>Who sees your data</h2>
        <ul>
          <li>
            <strong>The seller</strong> you order from sees your name, phone, WhatsApp choice,
            delivery details and M-Pesa code (not your email). Their customer list shows your name,
            phone and what you have bought, and they may contact you on WhatsApp or by phone.
          </li>
          <li>
            <strong>Anyone with your order link</strong> can open your order page, which shows your
            details. Keep the link private.
          </li>
          <li>
            <strong>The public</strong> sees shop pages: the shop&apos;s details and WhatsApp
            number, products and reviews (with the reviewer&apos;s first name and last initial). A
            shop&apos;s M-Pesa details appear only on the pay page of an order.
          </li>
          <li>
            <strong>{OPERATOR}</strong>, only when needed for support, reports, fraud or the law.
            Reports, feedback and reported reviews reach our support inbox in a daily email.
          </li>
        </ul>
        <h3>Services we use</h3>
        <p>
          These companies process data for us, only to provide their service. Some are outside
          Kenya, in the European Union or the United States. We use them with safeguards the Data
          Protection Act requires.
        </p>
        <ul>
          <li>Neon: our database, in Frankfurt, Germany.</li>
          <li>Vercel: hosting and file storage (photos, screenshots, backups), in Frankfurt.</li>
          <li>Resend: sends our emails.</li>
          <li>
            Sentry: error reports, stored in the EU. Emails, phones, codes, links and other personal
            details are removed before a report is sent.
          </li>
          <li>
            Expo and Google Firebase: deliver notifications to sellers&apos; phones. A notification
            can include a buyer&apos;s name, the amount and an M-Pesa code.
          </li>
          <li>GitHub: runs our scheduled jobs and makes our encrypted nightly backups.</li>
          <li>Cloudflare: points oda&apos;s web address to our hosting.</li>
          <li>Google Play: distributes the seller app.</li>
          <li>Google: confirms who you are when you choose to sign in with Google.</li>
        </ul>
        <p>
          Our emails use a font from Google Fonts, which your email app may load when it shows the
          email. WhatsApp links open WhatsApp on your phone; oda does not send WhatsApp messages for
          you.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>
            <strong>A seller&apos;s account and shop</strong>, with its orders and the buyer details
            in them: while the account exists. When a seller deletes their account, the shop closes
            at once and everything is removed 30 days later.
          </li>
          <li>Sign-ups that were never finished: 7 days.</li>
          <li>Records used to stop abuse (IP addresses, emails, phone numbers): 2 days.</li>
          <li>
            Password-reset and delete-account links: 1 hour; requests are removed after 30 days.
          </li>
          <li>Sign-ins: until you sign out, or after 60 days without use.</li>
          <li>
            Encrypted backups: 14 days, so deleted data can remain in a backup for up to 14 more
            days.
          </li>
          <li>
            A short record of what we did (account deletions, suspended shops, removed reviews: the
            shop&apos;s name and link, the reason, and for a removed review the reviewer&apos;s
            first name and initial), kept to show what happened and to prevent abuse.
          </li>
          <li>Error reports: deleted by Sentry after a limited time.</li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Under Kenya&apos;s Data Protection Act you can ask to see your data, correct it, delete
          it, or object to how we use it, and you can ask for a copy.
        </p>
        <ul>
          <li>
            Sellers can change their details in the app, and delete their account in the app (More →
            Settings → Delete account) or on the web at{' '}
            <Link href="/delete-account" className="underline">
              oda&apos;s delete-account page
            </Link>
            .
          </li>
          <li>
            Buyers: email {mail} with your order link or phone number and what you would like us to
            do. We may ask you to confirm it is you.
          </li>
        </ul>
        <p>
          If you are unhappy with how we handled your data, you can complain to the Office of the
          Data Protection Commissioner (odpc.go.ke).
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Everything travels encrypted (HTTPS). Passwords are hashed, the app&apos;s access to the
          database is limited to what it needs, backups are encrypted, and order links are long and
          secret. No system is perfectly safe; if something goes wrong that affects you, we will
          tell you and the Data Protection Commissioner as the law requires.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>oda is not meant for children. Sellers must be 18 or older.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          When we change this policy we update this page and its date. If a change matters to how
          your data is used, we will tell sellers in the app or by email first.
        </p>
      </section>
    </LegalPage>
  );
}
