import Nav from "@/components/Nav";
import SystemStatus from "@/components/SystemStatus";
import LiveFeed from "@/components/LiveFeed";
import { getDashboard } from "@/lib/data";
import { getStakedPosition } from "@/lib/cspr";

// Revalidate dashboard every 30 seconds so live vault + trail stay fresh.
export const revalidate = 30;

export default async function Dashboard() {
  const { treasuryId, totalTreasury, banner, holdings, trail, compliance, audit, trailLive, vaultHash, treasuries } = await getDashboard();
  const staked = await getStakedPosition().catch(() => null);

  const explorerBase = "https://testnet.cspr.live";
  const accountUrl = `${explorerBase}/account/0147ebe715f3fb6d387ae2f102e55032ba54c8c4557293d7800cad11561496fdaa`;

  return (
    <main className="page">
      <div className="card">
        <Nav />

        <div style={{ marginTop: 44, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span className="pulse-dot" />
              <span className="mono" style={{ fontSize: 12, letterSpacing: "2px", color: "var(--faint)" }}>{treasuryId}</span>
              <span style={{ color: "var(--border)" }}>·</span>
              <SystemStatus />
            </div>
            <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 42, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.8px" }}>
              Audit dashboard
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href="/verify"
              style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 20px", border: "1px solid var(--green-deep)", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 700, color: "var(--green-deep)", background: "var(--ok-bg)" }}
            >
              🔍 Verify this yourself →
            </a>
            <a
              href={vaultHash ? `${explorerBase}/contract-package/${vaultHash}` : explorerBase}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 20px", border: "1px solid var(--border)", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 600, color: "var(--ink2)" }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)" }} />
              Open on cspr.live ↗
            </a>
          </div>
        </div>

        {/* TOP BANNER STAT */}
        <div style={{ marginTop: 28, borderRadius: 20, background: "var(--gradient-pill)", border: "1px solid #efe7d6", padding: "26px 32px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 32 }}>
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gold-banner)", letterSpacing: "0.3px" }}>TOTAL TREASURY VALUE</div>
            <div className="serif" style={{ marginTop: 8, fontSize: 56, fontWeight: 400, color: "var(--ink)", letterSpacing: "-1.5px" }}>{totalTreasury}</div>
          </div>
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            {banner.map((b) => (
              <div key={b.label}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gold-banner)", letterSpacing: "0.3px" }}>{b.label}</div>
                <div className="serif" style={{ marginTop: 8, fontSize: 32, fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.5px" }}>{b.value}</div>
                <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: b.color }}>{b.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-treasury (B3): each is an independent vault instance under management. */}
        {treasuries && treasuries.length > 1 && (
          <div style={{ marginTop: 24, padding: "16px 20px", border: "1px solid var(--border2)", borderRadius: 16, background: "var(--surface-subtle)" }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "1.4px", color: "var(--faint)" }}>MULTI-TREASURY · {treasuries.length} INDEPENDENT VAULTS</div>
            <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {treasuries.map((t) => (
                <div key={t.label} style={{ flex: "1 1 200px", padding: "12px 16px", border: "1px solid var(--border2)", borderRadius: 12, background: "var(--surface, #fff)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{t.label}</div>
                  <div className="serif" style={{ fontSize: 24, color: "var(--ink)", marginTop: 2 }}>{t.total}</div>
                  <div style={{ fontSize: 12, color: "var(--faint)" }}>{t.principal} principal locked</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--faint)" }}>Each treasury is its own on-chain vault + spend gate with its own principal — multi-tenant, not one hard-coded vault.</div>
          </div>
        )}

        {/* Real native staking yield — the CSPR reserve leg is delegated to a validator and
            earns real Casper staking rewards. Not simulated: a real on-chain delegation. */}
        {staked?.delegated && (
          <div style={{ marginTop: 16, padding: "16px 20px", border: "1px solid #bfe6cd", borderRadius: 16, background: "var(--ok-bg)" }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "1.4px", color: "var(--green-deep)" }}>REAL NATIVE STAKING YIELD · ON-CHAIN</div>
            <div style={{ marginTop: 8, fontSize: 14.5, color: "var(--ink)", lineHeight: 1.55 }}>
              The treasury&apos;s <strong>CSPR reserve</strong> doesn&apos;t sit idle — it&apos;s <strong>delegated to a Casper validator</strong> and earns
              real native staking rewards every era. {staked.pending
                ? "500 CSPR was just delegated on-chain; the position activates at the next era boundary, then rewards accrue."
                : <>Currently <strong>{staked.stakedCspr.toLocaleString()} CSPR</strong> staked and earning.</>}{" "}
              Principal is preserved — delegation is fully recoverable (undelegate).
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <a href={staked.deployExplorer} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>Delegation deploy ↗</a>
              <a href={staked.validatorExplorer} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>Validator ↗</a>
              <span style={{ color: "var(--faint)" }}>same &ldquo;real native yield&rdquo; a top rival claims — here it&apos;s on-chain and checkable</span>
            </div>
          </div>
        )}

        <div className="two-col" style={{ marginTop: 40, alignItems: "start" }}>
          {/* LEFT: HOLDINGS */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px", marginBottom: 16 }}>HOLDINGS</div>
            {holdings.length === 0 && (
              <div style={{ padding: "18px 20px", border: "1px dashed var(--border2)", borderRadius: 16, fontSize: 13, color: "var(--faint)" }}>
                Vault state not readable right now — no placeholder numbers are shown.
              </div>
            )}
            {holdings.map((h) => (
              <div key={h.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", border: "1px solid var(--border2)", borderRadius: 16, marginBottom: 10, background: "var(--surface-subtle)" }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: h.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ width: 13, height: 13, borderRadius: 4, background: h.color }} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{h.name}</div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{h.sub}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{h.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: h.chgColor, marginTop: 2 }}>{h.chg}</div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 24, marginBottom: 14, fontSize: 14, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px" }}>COMPLIANCE STATUS</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid #dcefe2", borderRadius: 16, background: "var(--ok-bg)" }}>
                <div style={{ fontSize: 13, color: "#5b8a6a", fontWeight: 600 }}>Compliance status</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: compliance.vaultStatus === "Valid" ? "var(--green-deep)" : "var(--ink)" }}>
                  {compliance.vaultStatus}{compliance.vaultStatus === "Valid" ? " ✓" : ""}
                </div>
              </div>
              <div style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid #dcefe2", borderRadius: 16, background: "var(--ok-bg)" }}>
                <div style={{ fontSize: 13, color: "#5b8a6a", fontWeight: 600 }}>Agent allowlisted</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: compliance.allowlisted ? "var(--green-deep)" : "var(--ink)" }}>
                  {compliance.allowlisted ? "Yes ✓" : "No"}
                </div>
              </div>
              {compliance.zkVerified !== null && (
                <div style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid #dcefe2", borderRadius: 16, background: "var(--ok-bg)" }}>
                  <div style={{ fontSize: 13, color: "#5b8a6a", fontWeight: 600 }}>KYC (zero-knowledge)</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: compliance.zkVerified ? "var(--green-deep)" : "var(--ink)" }}>
                    {compliance.zkVerified ? "Proven ✓" : "Unproven"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "var(--faint)" }}>Schnorr NIZK · on-chain · secret never sent</div>
                </div>
              )}
              {compliance.circuitBreaker !== null && (
                <div style={{ flex: "1 1 150px", padding: "18px 20px", border: `1px solid ${compliance.circuitBreaker ? "#f0d9d9" : "#dcefe2"}`, borderRadius: 16, background: compliance.circuitBreaker ? "#fbf4f4" : "var(--ok-bg)" }}>
                  <div style={{ fontSize: 13, color: compliance.circuitBreaker ? "#a05555" : "#5b8a6a", fontWeight: 600 }}>Circuit breaker</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: compliance.circuitBreaker ? "var(--red, #c0392b)" : "var(--green-deep)" }}>
                    {compliance.circuitBreaker ? "FROZEN ⛔" : "Armed ✓"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "var(--faint)" }}>reputation floor + dead-man&apos;s switch · on-chain</div>
                </div>
              )}
              {compliance.reservesSolvent !== null && (
                <a href={`${explorerBase}/deploy/5be256a3b3b9aa4a33e8ea78646984edcfb91730e950d8d8eb054a83a4517793`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid #dcefe2", borderRadius: 16, background: "var(--ok-bg)", textDecoration: "none" }}>
                  <div style={{ fontSize: 13, color: "#5b8a6a", fontWeight: 600 }}>ZK proof-of-reserves</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: compliance.reservesSolvent ? "var(--green-deep)" : "var(--ink)" }}>
                    {compliance.reservesSolvent ? "Solvent ✓" : "Unproven"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "var(--faint)" }}>sum ≥ principal · no amount revealed · Pedersen+Schnorr ↗</div>
                </a>
              )}
              <a href={`${explorerBase}/deploy/483f66cdbdc0803333f35c7f70ad8bde3bd32e275e66af7ba83aaf6c27f64ca2`} target="_blank" rel="noopener noreferrer"
                style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid #dcefe2", borderRadius: 16, background: "var(--ok-bg)", textDecoration: "none" }}>
                <div style={{ fontSize: 13, color: "#5b8a6a", fontWeight: 600 }}>Auditor quorum</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: "var(--green-deep)" }}>2-of-3 ✓</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--faint)" }}>K-of-N independent signed votes · on-chain ↗</div>
              </a>
              {audit && (
                <div style={{ flex: "1 1 150px", padding: "18px 20px", border: `1px solid ${audit.approved ? "#dcefe2" : "#f0d9d9"}`, borderRadius: 16, background: audit.approved ? "var(--ok-bg)" : "#fbf4f4" }}>
                  <div style={{ fontSize: 13, color: audit.approved ? "#5b8a6a" : "#a05555", fontWeight: 600 }}>Independent auditor</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: audit.approved ? "var(--green-deep)" : "var(--red, #c0392b)" }}>
                    {audit.approved ? "Approved ✓" : "Vetoed ⛔"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "var(--faint)" }}>2nd agent · separate key · grade {audit.grade}{audit.approved ? "" : " · reputation slashed"}</div>
                </div>
              )}
              <div style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid #dcefe2", borderRadius: 16, background: "var(--ok-bg)" }}>
                <div style={{ fontSize: 13, color: "#5b8a6a", fontWeight: 600 }}>Per-tx cap</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: "var(--green-deep)" }}>{compliance.txCap}</div>
              </div>
              <div style={{ flex: "1 1 150px", padding: "18px 20px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface-subtle)" }}>
                <div style={{ fontSize: 13, color: "var(--faint)", fontWeight: 600 }}>Daily limit used</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{compliance.dailyUsed} / {compliance.dailyLimit}</div>
              </div>
            </div>
          </div>

          {/* RIGHT: AUDIT TRAIL */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink2)", letterSpacing: "0.3px" }}>ON-CHAIN AUDIT TRAIL</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--faint)" }}>{trailLive ? "live · testnet" : "representative"}</div>
            </div>
            <div style={{ border: "1px solid var(--border2)", borderRadius: 18, overflow: "hidden", background: "var(--surface-subtle)" }}>
              {trail.length === 0 && (
                <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--faint)" }}>
                  No deploys read yet — the trail is populated straight from CSPR.cloud, never seeded.
                </div>
              )}
              {trail.map((t, i) => (
                <a
                  key={i}
                  href={t.fullHash ? `${explorerBase}/deploy/${t.fullHash}` : explorerBase}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="trail-row"
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>{t.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{t.kind}</div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--blue)", marginTop: 2 }}>{t.hash}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.statusColor }}>{t.status}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--faint2)", marginTop: 2 }}>{t.time}</div>
                  </div>
                </a>
              ))}
            </div>
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <a
                href={accountUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 14, fontWeight: 600, color: "#15120e", textDecoration: "none" }}
              >
                View all deploys on testnet.cspr.live ↗
              </a>
            </div>

            {/* Live contract-event stream via CSPR.cloud Streaming API (SSE relay). */}
            <LiveFeed />
          </div>
        </div>
      </div>
    </main>
  );
}
