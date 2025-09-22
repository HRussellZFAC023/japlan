"""Generate cluster and day summaries for the Japlan itinerary."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from scripts.itinerary_engine import haversine_km

CLUSTER_PLAN = Path('data/cache/cluster_plan.json')
DAY_PLAN = Path('data/cache/day_plan.json')


def load_json(path: Path) -> List[Dict[str, object]]:
    if not path.exists():
        raise SystemExit(f'Missing required file: {path}. Run scripts/compile_mymaps.py first.')
    return json.loads(path.read_text(encoding='utf-8'))


def nearest_neighbor_route(nodes: Dict[int, Tuple[float, float]], start: int) -> List[int]:
    remaining = set(nodes) - {start}
    route = [start]
    current = start
    while remaining:
        next_node = min(
            remaining,
            key=lambda idx: haversine_km(
                nodes[current][0], nodes[current][1], nodes[idx][0], nodes[idx][1]
            ),
        )
        route.append(next_node)
        remaining.remove(next_node)
        current = next_node
    return route


def describe_route(cluster_data: List[Dict[str, object]], region: str, start_label: str) -> None:
    clusters = [c for c in cluster_data if c['label'].startswith(start_label) or c['region'] == region]
    if not clusters:
        return
    coords = {c['id']: (c['centroid'][0], c['centroid'][1]) for c in clusters}
    start_id = next(c['id'] for c in clusters if c['label'].startswith(start_label))
    route = nearest_neighbor_route(coords, start_id)
    print(f"\nRegion: {region}")
    for position, cluster_id in enumerate(route, start=1):
        cluster = next(c for c in clusters if c['id'] == cluster_id)
        print(f"  {position:>2}. {cluster['label']} ({len(cluster['members'])} stops)")


def main() -> None:
    cluster_data = load_json(CLUSTER_PLAN)
    day_data = load_json(DAY_PLAN)

    print('Cluster summary:')
    for entry in cluster_data:
        print(f"- {entry['label']} -> {entry['region']} ({len(entry['members'])} stops)")

    print('\nOptimised routes (nearest-neighbour heuristic):')
    describe_route(cluster_data, region='Osaka', start_label='KIX Arrival')
    describe_route(cluster_data, region='Tokyo', start_label='Sequence Miyashita Park')
    describe_route(cluster_data, region='Kobe', start_label='Himeji Heritage Walk')

    print('\nDay plan overview:')
    for entry in day_data:
        clusters = ', '.join(entry['clusters'])
        stops = ', '.join(entry['stops'])
        print(f"Day {entry['day']:>2} ({entry['date']}): {clusters}")
        print(f"    Stops: {stops}")


if __name__ == '__main__':
    main()
