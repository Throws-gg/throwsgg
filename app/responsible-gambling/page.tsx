export const metadata = {
  title: "Responsible Gambling — throws.gg",
  description: "Responsible gambling resources and self-exclusion tools on throws.gg.",
};

export default function ResponsibleGamblingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-white/70 text-sm leading-relaxed space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Responsible Gambling</h1>
        <p className="text-white/30 text-xs">Your wellbeing matters more than any bet.</p>
      </div>

      <p>
        Gambling should be entertainment, not a source of income or a way to solve financial problems.
        If gambling stops being fun, it&apos;s time to stop. throws.gg is committed to promoting safe and
        responsible gambling practices.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Know the odds</h2>
        <p>
          throws.gg is a virtual horse racing platform where the house has a built-in mathematical edge.
          Over time, the house will always win. Short-term wins are possible, but long-term profitability
          for players is not expected. Every race is provably fair — the odds are transparent and verifiable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Set your limits</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-white/90">Only bet what you can afford to lose.</strong> Never gamble with money you need for rent, bills, food, or other essentials.</li>
          <li><strong className="text-white/90">Set a budget before you start.</strong> Decide how much you&apos;re willing to spend per session, per day, or per week — and stick to it.</li>
          <li><strong className="text-white/90">Set a time limit.</strong> It&apos;s easy to lose track of time. Take regular breaks.</li>
          <li><strong className="text-white/90">Don&apos;t chase losses.</strong> If you&apos;re on a losing streak, walk away. Increasing your bets to recover losses is the most common path to problem gambling.</li>
          <li><strong className="text-white/90">Don&apos;t gamble under the influence.</strong> Alcohol and drugs impair judgement and lead to riskier decisions.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Deposit limits</h2>
        <p>
          You can set daily, weekly, or monthly deposit limits on your account through the{" "}
          <a href="/settings" className="text-violet underline hover:text-violet/80">Settings</a> page.
          Deposit limit decreases take effect immediately. Increases take effect after a 24-hour cooling-off period.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Self-exclusion</h2>
        <p>
          If you need a break from gambling, you can self-exclude from throws.gg through your{" "}
          <a href="/settings" className="text-violet underline hover:text-violet/80">Settings</a> page.
          Self-exclusion options:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-white/90">24 hours</strong> — short cooldown period</li>
          <li><strong className="text-white/90">7 days</strong> — take a week off</li>
          <li><strong className="text-white/90">30 days</strong> — month-long break</li>
          <li><strong className="text-white/90">Permanent</strong> — your account will be permanently closed and cannot be reopened</li>
        </ul>
        <p>
          During self-exclusion, you will not be able to log in, place bets, or deposit funds.
          Any remaining balance can be withdrawn by contacting support.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Warning signs of problem gambling</h2>
        <p>You may have a gambling problem if you:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Spend more time or money gambling than you intended</li>
          <li>Feel restless or irritable when trying to stop</li>
          <li>Chase losses by betting more to try to win back money</li>
          <li>Lie to family, friends, or others about how much you gamble</li>
          <li>Borrow money or sell possessions to fund gambling</li>
          <li>Neglect work, studies, or relationships because of gambling</li>
          <li>Feel anxious, depressed, or guilty about gambling</li>
          <li>Gamble to escape problems or relieve negative feelings</li>
        </ul>
        <p>
          If any of these apply to you, please seek help. Problem gambling is treatable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Get help</h2>
        <p>
          The following organisations offer free, confidential support for problem gambling:
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-semibold text-white">Gambling Therapy</p>
            <p className="text-white/50">Free online support for anyone affected by gambling</p>
            <a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer"
              className="text-violet underline hover:text-violet/80">www.gamblingtherapy.org</a>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-semibold text-white">Gamblers Anonymous</p>
            <p className="text-white/50">12-step recovery program available worldwide</p>
            <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer"
              className="text-violet underline hover:text-violet/80">www.gamblersanonymous.org</a>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-semibold text-white">BeGambleAware (UK)</p>
            <p className="text-white/50">0808 8020 133 — free, 24/7</p>
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer"
              className="text-violet underline hover:text-violet/80">www.begambleaware.org</a>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="font-semibold text-white">National Council on Problem Gambling (US)</p>
            <p className="text-white/50">1-800-522-4700 — 24/7 helpline</p>
            <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer"
              className="text-violet underline hover:text-violet/80">www.ncpgambling.org</a>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Underage gambling</h2>
        <p>
          throws.gg is strictly for users aged 18 and over (or the legal gambling age in your jurisdiction).
          We do not knowingly accept registrations from minors. If you believe a minor is using the Platform,
          please contact us immediately at{" "}
          <a href="mailto:support@throws.gg" className="text-violet underline hover:text-violet/80">support@throws.gg</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Contact us</h2>
        <p>
          If you have concerns about your gambling behaviour or need assistance with self-exclusion or deposit limits,
          contact us at{" "}
          <a href="mailto:support@throws.gg" className="text-violet underline hover:text-violet/80">support@throws.gg</a>.
          We will respond within 24 hours.
        </p>
      </section>
    </div>
  );
}
