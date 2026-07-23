/**
 * Lifecycle tests for the Shard, run against MockGateway. No token, no
 * Discord, no network beyond localhost. Each test scripts Discord's side
 * of the conversation and asserts the shard's reflexes.
 */

import { describe, expect, test } from "bun:test";
import { once } from "node:events";

import { GatewayOpcode, Shard, ShardState, type ReadyData } from "../src/index";
import { MockGateway } from "./mock-gateway";

const TOKEN = "test-token";

/** A minimal READY payload with only the fields the shard reads. */
function readyData(gw: MockGateway, sessionId = "sess-1"): ReadyData {
  return {
    v: 10,
    user: { id: "1", username: "testbot", discriminator: "0" },
    session_id: sessionId,
    // Point resumes back at the mock so reconnect tests stay self-contained.
    resume_gateway_url: gw.url,
    guilds: [],
  };
}

function makeShard(gw: MockGateway): Shard {
  return new Shard({ url: gw.url, token: TOKEN, intents: 0 });
}

describe("construction", () => {
  test("rejects invalid shard and intent settings", () => {
    expect(() => new Shard({ url: "wss://gateway.test", token: "", intents: 0 })).toThrow(
      /token/,
    );
    expect(
      () => new Shard({ url: "wss://gateway.test", token: TOKEN, intents: -1 }),
    ).toThrow(/intents/);
    expect(
      () =>
        new Shard({
          url: "wss://gateway.test",
          token: TOKEN,
          intents: 0,
          shard: [2, 2],
        }),
    ).toThrow(/shard id/);
  });
});

describe("handshake", () => {
  test("HELLO → IDENTIFY → READY, and connect() resolves at READY", async () => {
    const gw = new MockGateway();
    const shard = makeShard(gw);
    try {
      const connecting = shard.connect();

      // The shard must identify (with our token) only after HELLO.
      const identify = await gw.nextOfOp(GatewayOpcode.Identify);
      const d = identify.d as { token: string; intents: number; properties: { browser: string } };
      expect(d.token).toBe(TOKEN);
      expect(d.properties.browser).toBe("eunia");

      gw.sendDispatch("READY", readyData(gw), 1);
      await connecting; // resolves at READY, not at socket-open
      expect(shard.state).toBe(ShardState.Ready);
    } finally {
      shard.disconnect();
      gw.stop();
    }
  });

  test("a fatal close code (4004 bad token) stops the shard for good", async () => {
    const gw = new MockGateway();
    const shard = makeShard(gw);
    try {
      const connecting = shard.connect();
      const closed = once(shard, "closed");

      await gw.nextOfOp(GatewayOpcode.Identify);
      gw.closeLatest(4004, "Authentication failed.");

      // The real assertion is that no reconnect is ever attempted.
      expect(connecting).rejects.toThrow("4004");
      const [info] = (await closed) as [{ fatal: boolean }];
      expect(info.fatal).toBe(true);
      expect(shard.state).toBe(ShardState.Disconnected);
      await Bun.sleep(1_500); // give a buggy reconnect loop time to expose itself
      expect(gw.connectionCount).toBe(1);
    } finally {
      shard.disconnect();
      gw.stop();
    }
  });
});

describe("heartbeats", () => {
  test("beats on the interval, reports the latest seq, measures latency on ack", async () => {
    // A short interval so the test runs in milliseconds, not 41 seconds.
    const gw = new MockGateway({ heartbeatInterval: 200 });
    const shard = makeShard(gw);
    try {
      const connecting = shard.connect();
      await gw.nextOfOp(GatewayOpcode.Identify);
      gw.sendDispatch("READY", readyData(gw), 1);
      await connecting;

      // The first (jittered) beat may race READY, so allow one null before
      // requiring the beat to carry READY's sequence number.
      let beat = await gw.nextOfOp(GatewayOpcode.Heartbeat, 2_000);
      if (beat.d === null) beat = await gw.nextOfOp(GatewayOpcode.Heartbeat, 2_000);
      expect(beat.d).toBe(1);

      expect(shard.latencyMs).toBeNull(); // no ack yet
      gw.send({ op: GatewayOpcode.HeartbeatAck, d: null, s: null, t: null });
      // The ack travels through zlib + the event loop; poll briefly.
      for (let i = 0; i < 50 && shard.latencyMs === null; i++) await Bun.sleep(10);
      expect(shard.latencyMs).not.toBeNull();
    } finally {
      shard.disconnect();
      gw.stop();
    }
  });
});

