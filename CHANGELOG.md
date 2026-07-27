# Changelog

## 1.0.0 (2026-07-27)


### Features

* **auth:** Supabase JWT verification + per-user ownership scoping (MVP Phase 2) ([#15](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/15)) ([648858c](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/648858c0dc35cced918a0ca8ae0f33e6a8119392))
* **core:** distribute tax/tip/discount across members in balance engine ([#22](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/22)) ([1e5da94](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/1e5da949f7bba49afb286861bf59a8bf59c499b7))
* **core:** group activity feed — atomic emits, endpoint, web page ([#24](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/24)) ([b26f8f9](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/b26f8f9d813b8f2bcdbe51acc3d6aacc748b0475))
* **core:** group invite links (join-by-link) ([#21](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/21)) ([147e3d3](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/147e3d3a27122c9bb3c46b455df8c347945f8ff9))
* **core:** settle-up recording + settlement-aware, minimized group balances ([#20](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/20)) ([945c39d](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/945c39dabf332e644d3e5d5db5fef91b1e135624))
* **core:** surface former group members instead of hiding them ([#26](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/26)) ([ae40a7b](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/ae40a7ba85e7be689bc86a08ed5c481edcea7201))
* **core:** wire microservices/core to real Postgres persistence ([#14](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/14)) ([303da90](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/303da9068ce2f32d5428b4d5f151df1e59263578))
* end-to-end group flow — UI, API, and Balances screen ([#9](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/9)) ([54672d8](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/54672d86b78bb8d2d4693cdeea81d3c918cbd52e))
* establish Divvy Up product identity and domain scaffold ([#1](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/1)) ([47da366](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/47da36685a9f5ce0f0e60b7283ad22c9fd4b4f0f))
* **mobile:** Expo React Native shell (copy + strip + retheme) ([#10](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/10)) ([4095541](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/4095541a15f982c4411f7fac94156e140413a204))
* **mobile:** wire PowerSync local-first sync into packages/mobile ([#12](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/12)) ([3b60730](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/3b607300da3e4c427405079c8bf0f1823b767464))
* receipt extraction API, item assignment, and expense finalization ([#3](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/3)) ([afcf9fe](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/afcf9fe4d91bce75d814fbafb698d786d39570d8))
* receipt review UI with item assignment and balance calculation ([#4](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/4)) ([fe96fb0](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/fe96fb00bd823e214ee7e54f024f8c77636296c7))
* **receipt-service:** real Claude vision extraction for /receipts/extract ([#13](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/13)) ([38a6bde](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/38a6bdec63ae98752f11ca5b9764ed211b069792))
* **receipts:** bind imageKey to its uploader; verify ownership at extract ([#19](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/19)) ([84247fe](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/84247fe3da7d4b3185af3ccd380481098232947a))
* **receipts:** scope /receipts/extract to a group the caller belongs to ([#18](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/18)) ([c1e311d](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/c1e311d6e0f06ede98162eb74adaa4466f2078d9))


### Bug Fixes

* **core:** enforce integer pence at the expense-create boundary ([#23](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/23)) ([9f81cdc](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/9f81cdc0945c41a151e230a9e3a266978c0812e0))
* **core:** freeze `everyone` splits at finalize ([#25](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/25)) ([5aba07d](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/5aba07d6ab430dfbab291769fc2b39da645f4c69))
* **core:** log split changes made after an expense is finalized ([#27](https://github.com/Evans-Software-Solutions-Limited/divvy-up/issues/27)) ([7ed8ada](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/7ed8ada76baf90e493c7966c8428dc784fd8ec4a))
* format claude-review.yml to pass prettier --check ([abae4fb](https://github.com/Evans-Software-Solutions-Limited/divvy-up/commit/abae4fb8ceda8d90d3ea851a130552920a305197))
