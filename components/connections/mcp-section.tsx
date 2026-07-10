"use client";

import { useEffect, useState } from "react";
import { Button, Tag, Spinner } from "@/components/ui/index";
import { Toggle } from "@/components/settings/primitives";
import { IconPlus, IconTrash } from "@/components/chrome/icons";
import { listMcpServers, saveMcpServer, deleteMcpServer } from "@/lib/store/mcp";
import type { McpServerRecord } from "@/lib/store/db";
import { McpClient } from "@/lib/integrations/mcp/mcp-client";

export function McpSection() {
  const [servers, setServers] = useState<McpServerRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => listMcpServers().then(setServers);
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setError(null);
    if (!url.trim()) return;
    setBusy(true);
    try {
      const client = new McpClient(url.trim(), token.trim() || null);
      await client.initialize();
      const tools = await client.listTools();
      await saveMcpServer({
        name: name.trim() || new URL(url).hostname,
        url: url.trim(),
        bearerToken: token.trim() || null,
        enabled: true,
        tools,
        status: "ok",
      });
      setAdding(false);
      setName("");
      setUrl("");
      setToken("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: McpServerRecord) => {
    await saveMcpServer({ ...s, enabled: !s.enabled });
    load();
  };

  const [testing, setTesting] = useState<string | null>(null);
  const test = async (s: McpServerRecord) => {
    setTesting(s.id);
    try {
      const client = new McpClient(s.url, s.bearerToken ?? null);
      await client.initialize();
      const tools = await client.listTools();
      await saveMcpServer({ ...s, tools, status: "ok", lastError: null });
    } catch (e) {
      await saveMcpServer({ ...s, status: "error", lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(null);
      load();
    }
  };

  const remove = async (s: McpServerRecord) => {
    if (confirm(`Remove MCP server "${s.name}"?`)) {
      await deleteMcpServer(s.id);
      load();
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">MCP servers</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
            <IconPlus width={15} height={15} /> Add server
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {servers.map((s) => (
          <div key={s.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium text-text">{s.name}</span>
                  {s.status === "ok" && <Tag kind="success" dot>Connected</Tag>}
                  {s.status === "error" && <Tag kind="warning">Failed</Tag>}
                  <Tag kind="neutral">{s.tools.length} tools</Tag>
                </div>
                <div className="mt-0.5 truncate font-mono text-[12px] text-text-2">{s.url}</div>
                {s.status === "error" && s.lastError && (
                  <div className="mt-0.5 truncate text-[11.5px] text-danger">{s.lastError}</div>
                )}
              </div>
              <Button variant="text" className="!px-2 !py-1 text-[12.5px]" onClick={() => test(s)} disabled={testing === s.id}>
                {testing === s.id ? <Spinner size={13} /> : "Test"}
              </Button>
              <Toggle on={s.enabled} onChange={() => toggle(s)} />
              <button onClick={() => remove(s)} className="grid h-8 w-8 place-items-center rounded-full text-text-3 hover:bg-surface-2 hover:text-danger">
                <IconTrash width={16} height={16} />
              </button>
            </div>
            {s.tools.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.tools.slice(0, 8).map((t) => (
                  <span key={t.name} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-2">{t.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <div className="flex flex-col gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://my-tools.example.com/mcp" className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent" />
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token (optional)" type="password" className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent" />
            </div>
            {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
              <Button className="!px-4 !py-2 text-[13px]" onClick={add} disabled={busy || !url.trim()}>
                {busy ? <Spinner size={14} /> : "Connect"}
              </Button>
            </div>
          </div>
        )}

        {servers.length === 0 && !adding && (
          <p className="rounded-[var(--radius-card)] border border-dashed border-border px-4 py-5 text-center text-[13px] text-text-3">
            Point Xome at any MCP server and its tools become available in chat.
          </p>
        )}
      </div>
    </section>
  );
}
