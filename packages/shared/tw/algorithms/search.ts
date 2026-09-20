/**
 * Search algorithms -- binary, linear, interpolation, exponential, fibonacci.
 * @module shared/algorithms
 */

export type CompareFn<T> = (a: T, b: T) => number;

export function linearSearch<T>(arr: T[], target: T, compare?: CompareFn<T>): number {
  for (let i = 0; i < arr.length; i++) {
    if (compare ? compare(arr[i], target) === 0 : arr[i] === target) {
      return i;
    }
  }
  return -1;
}

export function linearSearchLast<T>(arr: T[], target: T, compare?: CompareFn<T>): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (compare ? compare(arr[i], target) === 0 : arr[i] === target) {
      return i;
    }
  }
  return -1;
}

export function linearSearchAll<T>(arr: T[], target: T, compare?: CompareFn<T>): number[] {
  const indices: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (compare ? compare(arr[i], target) === 0 : arr[i] === target) {
      indices.push(i);
    }
  }
  return indices;
}

export function linearSearchFind<T>(arr: T[], predicate: (item: T, index: number) => boolean): T | undefined {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i)) return arr[i];
  }
  return undefined;
}

export function linearSearchFindIndex<T>(arr: T[], predicate: (item: T, index: number) => boolean): number {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i)) return i;
  }
  return -1;
}

export function linearSearchFindLast<T>(arr: T[], predicate: (item: T, index: number) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return arr[i];
  }
  return undefined;
}

export function linearSearchFindLastIndex<T>(arr: T[], predicate: (item: T, index: number) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) return i;
  }
  return -1;
}

export function binarySearch<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function binarySearchRecursive<T>(arr: T[], target: T, compare: CompareFn<T>, low: number = 0, high: number = arr.length - 1): number {
  if (low > high) return -1;
  const mid = Math.floor((low + high) / 2);
  const cmp = compare(arr[mid], target);
  if (cmp === 0) return mid;
  if (cmp < 0) return binarySearchRecursive(arr, target, compare, mid + 1, high);
  return binarySearchRecursive(arr, target, compare, low, mid - 1);
}

export function binarySearchFirst<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  let low = 0;
  let high = arr.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) {
      result = mid;
      high = mid - 1;
    } else if (cmp < 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export function binarySearchLast<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  let low = 0;
  let high = arr.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) {
      result = mid;
      low = mid + 1;
    } else if (cmp < 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export function interpolationSearch(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high && target >= arr[low] && target <= arr[high]) {
    if (low === high) {
      return arr[low] === target ? low : -1;
    }
    const pos = low + Math.floor(((target - arr[low]) / (arr[high] - arr[low])) * (high - low));
    if (arr[pos] === target) return pos;
    if (arr[pos] < target) low = pos + 1;
    else high = pos - 1;
  }
  return -1;
}

export function exponentialSearch<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  if (arr.length === 0) return -1;
  if (compare(arr[0], target) === 0) return 0;
  let i = 1;
  while (i < arr.length && compare(arr[i], target) <= 0) {
    i *= 2;
  }
  return binarySearchRange(arr, target, compare, Math.floor(i / 2), Math.min(i, arr.length - 1));
}

function binarySearchRange<T>(arr: T[], target: T, compare: CompareFn<T>, low: number, high: number): number {
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = compare(arr[mid], target);
    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

export function fibonacciSearch<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  const n = arr.length;
  let fibM2 = 0;
  let fibM1 = 1;
  let fibM = fibM2 + fibM1;
  while (fibM < n) {
    fibM2 = fibM1;
    fibM1 = fibM;
    fibM = fibM2 + fibM1;
  }
  let offset = -1;
  while (fibM > 1) {
    const i = Math.min(offset + fibM2, n - 1);
    const cmp = compare(arr[i], target);
    if (cmp < 0) {
      fibM = fibM1;
      fibM1 = fibM2;
      fibM2 = fibM - fibM1;
      offset = i;
    } else if (cmp > 0) {
      fibM = fibM2;
      fibM1 = fibM1 - fibM2;
      fibM2 = fibM - fibM1;
    } else {
      return i;
    }
  }
  if (fibM1 === 1 && offset + 1 < n && compare(arr[offset + 1], target) === 0) {
    return offset + 1;
  }
  return -1;
}

export function jumpSearch<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  const n = arr.length;
  if (n === 0) return -1;
  const step = Math.floor(Math.sqrt(n));
  let prev = 0;
  let curr = Math.min(step, n) - 1;
  while (curr < n && compare(arr[curr], target) < 0) {
    prev = curr + 1;
    curr = Math.min(curr + step, n) - 1;
    if (prev >= n) return -1;
  }
  for (let i = prev; i <= Math.min(curr, n - 1); i++) {
    if (compare(arr[i], target) === 0) return i;
  }
  return -1;
}

export function ternarySearch<T>(arr: T[], target: T, compare: CompareFn<T>): number {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid1 = low + Math.floor((high - low) / 3);
    const mid2 = high - Math.floor((high - low) / 3);
    if (compare(arr[mid1], target) === 0) return mid1;
    if (compare(arr[mid2], target) === 0) return mid2;
    if (compare(target, arr[mid1]) < 0) {
      high = mid1 - 1;
    } else if (compare(target, arr[mid2]) > 0) {
      low = mid2 + 1;
    } else {
      low = mid1 + 1;
      high = mid2 - 1;
    }
  }
  return -1;
}

