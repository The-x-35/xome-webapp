"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { proxyFetch } from "@/lib/net/proxy";
import { getApiKey } from "@/lib/store/secrets";
import { getPrefs } from "@/lib/store/prefs";

/** Web + information utilities — port of web_tools.dart. All keyless except
 *  the optional Tavily/Brave search keys; web_search falls back to DuckDuckGo. */

interface SearchResult { title: string; url: string; snippet: string }

async function tavily(query: string, max: number, key: string) {
  const r = await proxyFetch({
    url: "https://api.tavily.com/search",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { api_key: key, query, max_results: max },
  });
  const data = r.json<{ results?: Array<{ title: string; url: string; content: string }> }>();
  return (data.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: x.content }));
}

async function brave(query: string, max: number, key: string) {
  const r = await proxyFetch({
    url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`,
    headers: { "X-Subscription-Token": key, accept: "application/json" },
  });
  const data = r.json<{ web?: { results?: Array<{ title: string; url: string; description: string }> } }>();
  return (data.web?.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: x.description }));
}

async function duckduckgo(query: string, max: number): Promise<SearchResult[]> {
  const r = await proxyFetch({
    url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    headers: { "user-agent": "Mozilla/5.0" },
  });
  const html = r.text;
  const results: SearchResult[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && results.length < max) {
    let url = m[1];
    const dec = url.match(/uddg=([^&]+)/);
    if (dec) url = decodeURIComponent(dec[1]);
    const title = m[2].replace(/<[^>]+>/g, "").trim();
    if (title) results.push({ title, url, snippet: "" });
  }
  return results;
}

export const webTools: Tool[] = [
  defineTool({
    name: "web_search",
    description:
      "Search the web for current information. Returns titles, URLs, and snippets. Uses Tavily or Brave if a key is set (Settings), otherwise DuckDuckGo. Use for anything that may have changed recently or that you don't know.",
    parameterSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        max: { type: "integer", description: "Max results 1–10 (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Web",
    invoke: async (args) => {
      const query = String(args.query ?? "").trim();
      if (!query) return { error: "empty_query", message: "query is required" };
      const max = Math.min(10, Math.max(1, Number(args.max ?? 5)));
      const engine = getPrefs().searchEngine;
      const tav = await getApiKey("tavily");
      const brv = await getApiKey("brave");
      try {
        let results: SearchResult[] = [];
        let used = "duckduckgo";
        if (engine === "tavily" && tav) { results = await tavily(query, max, tav); used = "tavily"; }
        else if (engine === "brave" && brv) { results = await brave(query, max, brv); used = "brave"; }
        else if (tav) { results = await tavily(query, max, tav); used = "tavily"; }
        else if (brv) { results = await brave(query, max, brv); used = "brave"; }
        else { results = await duckduckgo(query, max); }
        return { engine: used, count: results.length, results };
      } catch (e) {
        return { error: "search_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "web_fetch_url",
    description:
      "Fetch a web page and return its main text content (scripts/nav stripped, up to ~8000 chars). Use after web_search to read a specific result, or when the user gives a URL.",
    parameterSchema: {
      type: "object",
      properties: { url: { type: "string", description: "The full http(s) URL to fetch." } },
      required: ["url"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Web",
    invoke: async (args) => {
      const url = String(args.url ?? "");
      if (!url) return { error: "empty_url", message: "url is required" };
      const res = await fetch("/api/web-fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      return res.json();
    },
  }),
  defineTool({
    name: "wikipedia_lookup",
    description: "Look up a topic summary on Wikipedia. Returns the title, extract, and URL.",
    parameterSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic / article title." },
        lang: { type: "string", description: "Wikipedia language code (default en)." },
      },
      required: ["topic"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Web",
    invoke: async (args) => {
      const topic = String(args.topic ?? "").trim();
      const lang = String(args.lang ?? "en");
      if (!topic) return { error: "empty_topic", message: "topic is required" };
      const r = await proxyFetch({
        url: `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
      });
      const d = r.json<{ title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }>();
      if (!d.extract) return { error: "not_found", message: `No Wikipedia article for "${topic}".` };
      return { title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page };
    },
  }),
  defineTool({
    name: "weather_get",
    description: "Get current weather for a latitude/longitude via Open-Meteo (no key needed).",
    parameterSchema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude." },
        lon: { type: "number", description: "Longitude." },
      },
      required: ["lat", "lon"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Web",
    invoke: async (args) => {
      const lat = Number(args.lat), lon = Number(args.lon);
      const r = await proxyFetch({
        url: `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
      });
      const d = r.json<{ current_weather?: unknown }>();
      if (!d.current_weather) return { error: "no_data", message: "No weather data returned." };
      return { current_weather: d.current_weather };
    },
  }),
  defineTool({
    name: "currency_convert",
    description: "Convert an amount between currencies using the free Frankfurter API (ECB rates).",
    parameterSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount to convert." },
        from: { type: "string", description: "ISO 4217 code, e.g. USD." },
        to: { type: "string", description: "ISO 4217 code, e.g. EUR." },
      },
      required: ["amount", "from", "to"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Web",
    invoke: async (args) => {
      const amount = Number(args.amount);
      const from = String(args.from ?? "").toUpperCase();
      const to = String(args.to ?? "").toUpperCase();
      const r = await proxyFetch({
        url: `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`,
      });
      const d = r.json<{ rates?: Record<string, number>; date?: string }>();
      const converted = d.rates?.[to];
      if (converted == null) return { error: "convert_failed", message: "Could not convert." };
      return { amount, from, to, converted, date: d.date };
    },
  }),
  defineTool({
    name: "unit_convert",
    description: "Convert between common units of length, mass, or temperature (m/km/mi/ft, g/kg/lb/oz, c/f).",
    parameterSchema: {
      type: "object",
      properties: {
        value: { type: "number" },
        from: { type: "string", description: "Source unit." },
        to: { type: "string", description: "Target unit." },
      },
      required: ["value", "from", "to"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Web",
    invoke: async (args) => {
      const value = Number(args.value);
      const from = String(args.from ?? "").toLowerCase();
      const to = String(args.to ?? "").toLowerCase();
      const meters: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, cm: 0.01, in: 0.0254 };
      const grams: Record<string, number> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495, mg: 0.001 };
      if (from in meters && to in meters) return { result: (value * meters[from]) / meters[to], from, to };
      if (from in grams && to in grams) return { result: (value * grams[from]) / grams[to], from, to };
      const temp = (v: number, f: string, t: string): number | null => {
        let c: number;
        if (f === "c") c = v; else if (f === "f") c = ((v - 32) * 5) / 9; else if (f === "k") c = v - 273.15; else return null;
        if (t === "c") return c; if (t === "f") return (c * 9) / 5 + 32; if (t === "k") return c + 273.15; return null;
      };
      const t = temp(value, from, to);
      if (t != null) return { result: t, from, to };
      return { error: "unsupported", message: `Cannot convert ${from} → ${to}.` };
    },
  }),
  defineTool({
    name: "calculator",
    description: "Evaluate a basic arithmetic expression (+, -, *, /, parentheses, ^, %).",
    parameterSchema: {
      type: "object",
      properties: { expression: { type: "string", description: "e.g. (12.5 * 3) + 2^4" } },
      required: ["expression"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    group: "Utilities",
    invoke: async (args) => {
      const expr = String(args.expression ?? "");
      if (!/^[-+*/().,%^\d\s]+$/.test(expr)) {
        return { error: "invalid", message: "Only numbers and + - * / ( ) ^ % are allowed." };
      }
      try {
        const js = expr.replace(/\^/g, "**");
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${js});`)();
        if (typeof result !== "number" || !isFinite(result)) return { error: "nan", message: "Not a finite number." };
        return { expression: expr, result };
      } catch {
        return { error: "parse_error", message: "Could not evaluate the expression." };
      }
    },
  }),
];
