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

/** LinkedIn people profiles dataset (collect by URL). */
export function brightDataPeopleDatasetId(): string {
  return (
    process.env.BRIGHTDATA_PEOPLE_DATASET_ID?.trim() ||
    "gd_l1viktl72bvl7bjuj0"
  );
}

export function peopleLiveEnabled(): {
  coresignal: boolean;
  brightdata: boolean;
} {
  return {
    coresignal: Boolean(coresignalApiKey()),
    brightdata: Boolean(brightDataApiKey()),
  };
}
