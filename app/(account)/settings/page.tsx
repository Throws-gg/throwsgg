"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_PREFERENCES,
  EmailCategory,
  isTransactional,
} from "@/lib/email/categories";

export default function SettingsPage() {
  const authedFetch = useAuthedFetch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [unsubscribedAt, setUnsubscribedAt] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<EmailCategory, boolean>>(
    DEFAULT_PREFERENCES
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/api/user/email-preferences");
        if (!res.ok) return;
        const data = await res.json();
        setEmail(data.email);
        setUnsubscribedAt(data.unsubscribedAt);
        setPrefs(data.preferences);
      } finally {
        setLoading(false);
      }
    })();
  }, [authedFetch]);

  const toggle = async (category: EmailCategory, value: boolean) => {
    if (isTransactional(category)) return;
    setPrefs((p) => ({ ...p, [category]: value }));
    setSaving(true);
    try {
      await authedFetch("/api/user/email-preferences", {
        method: "POST",
        body: JSON.stringify({ preferences: { [category]: value } }),
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const toggleUnsubAll = async (unsubscribe: boolean) => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/user/email-preferences", {
        method: "POST",
        body: JSON.stringify({ unsubscribeAll: unsubscribe }),
      });
      if (res.ok) {
        setUnsubscribedAt(unsubscribe ? new Date().toISOString() : null);
        setSavedAt(Date.now());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">settings</h1>
        <p className="text-sm text-muted-foreground">manage your account</p>
      </div>

      {/* Email preferences */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div>
          <h2 className="text-sm font-medium">email preferences</h2>
          <p className="text-xs text-muted-foreground">
            {email ? (
              <>sending to <span className="text-foreground">{email}</span></>
            ) : (
              <>no email on file — sign in with email to enable retention emails</>
            )}
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">loading…</p>
        ) : (
          <>
            {unsubscribedAt ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400 flex items-center justify-between gap-3">
                <span>
                  you&apos;re unsubscribed from all non-transactional emails.
                  deposit + withdrawal confirmations still send.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"
                  disabled={saving}
                  onClick={() => toggleUnsubAll(false)}
                >
                  resubscribe
                </Button>
              </div>
            ) : null}

            <div className="space-y-2">
              {ALL_CATEGORIES.map((cat) => {
                const locked = isTransactional(cat);
                const checked = locked ? true : prefs[cat];
                return (
                  <label
                    key={cat}
                    className="flex items-start gap-3 py-1.5 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked || saving}
                      onChange={(e) => toggle(cat, e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-violet-500"
                    />
                    <span className="text-xs flex-1">
                      <span className="text-foreground">{CATEGORY_LABELS[cat]}</span>
                      {locked ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          always on
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            <Separator className="my-2" />

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {savedAt ? "saved" : "changes save automatically"}
              </div>
              {!unsubscribedAt ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  disabled={saving}
                  onClick={() => toggleUnsubAll(true)}
                >
                  unsubscribe from all
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Sound */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">sound</h2>
        <p className="text-xs text-muted-foreground">
          volume and sound preferences coming soon
        </p>
      </div>

      {/* Deposit limits */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">deposit limits</h2>
        <p className="text-xs text-muted-foreground">
          set daily, weekly, or monthly deposit caps
        </p>
      </div>

      <Separator />

      {/* Self-exclusion */}
      <div className="bg-card border border-destructive/30 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium text-destructive">self-exclusion</h2>
        <p className="text-xs text-muted-foreground">
          take a break. lock your account for a set period.
        </p>
        <div className="flex gap-2">
          {["24h", "7d", "30d", "permanent"].map((period) => (
            <Button
              key={period}
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
            >
              {period}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
