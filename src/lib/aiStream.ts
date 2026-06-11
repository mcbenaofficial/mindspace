import { isTauri } from "./tauri-compat";

// Shared OpenAI-style SSE streaming for chat completions. Used by both the
// canvas AiChatNode and the modal AiChatEditor. In Tauri the request runs
// through the Rust `http_post_stream` command (CORS-free, host-allowlisted)
// with chunks delivered as window events; in the browser it falls back to
// fetch with a ReadableStream.

export interface StreamHandle {
  /** Resolves with the full response text (or rejects on API error). */
  promise: Promise<string>;
  /** Stops generation; promise resolves with the text received so far. */
  stop: () => void;
}

interface StreamOptions {
  url: string;
  body: Record<string, unknown>;
  apiKey?: string;
  onDelta: (fullTextSoFar: string) => void;
}

function makeSSEParser(onDelta: (delta: string) => void) {
  let buffer = "";
  let nonSSE = ""; // anything that isn't an SSE data line — usually an error body
  return {
    push(text: string) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (!l.startsWith("data:")) {
          nonSSE += l;
          continue;
        }
        const dataStr = l.slice(5).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const j = JSON.parse(dataStr);
          const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
          if (delta) onDelta(delta);
        } catch {
          // partial JSON across chunk boundary — keep for next push
          buffer = line + "\n" + buffer;
          return;
        }
      }
    },
    errorBody() {
      return (nonSSE + buffer).trim();
    },
  };
}

export function streamChatCompletion(opts: StreamOptions): StreamHandle {
  let stopped = false;
  let stopFn = () => { stopped = true; };

  const promise = (async () => {
    let full = "";
    const parser = makeSSEParser((delta) => {
      full += delta;
      opts.onDelta(full);
    });
    const payload = JSON.stringify({ ...opts.body, stream: true });

    if (isTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const requestId = crypto.randomUUID();
      stopFn = () => {
        stopped = true;
        invoke("cancel_stream", { requestId }).catch(() => {});
      };
      const unlisten = await listen<{ id: string; data: string }>("ai-stream-chunk", (ev) => {
        if (ev.payload.id !== requestId || stopped) return;
        parser.push(ev.payload.data);
      });
      let status: number;
      try {
        status = await invoke<number>("http_post_stream", {
          url: opts.url,
          body: payload,
          apiKey: opts.apiKey ?? null,
          requestId,
        });
      } finally {
        unlisten();
      }
      if (!stopped && (status < 200 || status >= 300)) {
        let detail = parser.errorBody();
        try { detail = JSON.parse(detail)?.error?.message || detail; } catch { /* raw */ }
        throw new Error(`API error ${status}: ${detail || "request failed"}`);
      }
      return full;
    }

    // Browser fallback
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: payload,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${text}`);
    }
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    stopFn = () => {
      stopped = true;
      reader.cancel().catch(() => {});
    };
    const decoder = new TextDecoder();
    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    return full;
  })();

  return { promise, stop: () => stopFn() };
}
