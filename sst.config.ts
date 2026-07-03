/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "divvy-up",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const api = await import("./infra/api");
    const web = await import("./infra/web");
    const storage = await import("./infra/storage");
    return {
      api: api.coreAPI.url,
      receiptApi: api.receiptServiceAPI.url,
      web: $dev ? "http://localhost:5173" : web.frontend.url,
      receiptImages: storage.receiptImages.name,
    };
  },
});