export function ternarySearchMax(fn: (x: number) => number, low: number, high: number, precision: number = 1e-6): number {
  while (high - low > precision) {
    const mid1 = low + (high - low) / 3;
    const mid2 = high - (high - low) / 3;
    if (fn(mid1) < fn(mid2)) {
      low = mid1;
    } else {
      high = mid2;
    }
  }
  return (low + high) / 2;
}

export function ternarySearchMin(fn: (x: number) => number, low: number, high: number, precision: number = 1e-6): number {
  while (high - low > precision) {
    const mid1 = low + (high - low) / 3;
    const mid2 = high - (high - low) / 3;
    if (fn(mid1) > fn(mid2)) {
      low = mid1;
    } else {
      high = mid2;
    }
  }
  return (low + high) / 2;
}

export function goldenSectionSearchMax(fn: (x: number) => number, low: number, high: number, precision: number = 1e-6): number {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  let c = b - (b - a) * phi;
  let d = a + (b - a) * phi;
  while (Math.abs(b - a) > precision) {
    if (fn(c) > fn(d)) {
      b = d;
    } else {
      a = c;
    }
    c = b - (b - a) * phi;
    d = a + (b - a) * phi;
  }
  return (a + b) / 2;
}

export function goldenSectionSearchMin(fn: (x: number) => number, low: number, high: number, precision: number = 1e-6): number {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  let c = b - (b - a) * phi;
  let d = a + (b - a) * phi;
  while (Math.abs(b - a) > precision) {
    if (fn(c) < fn(d)) {
      b = d;
    } else {
      a = c;
    }
    c = b - (b - a) * phi;
    d = a + (b - a) * phi;
  }
  return (a + b) / 2;
}

export function breadthFirstSearch<T>(graph: Map<T, T[]>, start: T, target?: T): T[] {
  const visited = new Set<T>();
  const queue: T[] = [start];
  const result: T[] = [];
  visited.add(start);
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    if (target && node === target) return result;
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return result;
}

export function depthFirstSearch<T>(graph: Map<T, T[]>, start: T, target?: T): T[] {
  const visited = new Set<T>();
  const result: T[] = [];
  const dfs = (node: T): boolean => {
    visited.add(node);
    result.push(node);
    if (target && node === target) return true;
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      }
    }
    return false;
  };
  dfs(start);
  return result;
}

export function depthFirstSearchIterative<T>(graph: Map<T, T[]>, start: T, target?: T): T[] {
  const visited = new Set<T>();
  const stack: T[] = [start];
  const result: T[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    result.push(node);
    if (target && node === target) return result;
    const neighbors = graph.get(node) ?? [];
    for (let i = neighbors.length - 1; i >= 0; i--) {
      if (!visited.has(neighbors[i])) {
        stack.push(neighbors[i]);
      }
    }
  }
  return result;
}

export function dijkstra<T>(graph: Map<T, Array<{ node: T; weight: number }>>, start: T): Map<T, number> {
  const distances = new Map<T, number>();
  const visited = new Set<T>();
  for (const node of graph.keys()) {
    distances.set(node, Infinity);
  }
  distances.set(start, 0);
  const queue: Array<{ node: T; distance: number }> = [{ node: start, distance: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const { node, distance } = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    const neighbors = graph.get(node) ?? [];
    for (const { node: neighbor, weight } of neighbors) {
      const newDistance = distance + weight;
      if (newDistance < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, newDistance);
        queue.push({ node: neighbor, distance: newDistance });
      }
    }
  }
  return distances;
}

export function dijkstraPath<T>(graph: Map<T, Array<{ node: T; weight: number }>>, start: T, end: T): T[] {
  const distances = new Map<T, number>();
  const previous = new Map<T, T | null>();
  const visited = new Set<T>();
  for (const node of graph.keys()) {
    distances.set(node, Infinity);
    previous.set(node, null);
  }
  distances.set(start, 0);
  const queue: Array<{ node: T; distance: number }> = [{ node: start, distance: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const { node, distance } = queue.shift()!;
    if (node === end) break;
    if (visited.has(node)) continue;
    visited.add(node);
    const neighbors = graph.get(node) ?? [];
    for (const { node: neighbor, weight } of neighbors) {
      const newDistance = distance + weight;
      if (newDistance < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, newDistance);
        previous.set(neighbor, node);
        queue.push({ node: neighbor, distance: newDistance });
      }
    }
  }
  const path: T[] = [];
  let current: T | null = end;
  while (current) {
    path.unshift(current);
    current = previous.get(current) ?? null;
  }
  return path[0] === start ? path : [];
}

export function bellmanFord<T>(graph: Map<T, Array<{ node: T; weight: number }>>, start: T): { distances: Map<T, number>; hasNegativeCycle: boolean } {
  const distances = new Map<T, number>();
  for (const node of graph.keys()) {
    distances.set(node, Infinity);
  }
  distances.set(start, 0);
  const nodes = [...graph.keys()];
  const edges: Array<{ from: T; to: T; weight: number }> = [];
  for (const [from, neighbors] of graph) {
    for (const { node: to, weight } of neighbors) {
      edges.push({ from, to, weight });
    }
  }
  for (let i = 0; i < nodes.length - 1; i++) {
    for (const { from, to, weight } of edges) {
      const distFrom = distances.get(from) ?? Infinity;
      const distTo = distances.get(to) ?? Infinity;
      if (distFrom + weight < distTo) {
        distances.set(to, distFrom + weight);
      }
    }
  }
  let hasNegativeCycle = false;
  for (const { from, to, weight } of edges) {
    const distFrom = distances.get(from) ?? Infinity;
    const distTo = distances.get(to) ?? Infinity;
    if (distFrom + weight < distTo) {
      hasNegativeCycle = true;
      break;
    }
  }
  return { distances, hasNegativeCycle };
}

