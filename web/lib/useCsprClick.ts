"use client";
// CSPR.click integration via the official HOSTED SDK script (window.csprclick).
//
// Why not the npm SDK: @make-software/csprclick-ui hard-pins React 18 (we run
// React 19), and @make-software/csprclick-core-client@1.11.0 ships ONLY .d.ts
// (no runtime .js — its `main` points at a missing file), so importing it throws
// "Cannot find module" at runtime. The supported path for a non-React-18 app is
// the hosted client script: it reads window.clickSDKOptions, creates
// window.csprclick, and fires "csprclick:loaded". Runtime comes from the CDN; we
// only keep @make-software/csprclick-core-types (real .js) for the enum values.
//
// appId: 'csprclick-template' works on localhost; set NEXT_PUBLIC_CSPR_CLICK_APP_ID
// (console.cspr.build) for a deployed domain.
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTENT_MODE, WALLET_KEYS } from "@make-software/csprclick-core-types";

const APP_ID = process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID || "csprclick-template";
const SDK_VERSION = process.env.NEXT_PUBLIC_CSPR_CLICK_VERSION || "2.1.0";
const SDK_SRC = `https://cdn.cspr.click/ui/v${SDK_VERSION}/csprclick-client-${SDK_VERSION}.js`;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { csprclick?: any; clickSDKOptions?: any; clickUIOptions?: any }
}

export type ClickAccount = { public_key: string; provider: string } | null;

export function useCsprClick() {
  const [account, setAccount] = useState<ClickAccount>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wired = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || wired.current) return;
    wired.current = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setFrom = (evt: any) =>
      setAccount(
        evt?.account?.public_key
          ? { public_key: evt.account.public_key, provider: evt.account.provider }
          : null,
      );

    let timer: ReturnType<typeof setTimeout> | undefined;

    const wire = () => {
      const sdk = window.csprclick;
      if (!sdk) return;
      if (timer) clearTimeout(timer);
      sdk.on("csprclick:signed_in", setFrom);
      sdk.on("csprclick:switched_account", setFrom);
      sdk.on("csprclick:signed_out", () => setAccount(null));
      setReady(true);
      // Pick up an existing session.
      Promise.resolve(sdk.getActiveAccountAsync?.())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((a: any) => a?.public_key && setAccount({ public_key: a.public_key, provider: a.provider }))
        .catch(() => {});
    };

    // The demo template app-id only initializes on localhost; on a real domain the
    // SDK never creates window.csprclick / fires csprclick:loaded. Don't spin
    // forever — surface a clear reason after a few seconds.
    timer = setTimeout(() => {
      if (!window.csprclick) {
        setError(
          APP_ID === "csprclick-template"
            ? "CSPR.click didn't initialize — the demo template app-id only works on localhost. Create your own app-id at console.cspr.build (add this domain) and set NEXT_PUBLIC_CSPR_CLICK_APP_ID."
            : "CSPR.click didn't initialize for this app-id — check the app-id and that this domain is allowlisted in console.cspr.build.",
        );
      }
    }, 9000);

    // The hosted script reads these globals on load and builds window.csprclick.
    window.clickSDKOptions = {
      appName: "Amanah",
      appId: APP_ID,
      contentMode: CONTENT_MODE.IFRAME,
      providers: [
        WALLET_KEYS.CASPER_WALLET,
        WALLET_KEYS.LEDGER,
        WALLET_KEYS.METAMASK_SNAP,
        WALLET_KEYS.W3A_GOOGLE,
        WALLET_KEYS.W3A_APPLE,
      ],
      chainName: "casper-test",
    };
    window.clickUIOptions = {
      uiContainer: "csprclick-ui",
      rootAppElement: "body",
      defaultTheme: "light",
      accountMenuItems: [],
    };

    if (window.csprclick) {
      wire();
      return;
    }
    window.addEventListener("csprclick:loaded", wire, { once: true });

    if (!document.getElementById("csprclick-client")) {
      const s = document.createElement("script");
      s.src = SDK_SRC;
      s.id = "csprclick-client";
      s.async = true;
      s.onerror = () => setError("Could not load the CSPR.click SDK script (network/CDN).");
      document.head.appendChild(s);
    }
  }, []);

  const signIn = useCallback(() => window.csprclick?.signIn(), []);
  const connect = useCallback(async (provider: string) => {
    try {
      await window.csprclick?.connect(provider);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const signOut = useCallback(() => window.csprclick?.signOut(), []);

  // Sign + submit an (unsigned) transaction JSON with the connected wallet. Returns the
  // deploy/tx hash. Throws on cancel/error/SDK-not-ready so the caller can show why.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = useCallback(async (tx: object, publicKey: string): Promise<string> => {
    const sdk = window.csprclick;
    if (!sdk?.send) throw new Error("Wallet SDK isn't ready on this domain (see the connect notice).");
    const res = await sdk.send(tx, publicKey, true, 120);
    if (!res || res.cancelled) throw new Error("Signing was cancelled in the wallet.");
    if (res.error) throw new Error(res.error);
    const hash = res.deployHash || res.transactionHash;
    if (!hash) throw new Error("The wallet returned no transaction hash.");
    return hash;
  }, []);

  return { account, ready, error, appId: APP_ID, signIn, connect, signOut, send };
}
