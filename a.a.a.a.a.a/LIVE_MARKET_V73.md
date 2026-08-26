# Hybrid v7.3 — live market hardening

Hybrid v7.3 keeps wallet execution manual and hardens the read-only BNB/Pancake market path.

Public defaults used by the MacBook profile:

- BNB mainnet RPC: `https://bsc-dataseed.bnbchain.org`
- BEM: `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`
- BSC USDT: `0x55d398326f99059fF775485246999027B3197955`
- PancakeSwap V3 QuoterV2: `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`
- observed BEM/USDT Pancake V3 pool: `0x2f5ec19ab0583d3fcd9bcbcd9ab416d2858eea38`
- configured BEM decimals: `8`
- configured USDT decimals: `18`
- configured pool fee: `100` (0.01%)

The runtime does not trust those constants merely because they are configured. Before an executable quote is accepted it verifies:

1. chain id = 56;
2. bytecode exists at BEM, USDT, Quoter and expected pool;
3. BEM/USDT decimals from `decimals()` match configuration;
4. pool `token0()` / `token1()` are exactly BEM and USDT;
5. pool `fee()` equals the configured fee;
6. exact-size QuoterV2 output is non-zero;
7. freshness/slippage policy passes.

The remaining fail-closed blockers are the exact TapeOut task schema and deployed TapeOut chain/protocol ABI. They must be derived from the official public site/on-chain deployment and must not be guessed.

Local v7.3 regression result: **79 tests passed**.
