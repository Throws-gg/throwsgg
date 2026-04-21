import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

/**
 * /unsubscribe?token=...
 *
 * Server component — we do the unsubscribe on GET so one-tap from an email
 * client "just works" without a second click. Gmail's one-click Post will hit
 * /api/unsubscribe instead.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">missing unsubscribe token</h1>
        <p className="text-sm text-muted-foreground mt-2">
          we couldn&apos;t read the unsubscribe link. manage email preferences
          directly from <Link href="/settings" className="text-violet-400 underline">settings</Link>.
        </p>
      </Shell>
    );
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">invalid or expired link</h1>
        <p className="text-sm text-muted-foreground mt-2">
          manage email preferences directly from{" "}
          <Link href="/settings" className="text-violet-400 underline">settings</Link>.
        </p>
      </Shell>
    );
  }

  const supabase = createAdminClient();
  await supabase
    .from("users")
    .update({ email_unsubscribed_at: new Date().toISOString() })
    .eq("id", verified.userId)
    .is("email_unsubscribed_at", null);

  return (
    <Shell>
      <h1 className="text-xl font-semibold">unsubscribed</h1>
      <p className="text-sm text-muted-foreground mt-2">
        you won&apos;t get any more non-transactional emails from throws.gg.
        deposit, withdrawal, and security emails still send — those are
        required.
      </p>
      <p className="text-sm text-muted-foreground mt-4">
        change your mind?{" "}
        <Link href="/settings" className="text-violet-400 underline">
          resubscribe from settings →
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[60vh] max-w-xl mx-auto p-8 flex flex-col justify-center">
      <div className="bg-card border border-border rounded-lg p-6">
        {children}
      </div>
    </div>
  );
}
