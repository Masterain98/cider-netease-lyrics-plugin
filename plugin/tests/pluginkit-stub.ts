import { ref, type Ref } from "vue";
import { vi } from "vitest";

export class AppleMusic {
  static get nowPlayingItem(): unknown {
    return null;
  }
}

export const saveConfig = vi.fn(async (): Promise<void> => undefined);

export const v3 = vi.fn(async () => ({ data: { data: null } }));

export function definePluginContext<T extends Record<string, unknown>>(plugin: T) {
  return {
    plugin,
    customElementName: (name: string) => `test-${name}`,
    setupConfig: <V extends Record<string, unknown>>(defaults: V): Ref<V> => ref(defaults) as Ref<V>,
    goToPage: async () => undefined,
    useCPlugin: () => plugin,
  };
}

export function addImmersiveLayout(): void {}
export function removeImmersiveLayout(): void {}
