/**
 * In-memory data for the sample app. `.server.ts` marks this module as
 * server-only: importing it from client code fails the build, so it can only be
 * read inside server blocks, `.twm` routes and other server modules.
 */

export interface User {
  id: string;
  name: string;
  password: string;
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
  body: string;
}

export interface Doc {
  slug: string;
  title: string;
  body: string;
}

const users: User[] = [
  { id: "alice", name: "Alice", password: "alice-pw" },
  { id: "bob", name: "Bob", password: "bob-pw" },
];

const posts: Post[] = [
  { id: "1", authorId: "alice", title: "Alice: hello", body: "First post from Alice." },
  { id: "2", authorId: "alice", title: "Alice: again", body: "Alice writes once more." },
  { id: "3", authorId: "bob", title: "Bob: hi", body: "Bob says hello." },
];

const docs: Doc[] = [
  { slug: "intro", title: "Introduction", body: "What server blocks are for." },
  { slug: "setup", title: "Setup", body: "Turning on experimental.serverBlocks." },
];

export function verifyCredentials(name: string, password: string): User | null {
  const wanted = name.trim().toLowerCase();
  const user = users.find((u) => u.id.toLowerCase() === wanted || u.name.toLowerCase() === wanted);
  return user && user.password === password ? user : null;
}

export function getUser(id: string): User | null {
  return users.find((u) => u.id === id) ?? null;
}

export function allPosts(): Post[] {
  return posts;
}

export function postsByAuthor(authorId: string): Post[] {
  return posts.filter((p) => p.authorId === authorId);
}

export function docsBySlug(slug: string): Doc | null {
  return docs.find((d) => d.slug === slug) ?? null;
}

export function listDocs(): Doc[] {
  return docs;
}
