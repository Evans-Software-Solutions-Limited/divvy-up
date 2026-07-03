import { receiptImages } from "./storage";

// Core API: groups, members, expenses, receipt items, assignments, balances
export const coreAPI = new sst.aws.ApiGatewayV2("api-core");

// Receipt service: OCR/vision extraction path (POST /receipts/extract)
export const receiptServiceAPI = new sst.aws.ApiGatewayV2(
  "api-receipt-service",
);

// Placeholder default keeps deploys/typegen working before the real key is
// provisioned via `sst secret set AnthropicApiKey <key>` (see ANTHROPIC_SETUP.md).
export const anthropicApiKey = new sst.Secret("AnthropicApiKey", "placeholder");

coreAPI.route("$default", "microservices/core/src/api.handler");
receiptServiceAPI.route("$default", {
  handler: "microservices/other-service/src/api.handler",
  link: [receiptImages, anthropicApiKey],
  timeout: "29 seconds", // API Gateway v2 hard-caps integrations at 30s
});

// TODO: add JWT authorizer once auth is wired up
