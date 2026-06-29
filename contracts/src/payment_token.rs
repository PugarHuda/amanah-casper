//! PaymentToken — the x402 payment asset. A local CEP-18 + CEP-3009 token so
//! cargo-odra emits a real deployable wasm (an external `odra_modules::*` fqn in
//! Odra.toml only builds the intermediate builder wasm, no `call` export).
//!
//! Mirrors odra-modules' tested `CEP3009Wrapper`: a `Cep18` for balances plus a
//! `CEP3009` (EIP-3009 `transfer_with_authorization`) so the CSPR.cloud x402
//! facilitator can settle a signed authorization by calling
//! `transfer_with_authorization` on this package — gasless for the payer.
use odra::casper_types::{bytesrepr::Bytes, PublicKey, U256};
use odra::prelude::*;
use odra_modules::cep18_token::Cep18;
use odra_modules::cep3009::CEP3009;

#[odra::module]
pub struct PaymentToken {
    cep3009: SubModule<CEP3009>,
    token: SubModule<Cep18>,
}

#[odra::module]
impl PaymentToken {
    /// Inits the EIP-3009 module (stores the EIP-712 `chain_name` used as the
    /// domain's chainId substitute) and the CEP-18 token (mints initial_supply
    /// to the deployer). `chain_name` MUST equal the x402 network string the
    /// client/facilitator sign with — for testnet that's `casper:casper-test`.
    pub fn init(
        &mut self,
        chain_name: String,
        symbol: String,
        name: String,
        decimals: u8,
        initial_supply: U256,
    ) {
        self.cep3009.init(chain_name);
        self.token.init(symbol, name, decimals, initial_supply);
    }

    delegate! {
        to self.cep3009 {
            /// x402 settlement entrypoint — anyone may relay a signed authorization.
            fn transfer_with_authorization(
                &mut self,
                from: Address,
                to: Address,
                amount: U256,
                valid_after: u64,
                valid_before: u64,
                nonce: Bytes,
                public_key: PublicKey,
                signature: Bytes,
            );
            fn authorization_state(&self, authorizer: Address, nonce: Bytes) -> bool;
            fn cancel_authorization(
                &mut self,
                authorizer: Address,
                nonce: Bytes,
                public_key: PublicKey,
                signature: Bytes,
            );
        }

        to self.token {
            fn name(&self) -> String;
            fn symbol(&self) -> String;
            fn decimals(&self) -> u8;
            fn total_supply(&self) -> U256;
            fn balance_of(&self, address: &Address) -> U256;
            fn allowance(&self, owner: &Address, spender: &Address) -> U256;
            fn approve(&mut self, spender: &Address, amount: &U256);
            fn transfer(&mut self, recipient: &Address, amount: &U256);
            fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256);
        }
    }
}
