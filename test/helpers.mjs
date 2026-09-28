import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { listen } from "../server.js";
import { CASE } from "../engine.js";

/** Start a real server on an ephemeral port. */
export async function startServer(caseData) {
  return listen({ port: 0, host: "127.0.0.1", ...(caseData ? { caseData } : {}) });
}

/** Connect a real MCP client over Streamable HTTP. */
export async function connect(url, name = "test-client") {
  const client = new Client({ name, version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  return {
    client,
    transport,
    /** Call a tool; returns { raw, data } where raw is the full serialised response. */
    async call(name, args = {}) {
      try {
        const r = await client.callTool({ name, arguments: args });
        return { raw: JSON.stringify(r), data: r.structuredContent ?? null, isError: Boolean(r.isError) };
      } catch (err) {
        return { raw: `ERROR ${err?.message ?? String(err)}`, data: null, isError: true };
      }
    },
    close: () => client.close(),
  };
}

/** The same case with a different solution. Everything public is identical. */
export function alternateCase() {
  const alt = structuredClone(CASE);
  alt.solution = {
    culprit: "torii",
    method: "forced_bolt",
    motive: "rejected_manuscript",
    epilogue: "ALTERNATE EPILOGUE: a different ending entirely.",
    near_miss: {
      culprit: "ALTERNATE culprit hint.",
      method: "ALTERNATE method hint.",
      motive: "ALTERNATE motive hint.",
    },
  };
  return alt;
}

/**
 * Strings that exist only in the solution. If any of these appears in a
 * response before a committed accusation, the seal is broken.
 */
export function solutionMarkers(caseData = CASE) {
  const s = caseData.solution;
  const sentences = String(s.epilogue)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 20);
  // Phrases shorter than a sentence that carry the answer on their own.
  const phrases = ["aconite", "older sister", "dosed it", "Kuroda drew it"];
  const hints = Object.values(s.near_miss).map((h) => String(h).replace(/\s+/g, " ").trim());
  return [...sentences, ...phrases, ...hints, '"solution"', "near_miss", "epilogue\":\""];
}

/** A result is leaking if its serialisation (whitespace-normalised) contains a marker. */
export function findLeak(raw, markers) {
  const text = String(raw).replace(/\\n/g, " ").replace(/\s+/g, " ");
  return markers.find((m) => text.includes(m)) ?? null;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TOOL_NAMES = [
  "start_case",
  "list_suspects",
  "search_location",
  "examine_evidence",
  "question_suspect",
  "review_notes",
  "get_progress",
  "get_accusation_options",
  "accuse",
  "withdraw_accusation",
  "hear_ending",
  "reopen_case",
  "restart_case",
];

const WORDS = {
  place: ["counter", "the stairs", "kitchen", "coat rack", "door", "roof", "", "behind the bar", 42],
  item: ["bottle", "the lock", "photo", "clipping", "ledger", "manuscript", "glass", "back door", "chandelier", "", null],
  suspect: ["torii", "Kuroda", "the owner", "the editor", "novelist", "kadokura", "nobody", "", "Miyuki"],
  topic: ["alibi", "where were you", "the victim", "photo", "bottle", "the weather", "1996", "manuscript", ""],
  culprit: ["torii", "kuroda", "onodera", "no one", "the owner", "somebody", ""],
  method: ["forced_bolt", "hidden_exit", "no_entry_needed", "accident", "poison", "magic", ""],
  motive: ["rejected_manuscript", "career", "old_death", "none", "revenge for 1996", "money", ""],
};

/** Random arguments for a tool, including garbage and wrong types. */
export function randomArgs(tool, r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  switch (tool) {
    case "search_location":
      return r() < 0.2 ? {} : { place: pick(WORDS.place) };
    case "examine_evidence":
      return { item: pick(WORDS.item) };
    case "question_suspect":
      return { suspect: pick(WORDS.suspect), topic: pick(WORDS.topic) };
    case "accuse":
      return {
        culprit: pick(WORDS.culprit),
        method: pick(WORDS.method),
        motive: pick(WORDS.motive),
        ...(r() < 0.5 ? { confirmed: r() < 0.7 } : {}),
      };
    default:
      return r() < 0.1 ? { unexpected: "argument" } : {};
  }
}
