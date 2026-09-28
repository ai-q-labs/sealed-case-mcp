/**
 * Sealed Case for Alexa+ — the MCP surface.
 *
 * `buildMcpServer(game)` wraps one player's game in one McpServer. server.js
 * creates a fresh pair for every MCP session, so the state behind a tool call
 * is always the state of the session that made it.
 *
 * Every tool returns the game's result twice, as the spec recommends: as
 * `structuredContent`, and serialised as JSON in a text block for clients that
 * only read text. Every result has a `speech` field — at most two plain
 * sentences — that a voice assistant can say as-is.
 *
 * There is no tool, resource or prompt that returns the solution. The only
 * path to the verdict is `accuse` with `confirmed: true`, after the same
 * accusation has been read back to the player.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SERVER_INFO = { name: "sealed-case-mcp", version: "1.0.0" };

const INSTRUCTIONS = `You are the game master for Sealed Case, a one-player murder mystery played by voice.
You do not know who did it, and no tool will tell you: the answer lives only inside this server.
Speak each result's "speech" field. When a result has "said" (a suspect's reply) or "description" (a close look at an object), read it aloud verbatim if the player wants the detail; never invent testimony or evidence.
Let the player decide the accusation. Call accuse once to read it back, and call it again with confirmed=true only after the player says yes.`;

const result = (r) => ({
  content: [{ type: "text", text: JSON.stringify(r) }],
  structuredContent: r,
});

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const PLAY = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export function buildMcpServer(game) {
  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS,
    capabilities: { tools: {}, resources: {}, prompts: {} },
  });

  server.registerTool(
    "start_case",
    {
      title: "Start the mystery",
      description:
        "Start or resume the murder mystery and hear the opening briefing. Use when the player says things like 'start the mystery', 'let's play Sealed Case', 'what happened', or 'read me the case'.",
      inputSchema: {},
      annotations: { ...PLAY, idempotentHint: true },
    },
    async () => result(game.startCase()),
  );

  server.registerTool(
    "list_suspects",
    {
      title: "List the suspects",
      description:
        "Name the three suspects and their stated movements tonight. Use for 'who are the suspects', 'who was there', 'remind me who's who'.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => result(game.listSuspects()),
  );

  server.registerTool(
    "search_location",
    {
      title: "Search a place",
      description:
        "Look around one place in the Lantern Room and hear which objects are there. Places: the counter, the door, the stairwell, the coat rack, the kitchen. Use for 'search the counter', 'look around the stairs', 'what's by the door'. Call without a place to hear the list of places.",
      inputSchema: {
        place: z
          .string()
          .optional()
          .describe("The place as the player said it, e.g. 'behind the bar', 'the stairs', 'kitchen'."),
      },
      annotations: READ_ONLY,
    },
    async ({ place }) => result(game.searchLocation(place)),
  );

  server.registerTool(
    "examine_evidence",
    {
      title: "Examine an object",
      description:
        "Take a close look at one object and hear exactly what a person standing there would notice. Use for 'look at the bottle', 'check the lock', 'read the newspaper clipping', 'what does the ledger say'. Objects: keep bottle, glass, bolt, ledger, manuscript, photograph, clipping, back door. Examining twice gives nothing new.",
      inputSchema: {
        item: z.string().describe("The object as the player said it, e.g. 'the shochu', 'the lock', 'the photo'."),
      },
      annotations: { ...PLAY, idempotentHint: true },
    },
    async ({ item }) => result(game.examineEvidence(item)),
  );

  server.registerTool(
    "question_suspect",
    {
      title: "Question a suspect",
      description:
        "Ask one suspect about one topic and hear their reply, word for word. Suspects: Sae Torii (novelist), Hajime Kuroda (bar owner), Miyuki Onodera (editor). Topics: the victim, their alibi, the bottle, the photograph, the clipping, the manuscript. Use for 'ask the owner where he was', 'what does Torii say about the victim'. Only eight questions are answered in total, so ask only what the player asked for. The reply is written by the game: quote it, never invent it. Some suspects lie.",
      inputSchema: {
        suspect: z.string().describe("Who to ask, by name or role, e.g. 'Kuroda', 'the novelist'."),
        topic: z.string().describe("What to ask about, e.g. 'alibi', 'where she was', 'the photo', 'the victim'."),
      },
      annotations: PLAY,
    },
    async ({ suspect, topic }) => result(game.questionSuspect(suspect, topic)),
  );

  server.registerTool(
    "review_notes",
    {
      title: "Review notes",
      description:
        "Read back the player's notebook: evidence found, statements heard, questions left, objects not yet examined. Use for 'what do we know', 'recap', 'read my notes'.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => result(game.reviewNotes()),
  );

  server.registerTool(
    "get_progress",
    {
      title: "Check progress",
      description:
        "Say where the game stands: how much has been examined, how many questions remain, and whether an accusation is waiting for confirmation. Use for 'how am I doing', 'where are we'.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => result(game.progress()),
  );

  server.registerTool(
    "get_accusation_options",
    {
      title: "Hear the accusation options",
      description:
        "List the choices an accusation is built from: the culprit, how it was done, and why. Use for 'how do I accuse', 'what are my options', or before accusing when the player is unsure.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => result(game.accusationOptions()),
  );

  server.registerTool(
    "accuse",
    {
      title: "Accuse",
      description:
        "Make the player's accusation: who did it, how, and why. Use when the player says 'I accuse...', 'it was...', 'I think X did it because...'. The first call only reads the accusation back and asks the player to confirm; nothing is graded. Call again with the same three values and confirmed=true only after the player clearly says yes. Only then is the verdict revealed. Never set confirmed=true on the player's behalf.",
      inputSchema: {
        culprit: z.string().describe("Suspect name or role, or 'no one' if the player says it was not murder."),
        method: z
          .string()
          .describe(
            "forced_bolt (bolt worked from the corridor), hidden_exit (a second way out), no_entry_needed (the killer never had to be in the room), accident (no one killed him). Plain words are accepted.",
          ),
        motive: z
          .string()
          .describe(
            "rejected_manuscript, career (his position at the publisher), old_death (a death in 1996), none. Plain words are accepted.",
          ),
        confirmed: z
          .boolean()
          .optional()
          .describe("true only after the player has heard this exact accusation read back and said yes."),
      },
      annotations: PLAY,
    },
    async (args) => result(game.accuse(args)),
  );

  server.registerTool(
    "withdraw_accusation",
    {
      title: "Withdraw the accusation",
      description:
        "Take back an accusation that is waiting for confirmation. Use when the player says 'no', 'wait', 'not yet' after an accusation was read back.",
      inputSchema: {},
      annotations: PLAY,
    },
    async () => result(game.withdrawAccusation()),
  );

  server.registerTool(
    "hear_ending",
    {
      title: "Hear the ending",
      description:
        "Tell the full story of what happened. Works only after the player has committed a correct accusation; before that it refuses. Use for 'tell me what happened', 'how did he do it' after a win.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => result(game.hearEnding()),
  );

  server.registerTool(
    "reopen_case",
    {
      title: "Reopen the case",
      description:
        "After a wrong accusation, go back to investigating with all notes kept. Use for 'let me try again', 'reopen the case'.",
      inputSchema: {},
      annotations: PLAY,
    },
    async () => result(game.reopenCase()),
  );

  server.registerTool(
    "restart_case",
    {
      title: "Start over",
      description: "Wipe this player's progress and start the night over. Use only when the player asks to start over.",
      inputSchema: {},
      annotations: { ...PLAY, destructiveHint: true },
    },
    async () => result(game.restartCase()),
  );

  server.registerResource(
    "case-briefing",
    "sealed-case://lantern-room/briefing",
    {
      title: "The Lantern Room: case briefing",
      description: "The public case file: what happened, the victim, the suspects. Contains no solution.",
      mimeType: "application/json",
    },
    async (uri) => {
      const r = game.caseFile();
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(r) }] };
    },
  );

  server.registerPrompt(
    "play_sealed_case",
    {
      title: "Play Sealed Case",
      description: "Instructions for running Sealed Case as a voice game master who does not know the answer.",
    },
    async () => ({
      messages: [{ role: "user", content: { type: "text", text: `${INSTRUCTIONS}\nBegin by calling start_case.` } }],
    }),
  );

  return server;
}
