# treasury-app

Web app for Stellar Treasury. Create a treasury, propose a payment, approve it, execute it, and see history. Built with Next.js, talks to the chain through [`treasury-sdk`](https://github.com/Soroban-Treasury/SDK) and the Freighter wallet.

## Live demo

Open `/demo` (the **Live demo** link in the header) and press **Run the demo**. With no wallet, it makes two throwaway owners on the test network and runs the whole flow for real: create a 2-of-2 treasury with a spending limit, propose, a refused early payment, approve, pay, and a refused payment over the limit. It takes about three minutes because every step is a real transaction. The contract code it needs is bundled in `public/contract/`, so it needs no setup.

## What you can do

- **Connect** a Freighter wallet. The app follows the account and network picked in Freighter. If Freighter is on a different network from the app, a notice says which one to switch to, and nothing can be signed until you do.
- **Create a treasury:** pick owners, how many must approve, and a spending limit. Creating deploys the contract and sets the owners and limit in one transaction, so there is one wallet approval. On a network that does not have the treasury contract code yet, the app uploads it first, which is one more approval, once per network.
- **Open** a treasury you already have by its contract id. Treasuries you open are remembered in this browser only.
- **Propose** a payment (owners only), **approve** it, and **execute** it once enough owners approved. The page shows who approved and how long is left.
- **History** of paid and expired proposals. With `treasury-api` configured it also shows an activity log.

A token can only be spent once it has a spending limit, and limits are set when the treasury is created. Payments above the limit for the current period are refused by the contract.

## Run

```
npm install
npm run dev        # http://localhost:4000, on testnet
```

It works with no settings. To change them, copy `.env.example` to `.env.local`.

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` | `testnet` or `mainnet`. Sets the passphrase, a public RPC and the explorer links |
| `NEXT_PUBLIC_RPC_URL` | the network's public RPC | Soroban RPC. For mainnet, your own RPC provider is more reliable |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | from the network | Only for a custom network, such as a local one |
| `NEXT_PUBLIC_WASM_HASH` | the bundled code | Hash of treasury contract code already on the network. Leave it empty to use the bundled code (see below) |
| `NEXT_PUBLIC_API_URL` | none | `treasury-api` URL. Optional: adds the activity log. Add the app's origin to the API's `CORS_ORIGIN` |
| `NEXT_PUBLIC_BASE_PATH` | none | The sub-path the site is served from, for example `/Frontend` on GitHub Pages |

### Contract code

The app ships the treasury contract code as `public/contract/treasury_contract.wasm`, with its SHA-256 in `BUNDLED_WASM_HASH` (`src/lib/config.ts`). Before creating a treasury, it checks that the network has this code, and uploads it if not, after checking the file against the hash. That is why a fresh network, or testnet after a reset, needs no setup.

When the contract changes, build it (`sh scripts/build.sh` in the contract repo), then replace the file and the hash together. The monorepo CI warns when the bundled code and the contract source differ.

### The SDK dependency

`treasury-sdk` is installed from its GitHub repo (`github:Soroban-Treasury/SDK`), which builds it on install. While that repo is private, `npm install` needs git access to it (for example a logged-in `gh`, or an ssh key with access). CI uses a read-only deploy key, the secret `SDK_DEPLOY_KEY`. Until the SDK is published to npm, that is the install path.

## Host it

The app runs entirely in the browser, so it builds to a static site:

```
npm run build      # writes out/
npm start          # serves out/ at http://localhost:4000
```

Any static host can serve `out/`. Treasury pages are `/treasury/?id=<contract id>`, so the host needs no routing rules. Older `/treasury/<contract id>` links still work, because the 404 page forwards them.

GitHub Pages: [.github/workflows/pages.yml](.github/workflows/pages.yml) builds with the right base path and deploys on every push to `main`. On the free plan it needs this repo to be public, and Pages turned on once under Settings, Pages, Source: GitHub Actions. Set the repository variables named in that file to point it at mainnet or at a treasury-api.

## Accessibility

- Every field has a visible label; errors are written next to the field and linked with `aria-describedby`.
- Messages are announced: errors use `role="alert"`, progress and success use `role="status"`.
- Proposal state is always written out (for example "Ready to execute"), never colour alone.
- Keyboard: a skip link, visible focus outline, real buttons and links.
- Light and dark themes follow the system setting.

## Colours

All colours are CSS variables defined once at the top of `src/app/globals.css`. Nothing else in the app uses a literal colour, so a theme change is one place.

## Develop

```
npm test           # unit and component tests
npm run typecheck
npm run build
```

## Not built yet

- Policy simulator preview before proposing (`TODO(wave: app-1)`).
- Batch payments by CSV upload.
- Wallets other than Freighter.
- Changing spending limits after creation.
- A keyboard and screen-reader audit with real assistive technology.
