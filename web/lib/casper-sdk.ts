// Server-only shim for casper-js-sdk v5. Same reason as agent/src/sdk.ts: the package
// ships CJS with no ESM "import" condition, so named ESM imports don't resolve at
// runtime — import the default and re-export the values. Used ONLY in API routes (Node),
// never in a client component, so the SDK never lands in the browser bundle.
import csp from "casper-js-sdk";

export const { ContractCallBuilder, Args, CLValue, CLTypeByteArray, PublicKey } = csp as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ContractCallBuilder: any; Args: any; CLValue: any; CLTypeByteArray: any; PublicKey: any;
};