export function floydWarshall<T>(graph: Map<T, Array<{ node: T; weight: number }>>): Map<T, Map<T, number>> {
  const nodes = [...graph.keys()];
  const dist = new Map<T, Map<T, number>>();
  for (const u of nodes) {
    dist.set(u, new Map());
    for (const v of nodes) {
      dist.get(u)!.set(v, u === v ? 0 : Infinity);
    }
  }
  for (const [u, neighbors] of graph) {
    for (const { node: v, weight } of neighbors) {
      dist.get(u)!.set(v, weight);
    }
  }
  for (const k of nodes) {
    for (const i of nodes) {
      for (const j of nodes) {
        const dik = dist.get(i)!.get(k) ?? Infinity;
        const dkj = dist.get(k)!.get(j) ?? Infinity;
        const dij = dist.get(i)!.get(j) ?? Infinity;
        if (dik + dkj < dij) {
          dist.get(i)!.set(j, dik + dkj);
        }
      }
    }
  }
  return dist;
}

export function aStar<T>(graph: Map<T, Array<{ node: T; weight: number }>>, start: T, goal: T, heuristic: (a: T, b: T) => number): T[] {
  const openSet = new Set<T>([start]);
  const cameFrom = new Map<T, T>();
  const gScore = new Map<T, number>();
  const fScore = new Map<T, number>();
  gScore.set(start, 0);
  fScore.set(start, heuristic(start, goal));
  while (openSet.size > 0) {
    let current: T | null = null;
    let lowestFScore = Infinity;
    for (const node of openSet) {
      const score = fScore.get(node) ?? Infinity;
      if (score < lowestFScore) {
        lowestFScore = score;
        current = node;
      }
    }
    if (current === null) return [];
    if (current === goal) {
      const path: T[] = [current];
      while (cameFrom.has(current!)) {
        current = cameFrom.get(current!)!;
        path.unshift(current);
      }
      return path;
    }
    openSet.delete(current);
    const neighbors = graph.get(current) ?? [];
    for (const { node: neighbor, weight } of neighbors) {
      const tentativeGScore = (gScore.get(current) ?? Infinity) + weight;
      if (tentativeGScore < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeGScore);
        fScore.set(neighbor, tentativeGScore + heuristic(neighbor, goal));
        openSet.add(neighbor);
      }
    }
  }
  return [];
}

export function topologicalSort<T>(graph: Map<T, T[]>): T[] {
  const inDegree = new Map<T, number>();
  for (const [node, neighbors] of graph) {
    if (!inDegree.has(node)) inDegree.set(node, 0);
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
    }
  }
  const queue: T[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }
  const result: T[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }
  return result;
}

export function detectCycle<T>(graph: Map<T, T[]>): boolean {
  const visited = new Set<T>();
  const recursionStack = new Set<T>();
  const dfs = (node: T): boolean => {
    visited.add(node);
    recursionStack.add(node);
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }
    recursionStack.delete(node);
    return false;
  };
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

export function findCycles<T>(graph: Map<T, T[]>): T[][] {
  const cycles: T[][] = [];
  const visited = new Set<T>();
  const path: T[] = [];
  const dfs = (node: T): void => {
    visited.add(node);
    path.push(node);
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }
    path.pop();
  };
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }
  return cycles;
}

