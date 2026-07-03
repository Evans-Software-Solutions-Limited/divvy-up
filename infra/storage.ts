// Receipt images: uploaded by the client via presigned PUT, read by the
// receipt-service Lambda for vision extraction. Private; CORS stays on
// (SST default) so browsers can PUT directly to the presigned URL.
export const receiptImages = new sst.aws.Bucket("ReceiptImages");
