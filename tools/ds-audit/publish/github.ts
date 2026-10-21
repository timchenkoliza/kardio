import { COMMENT_MARKER, STATUS_CONTEXT } from "../config";

/**
 * Minimal GitHub REST client on fetch with the workflow's GITHUB_TOKEN.
 * The token is read from the environment and never logged.
 */
export class GitHub {
  constructor(private readonly repo: string, private readonly token: string, private readonly api = process.env.GITHUB_API_URL ?? "https://api.github.com") {}

  static fromEnv(): GitHub {
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required for publishing");
    return new GitHub(repo, token);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.api}/repos/${this.repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    return (response.status === 204 ? null : await response.json()) as T;
  }

  /** Open PRs whose head is exactly this commit. */
  async pullsForCommit(sha: string): Promise<Array<{ number: number; state: string; head: { sha: string; repo: { full_name: string } | null }; base: { ref: string; repo: { full_name: string } } }>> {
    return this.request("GET", `/commits/${sha}/pulls`);
  }

  async mergeBase(base: string, head: string): Promise<string> {
    const compare = await this.request<{ merge_base_commit: { sha: string } }>("GET", `/compare/${encodeURIComponent(base)}...${head}`);
    return compare.merge_base_commit.sha;
  }

  async setStatus(sha: string, state: "pending" | "success" | "failure" | "error", description: string, targetUrl: string | null) {
    await this.request("POST", `/statuses/${sha}`, { state, context: STATUS_CONTEXT, description: description.slice(0, 140), ...(targetUrl ? { target_url: targetUrl } : {}) });
  }

  /** One comment per PR, found by its marker and updated in place. */
  async upsertComment(pr: number, body: string) {
    for (let page = 1; page <= 10; page++) {
      const comments = await this.request<Array<{ id: number; body: string }>>("GET", `/issues/${pr}/comments?per_page=100&page=${page}`);
      const mine = comments.find(comment => comment.body.includes(COMMENT_MARKER));
      if (mine) return this.request("PATCH", `/issues/comments/${mine.id}`, { body });
      if (comments.length < 100) break;
    }
    return this.request("POST", `/issues/${pr}/comments`, { body });
  }
}