export function stronglyConnectedComponents<T>(graph: Map<T, T[]>): T[][] {
  let index = 0;
  const stack: T[] = [];
  const indices = new Map<T, number>();
  const lowLinks = new Map<T, number>();
  const onStack = new Set<T>();
  const result: T[][] = [];
  const strongconnect = (v: T): void => {
    indices.set(v, index);
    lowLinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    const neighbors = graph.get(v) ?? [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowLinks.set(v, Math.min(lowLinks.get(v) ?? 0, lowLinks.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowLinks.set(v, Math.min(lowLinks.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }
    if (lowLinks.get(v) === indices.get(v)) {
      const scc: T[] = [];
      let w: T;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      result.push(scc);
    }
  };
  for (const node of graph.keys()) {
    if (!indices.has(node)) {
      strongconnect(node);
    }
  }
  return result;
}

export function connectedComponents<T>(graph: Map<T, T[]>): T[][] {
  const visited = new Set<T>();
  const components: T[][] = [];
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const component: T[] = [];
      const queue: T[] = [node];
      visited.add(node);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        const neighbors = graph.get(current) ?? [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(component);
    }
  }
  return components;
}

export function isBipartite<T>(graph: Map<T, T[]>): boolean {
  const colors = new Map<T, number>();
  for (const node of graph.keys()) {
    if (!colors.has(node)) {
      colors.set(node, 0);
      const queue: T[] = [node];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentColor = colors.get(current) ?? 0;
        const neighbors = graph.get(current) ?? [];
        for (const neighbor of neighbors) {
          if (!colors.has(neighbor)) {
            colors.set(neighbor, 1 - currentColor);
            queue.push(neighbor);
          } else if (colors.get(neighbor) === currentColor) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

export function findBridges<T>(graph: Map<T, T[]>): Array<[T, T]> {
  const visited = new Set<T>();
  const disc = new Map<T, number>();
  const low = new Map<T, number>();
  const bridges: Array<[T, T]> = [];
  let time = 0;
  const dfs = (u: T, parent: T | null): void => {
    visited.add(u);
    disc.set(u, time);
    low.set(u, time);
    time++;
    const neighbors = graph.get(u) ?? [];
    for (const v of neighbors) {
      if (!visited.has(v)) {
        dfs(v, u);
        low.set(u, Math.min(low.get(u) ?? 0, low.get(v) ?? 0));
        if (low.get(v)! > disc.get(u)!) {
          bridges.push([u, v]);
        }
      } else if (v !== parent) {
        low.set(u, Math.min(low.get(u) ?? 0, disc.get(v) ?? 0));
      }
    }
  };
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, null);
    }
  }
  return bridges;
}

export function findArticulationPoints<T>(graph: Map<T, T[]>): T[] {
  const visited = new Set<T>();
  const disc = new Map<T, number>();
  const low = new Map<T, number>();
  const ap = new Set<T>();
  let time = 0;
  const dfs = (u: T, parent: T | null, isRoot: boolean): void => {
    visited.add(u);
    disc.set(u, time);
    low.set(u, time);
    time++;
    let children = 0;
    const neighbors = graph.get(u) ?? [];
    for (const v of neighbors) {
      if (!visited.has(v)) {
        children++;
        dfs(v, u, false);
        low.set(u, Math.min(low.get(u) ?? 0, low.get(v) ?? 0));
        if (!isRoot && low.get(v)! >= disc.get(u)!) {
          ap.add(u);
        }
      } else if (v !== parent) {
        low.set(u, Math.min(low.get(u) ?? 0, disc.get(v) ?? 0));
      }
    }
    if (isRoot && children > 1) {
      ap.add(u);
    }
  };
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, null, true);
    }
  }
  return [...ap];
}

export function kruskalMST<T>(edges: Array<{ from: T; to: T; weight: number }>): Array<{ from: T; to: T; weight: number }> {
  const sortedEdges = [...edges].sort((a, b) => a.weight - b.weight);
  const parent = new Map<T, T>();
  const find = (x: T): T => {
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x)!);
    parent.set(x, root);
    return root;
  };
  const union = (x: T, y: T): void => {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent.set(rootX, rootY);
    }
  };
  for (const edge of sortedEdges) {
    if (!parent.has(edge.from)) parent.set(edge.from, edge.from);
    if (!parent.has(edge.to)) parent.set(edge.to, edge.to);
  }
  const mst: Array<{ from: T; to: T; weight: number }> = [];
  for (const edge of sortedEdges) {
    if (find(edge.from) !== find(edge.to)) {
      union(edge.from, edge.to);
      mst.push(edge);
    }
  }
  return mst;
}

export function primMST<T>(graph: Map<T, Array<{ node: T; weight: number }>>, start: T): Array<{ from: T; to: T; weight: number }> {
  const visited = new Set<T>([start]);
  const mst: Array<{ from: T; to: T; weight: number }> = [];
  while (visited.size < graph.size) {
    let minEdge: { from: T; to: T; weight: number } | null = null;
    for (const u of visited) {
      const neighbors = graph.get(u) ?? [];
      for (const { node: v, weight } of neighbors) {
        if (!visited.has(v)) {
          if (minEdge === null || weight < minEdge.weight) {
            minEdge = { from: u, to: v, weight };
          }
        }
      }
    }
    if (minEdge === null) break;
    mst.push(minEdge);
    visited.add(minEdge.to);
  }
  return mst;
}

export function fordFulkerson<T>(graph: Map<T, Array<{ node: T; weight: number }>>, source: T, sink: T): number {
  const residualGraph = new Map<T, Map<T, number>>();
  for (const [u, neighbors] of graph) {
    if (!residualGraph.has(u)) residualGraph.set(u, new Map());
    for (const { node: v, weight } of neighbors) {
      residualGraph.get(u)!.set(v, weight);
      if (!residualGraph.has(v)) residualGraph.set(v, new Map());
      if (!residualGraph.get(v)!.has(u)) residualGraph.get(v)!.set(u, 0);
    }
  }
  const bfs = (): T[] | null => {
    const visited = new Set<T>([source]);
    const parent = new Map<T, T>();
    const queue: T[] = [source];
    while (queue.length > 0) {
      const u = queue.shift()!;
      const neighbors = residualGraph.get(u) ?? new Map();
      for (const [v, capacity] of neighbors) {
        if (!visited.has(v) && capacity > 0) {
          visited.add(v);
          parent.set(v, u);
          if (v === sink) {
            const path: T[] = [v];
            let current: T = v;
            while (current !== source) {
              current = parent.get(current)!;
              path.unshift(current);
            }
            return path;
          }
          queue.push(v);
        }
      }
    }
    return null;
  };
  let maxFlow = 0;
  let path = bfs();
  while (path) {
    let pathFlow = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      const capacity = residualGraph.get(u)!.get(v) ?? 0;
      pathFlow = Math.min(pathFlow, capacity);
    }
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      residualGraph.get(u)!.set(v, (residualGraph.get(u)!.get(v) ?? 0) - pathFlow);
      residualGraph.get(v)!.set(u, (residualGraph.get(v)!.get(u) ?? 0) + pathFlow);
    }
    maxFlow += pathFlow;
    path = bfs();
  }
  return maxFlow;
}

export function isCyclicDirected<T>(graph: Map<T, T[]>): boolean {
  const visited = new Set<T>();
  const recursionStack = new Set<T>();
  const dfs = (node: T): boolean => {
    visited.add(node);
    recursionStack.add(node);
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }
    recursionStack.delete(node);
    return false;
  };
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

export function isCyclicUndirected<T>(graph: Map<T, T[]>): boolean {
  const visited = new Set<T>();
  const dfs = (node: T, parent: T | null): boolean => {
    visited.add(node);
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, node)) return true;
      } else if (neighbor !== parent) {
        return true;
      }
    }
    return false;
  };
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node, null)) return true;
    }
  }
  return false;
}

