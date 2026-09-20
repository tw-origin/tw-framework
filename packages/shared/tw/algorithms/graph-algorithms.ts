/**
 * Graph algorithms -- BFS, DFS, Dijkstra, Bellman-Ford, Floyd-Warshall, A*, topological sort
 * @module shared/algorithms
 */

export class Graph {
  private adjacencyList: Map<string, Array<{ vertex: string; weight: number }>> = new Map();
  private directed: boolean;
  private weighted: boolean;

  constructor(directed: boolean = false, weighted: boolean = false) {
    this.directed = directed;
    this.weighted = weighted;
  }

  addVertex(vertex: string): this {
    if (!this.adjacencyList.has(vertex)) this.adjacencyList.set(vertex, []);
    return this;
  }
  addEdge(from: string, to: string, weight: number = 1): this {
    this.addVertex(from);
    this.addVertex(to);
    this.adjacencyList.get(from)!.push({ vertex: to, weight });
    if (!this.directed) this.adjacencyList.get(to)!.push({ vertex: from, weight });
    return this;
  }
  removeEdge(from: string, to: string): this {
    this.adjacencyList.set(from, (this.adjacencyList.get(from) ?? []).filter((e) => e.vertex !== to));
    if (!this.directed) this.adjacencyList.set(to, (this.adjacencyList.get(to) ?? []).filter((e) => e.vertex !== from));
    return this;
  }
  removeVertex(vertex: string): this {
    this.adjacencyList.delete(vertex);
    for (const [v, edges] of this.adjacencyList) this.adjacencyList.set(v, edges.filter((e) => e.vertex !== vertex));
    return this;
  }
  hasVertex(vertex: string): boolean { return this.adjacencyList.has(vertex); }
  hasEdge(from: string, to: string): boolean { return (this.adjacencyList.get(from) ?? []).some((e) => e.vertex === to); }
  getVertices(): string[] { return [...this.adjacencyList.keys()]; }
  getEdges(vertex: string): Array<{ vertex: string; weight: number }> { return [...(this.adjacencyList.get(vertex) ?? [])]; }
  getVertexCount(): number { return this.adjacencyList.size; }
  getEdgeCount(): number { let count = 0; for (const edges of this.adjacencyList.values()) count += edges.length; return this.directed ? count : count / 2; }
  isDirected(): boolean { return this.directed; }
  isWeighted(): boolean { return this.weighted; }
  getDegree(vertex: string): number { return this.adjacencyList.get(vertex)?.length ?? 0; }
  getNeighbors(vertex: string): string[] { return (this.adjacencyList.get(vertex) ?? []).map((e) => e.vertex); }
  getWeight(from: string, to: string): number { return (this.adjacencyList.get(from) ?? []).find((e) => e.vertex === to)?.weight ?? 0; }
  clear(): void { this.adjacencyList.clear(); }

