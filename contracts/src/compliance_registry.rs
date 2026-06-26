//! ComplianceRegistry - KYC/AML status per address. Upgradable (see Odra.toml).
use crate::common::{Error, Status};
use odra::prelude::*;

#[odra::module(errors = Error)]
pub struct ComplianceRegistry {
    status: Mapping<Address, Status>,
    identity_hash: Mapping<Address, [u8; 32]>,
}

#[odra::module]
impl ComplianceRegistry {
    // ponytail: no admin gate on set_status/revoke per spec ("minimal"). In
    // production these MUST be owner-restricted like SpendGate. Add an owner Var
    // + assert when wiring a real registrar.
    pub fn set_status(&mut self, addr: Address, status: Status, identity_hash: [u8; 32]) {
        self.status.set(&addr, status);
        self.identity_hash.set(&addr, identity_hash);
    }

    /// Reverts `NotCompliant` unless the address is `Valid`.
    pub fn assert_valid(&self, addr: Address) {
        if !matches!(self.status.get_or_default(&addr), Status::Valid) {
            self.env().revert(Error::NotCompliant);
        }
    }

    pub fn revoke(&mut self, addr: Address, _reason_code: u32) {
        // ponytail: reason_code is accepted for the audit trail but not stored;
        // emit/persist it if regulators need on-chain reason history.
        self.status.set(&addr, Status::Revoked);
    }

    pub fn status_of(&self, addr: Address) -> Status {
        self.status.get_or_default(&addr)
    }

    pub fn identity_of(&self, addr: Address) -> Option<[u8; 32]> {
        self.identity_hash.get(&addr)
    }
}
