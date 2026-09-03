#!/usr/bin/env python3
"""
k8s-sched-analyzer: Kubernetes Pod Scheduling Analyzer

Analyzes pending Kubernetes pods, diagnoses scheduling failures,
and suggests concrete pod moves to resolve them.

Read-only: uses kubectl get (no cluster modifications).
"""

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Resource utilities
# ---------------------------------------------------------------------------

def parse_cpu(s: str) -> int:
    """Parse Kubernetes CPU string to millicores."""
    s = str(s or "0").strip()
    if s.endswith("m"):
        return int(s[:-1])
    if s.endswith("n"):  # nanocores (rare)
        return max(1, int(s[:-1]) // 1_000_000)
    try:
        return int(float(s) * 1000)
    except ValueError:
        return 0


def parse_mem(s: str) -> int:
    """Parse Kubernetes memory string to bytes."""
    s = str(s or "0").strip()
    for suffix, mult in [
        ("Ki", 1024),
        ("Mi", 1024 ** 2),
        ("Gi", 1024 ** 3),
        ("Ti", 1024 ** 4),
        ("K", 1000),
        ("M", 1000 ** 2),
        ("G", 1000 ** 3),
        ("T", 1000 ** 4),
    ]:
        if s.endswith(suffix):
            try:
                return int(s[: -len(suffix)]) * mult
            except ValueError:
                return 0
    try:
        return int(s)
    except ValueError:
        return 0


def fmt_cpu(m: int) -> str:
    return f"{m / 1000:.2f} cores" if m >= 1000 else f"{m}m"


def fmt_mem(b: int) -> str:
    for unit, d in [("Gi", 1024 ** 3), ("Mi", 1024 ** 2), ("Ki", 1024)]:
        if b >= d:
            return f"{b / d:.1f}{unit}"
    return f"{b}B"


def pod_effective_requests(spec: dict) -> Tuple[int, int]:
    """
    Compute effective CPU and memory requests for scheduling.
    K8s rule: effective = max(sum_of_regular_containers, max_of_each_init_container).
    """
    reg_cpu = sum(
        parse_cpu(c.get("resources", {}).get("requests", {}).get("cpu", "0"))
        for c in spec.get("containers", [])
    )
    reg_mem = sum(
        parse_mem(c.get("resources", {}).get("requests", {}).get("memory", "0"))
        for c in spec.get("containers", [])
    )
    inits = spec.get("initContainers", [])
    if inits:
        init_cpu = max(
            parse_cpu(c.get("resources", {}).get("requests", {}).get("cpu", "0"))
            for c in inits
        )
        init_mem = max(
            parse_mem(c.get("resources", {}).get("requests", {}).get("memory", "0"))
            for c in inits
        )
        return max(reg_cpu, init_cpu), max(reg_mem, init_mem)
    return reg_cpu, reg_mem


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Taint:
    key: str
    value: str
    effect: str  # NoSchedule | PreferNoSchedule | NoExecute


@dataclass
class Toleration:
    key: str
    operator: str  # Equal | Exists
    value: str
    effect: str    # NoSchedule | NoExecute | PreferNoSchedule | "" (any)


@dataclass
class PodInfo:
    name: str
    namespace: str
    node: Optional[str]
    req_cpu: int          # millicores
    req_mem: int          # bytes
    node_selector: Dict[str, str]
    tolerations: List[Toleration]
    owner_kind: str       # Deployment | Job | StatefulSet | DaemonSet | ...
    owner_name: str
    phase: str
    schedule_msg: str = ""

    @property
    def full_name(self) -> str:
        return f"{self.namespace}/{self.name}"


@dataclass
class NodeInfo:
    name: str
    alloc_cpu: int
    alloc_mem: int
    labels: Dict[str, str]
    taints: List[Taint]
    pods: List[PodInfo] = field(default_factory=list)

    @property
    def used_cpu(self) -> int:
        return sum(p.req_cpu for p in self.pods)

    @property
    def used_mem(self) -> int:
        return sum(p.req_mem for p in self.pods)

    @property
    def free_cpu(self) -> int:
        return self.alloc_cpu - self.used_cpu

    @property
    def free_mem(self) -> int:
        return self.alloc_mem - self.used_mem


@dataclass
class Move:
    pod: PodInfo
    from_node: str
    to_node: str
    helps: str  # full_name of the pending pod this move unblocks


# ---------------------------------------------------------------------------
# Scheduling predicates
# ---------------------------------------------------------------------------

def _tol_matches(tol: Toleration, taint: Taint) -> bool:
    """Return True if a single toleration covers a taint."""
    # Effect must match, or toleration effect empty = covers any effect
    if tol.effect and tol.effect != taint.effect:
        return False
    if tol.operator == "Exists":
        # Empty key with Exists = match all keys
        return (not tol.key) or tol.key == taint.key
    # Equal: key and value must both match
    return tol.key == taint.key and tol.value == taint.value


def pod_tolerates(pod: PodInfo, taint: Taint) -> bool:
    """Return True if the pod tolerates this taint (hard constraints only)."""
    # PreferNoSchedule is advisory; never blocks scheduling
    if taint.effect == "PreferNoSchedule":
        return True
    return any(_tol_matches(t, taint) for t in pod.tolerations)


def selector_ok(pod: PodInfo, node: NodeInfo) -> bool:
    return all(node.labels.get(k) == v for k, v in pod.node_selector.items())


def taints_ok(pod: PodInfo, node: NodeInfo) -> bool:
    return all(pod_tolerates(pod, t) for t in node.taints)


def resources_ok(pod: PodInfo, node: NodeInfo,
                 extra_cpu: int = 0, extra_mem: int = 0) -> bool:
    return (
        node.free_cpu + extra_cpu >= pod.req_cpu
        and node.free_mem + extra_mem >= pod.req_mem
    )


def can_schedule(pod: PodInfo, node: NodeInfo) -> bool:
    return selector_ok(pod, node) and taints_ok(pod, node) and resources_ok(pod, node)


# ---------------------------------------------------------------------------
# kubectl interface
# ---------------------------------------------------------------------------

def _kubectl(args: List[str], kubeconfig: Optional[str],
             fatal: bool = True) -> Optional[dict]:
    cmd = ["kubectl"]
    if kubeconfig:
        cmd += ["--kubeconfig", kubeconfig]
    cmd += args + ["-o", "json"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        print("Error: kubectl not found in PATH.", file=sys.stderr)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"Error: kubectl timed out ({' '.join(cmd)})", file=sys.stderr)
        sys.exit(1)
    if r.returncode != 0:
        if fatal:
            print(f"kubectl error:\n{r.stderr.strip()}", file=sys.stderr)
            sys.exit(1)
        return None
    return json.loads(r.stdout)


def _ns_flags(namespace: str) -> List[str]:
    return ["--all-namespaces"] if namespace == "all" else ["-n", namespace]


def load_nodes(kc: Optional[str]) -> Dict[str, NodeInfo]:
    data = _kubectl(["get", "nodes"], kc)
    nodes: Dict[str, NodeInfo] = {}
    for item in data.get("items", []):
        name = item["metadata"]["name"]
        alloc = item["status"].get("allocatable", {})
        taints = [
            Taint(t.get("key", ""), t.get("value", ""), t.get("effect", ""))
            for t in item["spec"].get("taints", [])
        ]
        nodes[name] = NodeInfo(
            name=name,
            alloc_cpu=parse_cpu(alloc.get("cpu", "0")),
            alloc_mem=parse_mem(alloc.get("memory", "0")),
            labels=item["metadata"].get("labels", {}),
            taints=taints,
        )
    return nodes


def load_rs_owners(
    namespace: str, kc: Optional[str]
) -> Dict[Tuple[str, str], Tuple[str, str]]:
    """Map (namespace, rs_name) → (owner_kind, owner_name) for Deployment-owned RSes."""
    data = _kubectl(["get", "replicasets"] + _ns_flags(namespace), kc, fatal=False)
    if not data:
        return {}
    mapping: Dict[Tuple[str, str], Tuple[str, str]] = {}
    for item in data.get("items", []):
        ns = item["metadata"]["namespace"]
        rs = item["metadata"]["name"]
        for ref in item["metadata"].get("ownerReferences", []):
            if ref.get("kind") == "Deployment":
                mapping[(ns, rs)] = ("Deployment", ref["name"])
                break
    return mapping


def load_pods(
    namespace: str,
    kc: Optional[str],
    rs_owners: Dict[Tuple[str, str], Tuple[str, str]],
) -> List[PodInfo]:
    data = _kubectl(["get", "pods"] + _ns_flags(namespace), kc)
    pods: List[PodInfo] = []
    for item in data.get("items", []):
        meta = item["metadata"]
        spec = item["spec"]
        status = item["status"]

        owner_kind, owner_name = "", ""
        for ref in meta.get("ownerReferences", []):
            owner_kind = ref.get("kind", "")
            owner_name = ref.get("name", "")
            break

        # Resolve ReplicaSet → Deployment (one hop up the ownership chain)
        if owner_kind == "ReplicaSet":
            key = (meta.get("namespace", ""), owner_name)
            if key in rs_owners:
                owner_kind, owner_name = rs_owners[key]

        req_cpu, req_mem = pod_effective_requests(spec)

        tolerations = [
            Toleration(
                t.get("key", ""),
                t.get("operator", "Equal"),
                t.get("value", ""),
                t.get("effect", ""),
            )
            for t in spec.get("tolerations", [])
        ]

        sched_msg = ""
        for cond in status.get("conditions", []):
            if cond.get("type") == "PodScheduled" and cond.get("status") == "False":
                sched_msg = cond.get("message", "")
                break

        pods.append(
            PodInfo(
                name=meta["name"],
                namespace=meta.get("namespace", ""),
                node=spec.get("nodeName") or None,
                req_cpu=req_cpu,
                req_mem=req_mem,
                node_selector=spec.get("nodeSelector", {}),
                tolerations=tolerations,
                owner_kind=owner_kind,
                owner_name=owner_name,
                phase=status.get("phase", "Unknown"),
                schedule_msg=sched_msg,
            )
        )
    return pods


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

MOVEABLE_KINDS = {"Deployment", "Job"}
IGNORED_KINDS = {"StatefulSet", "DaemonSet"}


def diagnose(
    pod: PodInfo, nodes: Dict[str, NodeInfo]
) -> Tuple[List[str], List[NodeInfo]]:
    """
    Diagnose why `pod` is pending.

    Returns:
        reasons: human-readable list of failure reasons
        eligible: nodes that pass selector+taints but lack resources (move candidates)
    """
    sel_nodes: List[NodeInfo] = []
    taint_nodes: List[NodeInfo] = []
    eligible: List[NodeInfo] = []
    node_resource_lines: List[str] = []

    for node in nodes.values():
        s = selector_ok(pod, node)
        t = taints_ok(pod, node)
        c = node.free_cpu >= pod.req_cpu
        m = node.free_mem >= pod.req_mem

        if s:
            sel_nodes.append(node)
        if s and t:
            taint_nodes.append(node)
            if c and m:
                pass  # would be schedulable
            else:
                eligible.append(node)
                gaps: List[str] = []
                if not c:
                    gaps.append(
                        f"CPU: {fmt_cpu(node.free_cpu)} free, {fmt_cpu(pod.req_cpu)} needed"
                    )
                if not m:
                    gaps.append(
                        f"Mem: {fmt_mem(node.free_mem)} free, {fmt_mem(pod.req_mem)} needed"
                    )
                node_resource_lines.append(f"    {node.name}: {'; '.join(gaps)}")

    reasons: List[str] = []

    if not sel_nodes:
        if pod.node_selector:
            reasons.append(f"No node matches nodeSelector {pod.node_selector}")
        else:
            reasons.append("No schedulable nodes found in cluster")
    elif not taint_nodes:
        # Collect the unique intolerable taints across selector-matching nodes
        bad: List[str] = []
        for node in sel_nodes:
            for taint in node.taints:
                if not pod_tolerates(pod, taint) and taint.effect != "PreferNoSchedule":
                    entry = f"{taint.key}={taint.value}:{taint.effect}"
                    if entry not in bad:
                        bad.append(entry)
        reasons.append(
            f"All {len(sel_nodes)} nodeSelector-matching node(s) have intolerable taints"
        )
        if bad:
            reasons.append(f"  Intolerable taints: {', '.join(bad[:5])}")
    elif not eligible and not taint_nodes:
        reasons.append("No schedulable nodes (unknown reason)")
    elif node_resource_lines:
        reasons.append(
            f"All {len(taint_nodes)} eligible node(s) have insufficient resources:"
        )
        reasons.extend(node_resource_lines)
    else:
        # Eligible nodes found — transient state
        names = ", ".join(n.name for n in taint_nodes if can_schedule(pod, n))
        reasons.append(f"Schedulable nodes exist ({names}) — may be a transient state")

    return reasons, eligible


def find_moves(pending: PodInfo, nodes: Dict[str, NodeInfo]) -> List[Move]:
    """
    Find valid moves of Deployment/Job pods that would unblock `pending`.

    A move (candidate → dst) is valid when:
      1. candidate is owned by a Deployment or Job
      2. After evicting candidate from src, `pending` fits on src (selector+taints+resources)
      3. candidate fits on dst (selector+taints+current resources)
    """
    moves: List[Move] = []
    seen: set = set()

    for src in nodes.values():
        # src must be a node where pending passes selector+taints
        if not selector_ok(pending, src) or not taints_ok(pending, src):
            continue
        # src must currently lack resources (otherwise pending would already fit)
        if resources_ok(pending, src):
            continue

        for candidate in src.pods:
            if candidate.owner_kind not in MOVEABLE_KINDS:
                continue

            # Simulate evicting candidate: would pending now fit on src?
            if not resources_ok(pending, src, candidate.req_cpu, candidate.req_mem):
                continue

            # Find a valid destination for the candidate
            for dst in nodes.values():
                if dst.name == src.name:
                    continue
                if not can_schedule(candidate, dst):
                    continue

                key = (candidate.namespace, candidate.name, src.name, dst.name)
                if key in seen:
                    continue
                seen.add(key)

                moves.append(
                    Move(
                        pod=candidate,
                        from_node=src.name,
                        to_node=dst.name,
                        helps=pending.full_name,
                    )
                )
                break  # One valid destination per candidate per src is enough

    return moves


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

SEP = "=" * 64
DASH = "-" * 64


def _section(title: str) -> None:
    print(f"\n{SEP}")
    print(f"  {title}")
    print(SEP)


def print_report(
    nodes: Dict[str, NodeInfo],
    pending: List[PodInfo],
    diagnoses: List[Tuple[List[str], List[NodeInfo]]],
    all_moves: List[Move],
    dry_run: bool,
) -> None:
    running = sum(len(n.pods) for n in nodes.values())
    label = "  [DRY RUN — read-only, no cluster changes]" if dry_run else ""

    _section(f"Kubernetes Pod Scheduling Analyzer{label}")

    print(f"\n  Nodes: {len(nodes)}   Running pods: {running}   Pending: {len(pending)}")

    # Node resource table
    print(f"\n  Node Resources:")
    col = 30
    print(
        f"  {'NODE':<{col}} {'ALLOC CPU':>10} {'FREE CPU':>10} {'ALLOC MEM':>10} {'FREE MEM':>10}  PODS"
    )
    print(
        f"  {'-'*col} {'-'*10} {'-'*10} {'-'*10} {'-'*10}  ----"
    )
    for n in nodes.values():
        pct_cpu = int(n.used_cpu * 100 / n.alloc_cpu) if n.alloc_cpu else 0
        pct_mem = int(n.used_mem * 100 / n.alloc_mem) if n.alloc_mem else 0
        name_col = n.name[:col]
        print(
            f"  {name_col:<{col}} {fmt_cpu(n.alloc_cpu):>10} {fmt_cpu(n.free_cpu):>10} "
            f"{fmt_mem(n.alloc_mem):>10} {fmt_mem(n.free_mem):>10}  "
            f"{len(n.pods)} pods ({pct_cpu}% cpu / {pct_mem}% mem)"
        )

    if not pending:
        print(f"\n  No pending pods found. Cluster looks healthy!")
        print()
        return

    # Per-pod analysis
    _section(f"Pending Pod Analysis  ({len(pending)} pod(s))")

    for idx, (pod, (reasons, eligible)) in enumerate(zip(pending, diagnoses), 1):
        print(f"\n  [{idx}/{len(pending)}]  {pod.full_name}")
        print(f"    Owner:    {pod.owner_kind}/{pod.owner_name}")
        print(f"    Requests: CPU {fmt_cpu(pod.req_cpu)}, Memory {fmt_mem(pod.req_mem)}")
        if pod.node_selector:
            print(f"    nodeSelector: {pod.node_selector}")
        if pod.schedule_msg:
            print(f"    K8s message:  {pod.schedule_msg}")

        print(f"    Diagnosis:")
        for r in reasons:
            print(f"      {r}")

        pod_moves = [m for m in all_moves if m.helps == pod.full_name]
        if pod_moves:
            print(f"    Suggested fix (top {min(3, len(pod_moves))}):")
            for m in pod_moves[:3]:
                mp = m.pod
                print(
                    f"      Move {mp.full_name}  ({mp.owner_kind})"
                )
                print(f"           {m.from_node}  →  {m.to_node}")
                print(
                    f"           Frees {fmt_cpu(mp.req_cpu)} CPU + "
                    f"{fmt_mem(mp.req_mem)} mem on {m.from_node}"
                )
        else:
            if eligible:
                print(
                    "    No automatic fix: eligible nodes exist but no single "
                    "Deployment/Job pod frees enough resources."
                )
                print(
                    "    Consider: adding nodes, scaling down other workloads, "
                    "or reducing resource requests."
                )
            else:
                print(
                    "    No automatic fix: no node satisfies selector + taint constraints."
                )
                print(
                    "    Check: nodeSelector labels, taint/toleration configuration, "
                    "or add a matching node."
                )

    # Rebalancing plan
    _section("Rebalancing Plan")

    if not all_moves:
        print("\n  No moves suggested. Manual options:")
        print("    • Add nodes to the cluster")
        print("    • Increase allocatable resources on existing nodes")
        print("    • Reduce resource requests on pending pods")
        print("    • Fix nodeSelector / taint / toleration configuration")
        print()
        return

    # Deduplicate: same pod move may help multiple pending pods
    seen_keys: set = set()
    unique: List[Move] = []
    for m in all_moves:
        key = (m.pod.namespace, m.pod.name, m.from_node, m.to_node)
        if key not in seen_keys:
            seen_keys.add(key)
            unique.append(m)

    print(f"\n  {len(unique)} move(s) suggested — execute in order shown:\n")
    for i, m in enumerate(unique, 1):
        mp = m.pod
        print(f"  {i}. Move {mp.full_name}  ({mp.owner_kind})")
        print(f"     From:  {m.from_node}")
        print(f"     To:    {m.to_node}")
        print(
            f"     Frees: {fmt_cpu(mp.req_cpu)} CPU, {fmt_mem(mp.req_mem)} memory "
            f"on {m.from_node}"
        )
        print(f"     Helps: {m.helps}")
        print()
        print(
            f"     The {mp.owner_kind} controller will reschedule the pod; "
            f"deleting triggers it:"
        )
        print(f"       kubectl delete pod {mp.name} -n {mp.namespace}")
        print(
            f"     Verify {mp.owner_kind} spec allows scheduling on {m.to_node} "
            f"before running."
        )
        print()

    if len(unique) > 1:
        print(
            "  Note: each suggested move is validated independently. "
            "If moves share a destination\n"
            "  node, verify remaining capacity after each step before proceeding."
        )
        print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze Kubernetes pod scheduling failures and suggest fixes.",
        epilog=(
            "Examples:\n"
            "  %(prog)s\n"
            "  %(prog)s --namespace my-app\n"
            "  %(prog)s --kubeconfig ~/.kube/staging.yaml\n"
            "\n"
            "Scoping rules:\n"
            "  - Only analyzes pods owned by Deployments or Jobs\n"
            "  - Ignores StatefulSet and DaemonSet pods entirely\n"
            "  - Respects nodeSelector and taint/toleration constraints\n"
            "  - Always read-only (never modifies the cluster)\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Read-only mode, no cluster changes (default: True; tool is always read-only)",
    )
    parser.add_argument(
        "--namespace",
        "-n",
        default="all",
        metavar="NAMESPACE",
        help="Kubernetes namespace to analyze (default: all namespaces)",
    )
    parser.add_argument(
        "--kubeconfig",
        default=None,
        metavar="PATH",
        help="Path to kubeconfig file (default: KUBECONFIG env or ~/.kube/config)",
    )
    args = parser.parse_args()

    scope = f"namespace={args.namespace}" if args.namespace != "all" else "all namespaces"
    print(f"[k8s-sched-analyzer] Fetching cluster state ({scope})...")

    nodes = load_nodes(args.kubeconfig)
    if not nodes:
        print("No nodes found. Check kubectl connectivity.", file=sys.stderr)
        sys.exit(1)

    rs_owners = load_rs_owners(args.namespace, args.kubeconfig)
    pods = load_pods(args.namespace, args.kubeconfig, rs_owners)

    # Assign pods to nodes for resource accounting.
    # All non-terminal pods with a nodeName consume resources (including StatefulSet/DaemonSet).
    for pod in pods:
        if (
            pod.node
            and pod.node in nodes
            and pod.phase not in ("Failed", "Succeeded", "Unknown")
        ):
            nodes[pod.node].pods.append(pod)

    # Pending pods to analyze: unscheduled (no nodeName) and owned by Deployment or Job.
    pending_pods = [
        p
        for p in pods
        if p.phase == "Pending" and not p.node and p.owner_kind in MOVEABLE_KINDS
    ]

    diagnoses = [diagnose(p, nodes) for p in pending_pods]

    all_moves: List[Move] = []
    for pod in pending_pods:
        all_moves.extend(find_moves(pod, nodes))

    print_report(nodes, pending_pods, diagnoses, all_moves, args.dry_run)


if __name__ == "__main__":
    main()
