// Governance attribution for autonomous actions.
//
// DORA Art. 5(2)(a) puts FINAL, non-delegable responsibility for ICT risk on the financial
// entity's management body, which must "define, approve, oversee and be responsible for"
// the risk-management arrangements — including approving the risk tolerance — and Art.
// 28(1)(a) requires the entity to "remain fully responsible at all times" when using ICT
// third-party providers.
//
// A controls layer cannot absorb that duty. What it CAN do is make the duty discharge-able:
// every autonomous action carries the policy version it ran under, the risk tolerance that
// was approved, and the named human accountable for it — recorded in the attested blob, so
// the management body can evidence oversight instead of asserting it.
//
// Values come from config so the operator sets them deliberately; unset fields are reported
// as unset rather than defaulted to something reassuring.
import { config } from "./config.js";

export interface GovernanceContext {
  /** Version/identifier of the approved operating policy this cycle ran under. */
  policyVersion: string | null;
  /** Who approved that policy (named accountable person or body). */
  policyApprovedBy: string | null;
  /** Approved risk tolerance the agent must operate inside. */
  riskTolerance: { maxConfidenceOverride: null; escalateBelowConfidence: number } | null;
  /** Named owner accountable for this deployment's autonomous actions. */
  accountableOwner: string | null;
  /** Stated so a reader never mistakes attribution for transfer of liability. */
  note: string;
}

export function governanceContext(): GovernanceContext {
  const policyVersion = config.policyVersion || null;
  const policyApprovedBy = config.policyApprovedBy || null;
  const accountableOwner = config.accountableOwner || null;

  return {
    policyVersion,
    policyApprovedBy,
    riskTolerance: {
      // The agent escalates to a human below this confidence instead of acting — the
      // machine-readable form of an approved risk tolerance.
      escalateBelowConfidence: config.confidenceThreshold,
      maxConfidenceOverride: null,
    },
    accountableOwner,
    note:
      "Attribution only. Under DORA Art. 5(2)(a) final ICT responsibility rests with the " +
      "financial entity's management body and is not transferred by these controls; this " +
      "record exists so that oversight can be evidenced.",
  };
}

/** True when the operator has actually configured governance attribution. */
export function governanceConfigured(): boolean {
  return !!(config.policyVersion && config.accountableOwner);
}
