# k8s-sched-analyzer

A read-only Kubernetes Pod Scheduling Analyzer CLI.  
It fetches cluster state via `kubectl`, diagnoses why pods are stuck in `Pending`,
and proposes concrete pod moves to unblock them — without touching the cluster.

> **Built entirely with [Claude Code](https://claude.ai/code) (Anthropic AI).**

---

## What it does

1. **Collects cluster state** (read-only `kubectl get` calls):
   - All nodes: allocatable CPU/memory, labels, taints
   - All running pods per node: resource requests, owner, tolerations
   - All pending pods: requests, nodeSelector, tolerations, scheduler message

2. **Diagnoses each pending pod**, identifying:
   - No node matching `nodeSelector`
   - Node taints not tolerated by the pod
   - Insufficient CPU, memory, or both on all eligible nodes
   - Combinations of the above

3. **Suggests concrete moves**: "Move pod X from node A → node B, freeing enough
   resources for pending pod Y to schedule on A."  
   Every suggestion is validated — after the simulated move, both the displaced pod
   AND the pending pod must fit on their respective nodes (selector, taints, resources).

4. **Prints a structured terminal report**:
   - Summary: nodes / running pods / pending pods
   - Node resource table (allocatable vs. free)
   - Per pending pod: diagnosis + suggested fix
   - Final ordered rebalancing plan with the exact `kubectl delete pod` command to trigger rescheduling

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Python | 3.6+ |
| kubectl | any (1.13+ cluster API) |
| External Python packages | **none** (stdlib only) |

`kubectl` must be in `PATH` and configured to reach the target cluster.

---

## Usage

```bash
# Analyze all namespaces (default)
python analyzer.py

# Analyze a specific namespace
python analyzer.py --namespace my-app

# Use a custom kubeconfig
python analyzer.py --kubeconfig ~/.kube/staging.yaml

# Combine flags
python analyzer.py --namespace production --kubeconfig ~/.kube/prod.yaml
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--namespace` / `-n` | `all` | Kubernetes namespace to inspect |
| `--kubeconfig` | system default | Path to a kubeconfig file |
| `--dry-run` | `True` | Read-only mode (always true — the tool never modifies the cluster) |

---

## Example output

```
[k8s-sched-analyzer] Fetching cluster state (all namespaces)...

================================================================
  Kubernetes Pod Scheduling Analyzer  [DRY RUN — read-only, no cluster changes]
================================================================

  Nodes: 3   Running pods: 18   Pending: 2

  Node Resources:
  NODE                           ALLOC CPU   FREE CPU  ALLOC MEM  FREE MEM  PODS
  ------------------------------ ---------- ---------- ---------- ----------  ----
  node-1                          8.00 cores  1.50 cores      32.0Gi      8.2Gi  9 pods (81% cpu / 74% mem)
  node-2                          4.00 cores  0.20 cores      16.0Gi      1.4Gi  6 pods (95% cpu / 91% mem)
  node-3                          4.00 cores  3.80 cores      16.0Gi     14.1Gi  3 pods (5% cpu / 12% mem)

================================================================
  Pending Pod Analysis  (2 pod(s))
================================================================

  [1/2]  production/api-server-7d9f4b-xkp2q
    Owner:    Deployment/api-server
    Requests: CPU 2.00 cores, Memory 4.0Gi
    K8s message:  0/3 nodes are available: 2 Insufficient cpu, 1 node(s) had taint...
    Diagnosis:
      All 2 eligible node(s) have insufficient resources:
        node-1: CPU: 1.50 cores free, 2.00 cores needed
        node-2: CPU: 200m free, 2.00 cores needed; Mem: 1.4Gi free, 4.0Gi needed
    Suggested fix (top 1):
      Move production/batch-worker-6f8c9d-mnb7r  (Deployment)
           node-1  →  node-3
           Frees 2.50 cores CPU + 6.0Gi mem on node-1

  [2/2]  staging/worker-5c7b9f-lkj3m
    Owner:    Job/data-import
    Requests: CPU 500m, Memory 1.0Gi
    Diagnosis:
      All 2 eligible node(s) have insufficient resources:
        node-1: Mem: 8.2Gi free, 1.0Gi needed  ← fits actually
        node-2: CPU: 200m free, 500m needed; Mem: 1.4Gi free, 1.0Gi needed
    ...

================================================================
  Rebalancing Plan
================================================================

  1 move(s) suggested — execute in order shown:

  1. Move production/batch-worker-6f8c9d-mnb7r  (Deployment)
     From:  node-1
     To:    node-3
     Frees: 2.50 cores CPU, 6.0Gi memory on node-1
     Helps: production/api-server-7d9f4b-xkp2q

     The Deployment controller will reschedule the pod; deleting triggers it:
       kubectl delete pod batch-worker-6f8c9d-mnb7r -n production
     Verify Deployment spec allows scheduling on node-3 before running.
```

---

## Constraints respected

### Pod ownership filter
Only pods owned by **Deployments** or **Jobs** are considered:
- For analysis: only Deployment/Job pending pods are diagnosed
- For move suggestions: only Deployment/Job running pods are candidates for displacement
  (because their controllers will automatically reschedule them elsewhere)
- **StatefulSets** and **DaemonSets** are ignored entirely — StatefulSet pods have
  stable network identities and storage that make arbitrary moves unsafe; DaemonSet
  pods run exactly once per node by design

### `nodeSelector`
When suggesting a move, the tool only proposes destination nodes whose labels
satisfy the displaced pod's `nodeSelector`. If a Deployment pod has
`nodeSelector: {disktype: ssd}`, it will only be moved to nodes labelled `disktype=ssd`.

### Taints and tolerations
Only destination nodes whose taints are all tolerated by the pod are considered.
`PreferNoSchedule` taints are treated as advisory (non-blocking). `NoSchedule` and
`NoExecute` taints are treated as hard constraints.

### Resource requests
Resource accounting uses the pod's declared `requests` (not `limits`). Init
containers are handled correctly: the effective request is
`max(sum_of_regular_containers, max_of_each_init_container)`, matching the
Kubernetes scheduler's own calculation.

### Read-only
The tool never modifies the cluster. All `kubectl` invocations are read-only
(`kubectl get`). The suggested `kubectl delete pod` commands in the report are
printed for the operator to run manually after verifying.

---

## How the move suggestion works

For each pending pod `P`:
1. Identify nodes where `P` passes `nodeSelector` + taints but lacks resources.
2. For each such node `src`, iterate over its pods owned by Deployment/Job.
3. For each candidate pod `C`:
   - Simulate evicting `C` from `src` — would `P` now fit on `src`?
   - Find a destination node `dst` where `C` passes `nodeSelector` + taints +
     current resource availability.
   - If both conditions hold, emit a `Move(C, src → dst)` suggestion.

Moves are validated independently. If multiple moves share a destination node,
verify remaining capacity step-by-step before executing.

---

## Limitations

- Does not model `PodAffinity` / `PodAntiAffinity` rules.
- Does not model `TopologySpreadConstraints`.
- Does not consider `PriorityClass` preemption.
- Resource accounting is based on declared `requests`; actual usage may differ.
- Multi-move chains (move A then B to help C) are not computed — only single-move
  fixes are suggested.