export function shortestPathBFS<T>(graph: Map<T, T[]>, start: T, end: T): T[] {
  const visited = new Set<T>([start]);
  const parent = new Map<T, T>();
  const queue: T[] = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === end) {
      const path: T[] = [end];
      let current: T = end;
      while (current !== start) {
        current = parent.get(current)!;
        path.unshift(current);
      }
      return path;
    }
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, node);
        queue.push(neighbor);
      }
    }
  }
  return [];
}

export function allPathsDFS<T>(graph: Map<T, T[]>, start: T, end: T): T[][] {
  const paths: T[][] = [];
  const currentPath: T[] = [start];
  const visited = new Set<T>([start]);
  const dfs = (node: T): void => {
    if (node === end) {
      paths.push([...currentPath]);
      return;
    }
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        currentPath.push(neighbor);
        dfs(neighbor);
        currentPath.pop();
        visited.delete(neighbor);
      }
    }
  };
  dfs(start);
  return paths;
}

export function bidirectionalSearch<T>(graph: Map<T, T[]>, start: T, end: T): T[] {
  const visitedStart = new Set<T>([start]);
  const visitedEnd = new Set<T>([end]);
  const parentStart = new Map<T, T>();
  const parentEnd = new Map<T, T>();
  const queueStart: T[] = [start];
  const queueEnd: T[] = [end];
  while (queueStart.length > 0 && queueEnd.length > 0) {
    const nodeStart = queueStart.shift()!;
    const neighbors = graph.get(nodeStart) ?? [];
    for (const neighbor of neighbors) {
      if (!visitedStart.has(neighbor)) {
        visitedStart.add(neighbor);
        parentStart.set(neighbor, nodeStart);
        queueStart.push(neighbor);
        if (visitedEnd.has(neighbor)) {
          return reconstructPath(parentStart, parentEnd, start, end, neighbor);
        }
      }
    }
    const nodeEnd = queueEnd.shift()!;
    const neighborsEnd = graph.get(nodeEnd) ?? [];
    for (const neighbor of neighborsEnd) {
      if (!visitedEnd.has(neighbor)) {
        visitedEnd.add(neighbor);
        parentEnd.set(neighbor, nodeEnd);
        queueEnd.push(neighbor);
        if (visitedStart.has(neighbor)) {
          return reconstructPath(parentStart, parentEnd, start, end, neighbor);
        }
      }
    }
  }
  return [];
}

function reconstructPath<T>(parentStart: Map<T, T>, parentEnd: Map<T, T>, start: T, end: T, meeting: T): T[] {
  const path: T[] = [];
  let current: T = meeting;
  while (current !== start) {
    path.unshift(current);
    current = parentStart.get(current)!;
  }
  path.unshift(start);
  current = meeting;
  while (current !== end) {
    current = parentEnd.get(current)!;
    path.push(current);
  }
  return path;
}

export function countPaths<T>(graph: Map<T, T[]>, start: T, end: T): number {
  const visited = new Set<T>();
  let count = 0;
  const dfs = (node: T): void => {
    if (node === end) {
      count++;
      return;
    }
    visited.add(node);
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }
    visited.delete(node);
  };
  dfs(start);
  return count;
}

export function countPathsDP<T>(graph: Map<T, T[]>, start: T, end: T): number {
  const memo = new Map<T, number>();
  let count = (node: T): number => {
    if (node === end) return 1;
    if (memo.has(node)) return memo.get(node)!;
    const neighbors = graph.get(node) ?? [];
    let total = 0;
    for (const neighbor of neighbors) {
      total += count(neighbor);
    }
    memo.set(node, total);
    return total;
  };
  return count(start);
}

export function hasPath<T>(graph: Map<T, T[]>, start: T, end: T): boolean {
  const visited = new Set<T>([start]);
  const queue: T[] = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === end) return true;
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

