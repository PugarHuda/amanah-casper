"use client";

// Proof lab — the point of Amanah is "don't trust us, check it". This page re-runs our
// cryptography IN YOUR BROWSER against the exact bytes the Casper contracts accepted,
// and lets you tamper with the inputs to watch the proofs fail.
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { blake2b } from "blakejs";
import { verifyReserves, bytesToHex, type ReservesProof } from "@/lib/zk-verify";
import { computeLeaf, verifyInclusion } from "@/lib/merkle-verify";
import { verifyRange } from "@/lib/range-verify";
import { verifyAssignment } from "@/lib/select-verify";

const EXPLORER = "https://testnet.cspr.live";
const mono: React.CSSProperties = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 11, wordBreak: "break-all" };

type Reserves = ReservesProof & {
  labels?: string[]; total: string; principalFloor: string; deployHash: string; H: string; contractPackage: string;
};

type Liabilities = {
  root: string; total: string; clientCount: number;
  proofs: { id: string; balance: string; nonce: string; leaf: string; path: { hash: string; right: boolean }[] }[];
};

type Assignment = {
  decisionHash: string; k: number;
  auditors: { id: string; account: string; ticket: string }[]; assigned: string[];
};

type RedTeam = {
  at: string; total: number; blocked: number;
  results: { id: string; what: string; detectedInInput: string[]; action: string | null; move: string | null; blocked: boolean; guardViolations: string[] }[];
};

function Badge({ ok, okText, badText }: { ok: boolean | null; okText: string; badText: string }) {
  if (ok === null) return <span style={{ fontSize: 13, color: "var(--faint)" }}>checking…</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 999, fontSize: 13, fontWeight: 700,
      background: ok ? "var(--ok-bg)" : "var(--bad-bg)", color: ok ? "var(--green-deep)" : "#b3382c", border: `1px solid ${ok ? "#c9e7d5" : "#f0cdc9"}` }}>
      {ok ? "✓ " + okText : "✗ " + badText}
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--border2)" }}>
      <span style={{ fontSize: 11, color: "var(--faint)", minWidth: 122, flexShrink: 0 }}>{k}</span>
      <span className="mono" style={mono}>{v}</span>
    </div>
  );
}

/** Flip exactly ONE character of the blob. The point is that any edit at all — a single
 *  digit — changes blake2b completely, so the attested hash no longer matches. */
function tamperText(raw: string): string {
  const i = raw.search(/[1-9]/);
  if (i < 0) return raw + " ";
  const d = raw[i] === "9" ? "8" : String(Number(raw[i]) + 1);
  return raw.slice(0, i) + d + raw.slice(i + 1);
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--border2)", borderRadius: 18, padding: "22px 24px", background: "var(--surface-subtle)", marginBottom: 18 }}>
      <h2 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 400, color: "var(--ink)" }}>{title}</h2>
      <p style={{ margin: "6px 0 16px", fontSize: 13.5, color: "var(--muted, #6b6b6b)", lineHeight: 1.55 }}>{sub}</p>
      {children}
    </section>
  );
}

