import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existente = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existente) {
    return new Promise((resolve) => existente.addEventListener("load", () => resolve()));
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export default function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = (import.meta as any).env.VITE_TURNSTILE_SITE_KEY as string | undefined;
    if (!siteKey) {
      console.warn("[turnstile] VITE_TURNSTILE_SITE_KEY no configurada -- widget no se renderiza");
      return;
    }

    let cancelado = false;
    loadTurnstileScript().then(() => {
      if (cancelado || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "expired-callback": () => onVerify(""),
      });
    });

    return () => {
      cancelado = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="flex justify-center" />;
}
