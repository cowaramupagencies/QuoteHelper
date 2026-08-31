import { useCallback, useEffect, useRef, useState } from "react";
import type { Quote } from "@/types";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function quoteFingerprint(quote: Quote): string {
  return JSON.stringify(quote);
}

export function useAutoSaveQuote(
  quote: Quote | null,
  setQuote: (quote: Quote) => void,
  delayMs = 800
) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const readyRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteRef = useRef(quote);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);

  quoteRef.current = quote;

  const persist = useCallback(
    async (toSave: Quote): Promise<Quote | null> => {
      savingRef.current = true;
      setStatus("saving");
      setError(null);

      try {
        const res = await fetch("/api/quotes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toSave),
        });
        if (!res.ok) throw new Error("Could not save quote");

        const savedQuote = (await res.json()) as Quote;
        lastSavedRef.current = quoteFingerprint(savedQuote);
        setQuote(savedQuote);
        setStatus("saved");

        const latest = quoteRef.current;
        if (latest && quoteFingerprint(latest) !== lastSavedRef.current) {
          queuedRef.current = true;
        }

        return savedQuote;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not save quote");
        return null;
      } finally {
        savingRef.current = false;
      }
    },
    [setQuote]
  );

  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = quoteRef.current;
    if (!current) return null;
    if (quoteFingerprint(current) === lastSavedRef.current) {
      setStatus("saved");
      return current;
    }
    return persist(current);
  }, [persist]);

  useEffect(() => {
    if (!quote) return;
    if (!readyRef.current) {
      lastSavedRef.current = quoteFingerprint(quote);
      readyRef.current = true;
      setStatus("saved");
    }
  }, [quote]);

  useEffect(() => {
    if (!quote || !readyRef.current) return;

    const fingerprint = quoteFingerprint(quote);
    if (fingerprint === lastSavedRef.current) return;

    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist(quote);
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [quote, delayMs, persist]);

  useEffect(() => {
    if (!queuedRef.current || savingRef.current || !quoteRef.current) return;
    queuedRef.current = false;
    void saveNow();
  }, [status, saveNow]);

  useEffect(() => {
    const flush = () => {
      void saveNow();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveNow]);

  const hasUnsavedChanges =
    quote != null &&
    readyRef.current &&
    quoteFingerprint(quote) !== lastSavedRef.current;

  useEffect(() => {
    if (!hasUnsavedChanges && status !== "pending" && status !== "saving") return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, status]);

  return { status, error, saveNow, hasUnsavedChanges };
}
