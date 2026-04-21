export const metadata = {
  title: "Not available in your region — throws.gg",
  description:
    "throws.gg is not available in your region based on local regulations.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ r?: string; c?: string; rg?: string }>;
}

/**
 * Country-name lookup. Not exhaustive — just the ones we block so the
 * visitor sees a helpful label instead of a raw ISO-2 code. Keep in sync
 * with lib/geo/blocklist.ts.
 */
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  AU: "Australia",
  FR: "France",
  NL: "Netherlands",
  CW: "Curaçao",
  ES: "Spain",
  IT: "Italy",
  DE: "Germany",
  BE: "Belgium",
  PT: "Portugal",
  DK: "Denmark",
  SE: "Sweden",
  CH: "Switzerland",
  SG: "Singapore",
  HK: "Hong Kong",
  TR: "Turkey",
  IL: "Israel",
  PL: "Poland",
  CZ: "Czechia",
  IR: "Iran",
  KP: "North Korea",
  SY: "Syria",
  CU: "Cuba",
  RU: "Russia",
  BY: "Belarus",
  MM: "Myanmar",
  SD: "Sudan",
  SS: "South Sudan",
  ZW: "Zimbabwe",
  VE: "Venezuela",
  AF: "Afghanistan",
  UA: "Ukraine",
  CA: "Canada",
};

export default async function BlockedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const country = params.c?.toUpperCase();
  const region = params.rg?.toUpperCase();
  const reason = params.r;

  const countryName = country ? COUNTRY_NAMES[country] ?? country : null;
  const locationLabel = countryName
    ? region
      ? `${countryName} (${region})`
      : countryName
    : "your region";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full text-white/70 text-sm leading-relaxed space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            throws.gg is not available in {locationLabel}
          </h1>
          <p className="text-white/40 text-xs font-mono">
            HTTP 451 — Unavailable for Legal Reasons
          </p>
        </div>

        <p>
          {reason === "geo_unknown"
            ? "We couldn't determine your location, so access is blocked as a precaution. If you're using a VPN or privacy network, disabling it may resolve this. "
            : `Based on your current location${countryName ? ` (${countryName})` : ""}, you are not permitted to access throws.gg. `}
          This may be due to local gambling laws or our licence terms.
        </p>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
          <h2 className="text-white font-semibold text-sm">Licence</h2>
          <p className="text-xs text-white/50">
            throws.gg operates under an Anjouan gaming licence. We block
            regions where our licence does not permit service, or where local
            law prohibits online gambling.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
          <h2 className="text-white font-semibold text-sm">
            Travelling temporarily?
          </h2>
          <p className="text-xs text-white/50">
            If you believe this is an error — for example, you reside in a
            permitted jurisdiction and are travelling — contact{" "}
            <a
              href="mailto:compliance@throws.gg"
              className="text-violet/90 hover:text-violet underline"
            >
              compliance@throws.gg
            </a>{" "}
            with proof of residence. We do not reopen accounts for users who
            permanently reside in restricted regions.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
          <h2 className="text-white font-semibold text-sm">Support</h2>
          <p className="text-xs text-white/50">
            If you have funds on the platform and can no longer access it,
            email{" "}
            <a
              href="mailto:support@throws.gg"
              className="text-violet/90 hover:text-violet underline"
            >
              support@throws.gg
            </a>{" "}
            for withdrawal assistance. Access to gameplay is paused while in
            a restricted region; balances remain yours.
          </p>
        </div>

        <div className="pt-4 border-t border-white/[0.04] space-y-2">
          <p className="text-xs text-white/40">
            Online gambling carries financial risk. If you or someone you
            know is struggling with gambling, help is available:
          </p>
          <ul className="text-xs text-white/40 space-y-1 pl-4 list-disc">
            <li>
              <a
                href="https://www.begambleaware.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/70 underline"
              >
                BeGambleAware (UK)
              </a>
            </li>
            <li>
              <a
                href="https://www.ncpgambling.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/70 underline"
              >
                National Council on Problem Gambling (US)
              </a>
            </li>
            <li>
              <a
                href="https://www.gamblinghelponline.org.au/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/70 underline"
              >
                Gambling Help Online (AU)
              </a>
            </li>
          </ul>
        </div>

        <p className="text-[10px] text-white/25 font-mono pt-2">
          You must be 18+ to use throws.gg. Detected: {new Date().toISOString()}
        </p>
      </div>
    </div>
  );
}