export function getReachableNodes<T>(graph: Map<T, T[]>, start: T): Set<T> {
  const visited = new Set<T>([start]);
  const queue: T[] = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

export function getDegrees<T>(graph: Map<T, T[]>): Map<T, { inDegree: number; outDegree: number }> {
  const degrees = new Map<T, { inDegree: number; outDegree: number }>();
  for (const [node, neighbors] of graph) {
    if (!degrees.has(node)) degrees.set(node, { inDegree: 0, outDegree: 0 });
    degrees.get(node)!.outDegree = neighbors.length;
    for (const neighbor of neighbors) {
      if (!degrees.has(neighbor)) degrees.set(neighbor, { inDegree: 0, outDegree: 0 });
      degrees.get(neighbor)!.inDegree++;
    }
  }
  return degrees;
}

export function getIsolatedNodes<T>(graph: Map<T, T[]>): T[] {
  const degrees = getDegrees(graph);
  const isolated: T[] = [];
  for (const [node, { inDegree, outDegree }] of degrees) {
    if (inDegree === 0 && outDegree === 0) {
      isolated.push(node);
    }
  }
  return isolated;
}

export function getLeafNodes<T>(graph: Map<T, T[]>): T[] {
  const degrees = getDegrees(graph);
  const leaves: T[] = [];
  for (const [node, { outDegree }] of degrees) {
    if (outDegree === 0) {
      leaves.push(node);
    }
  }
  return leaves;
}

export function getRootNodes<T>(graph: Map<T, T[]>): T[] {
  const degrees = getDegrees(graph);
  const roots: T[] = [];
  for (const [node, { inDegree }] of degrees) {
    if (inDegree === 0) {
      roots.push(node);
    }
  }
  return roots;
}

export function getNeighbors<T>(graph: Map<T, T[]>, node: T): T[] {
  return graph.get(node) ?? [];
}

export function getEdgeCount<T>(graph: Map<T, T[]>): number {
  let count = 0;
  for (const neighbors of graph.values()) {
    count += neighbors.length;
  }
  return count;
}

export function getNodeCount<T>(graph: Map<T, T[]>): number {
  return graph.size;
}

export function getDensity<T>(graph: Map<T, T[]>): number {
  const n = graph.size;
  if (n <= 1) return 0;
  const maxEdges = n * (n - 1);
  return getEdgeCount(graph) / maxEdges;
}

export function getDiameter<T>(graph: Map<T, T[]>): number {
  let diameter = 0;
  for (const start of graph.keys()) {
    const distances = dijkstra(graph as Map<T, Array<{ node: T; weight: number }>>, start);
    for (const distance of distances.values()) {
      if (distance !== Infinity && distance > diameter) {
        diameter = distance;
      }
    }
  }
  return diameter;
}

export function getRadius<T>(graph: Map<T, T[]>): number {
  let radius = Infinity;
  for (const start of graph.keys()) {
    const distances = dijkstra(graph as Map<T, Array<{ node: T; weight: number }>>, start);
    let maxDist = 0;
    for (const distance of distances.values()) {
      if (distance !== Infinity && distance > maxDist) {
        maxDist = distance;
      }
    }
    if (maxDist < radius) {
      radius = maxDist;
    }
  }
  return radius;
}

export function getCenter<T>(graph: Map<T, T[]>): T | null {
  let minEccentricity = Infinity;
  let center: T | null = null;
  for (const start of graph.keys()) {
    const distances = dijkstra(graph as Map<T, Array<{ node: T; weight: number }>>, start);
    let maxDist = 0;
    for (const distance of distances.values()) {
      if (distance !== Infinity && distance > maxDist) {
        maxDist = distance;
      }
    }
    if (maxDist < minEccentricity) {
      minEccentricity = maxDist;
      center = start;
    }
  }
  return center;
}

export function isComplete<T>(graph: Map<T, T[]>): boolean {
  const n = graph.size;
  if (n <= 1) return true;
  const maxEdges = n * (n - 1);
  return getEdgeCount(graph) === maxEdges;
}

export function isTree<T>(graph: Map<T, T[]>): boolean {
  if (isCyclicUndirected(graph)) return false;
  const components = connectedComponents(graph);
  return components.length === 1;
}

export function isForest<T>(graph: Map<T, T[]>): boolean {
  return !isCyclicUndirected(graph);
}

export function isRegular<T>(graph: Map<T, T[]>): boolean {
  const degrees = getDegrees(graph);
  if (degrees.size === 0) return true;
  const firstDegree = [...degrees.values()][0].outDegree;
  for (const { outDegree } of degrees.values()) {
    if (outDegree !== firstDegree) return false;
  }
  return true;
}

export function isEulerian<T>(graph: Map<T, T[]>): boolean {
  if (!connectedComponents(graph).every((c) => c.length === 1 || c.length === graph.size)) return false;
  const degrees = getDegrees(graph);
  for (const { inDegree, outDegree } of degrees.values()) {
    if (inDegree !== outDegree) return false;
  }
  return true;
}

export function isHamiltonian<T>(graph: Map<T, T[]>): boolean {
  const nodes = [...graph.keys()];
  if (nodes.length === 0) return true;
  if (nodes.length === 1) return true;
  const permutations = getPermutations(nodes);
  for (const perm of permutations) {
    let isPath = true;
    for (let i = 0; i < perm.length - 1; i++) {
      const neighbors = graph.get(perm[i]) ?? [];
      if (!neighbors.includes(perm[i + 1])) {
        isPath = false;
        break;
      }
    }
    if (isPath) {
      const lastNeighbors = graph.get(perm[perm.length - 1]) ?? [];
      if (lastNeighbors.includes(perm[0])) {
        return true;
      }
    }
  }
  return false;
}

function getPermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of getPermutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

export function getEccentricity<T>(graph: Map<T, Array<{ node: T; weight: number }>>, node: T): number {
  const distances = dijkstra(graph, node);
  let maxDist = 0;
  for (const distance of distances.values()) {
    if (distance !== Infinity && distance > maxDist) {
      maxDist = distance;
    }
  }
  return maxDist;
}

export function getGirth<T>(graph: Map<T, T[]>): number {
  let girth = Infinity;
  for (const start of graph.keys()) {
    const visited = new Set<T>([start]);
    const distances = new Map<T, number>([[start, 0]]);
    const queue: T[] = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      const neighbors = graph.get(node) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          distances.set(neighbor, (distances.get(node) ?? 0) + 1);
          queue.push(neighbor);
        } else if (distances.get(neighbor)! >= (distances.get(node) ?? 0)) {
          const cycleLength = (distances.get(node) ?? 0) + (distances.get(neighbor) ?? 0) + 1;
          girth = Math.min(girth, cycleLength);
        }
      }
    }
  }
  return girth === Infinity ? -1 : girth;
}

export function getCliqueNumber<T>(graph: Map<T, T[]>): number {
  let maxClique = 0;
  const nodes = [...graph.keys()];
  const findClique = (current: T[], candidates: T[]): void => {
    if (candidates.length === 0) {
      maxClique = Math.max(maxClique, current.length);
      return;
    }
    if (current.length + candidates.length <= maxClique) return;
    for (let i = 0; i < candidates.length; i++) {
      const node = candidates[i];
      const neighbors = graph.get(node) ?? [];
      const newCandidates = candidates.slice(i + 1).filter((c) => neighbors.includes(c));
      findClique([...current, node], newCandidates);
    }
  };
  findClique([], nodes);
  return maxClique;
}

