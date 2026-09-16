export type TemperReadState =
  | "INITIAL_LOADING"
  | "LOADED_WITH_DATA"
  | "LOADED_EMPTY"
  | "REFRESHING_WITH_DATA"
  | "ERROR_WITH_STALE_DATA"
  | "ERROR_WITHOUT_DATA";

export function deriveTemperReadState({
  hasData,
  hasRecords,
  isFetching,
  isError,
}: {
  hasData: boolean;
  hasRecords: boolean;
  isFetching: boolean;
  isError: boolean;
}): TemperReadState {
  if (isError) return hasData ? "ERROR_WITH_STALE_DATA" : "ERROR_WITHOUT_DATA";
  if (!hasData) return "INITIAL_LOADING";
  if (hasData && isFetching) return "REFRESHING_WITH_DATA";
  if (hasData && hasRecords) return "LOADED_WITH_DATA";
  return "LOADED_EMPTY";
}
