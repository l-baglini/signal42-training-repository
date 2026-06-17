import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function TopicDetail() {
  const { topicId } = useParams();
  const qc = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);

  const topics = useQuery({ queryKey: ["topics"], queryFn: api.listTopics });
  const topic = topics.data?.find((t) => t.id === topicId);

  const findings = useQuery({
    queryKey: ["findings", topicId],
    queryFn: () => api.listFindings(topicId!),
    enabled: !!topicId,
  });

  // Poll the run while it's in progress; refresh findings when it ends.
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && ["ok", "partial", "failed"].includes(s) ? false : 2000;
    },
  });
  const runDone = !!run.data && ["ok", "partial", "failed"].includes(run.data.status);
  const runActive = !!runId && !runDone;

  useEffect(() => {
    if (runId && runDone) {
      qc.invalidateQueries({ queryKey: ["findings", topicId] });
      qc.invalidateQueries({ queryKey: ["topics"] });
      setRunId(null);
    }
  }, [runId, runDone, qc, topicId]);

  const trigger = useMutation({
    mutationFn: () => api.runTopic(topicId!),
    onSuccess: (r) => setRunId(r.run_id),
  });

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h2 className="page-title">{topic?.name ?? "Topic"}</h2>
        <button
          className="primary"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending || runActive}
        >
          {runActive || trigger.isPending ? (
            <>
              <span className="spinner" /> Running…
            </>
          ) : (
            "Run now"
          )}
        </button>
      </div>

      {runActive && (
        <p className="muted">Gathering sources and writing digests — this can take a minute.</p>
      )}

      {findings.isLoading && (
        <p className="muted">
          <span className="spinner" /> Loading findings…
        </p>
      )}
      {findings.data?.length === 0 && !runActive && (
        <div className="empty">
          <p>No findings yet.</p>
          <p className="muted">Press “Run now” to gather digests for this topic.</p>
        </div>
      )}

      {findings.data?.map((f, i) => (
        <Link key={f.id} to={`/findings/${f.id}`} style={{ color: "inherit" }}>
          <div
            className={`card ${f.is_read ? "" : "unread"}`}
            style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
          >
            <div className="between">
              <h3 className="card-title">{f.title}</h3>
              <div className="row">
                {f.status === "updated" && <span className="badge updated">updated</span>}
                {!f.is_read && <span className="badge unread">unread</span>}
              </div>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {f.latest_digest_at
                ? new Date(f.latest_digest_at).toLocaleString()
                : "no digest yet"}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
