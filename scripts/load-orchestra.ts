#!/usr/bin/env bun
import { setTimeout as sleep } from "node:timers/promises";
import {
  midiToNoteName,
  type ClientMessage,
  type PublicState,
  type ScorePart,
  type ServerMessage
} from "../shared/src/index";

type CliOptions = {
  api: string;
  adminPassword: string;
  players: number;
  jitterMs: number;
  connectDelayMs: number;
  timeoutMs: number;
};

type TargetUrls = {
  httpBase?: string;
  healthUrl?: string;
  wsUrl: string;
};

type Metrics = {
  sent: Map<string, number>;
  received: Map<string, number>;
  errors: string[];
  unexpectedCloses: number;
};

type Waiter<T extends ServerMessage = ServerMessage> = {
  description: string;
  predicate: (message: ServerMessage) => message is T;
  resolve: (message: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
};

const DEFAULTS: CliOptions = {
  api: process.env.API_URL ?? "http://localhost:3000",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  players: 24,
  jitterMs: 45,
  connectDelayMs: 15,
  timeoutMs: 120_000
};

const metrics: Metrics = {
  sent: new Map(),
  received: new Map(),
  errors: [],
  unexpectedCloses: 0
};

class RealtimeClient {
  readonly label: string;
  readonly role: "admin" | "student";
  state?: PublicState;
  connectionId?: string;
  sessionToken?: string;
  serverTimeOffsetMs = 0;
  private ws?: WebSocket;
  private waiters: Waiter[] = [];
  private closing = false;

  constructor(label: string, role: "admin" | "student") {
    this.label = label;
    this.role = role;
  }

  async open(wsUrl: string, timeoutMs: number): Promise<void> {
    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener("close", (event) => {
      if (!this.closing) {
        metrics.unexpectedCloses += 1;
        const reason = `${this.label} closed unexpectedly (${event.code})`;
        metrics.errors.push(reason);
        this.rejectWaiters(new Error(reason));
      }
    });

    socket.addEventListener("error", () => {
      const reason = `${this.label} websocket error`;
      metrics.errors.push(reason);
      this.rejectWaiters(new Error(reason));
    });

    await new Promise<void>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        reject(new Error(`${this.label} open timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.addEventListener(
        "open",
        () => {
          globalThis.clearTimeout(timer);
          resolve();
        },
        { once: true }
      );

      socket.addEventListener(
        "error",
        () => {
          globalThis.clearTimeout(timer);
          reject(new Error(`${this.label} failed to open websocket`));
        },
        { once: true }
      );
    });
  }

  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.label} websocket is not open`);
    }
    increment(metrics.sent, message.type);
    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.closing = true;
    for (const waiter of this.waiters) {
      globalThis.clearTimeout(waiter.timer);
    }
    this.waiters = [];
    this.ws?.close();
  }

  waitFor<T extends ServerMessage>(
    predicate: (message: ServerMessage) => message is T,
    timeoutMs: number,
    description: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter<T> = {
        description,
        predicate,
        resolve,
        reject,
        timer: globalThis.setTimeout(() => {
          this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
          reject(new Error(`${this.label} timeout waiting for ${description}`));
        }, timeoutMs)
      };
      this.waiters.push(waiter as Waiter);
    });
  }

  async waitForState(
    predicate: (state: PublicState) => boolean,
    timeoutMs: number,
    description: string
  ): Promise<PublicState> {
    if (this.state && predicate(this.state)) {
      return this.state;
    }

    const message = await this.waitFor(
      (candidate): candidate is Extract<ServerMessage, { type: "state" | "welcome" }> =>
        (candidate.type === "state" || candidate.type === "welcome") &&
        Boolean(this.state && predicate(this.state)),
      timeoutMs,
      description
    );
    void message;
    if (!this.state) {
      throw new Error(`${this.label} matched ${description} without local state`);
    }
    return this.state;
  }

  private handleMessage(raw: unknown): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(raw)) as ServerMessage;
    } catch {
      metrics.errors.push(`${this.label} received invalid JSON`);
      return;
    }

    increment(metrics.received, message.type);

    if (message.type === "welcome") {
      this.connectionId = message.connectionId;
      this.state = message.state;
      this.serverTimeOffsetMs = message.serverNowMs - Date.now();
      if (message.role === "student") {
        this.sessionToken = message.sessionToken;
      }
    } else if (message.type === "state") {
      if (this.state) {
        this.state = {
          ...message.state,
          scores: this.state.scores
        };
      } else {
        metrics.errors.push(`${this.label} received state before welcome`);
      }
      const instantOffset = message.serverNowMs - Date.now();
      this.serverTimeOffsetMs = this.serverTimeOffsetMs * 0.8 + instantOffset * 0.2;
    } else if (message.type === "error") {
      metrics.errors.push(`${this.label}: ${message.message}`);
    }

    for (const waiter of [...this.waiters]) {
      if (waiter.predicate(message)) {
        globalThis.clearTimeout(waiter.timer);
        this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
        waiter.resolve(message);
      }
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters) {
      globalThis.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters = [];
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const target = normalizeTarget(options.api);
  const clients: RealtimeClient[] = [];
  const startedAt = Date.now();

  console.info(`Target websocket: ${target.wsUrl}`);
  console.info(`Requested players: ${options.players}`);

  try {
    await preflight(target);

    const admin = await connectAdmin(target.wsUrl, options);
    clients.push(admin);

    console.info("Resetting session through admin websocket...");
    admin.send({ type: "admin_reset" });
    await admin.waitForState(
      (state) => state.phase === "phase1_lobby",
      10_000,
      "phase1_lobby after reset"
    );

    console.info("Switching path to orchestra...");
    admin.send({ type: "admin_set_path_choice", path: "orchestra" });
    await admin.waitForState(
      (state) => state.pathChoice === "orchestra",
      5_000,
      "pathChoice orchestra"
    );

    const students = await connectStudents(target.wsUrl, options);
    clients.push(...students);
    console.info(`Students connected: ${students.length}/${options.players}`);

    admin.send({ type: "admin_advance_phase" });
    const groupState = await admin.waitForState(
      (state) => state.phase === "phase6_orchestra_groups",
      10_000,
      "phase6_orchestra_groups"
    );

    const assignedTarget = assignStudentsToOrchestraGroups(students, groupState);
    await admin.waitForState(
      (state) => countOrchestraAssignments(state) >= assignedTarget,
      10_000,
      "orchestra group assignments"
    );

    const assignmentState = admin.state ?? groupState;
    const activePlayers = activeOrchestraPlayers(students, assignmentState);
    console.info(
      `Orchestra players active: ${activePlayers.length}; waiting players: ${
        students.length - activePlayers.length
      }`
    );

    if (activePlayers.length === 0) {
      throw new Error("No student could be assigned to an orchestra group.");
    }

    admin.send({ type: "admin_advance_phase" });
    await admin.waitForState(
      (state) => state.phase === "phase7_orchestra_practice",
      10_000,
      "phase7_orchestra_practice"
    );

    console.info("Starting orchestra performance...");
    const performanceStartPromise = admin.waitFor(
      (message): message is Extract<ServerMessage, { type: "performance_start" }> =>
        message.type === "performance_start" && message.scoreId === "orchestre",
      10_000,
      "orchestra performance_start"
    );
    admin.send({ type: "admin_advance_phase" });
    const performanceStart = await performanceStartPromise;

    const performanceState = await admin.waitForState(
      (state) =>
        state.phase === "phase8_orchestra_performance" &&
        state.currentScoreId === "orchestre" &&
        Boolean(state.performanceStartAtServerMs),
      10_000,
      "phase8_orchestra_performance"
    );

    const score = performanceState.scores.orchestre;
    const playTasks = activePlayers.map(({ client, part }) =>
      playPart(client, part, performanceStart.startAtServerMs, options.jitterMs)
    );

    await Promise.all(playTasks);

    await admin.waitForState(
      (state) =>
        state.phase === "phase8_orchestra_performance" &&
        state.performanceStatus === "finished",
      score.durationMs + 15_000,
      "orchestra performance finished"
    );

    printSummary({
      options,
      startedAt,
      connectedPlayers: students.length,
      activePlayers: activePlayers.length,
      finalState: admin.state
    });

    const closeFailureRatio =
      students.length === 0 ? 0 : metrics.unexpectedCloses / students.length;
    if (closeFailureRatio > 0.2) {
      throw new Error(
        `Too many unexpected websocket closes: ${metrics.unexpectedCloses}/${students.length}`
      );
    }
  } finally {
    for (const client of clients) {
      client.close();
    }
  }
}

