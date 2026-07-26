import { useEffect } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { useSettingsStore } from "./stores/useSettingsStore";

function App() {
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return <AppLayout />;
}

export default App;
