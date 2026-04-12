import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dynamic catch-all for vanity affiliate slugs at the root level.
 * e.g. throws.gg/drake → looks up "drake" in vanity_slugs table.
 *
 * If found: redirects to /r/[slug] which handles localStorage capture + splash.
 * If not found: shows 404.
 *
 * This is a server component so we can do the DB check at request time
 * without exposing a client-side fetch.
 */
export default async function VanitySlugPage({
  params,
}: {
  params: Promise<{ vanitySlug: string }>;
}) {
  const { vanitySlug } = await params;
  const slug = vanitySlug.toLowerCase().trim();

  // Quick format check — vanity slugs are 3-32 chars, alphanumeric + hyphens
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
    notFound();
  }

  const supabase = createAdminClient();
  const { data: vanity } = await supabase
    .from("vanity_slugs")
    .select("slug")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (!vanity) {
    notFound();
  }

  // Redirect to /r/[slug] which handles the referral capture flow
  redirect(`/r/${slug}`);
}
