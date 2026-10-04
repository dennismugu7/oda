import * as Network from 'expo-network';

/** False only when Android says there's no connection or no internet (Airplane mode). */
export async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected !== false && state.isInternetReachable !== false;
}
