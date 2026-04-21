/**
 * @digital-go-jp/abr-geocoder v2.2.1 の型シム
 *
 * 上流パッケージは .d.ts を同梱しておらず、さらに package.json に main/exports も
 * 無いため、subpath `/build/index.js` 指定と合わせて local で最小限の型を宣言する。
 * v2 系は CommonJS(build/ 以下に .js のみ)。
 */
declare module "@digital-go-jp/abr-geocoder/build/index.js" {
  export const SearchTarget: {
    readonly ALL: "all";
    readonly RESIDENTIAL: "residential";
    readonly PARCEL: "parcel";
  };

  export type AbrGeocoderDiContainerOptions = {
    database: { type: "sqlite3"; dataDir: string };
    cacheDir: string;
    debug?: boolean;
  };

  export class AbrGeocoderDiContainer {
    constructor(options: AbrGeocoderDiContainerOptions);
  }

  export type AbrQueryJson = {
    input?: unknown;
    pref?: string | null;
    county?: string | null;
    city?: string | null;
    ward?: string | null;
    oaza_cho?: string | null;
    chome?: string | null;
    koaza?: string | null;
    block?: string | null;
    block_id?: string | null;
    rsdt_num?: string | null;
    rsdt_num2?: string | null;
    rep_lat?: number | null;
    rep_lon?: number | null;
    lg_code?: string | null;
    machiaza_id?: string | null;
    match_level?: { num: number; str: string };
    coordinate_level?: { num: number; str: string };
    formatted?: string;
  };

  export type AbrGeocodeInput = {
    address: string;
    tag?: unknown;
    searchTarget?: string;
    fuzzy?: string;
  };

  export type AbrQuery = { toJSON(): AbrQueryJson };

  export class AbrGeocoder {
    static create(params: {
      container: AbrGeocoderDiContainer;
      numOfThreads: number;
      isSilentMode?: boolean;
      signal?: AbortSignal;
    }): Promise<AbrGeocoder>;
    geocode(input: AbrGeocodeInput): Promise<AbrQuery>;
    close(): Promise<void>;
  }
}
