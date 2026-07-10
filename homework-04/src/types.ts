/** An SSP whose `sellers.json` we ingest. */
export interface Ssp {
  domain: string;
  /** Whether the SSP publishes numeric seller ids (parsed as integers). */
  numericSellerId: boolean;
}

/** A seller as stored in the `sellers` MongoDB collection. */
export interface SellerRecord {
  sspDomain: string;
  sellerId: string | number;
  sellerPosition: number;
  wasInsertedOnFirstImport: boolean;
  sellerName?: string;
  sellerDomain?: string;
  sellerType?: string;
  importDate: Date;
}

/** A single entry of the IAB `sellers.json` spec. */
export interface SellersJsonEntry {
  seller_id: string;
  name?: string;
  domain?: string;
  seller_type?: string;
}

/** The `sellers.json` document served by an SSP. */
export interface SellersJson {
  sellers?: SellersJsonEntry[];
}