export function getChromaticNumber<T>(graph: Map<T, T[]>): number {
  const nodes = [...graph.keys()];
  if (nodes.length === 0) return 0;
  const colors = new Map<T, number>();
  for (let maxColors = 1; maxColors <= nodes.length; maxColors++) {
    colors.clear();
    const tryColoring = (index: number): boolean => {
      if (index >= nodes.length) return true;
      const node = nodes[index];
      const neighbors = graph.get(node) ?? [];
      for (let color = 0; color < maxColors; color++) {
        const canUse = neighbors.every((n) => colors.get(n) !== color);
        if (canUse) {
          colors.set(node, color);
          if (tryColoring(index + 1)) return true;
          colors.delete(node);
        }
      }
      return false;
    };
    if (tryColoring(0)) return maxColors;
  }
  return nodes.length;
}

export function greedyColoring<T>(graph: Map<T, T[]>): Map<T, number> {
  const colors = new Map<T, number>();
  for (const node of graph.keys()) {
    const neighbors = graph.get(node) ?? [];
    const usedColors = new Set<number>();
    for (const neighbor of neighbors) {
      const color = colors.get(neighbor);
      if (color !== undefined) {
        usedColors.add(color);
      }
    }
    let color = 0;
    while (usedColors.has(color)) color++;
    colors.set(node, color);
  }
  return colors;
}

export function getClusteringCoefficient<T>(graph: Map<T, T[]>, node: T): number {
  const neighbors = graph.get(node) ?? [];
  const k = neighbors.length;
  if (k < 2) return 0;
  let edges = 0;
  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      const neighborNeighbors = graph.get(neighbors[i]) ?? [];
      if (neighborNeighbors.includes(neighbors[j])) {
        edges++;
      }
    }
  }
  return (2 * edges) / (k * (k - 1));
}

export function getAverageClusteringCoefficient<T>(graph: Map<T, T[]>): number {
  let sum = 0;
  let count = 0;
  for (const node of graph.keys()) {
    sum += getClusteringCoefficient(graph, node);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export function getDegreeSequence<T>(graph: Map<T, T[]>): number[] {
  const degrees = getDegrees(graph);
  return [...degrees.values()].map((d) => d.outDegree).sort((a, b) => b - a);
}

export function getDegreeDistribution<T>(graph: Map<T, T[]>): Map<number, number> {
  const degrees = getDegrees(graph);
  const distribution = new Map<number, number>();
  for (const { outDegree } of degrees.values()) {
    distribution.set(outDegree, (distribution.get(outDegree) ?? 0) + 1);
  }
  return distribution;
}

export function getAssortativity<T>(graph: Map<T, T[]>): number {
  const degrees = getDegrees(graph);
  const edges: Array<[number, number]> = [];
  for (const [node, neighbors] of graph) {
    const nodeDegree = degrees.get(node)?.outDegree ?? 0;
    for (const neighbor of neighbors) {
      const neighborDegree = degrees.get(neighbor)?.outDegree ?? 0;
      edges.push([nodeDegree, neighborDegree]);
    }
  }
  if (edges.length === 0) return 0;
  const avgSource = edges.reduce((sum, [d]) => sum + d, 0) / edges.length;
  const avgTarget = edges.reduce((sum, [, d]) => sum + d, 0) / edges.length;
  let numerator = 0;
  let denominator = 0;
  for (const [ds, dt] of edges) {
    numerator += (ds - avgSource) * (dt - avgTarget);
    denominator += Math.pow(ds - avgSource, 2);
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function getBetweennessCentrality<T>(graph: Map<T, T[]>): Map<T, number> {
  const betweenness = new Map<T, number>();
  for (const node of graph.keys()) {
    betweenness.set(node, 0);
  }
  for (const source of graph.keys()) {
    const { distances, predecessors } = bfsShortestPaths(graph, source);
    const dependencies = new Map<T, number>();
    for (const node of graph.keys()) {
      dependencies.set(node, 0);
    }
    const sortedNodes = [...graph.keys()].sort((a, b) => (distances.get(b) ?? 0) - (distances.get(a) ?? 0));
    for (const node of sortedNodes) {
      if (node === source) continue;
      const preds = predecessors.get(node) ?? [];
      for (const pred of preds) {
        const dependency = (dependencies.get(node) ?? 0) / preds.length;
        dependencies.set(pred, (dependencies.get(pred) ?? 0) + dependency + 1);
      }
      betweenness.set(node, (betweenness.get(node) ?? 0) + (dependencies.get(node) ?? 0));
    }
  }
  return betweenness;
}

function bfsShortestPaths<T>(graph: Map<T, T[]>, source: T): { distances: Map<T, number>; predecessors: Map<T, T[]> } {
  const distances = new Map<T, number>([[source, 0]]);
  const predecessors = new Map<T, T[]>();
  const queue: T[] = [source];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, (distances.get(node) ?? 0) + 1);
        predecessors.set(neighbor, [node]);
        queue.push(neighbor);
      } else if (distances.get(neighbor) === (distances.get(node) ?? 0) + 1) {
        predecessors.get(neighbor)!.push(node);
      }
    }
  }
  return { distances, predecessors };
}

