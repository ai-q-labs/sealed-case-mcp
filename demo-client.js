/**
 * A scripted player, for the demo video and for a quick check that a server is
 * up. It connects with the official MCP SDK client over Streamable HTTP and
 * prints what a voice assistant would say after each tool call.
 *
 *   npm start                       (in one terminal)
 *   npm run demo                    (in another)
 *   MCP_URL=http://host:port/mcp npm run demo
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL || "http://127.0.0.1:3000/mcp");
const pause = Number(process.env.DEMO_PAUSE_MS ?? 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new Client({ name: "sealed-case-demo", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(url);
await client.connect(transport);
console.log(`connected  protocol ${transport.protocolVersion}  session ${transport.sessionId}\n`);

async function turn(player, name, args = {}) {
  console.log(`PLAYER  "${player}"`);
  console.log(`  tool   ${name} ${JSON.stringify(args)}`);
  const r = (await client.callTool({ name, arguments: args })).structuredContent;
  console.log(`  ALEXA  ${r.speech}`);
  if (r.said) console.log(`         ${r.suspect}: "${r.said}"`);
  if (r.ending) console.log(`         ${r.ending}`);
  console.log("");
  await sleep(pause);
  return r;
}

await turn("Alexa, let's play Sealed Case.", "start_case");
await turn("Search behind the counter.", "search_location", { place: "behind the counter" });
await turn("Look at the bottle.", "examine_evidence", { item: "the bottle" });
await turn("Check the lock on the door.", "examine_evidence", { item: "the lock" });
await turn("What's on the wall in the stairwell?", "examine_evidence", { item: "the newspaper clipping" });
await turn("And that photo behind the bar?", "examine_evidence", { item: "the photo" });
await turn("Ask the owner who the woman in the photo is.", "question_suspect", { suspect: "the owner", topic: "the photo" });
await turn("Ask the editor about her too.", "question_suspect", { suspect: "the editor", topic: "the photograph" });
const accusation = { culprit: "the owner", method: "the killer never had to be in the room", motive: "a death in 1996" };
await turn("I think it was the owner. He never had to be in the room. It's about 1996.", "accuse", accusation);
await turn("Yes.", "accuse", { ...accusation, confirmed: true });
await turn("Tell me what happened.", "hear_ending");

await transport.terminateSession();
await client.close();
