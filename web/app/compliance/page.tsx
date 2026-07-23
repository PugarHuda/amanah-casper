// Control evidence pack — the human-readable half of /api/compliance-report.
//
// SEC examination staff applying Advisers Act Rule 206(4)-7 expect written policies
// assessing whether "algorithms were performing as intended", supported by EXCEPTION
// REPORTS — and explicitly flag advisers on white-label/B2B platforms whose provider does
// not address this. A controls layer therefore has to hand its customer that artifact.
// Every row here is a real transaction; every claim links to cspr.live.
import Nav from "@/components/Nav";
import { getExceptions, getActivity, getContractDeploys, getPolicySignoff, getPolicyParams, getTimelock } from "@/lib/cspr";
import { VAULT, ATTESTATION, AUDITOR, ZK, X402, REPUTATION, live } from "@/lib/data";

export const revalidate = 60;

const EXPLORER = "https://testnet.cspr.live/deploy";
const short = (h: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");
const when = (t: string | null) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

export default async function CompliancePage() {
  const configured = live();
  const packages = [VAULT(), ATTESTATION(), AUDITOR(), ZK(), X402(), REPUTATION()].filter(Boolean);
  const [exceptions, activity, recent, policy, params, timelock] = configured
    ? await Promise.all([getExceptions(packages), getActivity(VAULT(), 30), getContractDeploys(packages, 40), getPolicySignoff().catch(() => null), getPolicyParams().catch(() => null), getTimelock().catch(() => null)])
    : [[], null, [], null, null, null];
  const executed = recent.filter((d) => !d.error_message);
  const policyRefusals = exceptions.filter((e) => e.kind === "policy");
  const platformFaults = exceptions.filter((e) => e.kind === "platform");

  return (
    <main className="page">
      <div className="card">
        <Nav />

        <div style={{ marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="pulse-dot" />
            <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>
              CONTROL EVIDENCE · READ LIVE FROM CHAIN
            </span>
          </div>
          <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 42, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.8px" }}>
            Did the algorithm perform as intended?
          </h1>
          <p style={{ margin: "12px 0 10px", fontSize: 15, color: "var(--muted, #6b6b6b)", maxWidth: 760, lineHeight: 1.6 }}>
            SEC examination staff applying <strong>Advisers Act Rule 206(4)-7</strong> expect an adviser
            using an automated platform to hold written policies assessing whether{" "}
            <em>&ldquo;algorithms were performing as intended&rdquo;</em>, supported by{" "}
            <strong>exception reports</strong> — and the same alert flags advisers whose{" "}
            <strong>white-label platform provider</strong> does not address this. This page is that
            artifact, generated from the chain rather than from any database we control.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 26px" }}>
            <a href="/api/compliance-report?days=30" target="_blank" rel="noopener noreferrer"
              style={{ padding: "11px 18px", border: "1px solid var(--green-deep)", background: "var(--ok-bg)", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "var(--green-deep)", textDecoration: "none" }}>
              ⤓ Export evidence pack (JSON)
            </a>
            <a href="https://github.com/PugarHuda/amanah-casper/blob/master/RESEARCH.md" target="_blank" rel="noopener noreferrer"
              style={{ padding: "11px 18px", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "var(--ink2)", textDecoration: "none" }}>
              Sources &amp; scope limits ↗
            </a>
            <a href="https://github.com/PugarHuda/amanah-casper/blob/master/SOC2.md" target="_blank" rel="noopener noreferrer"
              style={{ padding: "11px 18px", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "var(--ink2)", textDecoration: "none" }}>
              SOC 2 readiness ↗
            </a>
          </div>

          {/* Policy sign-off (D4): the written policy the DORA-accountable body approves,
              with on-chain evidence that the auditor quorum actually signed it off. */}
          <div style={{ padding: "16px 18px", border: "1px solid var(--border2)", borderRadius: 14, background: "var(--surface-subtle)", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: "1.4px", color: "var(--faint)" }}>POLICY SIGN-OFF · DORA ART. 5(2)(a)</span>
              {policy && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: policy.approved ? "var(--ok-bg)" : "var(--bad-bg)", color: policy.approved ? "var(--green-deep)" : "#b3382c" }}>
                  {policy.approved ? `signed off on-chain · ${policy.approvals}/${policy.threshold}` : `awaiting sign-off · ${policy.approvals}/${policy.threshold}`}
                </span>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>
              <strong>Treasury Policy v1</strong> is the written mandate the accountable management body approves.
              Its canonical hash is a decision the independent auditor quorum votes on, so the approval isn&apos;t a
              claim — it&apos;s an on-chain fact. The agent embeds this policy version in every attested decision.
            </div>
            {params && (
              <div style={{ marginTop: 10, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--ink)" }}>
                <span>Escalate below confidence <strong>{params.confidencePct.toFixed(0)}%</strong></span>
                <span>Max rebalance <strong>{params.maxRebalancePct.toFixed(0)}%</strong> / move</span>
                <span>Min reputation <strong>{params.minReputation}</strong></span>
                <span style={{ color: "var(--faint)" }}>— live from the on-chain PolicyEngine{timelock ? `, changes time-locked ${timelock.delaySec}s (B4 governance)` : " (B2)"}</span>
              </div>
            )}
            <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <a href="https://github.com/PugarHuda/amanah-casper/blob/master/POLICY.md" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>Read the policy ↗</a>
              {policy && <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>hash {policy.hash.slice(0, 20)}…</span>}
            </div>
          </div>
        </div>

        {!configured ? (
          <p style={{ fontSize: 14, color: "var(--faint)" }}>
            Chain indexer not configured — no evidence can be produced. Nothing is shown rather than estimated.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 26 }}>
              {[
                { l: "Vault transactions (30d)", v: activity ? String(activity.executed + activity.refused) : "—" },
                { l: "Executed by the agent", v: activity ? String(activity.executed) : "—" },
                { l: "Refused by a control", v: activity ? String(activity.refused) : "—" },
                { l: "Control refusals on record", v: String(policyRefusals.length) },
              ].map((s) => (
                <div key={s.l} style={{ flex: "1 1 170px", padding: "16px 18px", border: "1px solid var(--border2)", borderRadius: 16, background: "var(--surface-subtle)" }}>
                  <div style={{ fontSize: 12, color: "var(--faint)", fontWeight: 600 }}>{s.l}</div>
                  <div className="serif" style={{ marginTop: 6, fontSize: 30, color: "var(--ink)" }}>{s.v}</div>
                </div>
              ))}
            </div>

            <h2 className="serif" style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 400, color: "var(--ink)" }}>Exception report</h2>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted, #6b6b6b)", maxWidth: 760, lineHeight: 1.55 }}>
              Each row is a transaction a control <strong>refused</strong>. A refusal is not a failure —
              it is the control doing its job, and it is the evidence an examiner asks for.
            </p>
            {policyRefusals.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)", padding: "14px 16px", border: "1px dashed var(--border2)", borderRadius: 14 }}>
                No refusals recorded in the indexed window.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 30 }}>
                {policyRefusals.slice(0, 25).map((e) => (
                  <a key={e.deployHash} href={`${EXPLORER}/${e.deployHash}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "13px 16px", border: "1px solid #f0cdc9", background: "#fdf7f6", borderRadius: 14, textDecoration: "none" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "var(--bad-bg)", color: "#b3382c", flexShrink: 0, marginTop: 2 }}>
                      {e.name}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{e.control}</span>
                      <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--blue)", marginTop: 3 }}>
                        {short(e.deployHash)} ↗
                      </span>
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--faint2)", flexShrink: 0 }}>{when(e.timestamp)}</span>
                  </a>
                ))}
              </div>
            )}

            <h2 className="serif" style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 400, color: "var(--ink)" }}>Authorised activity</h2>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted, #6b6b6b)" }}>
              Transactions that passed every gate — each one recorded on-chain before it took effect.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 30 }}>
              {executed.slice(0, 12).map((d) => (
                <a key={d.deploy_hash} href={`${EXPLORER}/${d.deploy_hash}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 15px", border: "1px solid var(--border2)", borderRadius: 12, textDecoration: "none", background: "var(--surface, #fff)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "var(--ok-bg)", color: "var(--green-deep)" }}>passed</span>
                  <span className="mono" style={{ flex: 1, fontSize: 11, color: "var(--blue)" }}>{short(d.deploy_hash ?? "")} ↗</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--faint2)" }}>{when(d.timestamp ?? null)}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {platformFaults.length > 0 && (
          <>
            <h2 className="serif" style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 400, color: "var(--ink)" }}>Platform faults</h2>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted, #6b6b6b)", maxWidth: 760, lineHeight: 1.55 }}>
              Listed separately and deliberately: these are runtime/deployment conditions, <strong>not</strong>{" "}
              policy controls firing. Counting them as control refusals would overstate how often the
              guard rails engaged.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 30 }}>
              {platformFaults.slice(0, 10).map((e) => (
                <a key={e.deployHash} href={`${EXPLORER}/${e.deployHash}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 15px", border: "1px solid var(--border2)", borderRadius: 12, textDecoration: "none", background: "var(--surface, #fff)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#f3efe6", color: "var(--ink2)" }}>{e.name}</span>
                  <span className="mono" style={{ flex: 1, fontSize: 11, color: "var(--blue)" }}>{short(e.deployHash)} ↗</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--faint2)" }}>{when(e.timestamp)}</span>
                </a>
              ))}
            </div>
          </>
        )}

        <h2 className="serif" style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 400, color: "var(--ink)" }}>Scope &amp; limitations</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7, color: "var(--muted, #6b6b6b)", maxWidth: 780 }}>
          <li>Testnet deployment — figures are demonstration values, not client assets.</li>
          <li>Self-produced artifact. It evidences on-chain control behaviour; it is <strong>not</strong> an audit, an attestation engagement, or legal advice.</li>
          <li>The zero-knowledge circuit has <strong>not</strong> been independently audited, so the solvency proof is not auditor-grade evidence yet.</li>
          <li>Conduct and custody duties (MiCA/MiFID II) and ICT responsibility (DORA Art. 5(2)(a)) attach to the authorised provider — these controls make oversight <em>provable</em>, they do not transfer liability.</li>
        </ul>
      </div>
    </main>
  );
}
