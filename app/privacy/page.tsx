export const metadata = {
  title: "Privacy Policy — throws.gg",
  description: "Privacy Policy for throws.gg virtual horse racing platform.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-white/70 text-sm leading-relaxed space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
        <p className="text-white/30 text-xs">Last updated: April 2026</p>
      </div>

      <p>
        This Privacy Policy explains what information throws.gg (&quot;the Platform&quot;, &quot;we&quot;, &quot;us&quot;) collects,
        how we use it, who we share it with, and the rights you have over your data. By using the Platform you agree to
        the practices described below.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
        <p>We collect only what we need to operate the Platform and meet our legal obligations.</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-white/85">Account data.</strong> Email address (via Privy login), Solana wallet
            address, username, and a unique account identifier. We do not collect your name, date of birth, or address
            unless required for an enhanced KYC review.
          </li>
          <li>
            <strong className="text-white/85">Authentication data.</strong> Your Privy account ID and a JSON Web Token
            issued by Privy when you log in. We do not see or store your password — Privy handles authentication.
          </li>
          <li>
            <strong className="text-white/85">Activity data.</strong> Bets placed, races viewed, deposits, withdrawals,
            balances, chat messages, and timestamps of these events.
          </li>
          <li>
            <strong className="text-white/85">Anti-abuse data.</strong> Browser fingerprint (via FingerprintJS), IP
            address at signup, and email-normalisation hashes. Used to enforce single-account rules and to prevent
            bonus farming, self-referrals, and sanctioned-jurisdiction sign-ups.
          </li>
          <li>
            <strong className="text-white/85">On-chain data.</strong> Solana transaction signatures for deposits and
            withdrawals. These are public on the Solana blockchain by design — anyone can inspect them.
          </li>
          <li>
            <strong className="text-white/85">Communication.</strong> Email opens, clicks, bounces, and unsubscribe
            preferences. We use this only to manage transactional and lifecycle email delivery.
          </li>
          <li>
            <strong className="text-white/85">Approximate geolocation.</strong> Country and region derived from your IP
            address by our hosting provider. Used to enforce geographic restrictions, not stored in raw form.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">2. How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To operate the Platform — credit deposits, settle bets, process withdrawals, run chat.</li>
          <li>To prevent fraud, abuse, money laundering, and underage gambling.</li>
          <li>To comply with applicable laws, court orders, and regulatory requests.</li>
          <li>To send transactional emails (deposit confirmations, withdrawal confirmations, login notices) which you
            cannot opt out of as long as you have an active account.</li>
          <li>To send retention emails (rakeback ready, daily bonus reminders, win-back) which you can disable in
            <a href="/settings" className="text-violet/80 hover:text-violet"> account settings</a>.</li>
          <li>To produce aggregated analytics (event counts, segment cohorts, withdrawal funnel metrics) without
            personally identifying individual users in third-party tooling.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">3. Third Parties We Share Data With</h2>
        <p>
          We do not sell your information. We share data only with infrastructure providers required to run the
          Platform, and only the minimum needed for them to do their job:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-white/85">Privy.</strong> Authentication and embedded wallet management. Receives
            email and login data.
          </li>
          <li>
            <strong className="text-white/85">Supabase.</strong> Database and real-time chat. Stores account, balance,
            and transaction records on our behalf.
          </li>
          <li>
            <strong className="text-white/85">Vercel.</strong> Hosting and edge networking. Sees IP addresses and
            request metadata.
          </li>
          <li>
            <strong className="text-white/85">Solana mainnet RPC providers.</strong> Public blockchain — receives
            wallet addresses and signature lookups, no personal data.
          </li>
          <li>
            <strong className="text-white/85">Resend.</strong> Email delivery. Receives email address and message
            content for emails we send.
          </li>
          <li>
            <strong className="text-white/85">PostHog.</strong> Product analytics. Receives a hashed user identifier
            and event metadata (bet types, page views, tier buckets). Wallet addresses are hashed before sending; raw
            balances are bucketed into tiers, never sent as exact figures.
          </li>
          <li>
            <strong className="text-white/85">FingerprintJS.</strong> Anti-abuse fingerprinting. Receives a
            browser-derived visitor ID, no PII.
          </li>
          <li>
            <strong className="text-white/85">Anthropic Claude.</strong> AI-generated post-race commentary. Receives
            anonymised race data (horses, finish order, distance) — no user data.
          </li>
        </ul>
        <p>
          We may also share data when legally compelled to do so by valid court orders, subpoenas, or regulatory
          authorities with jurisdiction over our operations. We will use reasonable efforts to notify you of such
          requests unless prohibited by law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">4. Data Retention</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Account, transaction, and bet records are retained for at least five years after account closure to
            satisfy AML and gaming-licence record-keeping requirements.</li>
          <li>Email logs are retained for 18 months for deliverability monitoring, then deleted.</li>
          <li>Self-exclusion records are retained permanently; we do not delete them on request because their purpose
            is to enforce a self-exclusion that you set.</li>
          <li>On-chain data on Solana is permanent and outside our control. We do not store private keys for your
            embedded wallet — Privy holds those in a hardware-secured trusted execution environment.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">5. Your Rights</h2>
        <p>Subject to local law and the retention obligations above, you may request:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-white/85">Access</strong> — a copy of the personal data we hold about you.</li>
          <li><strong className="text-white/85">Correction</strong> — to fix inaccurate data (e.g. a wrong email).</li>
          <li><strong className="text-white/85">Deletion</strong> — to remove your account and personal data, except
            for records we are legally required to retain (transaction history, fraud-prevention data, self-exclusion
            entries).</li>
          <li><strong className="text-white/85">Email opt-out</strong> — adjust marketing email preferences in
            <a href="/settings" className="text-violet/80 hover:text-violet"> settings</a> or via the unsubscribe link
            in any non-transactional email.</li>
          <li><strong className="text-white/85">Self-exclusion</strong> — see the
            <a href="/responsible-gambling" className="text-violet/80 hover:text-violet"> Responsible Gambling</a>{" "}
            page.</li>
        </ul>
        <p>
          To exercise any of these rights, email us at <span className="font-mono text-white/85">privacy@throws.gg</span>.
          We will respond within 30 days.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">6. Security</h2>
        <p>
          We use industry-standard practices to protect your data: HTTPS-only transport with HSTS, content-security
          headers, server-side authorisation on every API endpoint, encrypted database storage, and strict
          least-privilege access for staff. No system is perfectly secure. If we suffer a breach affecting your data,
          we will notify you within 72 hours of confirming the breach.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">7. International Transfers</h2>
        <p>
          We are a global service operating outside any single jurisdiction. Data is stored and processed across
          multiple regions depending on which providers are involved. By using the Platform you consent to your data
          being processed in jurisdictions other than your own. Where required by law, we apply appropriate safeguards
          (such as standard contractual clauses) to international transfers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">8. Children</h2>
        <p>
          The Platform is for adults only. We do not knowingly collect data from anyone under 18. If you believe a
          minor has registered, contact us at <span className="font-mono text-white/85">privacy@throws.gg</span> and we
          will delete the account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy as the Platform evolves and as the legal landscape around crypto gaming
          changes. Material changes will be announced via in-app notice or email. The &quot;Last updated&quot; date at
          the top of the page reflects the most recent revision.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">10. Contact</h2>
        <p>
          Privacy questions or data requests: <span className="font-mono text-white/85">privacy@throws.gg</span>
          <br />
          General support: <span className="font-mono text-white/85">support@throws.gg</span>
        </p>
      </section>

      <p className="text-white/30 text-xs">
        See also our <a href="/terms" className="text-violet/80 hover:text-violet">Terms of Service</a> and our{" "}
        <a href="/responsible-gambling" className="text-violet/80 hover:text-violet">Responsible Gambling</a> resources.
      </p>
    </div>
  );
}
