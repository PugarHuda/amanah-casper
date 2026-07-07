//! SpendGate - per-tx cap, rolling daily limit, allowlist, expiry, kill switch.
use crate::common::Error;
use odra::casper_types::U512;
use odra::prelude::*;

const DAY_MS: u64 = 86_400_000;

#[odra::module(errors = Error)]
pub struct SpendGate {
    owner: Var<Address>,
    max_per_tx: Var<U512>,
    daily_limit: Var<U512>,
    spent_today: Var<U512>,
    /// Absolute expiry timestamp (ms). `0` = no expiry set. `revoke()` sets it
    /// to "now" so every subsequent check fails — the instant kill switch.
    expiry: Var<u64>,
    /// Day index (block_time / DAY_MS) that `spent_today` belongs to.
    day_anchor: Var<u64>,
    allowlist: Mapping<Address, bool>,
    /// The vault contract — the ONLY address allowed to call `check` (which mutates
    /// `spent_today`). Set by the owner after the vault is deployed. Without this,
    /// anyone could call `check` directly and exhaust the daily limit to grief the
    /// agent. Declared last so existing state field indices don't shift.
    spender: Var<Address>,
}

#[odra::module]
impl SpendGate {
    pub fn init(&mut self, max_per_tx: U512, daily_limit: U512, expiry: u64) {
        self.owner.set(self.env().caller());
        self.max_per_tx.set(max_per_tx);
        self.daily_limit.set(daily_limit);
        self.expiry.set(expiry);
        self.spent_today.set(U512::zero());
        self.day_anchor.set(self.env().get_block_time() / DAY_MS);
    }

    /// Reverts with a machine-readable error if `amount` to `target` is not
    /// permitted; otherwise records the spend against today's running total.
    pub fn check(&mut self, target: Address, amount: U512) {
        // Only the vault may spend against the gate. Anyone else calling this would
        // inflate `spent_today` and grief the agent into `OverDailyLimit`.
        if self.env().caller() != self.spender.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
        let now = self.env().get_block_time();

        let expiry = self.expiry.get_or_default();
        if expiry != 0 && now >= expiry {
            self.env().revert(Error::Expired);
        }
        if !self.allowlist.get_or_default(&target) {
            self.env().revert(Error::NotAllowlisted);
        }
        if amount > self.max_per_tx.get_or_default() {
            self.env().revert(Error::OverTxCap);
        }

        // Roll the daily window over when the day changes.
        let today = now / DAY_MS;
        let mut spent = if today == self.day_anchor.get_or_default() {
            self.spent_today.get_or_default()
        } else {
            self.day_anchor.set(today);
            U512::zero()
        };

        spent += amount;
        if spent > self.daily_limit.get_or_default() {
            self.env().revert(Error::OverDailyLimit);
        }
        self.spent_today.set(spent);
    }

    pub fn set_limits(&mut self, max_per_tx: U512, daily_limit: U512, expiry: u64) {
        self.assert_owner();
        self.max_per_tx.set(max_per_tx);
        self.daily_limit.set(daily_limit);
        self.expiry.set(expiry);
    }

    /// Owner sets the vault contract that is allowed to call `check`. Called once,
    /// after the vault is deployed (the vault's address isn't known at gate init).
    pub fn set_spender(&mut self, spender: Address) {
        self.assert_owner();
        self.spender.set(spender);
    }

    /// Instant kill: expire the gate as of now.
    pub fn revoke(&mut self) {
        self.assert_owner();
        self.expiry.set(self.env().get_block_time());
    }

    pub fn add_allowlist(&mut self, addr: Address) {
        self.assert_owner();
        self.allowlist.set(&addr, true);
    }

    pub fn is_allowlisted(&self, addr: Address) -> bool {
        self.allowlist.get_or_default(&addr)
    }

    pub fn spent_today(&self) -> U512 {
        self.spent_today.get_or_default()
    }

    fn assert_owner(&self) {
        if self.env().caller() != self.owner.get_or_revert_with(Error::AddressNotSet) {
            self.env().revert(Error::NotAuthorized);
        }
    }
}
