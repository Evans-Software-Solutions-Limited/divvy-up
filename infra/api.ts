// Core API: groups, members, expenses, receipt items, assignments, balances
export const coreAPI = new sst.aws.ApiGatewayV2("api-core");

// Receipt service: OCR/vision extraction path (POST /receipts/extract)
export const receiptServiceAPI = new sst.aws.ApiGatewayV2(
  "api-receipt-service",
);

coreAPI.route("$default", "microservices/core/src/api.handler");
receiptServiceAPI.route(
  "$default",
  "microservices/other-service/src/api.handler",
);

// TODO: add JWT authorizer once auth is wired up
