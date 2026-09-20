/** Merkle tree construction and proof verification. */

import { sha256Async } from "./sha";


export interface MerkleNode {
  hash: string;
  left: MerkleNode | null;
  right: MerkleNode | null;
  data: string | null;
}

export async function buildMerkleTree(
  leaves: string[],
  hashFn: (d: string) => Promise<string> = sha256Async,
): Promise<MerkleNode> {
  if (leaves.length === 0) {
    const emptyHash = await hashFn("");
    return { hash: emptyHash, left: null, right: null, data: null };
  }

  let nodes: MerkleNode[] = await Promise.all(
    leaves.map(async (leaf) => ({
      hash: await hashFn(leaf),
      left: null,
      right: null,
      data: leaf,
    })),
  );

  while (nodes.length > 1) {
    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = i + 1 < nodes.length ? nodes[i + 1] : left;

      const combinedHash = await hashFn(left.hash + right.hash);
      nextLevel.push({
        hash: combinedHash,
        left,
        right: right === left ? null : right,
        data: null,
      });
    }

    nodes = nextLevel;
  }

  return nodes[0];
}

export async function verifyMerkleProof(
  leaf: string,
  proof: { hash: string; direction: "left" | "right" }[],
  rootHash: string,
  hashFn: (d: string) => Promise<string> = sha256Async,
): Promise<boolean> {
  let currentHash = await hashFn(leaf);

  for (const step of proof) {
    if (step.direction === "left") {
      currentHash = await hashFn(step.hash + currentHash);
    } else {
      currentHash = await hashFn(currentHash + step.hash);
    }
  }

  return currentHash === rootHash;
}

