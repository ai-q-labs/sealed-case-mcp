# Sealed Case for Alexa+

**A voice-only, one-player murder mystery served as a self-hosted MCP server. The AI game master runs the whole night, and it structurally cannot know who did it.**

Built for the Amazon Developer Hackathon "Build, Ship, Shape", Alexa+ track.
Streamable HTTP · MCP protocol `2025-11-25` · Node (tested on 24) · MIT

---

## The problem

We publish murder mystery scenarios. The biggest thing standing between a customer and a game they have already bought isn't price or quality. **They have to get three to seven people free on the same evening, plus one more person who agrees to run the table and never gets to play.**

The obvious fix is to let an AI be the game master. That doesn't work, and the reason is structural, not a matter of prompting:

> **If the script is in the model's context, the model knows who did it.** Then it plays every suspect, judges every deduction and narrates every scene while knowing.

Anyone who has tried it has seen the model soften a guilty suspect's denial, steer the player toward the answer, or answer a question no character in the room could answer. You can't instruct that away, because the answer is already in the model's context.

## Why MCP fixes it structurally

MCP lets the knowledge live somewhere the model cannot read. **This server holds the case; the assistant holds the conversation.** They meet at a tool boundary that the server controls.

- The solution lives in one closure inside `engine.js`, in the server process. No tool, resource, prompt or error message returns it.
- The tools expose only what a player standing in the room could learn: search a place, examine an object, question a suspect, review notes, accuse.
- **The verdict exists only after an accusation is committed.** `accuse` works in two steps. The first call reads the accusation back to the player. Only a second call with the same three choices and `confirmed: true`, made after the player says yes, is graded. There is no tool that grades without that.

So Alexa+ (or any MCP client) can call every tool in any order, as many times as it likes, and it ends up where the player is: holding evidence and reasoning it out. **It is not following an instruction to keep a secret; the secret is simply not in anything it receives.**

