import { useMemo, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { LandingPage } from "./pages/LandingPage";
import { StudentPage } from "./pages/StudentPage";
import { AudioEngine } from "./audio/AudioEngine";
import { useRealtime } from "./realtime/useRealtime";

export function App() {
  const realtime = useRealtime();
  const audioEngine = useMemo(() => new AudioEngine(), []);
  const [audioReady, setAudioReady] = useState(false);

  const unlockAudio = async () => {
    await audioEngine.unlock();
    setAudioReady(true);
  };

  if (!realtime.role || !realtime.state) {
    return (
      <LandingPage
        status={realtime.status}
        error={realtime.error}
        onEnter={async (entry) => {
          try {
            await unlockAudio();
          } catch {
            setAudioReady(false);
          }
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
      audioEngine={audioEngine}
      audioReady={audioReady}
      onUnlockAudio={unlockAudio}
      groupNotes={realtime.groupNotes}
      latestJudgement={realtime.latestJudgement}
    />
  );
}
