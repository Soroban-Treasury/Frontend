# Security policy

This repository holds the Stellar Treasury web app. It handles transactions that move funds, so reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Open a private report with GitHub's "Report a vulnerability" button on the Security tab of this repository. Include what you did, what happened and what you expected, and please give us time to fix the problem before you share details.

## In scope

The app in `src/`: wallet connection, transaction building through the SDK, handling of user input.

## Out of scope

The contract, SDK and API; report those in their own repositories.

The treasury contract has its own policy and an internal pre-audit: see the contract repository.