export default function VerifyPage() {
  // --- ZK proof-of-reserves -------------------------------------------------
  const [rv, setRv] = useState<Reserves | null>(null);
  const [rvErr, setRvErr] = useState<string | null>(null);
  const [rvTampered, setRvTampered] = useState(false);
  const [rvOut, setRvOut] = useState<ReturnType<typeof verifyReserves> | null>(null);
  const [rvMs, setRvMs] = useState(0);

  useEffect(() => {
    fetch("/proofs/reserves.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRv)
      .catch((e) => setRvErr(e.message || "could not load the proof"));
  }, []);
  useEffect(() => {
    if (!rv) return;
    const claimed = rvTampered ? (BigInt(rv.total) + 1_000_000_000n).toString() : rv.total;
    const t0 = performance.now();
    setRvOut(verifyReserves({ commitments: rv.commitments, total: claimed, proofT: rv.proofT, s: rv.s }));
    setRvMs(Math.round((performance.now() - t0) * 10) / 10);
  }, [rv, rvTampered]);

  // --- proof-of-reasoning ---------------------------------------------------
  const [blob, setBlob] = useState<{ hash: string; raw: string; cid: string | null } | null>(null);
  const [blobErr, setBlobErr] = useState<string | null>(null);
  const [poTampered, setPoTampered] = useState(false);
  const [computed, setComputed] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reasoning")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? "unavailable"))))
      .then(setBlob)
      .catch((e) => setBlobErr(e.message));
  }, []);
  useEffect(() => {
    if (!blob) return;
    const text = poTampered ? tamperText(blob.raw) : blob.raw;
    setComputed(bytesToHex(blake2b(new TextEncoder().encode(text), undefined, 32)));
  }, [blob, poTampered]);

  // --- red-team results (prompt-injection defence) --------------------------
  const [rt, setRt] = useState<RedTeam | null>(null);
  useEffect(() => {
    fetch("/redteam.json").then((r) => (r.ok ? r.json() : null)).then(setRt).catch(() => {});
  }, []);

  // --- range proofs (each hidden allocation ∈ [0, 2^N)) ---------------------
  const [rangeOk, setRangeOk] = useState<boolean | null>(null);
  const [rangeBits, setRangeBits] = useState(48);
  useEffect(() => {
    if (!rv) return;
    fetch("/proofs/rangeproof.json").then((r) => (r.ok ? r.json() : null)).then((rp) => {
      if (!rp?.byCommitment) { setRangeOk(null); return; }
      setRangeBits(rp.bits ?? 48);
      // Verify every commitment's range proof (they're bound to the reserves commitments).
      const ok = rv.commitments.every((c) => rp.byCommitment[c] && verifyRange(c, rp.byCommitment[c]));
      setRangeOk(ok);
    }).catch(() => setRangeOk(null));
  }, [rv]);

  // --- verifiable auditor assignment (B7) -----------------------------------
  const [assign, setAssign] = useState<Assignment | null>(null);
  useEffect(() => {
    fetch("/auditor-assignment.json").then((r) => (r.ok ? r.json() : null)).then(setAssign).catch(() => {});
  }, []);

  // --- proof-of-liabilities (Merkle) ----------------------------------------
  const [liab, setLiab] = useState<Liabilities | null>(null);
  const [pick, setPick] = useState(0);
  const [liabTampered, setLiabTampered] = useState(false);
  useEffect(() => {
    fetch("/liabilities.json").then((r) => (r.ok ? r.json() : null)).then(setLiab).catch(() => {});
  }, []);

  const fmtUsd = (v: string) => "$" + (Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 });

  // The headline claim is SOLVENCY, which is two things: the sum proof verifies, and the
  // proven total is at least the locked principal (and there is something to prove about).
  const claimedTotal = rv ? (rvTampered ? BigInt(rv.total) + 1_000_000_000n : BigInt(rv.total)) : 0n;
  const coversPrincipal = !!rv && rv.commitments.length > 0 && claimedTotal >= BigInt(rv.principalFloor);

  return (
    <main className="page">
      <div className="card">
        <Nav />

        <div style={{ marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="pulse-dot" />
            <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>PROOF LAB · RUNS IN YOUR BROWSER</span>
          </div>
          <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 42, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.8px" }}>
            Don’t trust us. Verify.
          </h1>
          <p style={{ margin: "12px 0 16px", fontSize: 15, color: "var(--muted, #6b6b6b)", maxWidth: 720, lineHeight: 1.6 }}>
            Every claim Amanah makes is checkable. The checks below run <strong>client-side, on your
            machine</strong>, against the exact bytes the Casper contracts accepted — then you can
            tamper with the inputs and watch the proofs break.
          </p>
          {/* The strongest published criticism of zk proof-of-reserves is that only auditors
              can actually check it. This page exists specifically to answer that. */}
          <p style={{ margin: "0 0 30px", padding: "13px 16px", maxWidth: 720, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink2)", background: "var(--surface-subtle)", border: "1px solid var(--border2)", borderRadius: 14 }}>
            <strong>Why this page exists.</strong> The main criticism of zero-knowledge
            proof-of-reserves is <em>asymmetric verifiability</em> — the cryptography is strong, but
            non-technical users can&apos;t inspect it, so only auditors can really check it
            (<a href="https://arxiv.org/pdf/2606.08211" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>arXiv 2606.08211</a>).
            You shouldn&apos;t need to read a paper to falsify our claim: press a tamper button and
            watch the proof fail. See <a href="https://github.com/PugarHuda/amanah-casper/blob/master/RESEARCH.md" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>RESEARCH.md</a> for the sources behind each control.
          </p>
        </div>

        {/* 1 — ZK proof-of-reserves */}
        <Card
          title="1 · Zero-knowledge proof-of-solvency"
          sub="Solvency has two halves — assets AND liabilities — so both are checked here: the hidden per-asset allocations must sum to the claimed total (assets), and that total must cover the locked principal (our liability). Neither individual amount is revealed. Below is the Pedersen+Schnorr proof the on-chain verifier accepted; your browser re-derives the generator H, recomputes the Fiat–Shamir challenge, and checks s·H = proof_T + c·(ΣC − T·G)."
        >
          {rvErr ? (
            <p style={{ fontSize: 13, color: "var(--faint)" }}>
              Couldn&apos;t load the published proof ({rvErr}). It is also verifiable straight from the
              chain — see the{" "}
              <a href={`${EXPLORER}/deploy/aa4d82eb5b61c582d4910707ad25d223de3df03435835901112013b057b00565`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>
                on-chain verification ↗
              </a>.
            </p>
          ) : !rv ? <span style={{ fontSize: 13, color: "var(--faint)" }}>loading proof…</span> : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
                {/* Solvency needs BOTH: the sum proof must verify AND the proven total must
                    actually cover the locked principal (the contract checks the floor too —
                    a valid proof of a total below the floor is still insolvent). */}
                <Badge
                  ok={rvOut ? rvOut.ok && coversPrincipal : null}
                  okText={`verified in ${rvMs} ms · covers principal`}
                  badText={rvOut && rvOut.ok && !coversPrincipal ? "proof valid, but reserves < principal" : "proof rejected"}
                />
                {/* Range proofs: each hidden allocation is proven ∈ [0, 2^48) so a prover
                    can't use wrapped/negative values to fake the sum. */}
                <Badge ok={rangeOk} okText={`each allocation proven ≥ 0 (${rangeBits}-bit range)`} badText="range proof failed" />
                <button onClick={() => setRvTampered((t) => !t)}
                  style={{ padding: "8px 15px", borderRadius: 10, border: "1px solid var(--border)", background: rvTampered ? "var(--bad-bg)" : "var(--surface, #fff)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>
                  {rvTampered ? "↺ restore the real total" : "⚡ claim $1,000 more than we hold"}
                </button>
                <a href={`${EXPLORER}/deploy/${rv.deployHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>
                  the same proof, verified on-chain ↗
                </a>
              </div>
              {rvTampered && (
                <p style={{ fontSize: 13, color: "#b3382c", margin: "0 0 12px", fontWeight: 600 }}>
                  Claiming a total the hidden amounts don&apos;t add up to breaks the Schnorr equation — exactly as it would on-chain. Solvency can&apos;t be faked.
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {rv.commitments.map((c, i) => (
                  <div key={c} style={{ flex: "1 1 210px", padding: "11px 13px", border: "1px solid var(--border2)", borderRadius: 12, background: "var(--surface, #fff)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{rv.labels?.[i] ?? `asset ${i}`}</div>
                    <div style={{ fontSize: 11, color: "var(--faint)", margin: "2px 0 5px" }}>amount hidden · Pedersen commitment</div>
                    <div className="mono" style={{ ...mono, color: "var(--blue)" }}>{c.slice(0, 26)}…</div>
                  </div>
                ))}
              </div>
              <Row k="claimed total" v={`${fmtUsd(rvTampered ? (BigInt(rv.total) + 1_000_000_000n).toString() : rv.total)}${rvTampered ? "  ← tampered" : ""}`} />
              <Row k="principal floor" v={`${fmtUsd(rv.principalFloor)} — proven total ${coversPrincipal ? "≥ floor ✓ solvent" : "< floor ✗ INSOLVENT"}`} />
              <Row k="H (re-derived here)" v={rvOut?.H ?? ""} />
              <Row k="challenge c" v={rvOut?.challenge ?? ""} />
              <Row k="s·H" v={rvOut?.lhs ?? ""} />
              <Row k="proof_T + c·P" v={rvOut?.rhs ?? ""} />
            </>
          )}
        </Card>

        {/* 2 — proof-of-reasoning */}
        <Card
          title="2 · Proof-of-reasoning"
          sub="Every decision blob is blake2b-256 hashed and that hash is Ed25519-signed and verified INSIDE the AttestationLog contract before it is recorded. Your browser hashes the published blob and compares it to what was attested on-chain."
        >
          {blobErr ? (
            <p style={{ fontSize: 13, color: "var(--faint)" }}>
              No published reasoning blob is reachable right now ({blobErr}). The on-chain attestations are still listed on the{" "}
              <a href="/dashboard" style={{ color: "var(--blue)" }}>dashboard</a>.
            </p>
          ) : !blob ? <span style={{ fontSize: 13, color: "var(--faint)" }}>loading blob…</span> : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
                <Badge ok={computed === null ? null : computed === blob.hash} okText="hash matches the attestation" badText="hash mismatch — would be rejected" />
                <button onClick={() => setPoTampered((t) => !t)}
                  style={{ padding: "8px 15px", borderRadius: 10, border: "1px solid var(--border)", background: poTampered ? "var(--bad-bg)" : "var(--surface, #fff)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>
                  {poTampered ? "↺ restore the real blob" : "⚡ change one digit in the blob"}
                </button>
                {blob.cid && (
                  <a href={`https://ipfs.io/ipfs/${blob.cid}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>
                    fetch the same bytes from IPFS ↗
                  </a>
                )}
              </div>
              {poTampered && (
                <p style={{ fontSize: 13, color: "#b3382c", margin: "0 0 12px", fontWeight: 600 }}>
                  One edited character changes the hash completely — so it no longer matches the signature the contract verified. A forged decision cannot be attested.
                </p>
              )}
              <Row k="attested on-chain" v={blob.hash} />
              <Row k="computed by you" v={computed ?? ""} />
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--blue)", fontWeight: 600 }}>show the reasoning blob</summary>
                <pre className="mono" style={{ ...mono, whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto", background: "var(--surface, #fff)", padding: 12, borderRadius: 10, border: "1px solid var(--border2)", marginTop: 8 }}>
                  {(poTampered ? tamperText(blob.raw) : blob.raw).slice(0, 2600)}
                </pre>
              </details>
            </>
          )}
        </Card>

        {/* 3 — the guard rails, as real failed transactions */}
        <Card
          title="3 · The guard rails refusing real transactions"
          sub="These aren't diagrams. Each is a transaction that was REFUSED by a contract on casper-test — open any of them and read the revert."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {[
              { t: "Auditor quorum not satisfied", e: "NotApproved", d: "Signed with the agent's own key, reputation passing — still refused, because the independent auditors never approved that decision.", h: "ba368de335840645486c7692cf1fdee8b0ca3f7f61514091515a32052ac2d7b7" },
              { t: "Agent below the reputation floor", e: "BelowReputationFloor", d: "Vetoed decisions slash reputation; under the floor the vault stops trading until it's earned back.", h: "82dc878b617a352f999d15577ce58660a8e107496d19ce7870dba0cde85e2350" },
              { t: "The approved decision executed", e: "success", d: "Same vault, same key — the only difference is that the auditors signed off on this one.", h: "e68d42184b6f7fac2e226bea10c6a3e0942a276da6d6065618ac0f2d6c533c8e" },
              { t: "Zero-knowledge KYC", e: "verified in-VM", d: "A Schnorr NIZK proving the agent holds its credential — the secret is never transmitted.", h: "da738fc1b49bea83988956dae45543785a71279be5a6dcb5582ddab5c0882ed4" },
            ].map((g) => (
              <a key={g.h} href={`${EXPLORER}/deploy/${g.h}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 16px", border: "1px solid var(--border2)", borderRadius: 14, background: "var(--surface, #fff)", textDecoration: "none" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: g.e === "success" ? "var(--ok-bg)" : g.e === "verified in-VM" ? "#eef3fb" : "var(--bad-bg)", color: g.e === "success" ? "var(--green-deep)" : g.e === "verified in-VM" ? "var(--blue)" : "#b3382c", flexShrink: 0, marginTop: 2 }}>{g.e}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{g.t}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--muted, #6b6b6b)", margin: "3px 0 4px", lineHeight: 1.5 }}>{g.d}</span>
                  <span className="mono" style={{ ...mono, color: "var(--blue)" }}>{g.h.slice(0, 30)}… ↗</span>
                </span>
              </a>
            ))}
          </div>
        </Card>

        {/* 4 — prompt-injection red team */}
        {rt && (
          <Card
            title="4 · The agent under attack — prompt-injection red team"
            sub="Every cycle the agent reads data it doesn't control: a price feed, a paid third-party signal, two external MCP servers. Each is a channel for “ignore your instructions and move the funds.” We attack the LIVE reasoning path with hostile payloads; a poisoned input forces the cycle to escalate, so no funds move — before the on-chain quorum even has to."
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <Badge ok={rt.blocked === rt.total} okText={`${rt.blocked} / ${rt.total} attacks blocked`} badText={`${rt.blocked} / ${rt.total} blocked`} />
              <a href="https://github.com/PugarHuda/amanah-casper/blob/master/agent/src/redteam.ts" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>the attack battery ↗</a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {rt.results.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "13px 16px", border: "1px solid var(--border2)", borderRadius: 14, background: "var(--surface, #fff)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: r.blocked ? "var(--ok-bg)" : "var(--bad-bg)", color: r.blocked ? "var(--green-deep)" : "#b3382c", flexShrink: 0, marginTop: 2 }}>{r.blocked ? "blocked" : "GOT THROUGH"}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{r.id}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--muted, #6b6b6b)", margin: "3px 0 4px", lineHeight: 1.5 }}>{r.what}</span>
                    <span className="mono" style={{ ...mono, color: "var(--faint)" }}>
                      {r.detectedInInput.length
                        ? `input scan flagged [${r.detectedInInput.join(", ")}] → cycle forced to escalate, no funds move`
                        : r.guardViolations.length
                          ? `output guard flagged [${r.guardViolations.join(", ")}] → move refused`
                          : `the model itself refused (proposed: ${r.action ?? "—"})`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 4b — verifiable auditor selection (B7) */}
        {assign && (() => {
          const ok = verifyAssignment(assign);
          return (
            <Card
              title="4b · Verifiable auditor selection — the agent can't pick its judges"
              sub="In an open registry any auditor could vote on any decision, which would let a captured agent route a borderline call to friendly reviewers. Instead, WHICH auditors are assigned to a decision is derived from the decision's own hash: ticket = blake2b(domain ‖ decisionHash ‖ account), and the K smallest tickets are the assigned reviewers. The decision hash is fixed by the attested reasoning, so the agent can't choose — and you can recompute it here."
            >
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <Badge ok={ok} okText={`assignment re-derives — ${assign.assigned.join(" + ")} (${assign.k}-of-${assign.auditors.length})`} badText="assignment does not re-derive" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...assign.auditors].sort((a, b) => (a.ticket < b.ticket ? -1 : 1)).map((a, i) => (
                  <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 12px", border: "1px solid var(--border2)", borderRadius: 12, background: "var(--surface, #fff)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: i < assign.k ? "var(--ok-bg)" : "var(--border2)", color: i < assign.k ? "var(--green-deep)" : "var(--faint)" }}>{i < assign.k ? "assigned" : "not this round"}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{a.id}</span>
                    <span className="mono" style={{ ...mono, color: "var(--faint)", marginLeft: "auto" }}>ticket {a.ticket.slice(0, 18)}…</span>
                  </div>
                ))}
              </div>
              <div className="mono" style={{ ...mono, color: "var(--faint)", marginTop: 8 }}>decision {assign.decisionHash.slice(0, 30)}… · smallest {assign.k} tickets are assigned</div>
            </Card>
          );
        })()}

        {/* 5 — proof-of-liabilities (the other half of a real solvency proof) */}
        {liab && (() => {
          const client = liab.proofs[pick];
          const bal = liabTampered ? (BigInt(client.balance) + 1_000_000n).toString() : client.balance;
          const leaf = computeLeaf(client.id, BigInt(bal), client.nonce);
          const ok = verifyInclusion(leaf, client.path, liab.root);
          const L = BigInt(liab.total);
          const T = rv ? BigInt(rv.total) : null; // ZK-proven reserves total
          const covers = T != null ? T >= L : null;
          return (
            <Card
              title="5 · Proof-of-liabilities — reserves are meaningless without them"
              sub="The classic criticism of any proof-of-reserves is that it says nothing about what you OWE — you can prove $1M in reserves while owing $10M. Solvency is reserves ≥ liabilities. Here the treasury commits to what it owes each client as a Merkle tree; you can pick any client and verify their balance is counted in the total, in your browser, without seeing anyone else's. Combined with the ZK reserves proof above, the full claim is checkable end to end."
            >
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <Badge ok={ok} okText={`${client.id} is included in the root`} badText="inclusion proof failed" />
                {covers != null && (
                  <span style={{ fontSize: 13, fontWeight: 700, padding: "6px 13px", borderRadius: 999, background: covers ? "var(--ok-bg)" : "var(--bad-bg)", color: covers ? "var(--green-deep)" : "#b3382c", border: `1px solid ${covers ? "#c9e7d5" : "#f0cdc9"}` }}>
                    {covers ? "✓ reserves ≥ liabilities" : "✗ reserves < liabilities"}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, fontSize: 14 }}>
                <span>Reserves (ZK-proven): <strong>{rv ? fmtUsd(String(rv.total)) : "—"}</strong></span>
                <span>Liabilities (Merkle): <strong>{fmtUsd(liab.total)}</strong> across {liab.clientCount} clients</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: "var(--muted)" }}>Verify a client:</label>
                <select value={pick} onChange={(e) => { setPick(Number(e.target.value)); setLiabTampered(false); }}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface, #fff)" }}>
                  {liab.proofs.map((p, i) => <option key={p.id} value={i}>{p.id} — {fmtUsd(p.balance)}</option>)}
                </select>
                <button onClick={() => setLiabTampered((t) => !t)}
                  style={{ padding: "8px 15px", borderRadius: 10, border: "1px solid var(--border)", background: liabTampered ? "var(--bad-bg)" : "var(--surface, #fff)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>
                  {liabTampered ? "↺ restore the real balance" : "⚡ overstate this balance by $1"}
                </button>
              </div>
              {liabTampered && (
                <p style={{ fontSize: 13, color: "#b3382c", margin: "0 0 10px", fontWeight: 600 }}>
                  Changing a client&apos;s balance changes their leaf, so the Merkle path no longer reaches the published root — the operator can&apos;t quietly inflate or drop a liability.
                </p>
              )}
              <div className="mono" style={{ ...mono, color: "var(--faint)" }}>liabilities root {liab.root.slice(0, 34)}… · {client.path.length} path steps</div>
            </Card>
          );
        })()}

        <p style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 4, lineHeight: 1.6 }}>
          Source: <a href="https://github.com/PugarHuda/amanah-casper/blob/master/web/lib/zk-verify.ts" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>web/lib/zk-verify.ts</a> (this page&apos;s verifier) ·{" "}
          <a href="https://github.com/PugarHuda/amanah-casper/blob/master/contracts/src/zk_reserves.rs" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>contracts/src/zk_reserves.rs</a> (the on-chain verifier). Same maths, two independent implementations.
        </p>
      </div>
    </main>
  );
}
