import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { LandingPage } from "./pages/LandingPage";
import { StudentPage } from "./pages/StudentPage";
import { AudioEngine } from "./audio/AudioEngine";
import { ORCHESTRA_PRESET_KEYS } from "./audio/instrumentPresets";
import { useRealtime } from "./realtime/useRealtime";

export function App() {
  const realtime = useRealtime();
  const audioEngine = useMemo(() => new AudioEngine(), []);
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    if (realtime.role !== "admin" || !audioReady) return;
    void audioEngine.preloadPreset("piano").catch(() => undefined);
  }, [audioEngine, audioReady, realtime.role]);

  useEffect(() => {
    if (realtime.role !== "admin" || !audioReady) return;
    const phase = realtime.state?.phase;
    if (
      phase === "phase6_orchestra_groups" ||
      phase === "phase7_orchestra_practice" ||
      phase === "phase8_orchestra_performance"
    ) {
      for (const key of ORCHESTRA_PRESET_KEYS) {
        void audioEngine.preloadPreset(key).catch(() => undefined);
      }
    }
  }, [audioEngine, audioReady, realtime.role, realtime.state?.phase]);

  if (!realtime.role || !realtime.state) {
    return (
      <LandingPage
        status={realtime.status}
        error={realtime.error}
        onEnter={(entry) => {
          realtime.connect(entry);
        }}
      />
    );
  }

  if (realtime.role === "admin") {
    return (
      <AdminPage
        state={realtime.state}
        status={realtime.status}
        error={realtime.error}
        send={realtime.send}
        audioEngine={audioEngine}
        audioReady={audioReady}
        serverTimeOffsetMs={realtime.serverTimeOffsetMs}
        groupNotes={realtime.groupNotes}
        groupStops={realtime.groupStops}
        onUnlockAudio={async () => {
          await audioEngine.unlock();
          setAudioReady(true);
        }}
      />
    );
  }

  return (
    <StudentPage
      state={realtime.state}
      status={realtime.status}
      error={realtime.error}
      connectionId={realtime.connectionId}
      serverTimeOffsetMs={realtime.serverTimeOffsetMs}
      send={realtime.send}
    />
  );
}