function parseArgs(args: string[]): CliOptions {
  const options = { ...DEFAULTS };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    switch (rawKey) {
      case "api":
        options.api = value;
        break;
      case "admin-password":
        options.adminPassword = value;
        break;
      case "players":
        options.players = parsePositiveInt(value, rawKey);
        break;
      case "jitter-ms":
        options.jitterMs = parseNonNegativeInt(value, rawKey);
        break;
      case "connect-delay-ms":
        options.connectDelayMs = parseNonNegativeInt(value, rawKey);
        break;
      case "timeout-ms":
        options.timeoutMs = parsePositiveInt(value, rawKey);
        break;
      default:
        throw new Error(`Unknown option: --${rawKey}`);
    }
  }

  return options;
}

function printUsage(): void {
  console.info(`
Usage:
  bun run load:orchestra -- --api http://localhost:3000 --admin-password admin123 --players 24

Options:
  --api                 API base URL or websocket URL. Default: ${DEFAULTS.api}
  --admin-password      Admin password. Default: ADMIN_PASSWORD or admin123
  --players             Number of student connections. Default: 24
  --jitter-ms           Random human timing jitter for note inputs. Default: 45
  --connect-delay-ms    Delay between student connections. Default: 15
  --timeout-ms          WebSocket open timeout. Default: 120000
`);
}

