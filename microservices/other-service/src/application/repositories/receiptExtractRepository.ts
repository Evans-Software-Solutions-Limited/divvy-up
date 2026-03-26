type ExtractedItem = {
  description: string;
  unitPrice: number;
  quantity: number;
};

type ReceiptExtractResult = {
  items: ExtractedItem[];
  rawText?: string;
};

export class ReceiptExtractRepository {
  static readonly key = "ReceiptExtractRepository";

  async extract(imageKey: string): Promise<ReceiptExtractResult> {
    // TODO: call vision/OCR API (e.g. AWS Textract or Claude vision)
    // with the S3 object at imageKey and return structured items
    void imageKey;
    return {
      items: [],
      rawText: undefined,
    };
  }
}
