# treasury-app

Web app for Stellar Treasury. Create a treasury, propose a payment, approve it, execute it, and see history. Built with Next.js, talks to the chain through [`treasury-sdk`](https://github.com/Soroban-Treasury/SDK) and the Freighter wallet.

## What you can do

- **Connect** a Freighter wallet.
- **Create a treasury:** pick owners, how many must approve, and a spending limit. Creating deploys the contract and sets the limit in two wallet approvals.
- **Open** a treasury you already have by its contract id. Treasuries you open are remembered in this browser only.
- **Propose** a payment (owners only), **approve** it, and **execute** it once enough owners approved. The page shows who approved and how long is left.
- **History** of paid and expired proposals. With `treasury-api` configured it also shows an activity log.

A token can only be spent once it has a spending limit, and limits are set when the treasury is created. Payments above the limit for the current period are refused by the contract.

## Run

```
npm install
cp .env.example .env.local   # then fill in NEXT_PUBLIC_WASM_HASH
npm run dev
```

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | testnet RPC | Soroban RPC. For mainnet, use your RPC provider's URL |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | testnet | `Public Global Stellar Network ; September 2015` for mainnet |
| `NEXT_PUBLIC_WASM_HASH` | none | Hex hash of the uploaded treasury contract wasm. Without it, the app can open treasuries but not create them |
| `NEXT_PUBLIC_API_URL` | none | `treasury-api` URL. Optional: adds the activity log |

To get a wasm hash: build the contract (`stellar contract build` in the contract repo), then `stellar contract upload --wasm <file> --source <account> --network <testnet|mainnet>`.

### The SDK dependency

`treasury-sdk` is installed from its GitHub repo (`github:Soroban-Treasury/SDK`), which builds it on install. While those repos are private, `npm install` needs git access to them (for example a logged-in `gh` or a token). Until the SDK is published to npm, that is the install path.

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