function normalizeTarget(rawApi: string): TargetUrls {
  const raw = rawApi.trim().replace(/\/+$/, "");
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withScheme);

  if (url.protocol === "ws:" || url.protocol === "wss:") {
    const httpProtocol = url.protocol === "wss:" ? "https:" : "http:";
    const wsPath = url.pathname === "/" ? "/ws" : url.pathname;
    const apiPath = wsPath.endsWith("/ws") ? wsPath.slice(0, -3) || "" : "";
    return {
      httpBase: `${httpProtocol}//${url.host}`,
      healthUrl: apiPath !== undefined ? `${httpProtocol}//${url.host}${apiPath}/api/health` : undefined,
      wsUrl: `${url.protocol}//${url.host}${wsPath}${url.search}`
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported API protocol: ${url.protocol}`);
  }

  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const apiPath = basePath.endsWith("/ws") ? basePath.slice(0, -3) : basePath;
  const wsPath = basePath.endsWith("/ws") ? basePath : `${basePath}/ws`;

  return {
    httpBase: `${url.protocol}//${url.host}${apiPath}`,
    healthUrl: `${url.protocol}//${url.host}${apiPath}/api/health`,
    wsUrl: `${wsProtocol}//${url.host}${wsPath}${url.search}`
  };
}

async function preflight(target: TargetUrls): Promise<void> {
  if (!target.healthUrl) {
    return;
  }

  try {
    const response = await fetch(target.healthUrl);
    if (!response.ok) {
      console.warn(`Health check returned HTTP ${response.status}; continuing.`);
      return;
    }
    const body = (await response.json()) as { ok?: boolean };
    if (body.ok !== true) {
      console.warn("Health check did not return ok=true; continuing.");
    }
  } catch (error) {
    console.warn(
      `Health check failed (${error instanceof Error ? error.message : String(error)}); continuing.`
    );
  }
}

async function connectAdmin(
  wsUrl: string,
  options: CliOptions
): Promise<RealtimeClient> {
  const admin = new RealtimeClient("admin", "admin");
  await admin.open(wsUrl, options.timeoutMs);
  const welcome = admin.waitFor(
    (message): message is Extract<ServerMessage, { type: "welcome" | "error" }> =>
      message.type === "welcome" || message.type === "error",
    10_000,
    "admin welcome"
  );
  admin.send({ type: "hello", role: "admin", password: options.adminPassword });
  const message = await welcome;
  if (message.type === "error") {
    throw new Error(`Admin login failed: ${message.message}`);
  }
  return admin;
}

async function connectStudents(
  wsUrl: string,
  options: CliOptions
): Promise<RealtimeClient[]> {
  const students: RealtimeClient[] = [];

  for (let index = 0; index < options.players; index += 1) {
    const student = new RealtimeClient(`student-${index + 1}`, "student");
    await student.open(wsUrl, options.timeoutMs);
    const welcome = student.waitFor(
      (message): message is Extract<ServerMessage, { type: "welcome" | "error" }> =>
        message.type === "welcome" || message.type === "error",
      10_000,
      `${student.label} welcome`
    );
    student.send({
      type: "hello",
      role: "student",
      name: `Load ${String(index + 1).padStart(2, "0")}`
    });
    const message = await welcome;
    if (message.type === "error") {
      throw new Error(`${student.label} failed to join: ${message.message}`);
    }
    await syncClock(student);
    students.push(student);

    if (options.connectDelayMs > 0) {
      await sleep(options.connectDelayMs);
    }
  }

  return students;
}

async function syncClock(client: RealtimeClient): Promise<void> {
  const samples: Array<{ rtt: number; offset: number }> = [];

  for (let index = 0; index < 3; index += 1) {
    const sentAt = Date.now();
    const pong = client.waitFor(
      (message): message is Extract<ServerMessage, { type: "clock_pong" }> =>
        message.type === "clock_pong" && message.clientSentAtMs === sentAt,
      2_000,
      "clock_pong"
    );
    client.send({ type: "clock_ping", clientSentAtMs: sentAt });
    try {
      const message = await pong;
      const receivedAt = Date.now();
      const rtt = receivedAt - message.clientSentAtMs;
      const estimatedServerAtReceive = message.serverSentAtMs + rtt / 2;
      samples.push({ rtt, offset: estimatedServerAtReceive - receivedAt });
    } catch {
      break;
    }
    await sleep(20);
  }

  samples.sort((a, b) => a.rtt - b.rtt);
  if (samples[0]) {
    client.serverTimeOffsetMs = samples[0].offset;
  }
}

