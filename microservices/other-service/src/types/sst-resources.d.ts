// Hand-written augmentation for resources linked in infra/api.ts.
// SST regenerates sst-env.d.ts with identical members on the next
// dev/deploy; interface merging keeps both compatible.
declare module "sst" {
  export interface Resource {
    ReceiptImages: { type: "sst.aws.Bucket"; name: string };
  }
}
import "sst";
export {};