export function getClosenessCentrality<T>(graph: Map<T, Array<{ node: T; weight: number }>>): Map<T, number> {
  const closeness = new Map<T, number>();
  for (const node of graph.keys()) {
    const distances = dijkstra(graph, node);
    let totalDistance = 0;
    let reachable = 0;
    for (const [target, distance] of distances) {
      if (target !== node && distance !== Infinity) {
        totalDistance += distance;
        reachable++;
      }
    }
    closeness.set(node, reachable > 0 ? reachable / totalDistance : 0);
  }
  return closeness;
}

export function getEigenvectorCentrality<T>(graph: Map<T, T[]>, maxIterations: number = 100, tolerance: number = 1e-6): Map<T, number> {
  const centrality = new Map<T, number>();
  const nodes = [...graph.keys()];
  for (const node of nodes) {
    centrality.set(node, 1 / nodes.length);
  }
  for (let iter = 0; iter < maxIterations; iter++) {
    const newCentrality = new Map<T, number>();
    let maxCentrality = 0;
    for (const node of nodes) {
      let sum = 0;
      const neighbors = graph.get(node) ?? [];
      for (const neighbor of neighbors) {
        sum += centrality.get(neighbor) ?? 0;
      }
      newCentrality.set(node, sum);
      maxCentrality = Math.max(maxCentrality, sum);
    }
    if (maxCentrality > 0) {
      for (const node of nodes) {
        newCentrality.set(node, (newCentrality.get(node) ?? 0) / maxCentrality);
      }
    }
    let diff = 0;
    for (const node of nodes) {
      diff += Math.abs((newCentrality.get(node) ?? 0) - (centrality.get(node) ?? 0));
    }
    centrality.clear();
    for (const [node, value] of newCentrality) {
      centrality.set(node, value);
    }
    if (diff < tolerance) break;
  }
  return centrality;
}

export function getPageRank<T>(graph: Map<T, T[]>, dampingFactor: number = 0.85, maxIterations: number = 100, tolerance: number = 1e-6): Map<T, number> {
  const nodes = [...graph.keys()];
  const n = nodes.length;
  if (n === 0) return new Map();
  const pageRank = new Map<T, number>();
  for (const node of nodes) {
    pageRank.set(node, 1 / n);
  }
  for (let iter = 0; iter < maxIterations; iter++) {
    const newPageRank = new Map<T, number>();
    let danglingSum = 0;
    for (const node of nodes) {
      const neighbors = graph.get(node) ?? [];
      if (neighbors.length === 0) {
        danglingSum += pageRank.get(node) ?? 0;
      }
    }
    let maxDiff = 0;
    for (const node of nodes) {
      let sum = 0;
      for (const other of nodes) {
        const neighbors = graph.get(other) ?? [];
        if (neighbors.includes(node)) {
          sum += (pageRank.get(other) ?? 0) / neighbors.length;
        }
      }
      sum += danglingSum / n;
      const newRank = (1 - dampingFactor) / n + dampingFactor * sum;
      newPageRank.set(node, newRank);
      maxDiff = Math.max(maxDiff, Math.abs(newRank - (pageRank.get(node) ?? 0)));
    }
    pageRank.clear();
    for (const [node, value] of newPageRank) {
      pageRank.set(node, value);
    }
    if (maxDiff < tolerance) break;
  }
  return pageRank;
}

export function getHITS<T>(graph: Map<T, T[]>, maxIterations: number = 100, tolerance: number = 1e-6): { hubScores: Map<T, number>; authorityScores: Map<T, number> } {
  const nodes = [...graph.keys()];
  const hubScores = new Map<T, number>();
  const authorityScores = new Map<T, number>();
  for (const node of nodes) {
    hubScores.set(node, 1);
    authorityScores.set(node, 1);
  }
  for (let iter = 0; iter < maxIterations; iter++) {
    const newAuth = new Map<T, number>();
    const newHub = new Map<T, number>();
    for (const node of nodes) {
      newAuth.set(node, 0);
      newHub.set(node, 0);
    }
    for (const [node, neighbors] of graph) {
      for (const neighbor of neighbors) {
        newAuth.set(neighbor, (newAuth.get(neighbor) ?? 0) + (hubScores.get(node) ?? 0));
      }
    }
    for (const [node, neighbors] of graph) {
      for (const neighbor of neighbors) {
        newHub.set(node, (newHub.get(node) ?? 0) + (newAuth.get(neighbor) ?? 0));
      }
    }
    let maxAuth = 0;
    let maxHub = 0;
    for (const node of nodes) {
      maxAuth = Math.max(maxAuth, newAuth.get(node) ?? 0);
      maxHub = Math.max(maxHub, newHub.get(node) ?? 0);
    }
    if (maxAuth > 0) {
      for (const node of nodes) {
        newAuth.set(node, (newAuth.get(node) ?? 0) / maxAuth);
      }
    }
    if (maxHub > 0) {
      for (const node of nodes) {
        newHub.set(node, (newHub.get(node) ?? 0) / maxHub);
      }
    }
    let maxDiff = 0;
    for (const node of nodes) {
      maxDiff = Math.max(maxDiff, Math.abs((newHub.get(node) ?? 0) - (hubScores.get(node) ?? 0)));
      maxDiff = Math.max(maxDiff, Math.abs((newAuth.get(node) ?? 0) - (authorityScores.get(node) ?? 0)));
    }
    hubScores.clear();
    authorityScores.clear();
    for (const [node, value] of newHub) hubScores.set(node, value);
    for (const [node, value] of newAuth) authorityScores.set(node, value);
    if (maxDiff < tolerance) break;
  }
  return { hubScores, authorityScores };
}
