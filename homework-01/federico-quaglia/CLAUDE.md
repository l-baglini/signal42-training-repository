# k8s-sched-analyzer — AI Agent Context

## What this tool does

`analyzer.py` is a single-file, read-only Kubernetes pod scheduling analyzer. It:

1. Fetches cluster state via `kubectl get` (nodes, pods, replicasets — all read-only).
2. Diagnoses why each pending pod is unschedulable (nodeSelector mismatch, intolerable taints, insufficient CPU/memory, or combinations).
3. Suggests concrete single-pod moves of the form "evict pod C from node A → node B, which frees enough resources for pending pod P to land on A." Every suggestion is validated: after the simulated eviction, both C and P must fit on their respective target nodes (selector + taints + resources).
4. Prints a structured terminal report: cluster overview table, per-pod diagnosis, and an ordered rebalancing plan with the exact `kubectl delete pod` command the operator should run manually.

Entry point: `main()` at the bottom of `analyzer.py`. No package installation needed.

## Key constraints — do not violate these

### Pod ownership scope
- **Analyzed (pending):** only pods owned by `Deployment` or `Job` (`MOVEABLE_KINDS` set, line 346).
- **Move candidates (running):** same — only `Deployment`/`Job` pods, because their controllers automatically reschedule them.
- **Ignored entirely:** `StatefulSet` and `DaemonSet` pods (`IGNORED_KINDS` set, line 347). StatefulSets have stable identities and PVCs; DaemonSets run exactly once per node. Moving either is unsafe.
- All pod types (including StatefulSet/DaemonSet) still count toward node resource accounting — they consume capacity even though they are never moved.

### nodeSelector
`selector_ok()` (line 194) requires every key/value in a pod's `nodeSelector` to match the destination node's labels. A move is only proposed when both the displaced pod AND the pending pod satisfy this predicate on their respective target nodes.

### Taints and tolerations
`taints_ok()` (line 198) enforces `NoSchedule` and `NoExecute` taints as hard constraints. `PreferNoSchedule` is advisory — `pod_tolerates()` returns `True` for it unconditionally (line 189). A move is only proposed when both pods tolerate all hard taints on their target nodes.

### Resource accounting
Uses declared `requests`, not `limits`. Init containers are handled with the correct Kubernetes formula: `effective = max(sum_of_regular_containers, max_of_each_init_container)` — see `pod_effective_requests()` (line 71). Pods in `Failed`, `Succeeded`, or `Unknown` phase do not consume resources.

### Kubernetes compatibility
Uses only `kubectl get` with `-o json`. No server-side apply, no admission webhooks, no metrics API. Compatible with Kubernetes 1.13+ clusters.

### No external Python dependencies
stdlib only: `argparse`, `json`, `subprocess`, `sys`, `dataclasses`, `typing`. The `requirements.txt` is intentionally empty. Do not add third-party imports.

### `--dry-run` is always read-only
`--dry-run` defaults to `True` and is currently the only mode. The tool never calls `kubectl delete`, `kubectl patch`, or any mutating verb. The suggested `kubectl delete pod` commands are printed as human-readable instructions only.

## File structure

```
analyzer.py        # Single-file implementation — all logic here
README.md          # User-facing documentation
requirements.txt   # Intentionally empty (no external deps)
CLAUDE.md          # This file
```

### Internal layout of `analyzer.py`

| Section | Lines | Purpose |
|---|---|---|
| Resource utilities | 23–68 | Parse/format CPU (millicores) and memory (bytes) |
| Data structures | 102–168 | `Taint`, `Toleration`, `PodInfo`, `NodeInfo`, `Move` dataclasses |
| Scheduling predicates | 174–211 | `selector_ok`, `taints_ok`, `resources_ok`, `can_schedule` |
| kubectl interface | 218–339 | `load_nodes`, `load_rs_owners`, `load_pods` |
| Analysis | 346–476 | `diagnose`, `find_moves` |
| Report | 483–629 | `print_report` (terminal output) |
| Entry point | 636–712 | `main()` — arg parsing and orchestration |

## Scheduling predicate logic

```
can_schedule(pod, node) = selector_ok AND taints_ok AND resources_ok
```

Move validity requires:
1. `selector_ok(pending, src) AND taints_ok(pending, src)` — src is a candidate for pending.
2. `NOT resources_ok(pending, src)` — pending doesn't fit yet (otherwise it would already be scheduled).
3. After simulating eviction of candidate C: `resources_ok(pending, src, +C.cpu, +C.mem)`.
4. `can_schedule(C, dst)` — C fits on its proposed destination.

## Known limitations (do not silently remove from README)

- No `PodAffinity` / `PodAntiAffinity` modelling.
- No `TopologySpreadConstraints`.
- No `PriorityClass` preemption simulation.
- Only single-move fixes — multi-move chains are not computed.
- Resource accounting based on declared requests; actual usage may differ.

## Future work — `--execute` flag

The natural next step is an `--execute` flag (or `--no-dry-run`) that performs the suggested moves automatically. Implementation notes:

- The flag must be **explicitly opt-in** — default must remain read-only. `--dry-run` should stay `True` by default; `--execute` (or `--dry-run=false`) would flip it.
- Execution order matters: moves must be applied sequentially in the order printed. After each eviction, re-verify that the destination still has capacity (another pod may have landed there in the interim) before proceeding.
- Each move is implemented by `kubectl delete pod <name> -n <namespace>`. The owning controller (Deployment/Job) reschedules the pod. No direct node assignment is needed.
- After each deletion, poll until the displaced pod is `Running` on the new node (or surfaces a scheduling error) before moving to the next step. A timeout and retry budget are needed.
- The execute path should validate `can_schedule(candidate, dst)` against a **fresh** cluster snapshot immediately before each deletion, not against the snapshot taken at startup.
- Failures mid-run (pod deleted but can't reschedule) should surface a clear error and halt further moves rather than continuing blindly.
- Dry-run output should clearly distinguish "would execute" from "would suggest" when `--execute` is passed alongside `--dry-run` (e.g. for testing the flag parsing without side effects).
