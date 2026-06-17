import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function Sidebar() {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const topics = useQuery({ queryKey: ["topics"], queryFn: api.listTopics });

  const add = useMutation({
    mutationFn: (n: string) => api.createTopic(n),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTopic(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topics"] }),
  });

  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <span className="dot" />
        <h1>gatherer</h1>
      </NavLink>

      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate(name.trim());
        }}
      >
        <input
          type="text"
          placeholder="add topic…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary" type="submit" disabled={add.isPending}>
          +
        </button>
      </form>

      {topics.isLoading && <p className="muted">Loading…</p>}
      {topics.error && <p className="muted">Failed to load topics.</p>}
      {topics.data?.length === 0 && <p className="muted">No topics yet.</p>}

      <nav>
        {topics.data?.map((t) => (
          <NavLink
            key={t.id}
            to={`/topics/${t.id}`}
            className={({ isActive }) => `topic-link ${isActive ? "active" : ""}`}
          >
            <span className="name">{t.name}</span>
            <span className="topic-actions">
              {t.unread_count > 0 && <span className="badge unread">{t.unread_count}</span>}
              <span
                role="button"
                title="Remove topic"
                className="icon-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Remove topic "${t.name}"?`)) remove.mutate(t.id);
                }}
              >
                ✕
              </span>
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
