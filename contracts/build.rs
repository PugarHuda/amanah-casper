//! Odra's contracts build script.
//! Reads the `ODRA_MODULE` env var and sets the `odra_module` cfg flag so each
//! contract compiles to its own wasm and the schema/build bins gate correctly.
pub fn main() {
    odra_build::build();
}
