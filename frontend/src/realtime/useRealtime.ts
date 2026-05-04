import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  NoteJudgement,
  PublicState,
  ServerMessage
} from "@classe-orchestre/shared";
import { websocketUrl } from "./socket";

type Status = "idle" | "connecting" | "connected" | "disconnected";
type Role = "student" | "admin";
type GroupPlayNote = Extract<ServerMessage, { type: "group_play_note" }> & {
  receivedAt: number;
  key: string;
};

type ClockSample = {
  rtt: number;
  offset: number;
};

const RESET_SENTINEL = "__RESET__";

export function useRealtime() {
  const [status, setStatus] = useState<Status>("idle");
  const [role, setRole] = useState<Role | undefined>();
  const [state, setState] = useState<PublicState | undefined>();
  const [connectionId, setConnectionId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [groupNotes, setGroupNotes] = useState<GroupPlayNote[]>([]);
  const [groupStops, setGroupStops] = useState<string[]>([]);
  const [latestJudgement, setLatestJudgement] = useState<NoteJudgement | undefined>();
  const wsRef = useRef<WebSocket | null>(null);
  const clockTimerRef = useRef<number | undefined>();
  const reconnectTimerRef = useRef<number | undefined>();
  const lastEntryRef = useRef<string>();
  const clockSamplesRef = useRef<ClockSample[]>([]);
  const manualCloseRef = useRef(false);

  const send = useCallback((message: ClientMessage) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }, []);

  const stopClock = useCallback(() => {
    if (clockTimerRef.current !== undefined) {
      window.clearInterval(clockTimerRef.current);
      clockTimerRef.current = undefined;
    }
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    clockTimerRef.current = window.setInterval(() => {
      send({
        type: "clock_ping",
        clientSentAtMs: Date.now()
      });
    }, 2000);
  }, [send, stopClock]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "welcome":
        setRole(message.role);
        setState(message.state);
        setConnectionId(message.connectionId);
        setServerTimeOffsetMs(message.serverNowMs - Date.now());
        if (message.role === "student" && message.sessionToken) {
          window.localStorage.setItem("sessionToken", message.sessionToken);
          if (lastEntryRef.current) {
            window.localStorage.setItem("studentName", lastEntryRef.current);
          }
        }
        if (message.role === "admin") {
          window.localStorage.removeItem("studentName");
          window.localStorage.removeItem("sessionToken");
        }
        break;
      case "state":
        setState(message.state);
        setServerTimeOffsetMs((previous) => {
          const instantOffset = message.serverNowMs - Date.now();
          return previous * 0.8 + instantOffset * 0.2;
        });
        break;
      case "clock_pong": {
        const clientReceivedAtMs = Date.now();
        const roundTripMs = clientReceivedAtMs - message.clientSentAtMs;
        const estimatedServerAtClientReceive =
          message.serverSentAtMs + roundTripMs / 2;
        const offset = estimatedServerAtClientReceive - clientReceivedAtMs;
        const samples = [...clockSamplesRef.current, { rtt: roundTripMs, offset }]
          .sort((a, b) => a.rtt - b.rtt)
          .slice(0, 5);
        clockSamplesRef.current = samples;
        setServerTimeOffsetMs(samples[0]?.offset ?? offset);
        break;
      }
      case "performance_start":
        setState((current) =>
          current
            ? {
                ...current,
                performanceStartAtServerMs: message.startAtServerMs,
                currentScoreId: message.scoreId,
                performanceStatus: "countdown"
              }
            : current
        );
        setLatestJudgement(undefined);
        setGroupNotes([]);
        break;
      case "group_play_note":
        setGroupNotes((current) =>
          [
            ...current,
            {
              ...message,
              receivedAt: Date.now(),
              key: `${message.partId}:${message.noteId}:${message.playAtServerMs}`
            }
          ].slice(-80)
        );
        break;
      case "group_stop_note":
        setGroupStops((current) => [...current, message.eventId].slice(-80));
        break;
      case "note_judgement":
        setLatestJudgement(message.judgement);
        break;
      case "score_update":
        setState((current) =>
          current
            ? {
                ...current,
                groupScores: message.groupScores,
                globalScore: message.globalScore
              }
            : current
        );
        break;
      case "error":
        if (message.message === RESET_SENTINEL) {
          window.localStorage.removeItem("studentName");
          window.localStorage.removeItem("sessionToken");
          manualCloseRef.current = true;
          lastEntryRef.current = undefined;
          wsRef.current?.close();
          setRole(undefined);
          setState(undefined);
          setError(undefined);
          setConnectionId(undefined);
          setStatus("idle");
        } else {
          setError(message.message);
        }
        break;
    }
  }, []);

  const connect = useCallback(
    (entry: string) => {
      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }

      manualCloseRef.current = false;
      lastEntryRef.current = trimmed;
      setStatus("connecting");
      setError(undefined);

      if (wsRef.current) {
        wsRef.current.close();
      }

      const socket = new WebSocket(websocketUrl());
      wsRef.current = socket;

      socket.addEventListener("open", () => {
        setStatus("connected");
        socket.send(
          JSON.stringify({
            type: "hello",
            role: "student",
            name: trimmed,
            sessionToken: window.localStorage.getItem("sessionToken") ?? undefined
          } satisfies ClientMessage)
        );
        startClock();
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        handleServerMessage(message);
      });

      socket.addEventListener("close", () => {
        stopClock();
        setStatus("disconnected");
        if (!manualCloseRef.current && lastEntryRef.current) {
          reconnectTimerRef.current = window.setTimeout(() => {
            connect(lastEntryRef.current!);
          }, 900);
        }
      });

      socket.addEventListener("error", () => {
        setError("Connexion temps réel interrompue.");
      });
    },
    [handleServerMessage, startClock, stopClock]
  );

  useEffect(() => {
    return () => {
      manualCloseRef.current = true;
      stopClock();
      if (reconnectTimerRef.current !== undefined) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [stopClock]);

  return {
    status,
    role,
    state,
    connectionId,
    error,
    serverTimeOffsetMs,
    groupNotes,
    groupStops,
    latestJudgement,
    connect,
    send
  };
}