function assignStudentsToOrchestraGroups(
  students: RealtimeClient[],
  state: PublicState
): number {
  const rooms = state.parts.filter((room) => room.scoreId === "orchestre");
  const slots: string[] = [];
  const maxRoomSize = Math.max(0, ...rooms.map((room) => room.maxSize));

  for (let seat = 0; seat < maxRoomSize; seat += 1) {
    for (const room of rooms) {
      if (seat < room.maxSize) {
        slots.push(room.partId);
      }
    }
  }

  const target = Math.min(students.length, slots.length);
  for (let index = 0; index < target; index += 1) {
    students[index].send({ type: "join_part", partId: slots[index] });
  }

  return target;
}

function countOrchestraAssignments(state: PublicState): number {
  return state.parts
    .filter((room) => room.scoreId === "orchestre")
    .reduce((sum, room) => sum + room.students.length, 0);
}

function activeOrchestraPlayers(
  students: RealtimeClient[],
  state: PublicState
): Array<{ client: RealtimeClient; part: ScorePart }> {
  const score = state.scores.orchestre;

  return students.flatMap((client) => {
    const student = state.students.find(
      (candidate) => candidate.connectionId === client.connectionId
    );
    if (!student?.partId) {
      return [];
    }
    const part = score.parts.find((candidate) => candidate.id === student.partId);
    return part ? [{ client, part }] : [];
  });
}

async function playPart(
  client: RealtimeClient,
  part: ScorePart,
  startAtServerMs: number,
  jitterMs: number
): Promise<void> {
  const upTasks: Promise<void>[] = [];
  const notes = [...part.notes].sort((a, b) => a.timestampMs - b.timestampMs);

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const jitter = randomBetween(-jitterMs, jitterMs);
    const localDownAt = startAtServerMs + note.timestampMs - client.serverTimeOffsetMs + jitter;
    await sleepUntil(localDownAt);

    const eventId = `${client.label}-${index}-${Date.now().toString(36)}`;
    const downAt = Date.now();
    client.send({
      type: "input_down",
      eventId,
      note: midiToNoteName(note.midi),
      midi: note.midi,
      clientEventAtMs: downAt,
      estimatedServerEventAtMs: downAt + client.serverTimeOffsetMs
    });

    const holdMs = Math.max(80, note.durationMs);
    upTasks.push(
      sleep(holdMs).then(() => {
        const upAt = Date.now();
        client.send({
          type: "input_up",
          eventId,
          note: midiToNoteName(note.midi),
          midi: note.midi,
          clientEventAtMs: upAt,
          estimatedServerEventAtMs: upAt + client.serverTimeOffsetMs
        });
      })
    );
  }

  await Promise.all(upTasks);
}

async function sleepUntil(timestampMs: number): Promise<void> {
  const delay = Math.max(0, timestampMs - Date.now());
  if (delay > 0) {
    await sleep(delay);
  }
}

function printSummary(input: {
  options: CliOptions;
  startedAt: number;
  connectedPlayers: number;
  activePlayers: number;
  finalState?: PublicState;
}): void {
  const durationSeconds = ((Date.now() - input.startedAt) / 1000).toFixed(1);
  const finalState = input.finalState;

  console.info("\nLoad test summary");
  console.info("-----------------");
  console.info(`Duration: ${durationSeconds}s`);
  console.info(`Players requested: ${input.options.players}`);
  console.info(`Players connected: ${input.connectedPlayers}`);
  console.info(`Orchestra players active: ${input.activePlayers}`);
  console.info(`Players waiting: ${input.connectedPlayers - input.activePlayers}`);
  console.info(`Unexpected websocket closes: ${metrics.unexpectedCloses}`);
  if (finalState) {
    console.info(`Final phase: ${finalState.phase}`);
    console.info(`Final performance status: ${finalState.performanceStatus}`);
    console.info(`Final global score: ${finalState.globalScore}`);
  }
  printCounter("Sent", metrics.sent);
  printCounter("Received", metrics.received);
  if (metrics.errors.length > 0) {
    console.info("Errors:");
    for (const error of metrics.errors.slice(0, 20)) {
      console.info(`  - ${error}`);
    }
    if (metrics.errors.length > 20) {
      console.info(`  ... ${metrics.errors.length - 20} more`);
    }
  }
}

function printCounter(label: string, counter: Map<string, number>): void {
  const entries = [...counter.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.info(`${label}:`);
  for (const [type, count] of entries) {
    console.info(`  ${type}: ${count}`);
  }
}

function increment(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
