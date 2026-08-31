import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";

function Section({ title, body, delay = 0 }: { title: string; body: string; delay?: number }) {
  return (
    <div className="section" style={{ animationDelay: `${delay}ms` }}>
      <h3>{title}</h3>
      <div className="prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body || "_(empty)_"}</ReactMarkdown>
      </div>
    </div>
  );
}

export function DigestView() {
  const { findingId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const finding = useQuery({
    queryKey: ["finding", findingId],
    queryFn: () => api.getFinding(findingId!),
    enabled: !!findingId,
  });

  const setRead = useMutation({
    mutationFn: (is_read: boolean) => api.setRead(findingId!, is_read),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finding", findingId] });
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  // Auto-mark as read when opened (if currently unread).
  useEffect(() => {
    if (finding.data && !finding.data.is_read) {
      setRead.mutate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding.data?.id]);

  if (finding.isLoading)
    return (
      <p className="muted">
        <span className="spinner" /> Loading…
      </p>
    );
  if (finding.error || !finding.data) return <div className="empty">Not found.</div>;

  const d = finding.data;

  return (
    <div>
      <a
        href="#"
        className="back-link muted"
        onClick={(e) => {
          e.preventDefault();
          navigate(-1);
        }}
      >
        ← back
      </a>

      <div className="digest-header">
        <div className="between">
          <h2>{d.title}</h2>
          <button onClick={() => setRead.mutate(!d.is_read)}>
            Mark {d.is_read ? "unread" : "read"}
          </button>
        </div>
        {d.digest && (
          <div className="row muted">
            {d.status === "updated" && <span className="badge updated">updated</span>}
            <span>
              {d.digest.model} · {new Date(d.digest.created_at).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {!d.digest && <div className="empty">No digest content available.</div>}

      {d.digest && (
        <>
          <Section title="What changed" body={d.digest.what_changed} delay={40} />
          <Section title="Why it matters" body={d.digest.why_it_matters} delay={100} />
          <Section title="Technical details" body={d.digest.technical_details} delay={160} />

          {d.images.length > 0 && (
            <div className="section">
              <h3>Images</h3>
              <div className="images">
                {d.images.map((img) => (
                  <figure key={img.url}>
                    <img className="digest-image" src={img.url} alt={img.attribution ?? ""} />
                    <figcaption className="muted">
                      {img.attribution}{" "}
                      <a href={img.origin_url} target="_blank" rel="noreferrer">
                        source
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          <div className="section">
            <h3>Sources</h3>
            <ol className="sources-list">
              {d.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title || s.url}
                  </a>
                  {s.published_at && (
                    <span className="muted"> · {new Date(s.published_at).toLocaleDateString()}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