  bfs(start: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [start];
    const result: string[] = [];
    visited.add(start);
    while (queue.length > 0) {
      const vertex = queue.shift()!;
      result.push(vertex);
      for (const neighbor of this.getNeighbors(vertex)) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    return result;
  }
  dfs(start: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const dfsHelper = (vertex: string) => {
      visited.add(vertex);
      result.push(vertex);
      for (const neighbor of this.getNeighbors(vertex)) {
        if (!visited.has(neighbor)) dfsHelper(neighbor);
      }
    };
    dfsHelper(start);
    return result;
  }
  dfsIterative(start: string): string[] {
    const visited = new Set<string>();
    const stack: string[] = [start];
    const result: string[] = [];
    while (stack.length > 0) {
      const vertex = stack.pop()!;
      if (!visited.has(vertex)) {
        visited.add(vertex);
        result.push(vertex);
        for (const neighbor of this.getNeighbors(vertex)) {
          if (!visited.has(neighbor)) stack.push(neighbor);
        }
      }
    }
    return result;
  }
  dijkstra(start: string): Map<string, number> {
    const distances = new Map<string, number>();
    const visited = new Set<string>();
    const pq: Array<{ vertex: string; distance: number }> = [];
    for (const vertex of this.getVertices()) distances.set(vertex, Infinity);
    distances.set(start, 0);
    pq.push({ vertex: start, distance: 0 });
    while (pq.length > 0) {
      pq.sort((a, b) => a.distance - b.distance);
      const { vertex } = pq.shift()!;
      if (visited.has(vertex)) continue;
      visited.add(vertex);
      for (const { vertex: neighbor, weight } of this.getEdges(vertex)) {
        if (visited.has(neighbor)) continue;
        const newDist = distances.get(vertex)! + weight;
        if (newDist < (distances.get(neighbor) ?? Infinity)) {
          distances.set(neighbor, newDist);
          pq.push({ vertex: neighbor, distance: newDist });
        }
      }
    }
    return distances;
  }
  bellmanFord(start: string): Map<string, number> | null {
    const distances = new Map<string, number>();
    for (const vertex of this.getVertices()) distances.set(vertex, Infinity);
    distances.set(start, 0);
    const vertices = this.getVertices();
    for (let i = 0; i < vertices.length - 1; i++) {
      for (const from of vertices) {
        for (const { vertex: to, weight } of this.getEdges(from)) {
          const newDist = distances.get(from)! + weight;
          if (newDist < (distances.get(to) ?? Infinity)) distances.set(to, newDist);
        }
      }
    }
    for (const from of vertices) {
      for (const { vertex: to, weight } of this.getEdges(from)) {
        if (distances.get(from)! + weight < (distances.get(to) ?? Infinity)) return null;
      }
    }
    return distances;
  }
  floydWarshall(): Map<string, Map<string, number>> {
    const dist = new Map<string, Map<string, number>>();
    const vertices = this.getVertices();
    for (const i of vertices) {
      dist.set(i, new Map());
      for (const j of vertices) dist.get(i)!.set(j, i === j ? 0 : Infinity);
    }
    for (const from of vertices) {
      for (const { vertex: to, weight } of this.getEdges(from)) {
        dist.get(from)!.set(to, weight);
      }
    }
    for (const k of vertices) {
      for (const i of vertices) {
        for (const j of vertices) {
          const through = dist.get(i)!.get(k)! + dist.get(k)!.get(j)!;
          if (through < dist.get(i)!.get(j)!) dist.get(i)!.set(j, through);
        }
      }
    }
    return dist;
  }
  topologicalSort(): string[] {
    if (!this.directed) return [];
    const inDegree = new Map<string, number>();
    for (const vertex of this.getVertices()) inDegree.set(vertex, 0);
    for (const from of this.getVertices()) {
      for (const { vertex: to } of this.getEdges(from)) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
    const queue: string[] = [];
    for (const [vertex, degree] of inDegree) if (degree === 0) queue.push(vertex);
    const result: string[] = [];
    while (queue.length > 0) {
      const vertex = queue.shift()!;
      result.push(vertex);
      for (const { vertex: neighbor } of this.getEdges(vertex)) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
        if (inDegree.get(neighbor) === 0) queue.push(neighbor);
      }
    }
    return result;
  }
  hasCycle(): boolean {
    if (!this.directed) return this.hasUndirectedCycle();
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const hasCycleHelper = (vertex: string): boolean => {
      visited.add(vertex);
      recStack.add(vertex);
      for (const neighbor of this.getNeighbors(vertex)) {
        if (!visited.has(neighbor)) { if (hasCycleHelper(neighbor)) return true; }
        else if (recStack.has(neighbor)) return true;
      }
      recStack.delete(vertex);
      return false;
    };
    for (const vertex of this.getVertices()) {
      if (!visited.has(vertex)) if (hasCycleHelper(vertex)) return true;
    }
    return false;
  }
  private hasUndirectedCycle(): boolean {
    const visited = new Set<string>();
    const hasCycleHelper = (vertex: string, parent: string | null): boolean => {
      visited.add(vertex);
      for (const neighbor of this.getNeighbors(vertex)) {
        if (!visited.has(neighbor)) { if (hasCycleHelper(neighbor, vertex)) return true; }
        else if (neighbor !== parent) return true;
      }
      return false;
    };
    for (const vertex of this.getVertices()) {
      if (!visited.has(vertex)) if (hasCycleHelper(vertex, null)) return true;
    }
    return false;
  }
  isConnected(): boolean {
    const vertices = this.getVertices();
    if (vertices.length === 0) return true;
    const visited = new Set(this.bfs(vertices[0]));
    return visited.size === vertices.length;
  }
  shortestPath(start: string, end: string): string[] | null {
    const distances = this.dijkstra(start);
    if (distances.get(end) === Infinity) return null;
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();
    const pq: Array<{ vertex: string; distance: number }> = [{ vertex: start, distance: 0 }];
    for (const vertex of this.getVertices()) previous.set(vertex, null);
    while (pq.length > 0) {
      pq.sort((a, b) => a.distance - b.distance);
      const { vertex } = pq.shift()!;
      if (vertex === end) break;
      if (visited.has(vertex)) continue;
      visited.add(vertex);
      for (const { vertex: neighbor, weight } of this.getEdges(vertex)) {
        if (visited.has(neighbor)) continue;
        const newDist = distances.get(vertex)! + weight;
        if (newDist < (distances.get(neighbor) ?? Infinity)) {
          distances.set(neighbor, newDist);
          previous.set(neighbor, vertex);
          pq.push({ vertex: neighbor, distance: newDist });
        }
      }
    }
    const path: string[] = [];
    let current: string | null = end;
    while (current) { path.unshift(current); current = previous.get(current) ?? null; }
    return path[0] === start ? path : null;
  }
  toJSON(): string {
    const obj: Record<string, Array<{ vertex: string; weight: number }>> = {};
    for (const [vertex, edges] of this.adjacencyList) obj[vertex] = edges;
    return JSON.stringify(obj, null, 2);
  }
}

export function createGraph(directed?: boolean, weighted?: boolean): Graph {
  return new Graph(directed, weighted);
}

