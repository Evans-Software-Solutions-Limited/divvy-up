import { receiptImages } from "./storage";
import { databaseUrl, supabaseUrl } from "./secrets";

// Core API: groups, members, expenses, receipt items, assignments, balances
export const coreAPI = new sst.aws.ApiGatewayV2("api-core");

// Receipt service: OCR/vision extraction path (POST /receipts/extract)
export const receiptServiceAPI = new sst.aws.ApiGatewayV2(
  "api-receipt-service",
);

coreAPI.route("$default", {
  handler: "microservices/core/src/api.handler",
  link: [databaseUrl, supabaseUrl],
});
receiptServiceAPI.route("$default", {
  handler: "microservices/other-service/src/api.handler",
  link: [receiptImages, databaseUrl, supabaseUrl],
  permissions: [
    {
      // Claude in Amazon Bedrock ("Mantle" Messages-API endpoint) —
      // SigV4 service bedrock-mantle; model access must be enabled in the
      // account's Bedrock console (already done in ess-dev).
      actions: ["bedrock-mantle:CreateInference"],
      resources: ["*"],
    },
  ],
  timeout: "29 seconds", // API Gateway v2 hard-caps integrations at 30s
});
