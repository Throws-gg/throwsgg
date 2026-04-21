/**
 * Jurisdiction blocklist for throws.gg.
 *
 * Sourced from swarm-research-for-launch/25-geoblock-jurisdictions.md.
 * Anjouan-licensed operator — block where (a) we lack a required local
 * licence, (b) local law bans online gambling, (c) OFAC/UN/EU sanctions
 * apply, or (d) peer crypto-casinos block as risk hygiene.
 *
 * Edits here are cheap — rebuild + deploy and Vercel edge picks up the new
 * list within ~30s. If a jurisdiction legalises or we license, remove the
 * ISO-2 code and document why in a commit message.
 *
 * AU is intentionally NOT in the launch list — Connor (founder) is in AU
 * pre-launch and needs access for testing. Add 'AU' to BLOCKED_COUNTRIES
 * when Connor confirms he's relocated.
 */

// ISO-3166-1 alpha-2. Vercel uses GB (not UK).
export const BLOCKED_COUNTRIES: ReadonlySet<string> = new Set([
  // Regulatory (country-level bans / unlicensed operation = criminal exposure)
  "US", // UIGEA + state bans
  "GB", // UKGC licence
  "FR", // ANJ monopoly
  "NL", // KSA licence
  "CW", // Curaçao — operator choice (licensed peers block)
  "ES", // DGOJ
  "IT", // ADM + .it domain
  "DE", // GGL
  "BE", // BGC
  "PT", // SRIJ
  "DK", // Spillemyndigheden
  "SE", // Spelinspektionen
  "CH", // Gespa
  "SG", // Remote Gambling Act 2014
  "HK", // Gambling Ordinance
  "TR", // Total ban
  "IL", // Illegal
  "PL", // Ustawa hazardowa
  "CZ", // MF licence
  // OFAC / UN / EU / UK sanctions (non-negotiable)
  "IR", // Iran
  "KP", // North Korea
  "SY", // Syria
  "CU", // Cuba
  "RU", // Russia (EU/UK sanctions)
  "BY", // Belarus
  "MM", // Myanmar
  "SD", // Sudan
  "SS", // South Sudan
  "ZW", // Zimbabwe
  "VE", // Venezuela
  "AF", // Afghanistan (high FATF risk)
  // AU intentionally excluded for launch — add when Connor relocates.
]);

/**
 * US states to block *if the US country block were ever lifted*. With US
 * in BLOCKED_COUNTRIES this set is defence-in-depth only. Keep for clarity.
 */
export const BLOCKED_US_STATES: ReadonlySet<string> = new Set([
  "WA", // Class C felony (RCW 9.46.240)
  "NV", "NY", "CT", "NJ", "PA", "MI", "WV", "DE", "TN", "LA", "ID", "UT", "HI",
]);

/** Occupied Ukrainian oblasts — UN/EU sanctions. ISO-3166-2 subdivision codes. */
export const BLOCKED_UA_REGIONS: ReadonlySet<string> = new Set([
  "43", // Crimea
  "09", // Luhansk
  "14", // Donetsk
]);

/** Canadian province regs — Ontario iGaming requires iGO licence. */
export const BLOCKED_CA_REGIONS: ReadonlySet<string> = new Set(["ON"]);

export interface GeoBlockDecision {
  blocked: boolean;
  reason?: "country" | "us_state" | "ua_region" | "ca_region" | "geo_unknown";
  country?: string | null;
  region?: string | null;
}

/**
 * Decide whether a visitor from this country+region should be blocked.
 * Fails closed — if we can't determine the country, block.
 *
 * `country` and `region` are the raw values from Vercel's
 * x-vercel-ip-country / x-vercel-ip-country-region headers.
 */
export function decideGeoBlock(
  country: string | null | undefined,
  region: string | null | undefined,
): GeoBlockDecision {
  if (!country || country === "XX" || country.length !== 2) {
    return { blocked: true, reason: "geo_unknown", country, region };
  }

  const c = country.toUpperCase();
  const r = (region ?? "").toUpperCase();

  if (BLOCKED_COUNTRIES.has(c)) {
    return { blocked: true, reason: "country", country: c, region: r || null };
  }
  if (c === "US" && r && BLOCKED_US_STATES.has(r)) {
    return { blocked: true, reason: "us_state", country: c, region: r };
  }
  if (c === "UA" && r && BLOCKED_UA_REGIONS.has(r)) {
    return { blocked: true, reason: "ua_region", country: c, region: r };
  }
  if (c === "CA" && r && BLOCKED_CA_REGIONS.has(r)) {
    return { blocked: true, reason: "ca_region", country: c, region: r };
  }

  return { blocked: false, country: c, region: r || null };
}
