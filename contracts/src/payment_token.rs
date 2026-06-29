//! PaymentToken — the x402 payment asset. A thin wrapper over odra-modules'
//! stock CEP-18 so cargo-odra generates a real deployable wasm (an external
//! `odra_modules::*` fqn in Odra.toml builds only the intermediate builder wasm,
//! with no `call` export). Delegates the entrypoints x402 settlement needs.
use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::cep18_token::Cep18;

#[odra::module]
pub struct PaymentToken {
    token: SubModule<Cep18>,
}

#[odra::module]
impl PaymentToken {
    /// Mints `initial_supply` to the deployer.
    pub fn init(&mut self, symbol: String, name: String, decimals: u8, initial_supply: U256) {
        self.token.init(symbol, name, decimals, initial_supply);
    }

    pub fn name(&self) -> String {
        self.token.name()
    }
    pub fn symbol(&self) -> String {
        self.token.symbol()
    }
    pub fn decimals(&self) -> u8 {
        self.token.decimals()
    }
    pub fn total_supply(&self) -> U256 {
        self.token.total_supply()
    }
    pub fn balance_of(&self, address: Address) -> U256 {
        self.token.balance_of(&address)
    }
    pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.token.allowance(&owner, &spender)
    }
    pub fn approve(&mut self, spender: Address, amount: U256) {
        self.token.approve(&spender, &amount);
    }
    pub fn transfer(&mut self, recipient: Address, amount: U256) {
        self.token.transfer(&recipient, &amount);
    }
    pub fn transfer_from(&mut self, owner: Address, recipient: Address, amount: U256) {
        self.token.transfer_from(&owner, &recipient, &amount);
    }
}
