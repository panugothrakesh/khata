# Friction report

Developer-experience notes gathered while building Khata against
`@arkiv-network/sdk@0.8.1` on the Tiramisu testnet, 16 October 2026.

Environment, so everything below is reproducible:

| | |
|---|---|
| OS | macOS (darwin 27.0.0, Apple Silicon) |
| Node | v26.4.0 |
| Package manager | npm 11.17.0 |
| SDK | `@arkiv-network/sdk@0.8.1` |
| viem | `2.37.6` |
| Chain | Tiramisu, id `7738577`, `https://rpc.tiramisu.db-chain.testnet.arkiv.network` |

This is written to be useful rather than polite. The SDK is pre-1.0 and most of
what follows is small; where something was genuinely good it is said once and
briefly, because a friction report full of compliments is not a friction report.

<!-- Items are appended as they were hit, in order. -->
