import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopicDetail } from "./components/TopicDetail";
import { DigestView } from "./components/DigestView";

function Home() {
  return (
    <div className="empty">
      <p>Select a topic on the left, or add one to start tracking it.</p>
      <p className="muted">
        Each topic is searched on a schedule; new developments become cited digests.
      </p>
    </div>
  );
}

export function App() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/topics/:topicId" element={<TopicDetail />} />
          <Route path="/findings/:findingId" element={<DigestView />} />
        </Routes>
      </main>
    </div>
  );
}