The tests check this mechanically instead of just saying it here (see [Tests](#tests)).

## Built for voice

| | |
|---|---|
| **`speech` in every result** | Every tool result has a `speech` field: plain spoken English, at most two sentences, no markdown, no emoji. The assistant can say it as-is. The structured data sits alongside it. |
| **Verbatim material is separate** | A suspect's reply (`said`) and a close look at an object (`description`) are their own fields, so the assistant quotes the game's words instead of paraphrasing testimony. Some suspects lie. The server knows which ones; the assistant doesn't. |
| **Natural phrasing** | Arguments take what the player said: `"the owner"`, `"the shochu behind the bar"`, `"where was she tonight"`. The server resolves them to suspects, objects and topics. |
| **Tool descriptions for speech** | Each description lists the phrases it answers ("search the counter", "ask the owner where he was", "I accuse…") so a voice assistant picks the right tool. |
| **Forgiving misheard input** | If the topic of a question can't be understood, it doesn't use up one of the eight questions. |
| **One game per session** | State is keyed by `Mcp-Session-Id`. Several people can play at once, and nobody sees another player's notes or can confirm another player's accusation. |

## Tools

| Tool | What the player says | Notes |
|---|---|---|
| `start_case` | "Let's play Sealed Case." | Opening briefing; opens the investigation |
| `list_suspects` | "Who was there?" | |
| `search_location` | "Search behind the counter." | Counter, door, stairwell, coat rack, kitchen |
| `examine_evidence` | "Look at the bottle." | `speech` summary + full `description` |
| `question_suspect` | "Ask the owner where he was." | 8 questions in total; reply in `said` |
| `review_notes` | "What do we know?" | |
| `get_progress` | "How am I doing?" | |
| `get_accusation_options` | "How do I accuse?" | Culprit, method, motive choices |
| `accuse` | "It was the owner…" then "Yes." | Two-step; graded only when `confirmed: true` repeats a read-back accusation |
| `withdraw_accusation` | "No, wait." | |
| `hear_ending` | "Tell me what happened." | Refuses until the case is solved |
| `reopen_case` | "Let me try again." | After a wrong accusation; notes are kept |
| `restart_case` | "Start over." | |

Also available: resource `sealed-case://lantern-room/briefing` (the public case file) and prompt `play_sealed_case` (game master instructions). Neither contains the solution.

## Run it

```bash
git clone <this repository>
cd sealed-case-mcp
npm install
npm test          # 13 tests, including the leak proofs
npm start         # http://127.0.0.1:3000/mcp
```

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | On localhost, the SDK's DNS rebinding protection is on |
| `ALLOWED_HOSTS` | (none) | Comma-separated Host header allowlist; set it when you bind to `0.0.0.0` behind a public hostname |
| `SESSION_TTL_MS` | `3600000` | Idle games are closed after this long |
| `MAX_SESSIONS` | `500` | |

## Connect an MCP client

The endpoint is **`POST/GET/DELETE /mcp`**, using Streamable HTTP with sessions.

- **Scripted client (included):** `npm run demo` plays a short game against `MCP_URL` (default `http://127.0.0.1:3000/mcp`) using the official SDK client and prints what the assistant would say.
- **MCP Inspector:** `npx @modelcontextprotocol/inspector`, choose *Streamable HTTP*, URL `http://127.0.0.1:3000/mcp`. *(We haven't tried this client ourselves.)*
- **Alexa+:** Alexa+ needs to reach the server over HTTPS, so expose `/mcp` at a public URL (a reverse proxy or tunnel in front of `npm start`, with `HOST=0.0.0.0` and `ALLOWED_HOSTS=<your hostname>`), then register that URL as an MCP server following the Alexa+ track's connection instructions. *We haven't yet tested it end to end against Alexa+ itself; the tests use the MCP SDK client.*
- **Any other MCP client** that speaks Streamable HTTP works the same way. The server (MCP TypeScript SDK 1.30.1) answers with the protocol version the client requests if the SDK supports it, and otherwise with its latest, `2025-11-25`. The SDK client requests `2025-11-25`.

## Tests

`npm test` (which runs `node --test`) runs everything through the real server. The client side uses the SDK's own `Client` and `StreamableHTTPClientTransport`.

| File | What it proves |
|---|---|
| `test/seal.test.mjs` | **Nothing reachable carries the solution before an accusation is committed.** It is checked two ways. (1) *Marker grep*: every tool result, `tools/list`, resource, prompt, instructions text, MCP error (unknown tool, schema violation, unknown resource or prompt) and raw HTTP error is searched for text that exists only in the solution. (2) *Differential*: the same calls are replayed against a second server whose case has a **different culprit, method and motive**. Every pre-commit response has to be byte-identical. This runs over a scripted playthrough and over 1,200 randomised tool calls with garbage arguments (8 seeds), which include real commits followed by restarts. |
| `test/session.test.mjs` | Negotiated protocol is `2025-11-25`. A full playthrough over MCP reaches the correct verdict, including a wrong accusation and a reopen first. Two concurrent sessions don't share evidence, testimony, question budget, staged accusations or verdicts, and one player can't confirm another's accusation. An unknown session id gets 404. |
| `test/voice.test.mjs` | Every result from every branch, scripted and randomised, has a `speech` of 1–2 sentences with no markdown, emoji or line breaks. Natural phrasing resolves correctly. |

**Why the differential test and not just a grep for the culprit's name?** The culprit is one of the three suspects, so the culprit's name correctly appears in the suspect list, the ledger and other people's testimony. Grepping for it proves nothing. We checked that the test catches real leaks by planting two. First, the engine was changed to list the culprit first among the accusation options, a leak that uses no solution text at all. The marker grep **passed** it, and the differential tests **failed** it. Second, `hear_ending` was allowed to answer before a verdict. All three seal tests failed.

## What was built during the hackathon window (after 2026-08-31)

This project reuses the case and game engine from our earlier project **Sealed Case** (MIT, © 2026 Ai-Q Labs), a browser game built on WebMCP in August 2026. We're saying exactly what was reused so judges don't have to guess.

**Reused**

- `case/lantern-room.js`: the scenario (provenance header added; the fictional publisher was renamed to Akeboshi so its name cannot be confused with a real company).
- `engine.js`: the game rules and the solution closure. One change: `createEngine()` now takes the case as a parameter, so each MCP session gets its own engine and the tests can swap in a different solution.
- The tool vocabulary is modeled on Sealed Case's WebMCP tools.

**New for this hackathon**

- `server.js`: a self-hosted **Streamable HTTP MCP server** using the official SDK, with per-session games keyed by `Mcp-Session-Id`, idle-session expiry and a session cap, and DNS rebinding protection on localhost. Sealed Case had no server at all; it ran entirely in a browser tab.
- `mcp.js`: an MCP tool surface redesigned for voice. The tools are organized around what a player says, the descriptions are written for tool selection from speech, and there are tool annotations, a resource and a prompt.
- `game.js`: the voice layer. It adds the `speech` field on every result, splits verbatim testimony and descriptions into separate fields, resolves natural phrasing to ids, groups objects into searchable places, and keeps misheard questions from costing anything.
- **Committed accusations over MCP.** In Sealed Case, the verdict came from a click in the web page. With voice there's no page, so the commit step became a read-back plus a spoken "yes" (`accuse` with `confirmed: true`), and the tests show one call can never both stage and grade an accusation.
- The solution now stays in a **server process**, where the browser version kept it in page memory. A client, an assistant, or a person with devtools gets only tool results.
- All 13 tests, including the differential leak proof and the concurrency tests.
- `demo-client.js`, this README, and the demo script below.

## Demo script (under 3 minutes)

Record the terminal on its own, with no editor, file tree or browser chrome in the frame. First set a short prompt so no local path is ever on screen:

```powershell
function prompt { "PS> " }
```

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Title card | "Murder mysteries need five people and a game master who never gets to play. An AI game master that reads the script knows the answer. Sealed Case fixes that with MCP." |
| 0:20–0:40 | `PS> npm test` | "Thirteen tests. The key one replays every call against a copy of the case with a different culprit. Before you accuse, every response is byte-identical, so nothing the assistant hears depends on who did it." |
| 0:40–0:50 | `PS> npm start` (first terminal) | "This is a self-hosted MCP server over Streamable HTTP, protocol 2025-11-25." |
| 0:50–2:20 | `PS> npm run demo` (second terminal) | Read the PLAYER lines aloud as the player. Point out: the `speech` line is what Alexa says; the suspect's words are quoted, never made up; the accusation is read back and graded only after "Yes." |
| 2:20–2:45 | Scroll to the `accuse` lines | "The assistant can gather evidence and repeat my accusation back to me. Only my yes commits it. It never knew the answer, so it couldn't have steered me toward it." |
| 2:45–2:55 | Closing card | "Sealed Case for Alexa+. One player, by voice, with a game master who doesn't know the ending." |

## Files

| File | |
|---|---|
| `server.js` | Entry point. Express + `StreamableHTTPServerTransport`, one game per session. |
| `mcp.js` | Tools, resource and prompt. |
| `game.js` | Voice layer: `speech`, phrase resolution, two-step accusation. |
| `engine.js` | Game rules; the solution closure. (Reused, see above.) |
| `case/lantern-room.js` | The scenario. The only place the solution exists. (Reused.) |
| `demo-client.js` | Scripted player using the SDK client. |
| `test/` | `node --test` suites. |

The scenario is original and entirely fictional. Every person, publisher, magazine and establishment in it is invented.

## License

MIT, © 2026 Ai-Q Labs. See `LICENSE`.
