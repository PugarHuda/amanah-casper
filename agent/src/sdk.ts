// casper-js-sdk v5 ships ONLY a CJS bundle — its package.json "exports" has no
// "import" condition, so Node's ESM loader loads the bundle and cjs-module-lexer
// can't detect its named exports (`Args`, `PrivateKey`, …) at runtime. Importing
// the default (= the CJS module.exports object) and re-exporting the VALUES from
// here makes them resolve at runtime. Types still come straight from the package
// via `import type { … } from "casper-js-sdk"` (type imports are erased, so they
// don't hit the broken runtime resolution).
import csp from "casper-js-sdk";

export const {
  HttpHandler,
  RpcClient,
  PrivateKey,
  KeyAlgorithm,
  ContractCallBuilder,
  SessionBuilder,
  NativeTransferBuilder,
  AccountIdentifier,
  Args,
  CLValue,
  CLTypeUInt8,
  CLTypePublicKey,
  CLTypeByteArray,
  Key,
} = csp;
