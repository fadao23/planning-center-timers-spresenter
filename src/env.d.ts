// Ambient types for the logic thread: brings the global `spresenter` into scope.
// Types only — no runtime cost.
import '@spresenter/plugin-sdk/code';

// `requests` is documented (docs/api-reference.md#requests) but missing from the
// vendored SDK 0.4.0 typings. Declared optional: older hosts don't provide it.
declare module '@spresenter/plugin-sdk/code' {
  interface PluginRequestMeta {
    method: 'GET' | 'POST' | 'PLUGIN' | 'AUTOMATION';
    query?: Record<string, string>;
  }

  interface SpresenterApi {
    requests?: {
      on(
        action: string,
        handler: (payload: unknown, meta: PluginRequestMeta) => unknown | Promise<unknown>,
        meta?: { name?: string; description?: string; sample?: Record<string, unknown> },
      ): void;
      off(action: string): void;
      error(status: number, message: string, code?: string): Error;
    };
  }
}
