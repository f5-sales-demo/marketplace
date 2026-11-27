import { type CeEventBus, type CePlatformService, requestCePlatformService } from '../../../platform/src/ce/service';

export function awsPlatformService(pi: { [key: string]: unknown }, signal?: AbortSignal): Promise<CePlatformService> {
  return requestCePlatformService(pi.events as CeEventBus | undefined, signal);
}
