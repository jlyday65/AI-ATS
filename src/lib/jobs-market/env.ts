export function coresignalApiKey(): string {
  return (
    process.env.CORESIGNAL_API_KEY?.trim() ||
    process.env.CORESIGNAL_APIKEY?.trim() ||
    ""
  );
}

export function brightDataApiKey(): string {
  return (
    process.env.BRIGHTDATA_API_KEY?.trim() ||
    process.env.BRIGHT_DATA_API_KEY?.trim() ||
    ""
  );
}

/** LinkedIn jobs discover-by-keyword dataset (Bright Data Scrapers library). */
export function brightDataJobsDatasetId(): string {
  return (
    process.env.BRIGHTDATA_JOBS_DATASET_ID?.trim() ||
    "gd_lpfll7v5hcqtkxl6l"
  );
}

export function jobsMarketLiveEnabled(): {
  coresignal: boolean;
  brightdata: boolean;
} {
  return {
    coresignal: Boolean(coresignalApiKey()),
    brightdata: Boolean(brightDataApiKey()),
  };
}