describe("commands sent by a ready shard", () => {
  test("updates presence and validates member requests", async () => {
    const gw = new MockGateway();
    const shard = makeShard(gw);
    try {
      const connecting = shard.connect();
      await gw.nextOfOp(GatewayOpcode.Identify);
      gw.sendDispatch("READY", readyData(gw), 1);
      await connecting;

      await shard.updatePresence({
        since: null,
        activities: [],
        status: "online",
        afk: false,
      });
      const presence = await gw.nextOfOp(GatewayOpcode.PresenceUpdate);
      expect((presence.d as { status: string }).status).toBe("online");

      await shard.requestGuildMembers({
        guild_id: "123456789012345678",
        user_ids: ["222222222222222222"],
        nonce: "members",
      });
      const request = await gw.nextOfOp(GatewayOpcode.RequestGuildMembers);
      expect(request.d).toEqual({
        guild_id: "123456789012345678",
        user_ids: ["222222222222222222"],
        nonce: "members",
      });

      await shard.requestSoundboardSounds({
        guild_ids: ["123456789012345678"],
      });
      expect(await gw.nextOfOp(GatewayOpcode.RequestSoundboardSounds)).toMatchObject({
        d: { guild_ids: ["123456789012345678"] },
      });

      await shard.requestChannelInfo({
        guild_id: "123456789012345678",
        fields: ["status", "voice_start_time"],
      });
      expect(await gw.nextOfOp(GatewayOpcode.RequestChannelInfo)).toMatchObject({
        d: {
          guild_id: "123456789012345678",
          fields: ["status", "voice_start_time"],
        },
      });

      await shard.updateVoiceState({
        guild_id: "123456789012345678",
        channel_id: "333333333333333333",
        self_mute: false,
        self_deaf: true,
      });
      expect(await gw.nextOfOp(GatewayOpcode.VoiceStateUpdate)).toMatchObject({
        d: {
          guild_id: "123456789012345678",
          channel_id: "333333333333333333",
          self_mute: false,
          self_deaf: true,
        },
      });

      expect(() =>
        shard.requestGuildMembers({
          guild_id: "123456789012345678",
          query: "",
        }),
      ).toThrow(/require limit/);
      expect(() =>
        shard.requestGuildMembers({
          guild_id: "123456789012345678",
          user_ids: [],
        }),
      ).toThrow(/at least one/);
      expect(() =>
        shard.requestGuildMembers({
          guild_id: "123456789012345678",
          user_ids: "222222222222222222",
          presences: true,
        }),
      ).toThrow(/GuildPresences/);
      expect(() => shard.requestSoundboardSounds({ guild_ids: [] })).toThrow(
        /at least one/,
      );
      expect(() =>
        shard.requestChannelInfo({
          guild_id: "123456789012345678",
          fields: [],
        }),
      ).toThrow(/at least one/);
      expect(() =>
        shard.updateVoiceState({
          guild_id: "123456789012345678",
          channel_id: "not-an-id",
          self_mute: false,
          self_deaf: false,
        }),
      ).toThrow(/snowflakes or null/);
    } finally {
      shard.disconnect();
      gw.stop();
    }
  });
});

describe("resume", () => {
  test(
    "op 7 RECONNECT → new connection → op 6 RESUME with session tickets → RESUMED",
    async () => {
      const gw = new MockGateway();
      const shard = makeShard(gw);
      try {
        const connecting = shard.connect();
        await gw.nextOfOp(GatewayOpcode.Identify);
        gw.sendDispatch("READY", readyData(gw, "sess-42"), 7);
        await connecting;

        const resumed = once(shard, "resumed");
        gw.send({ op: GatewayOpcode.Reconnect, d: null, s: null, t: null });

        // The shard must come back on a NEW connection and hand over the
        // exact tickets from READY: session id + last seq it processed.
        const resume = await gw.nextOfOp(GatewayOpcode.Resume, 10_000);
        expect(resume.connection).toBe(1);
        expect(resume.d).toEqual({ token: TOKEN, session_id: "sess-42", seq: 7 });

        gw.sendDispatch("RESUMED", null, 8);
        await resumed;
        expect(shard.state).toBe(ShardState.Ready);
      } finally {
        shard.disconnect();
        gw.stop();
      }
    },
    15_000,
  );

  test(
    "zombie connection (acks never arrive) → self-recycle → RESUME",
    async () => {
      // Fast heartbeats so the zombie is detected quickly; we never ack.
      const gw = new MockGateway({ heartbeatInterval: 150 });
      const shard = makeShard(gw);
      try {
        const connecting = shard.connect();
        await gw.nextOfOp(GatewayOpcode.Identify);
        gw.sendDispatch("READY", readyData(gw), 3);
        await connecting;

        // No acks ever sent → the second due beat trips zombie detection →
        // the shard kills its own socket and resumes on a fresh one.
        const resume = await gw.nextOfOp(GatewayOpcode.Resume, 10_000);
        expect(resume.connection).toBeGreaterThanOrEqual(1);
        expect((resume.d as { seq: number }).seq).toBe(3);
        gw.sendDispatch("RESUMED", null, 4);
        for (let i = 0; i < 50 && shard.state !== ShardState.Ready; i++) await Bun.sleep(10);
        expect(shard.state).toBe(ShardState.Ready);
      } finally {
        shard.disconnect();
        gw.stop();
      }
    },
    15_000,
  );
});
