"use client";

import { authedFetch } from "@/lib/integrations/oauth-client";

/** GitHub REST client over the integration proxy. Uses authedFetch("github", …)
 *  so the user's OAuth token is attached server-side per request. */

const BASE = "https://api.github.com";
const ACCEPT = "application/vnd.github+json";

export interface ListIssuesArgs {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  perPage?: number;
}

export interface CreateIssueArgs {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface CreateCommentArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export interface GetPrArgs {
  owner: string;
  repo: string;
  number: number;
}

export interface ListNotificationsArgs {
  all?: boolean;
}

interface RawLabel {
  name?: string;
}

interface RawUser {
  login?: string;
}

interface RawIssue {
  number?: number;
  title?: string;
  state?: string;
  user?: RawUser;
  html_url?: string;
  labels?: RawLabel[];
}

interface RawCodeItem {
  name?: string;
  path?: string;
  repository?: { full_name?: string };
  html_url?: string;
}

interface RawSearchIssue {
  number?: number;
  title?: string;
  state?: string;
  html_url?: string;
  repository_url?: string;
}

interface RawNotification {
  id?: string;
  reason?: string;
  unread?: boolean;
  subject?: { title?: string; type?: string; url?: string };
  repository?: { full_name?: string };
}

export class GitHubClient {
  private async get<T = unknown>(path: string): Promise<T> {
    const res = await authedFetch("github", {
      url: `${BASE}${path}`,
      headers: { accept: ACCEPT },
    });
    return res.json<T>();
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await authedFetch("github", {
      url: `${BASE}${path}`,
      method: "POST",
      headers: { accept: ACCEPT, "content-type": "application/json" },
      body,
    });
    return res.json<T>();
  }

  async listIssues({ owner, repo, state = "open", perPage = 30 }: ListIssuesArgs) {
    const data = await this.get<RawIssue[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(
        state,
      )}&per_page=${perPage}`,
    );
    const issues = (Array.isArray(data) ? data : []).map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      user: i.user?.login,
      html_url: i.html_url,
      labels: (i.labels ?? []).map((l) => l.name).filter((n): n is string => Boolean(n)),
    }));
    return issues;
  }

  async createIssue({ owner, repo, title, body, labels, assignees }: CreateIssueArgs) {
    const payload: Record<string, unknown> = { title };
    if (body != null) payload.body = body;
    if (labels != null) payload.labels = labels;
    if (assignees != null) payload.assignees = assignees;
    const data = await this.post<RawIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      payload,
    );
    return { number: data.number, html_url: data.html_url };
  }

  async searchCode(query: string) {
    const data = await this.get<{ total_count?: number; items?: RawCodeItem[] }>(
      `/search/code?q=${encodeURIComponent(query)}`,
    );
    return {
      total_count: data.total_count ?? 0,
      items: (data.items ?? []).map((it) => ({
        name: it.name,
        path: it.path,
        repository: { full_name: it.repository?.full_name },
        html_url: it.html_url,
      })),
    };
  }

  async searchIssues(query: string) {
    const data = await this.get<{ total_count?: number; items?: RawSearchIssue[] }>(
      `/search/issues?q=${encodeURIComponent(query)}`,
    );
    return {
      total_count: data.total_count ?? 0,
      items: (data.items ?? []).map((it) => ({
        number: it.number,
        title: it.title,
        state: it.state,
        html_url: it.html_url,
        repository_url: it.repository_url,
      })),
    };
  }

  async getPr({ owner, repo, number }: GetPrArgs) {
    return this.get(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
    );
  }

  async listNotifications({ all = false }: ListNotificationsArgs = {}) {
    const data = await this.get<RawNotification[]>(`/notifications?all=${all}`);
    return (Array.isArray(data) ? data : []).map((n) => ({
      id: n.id,
      reason: n.reason,
      unread: n.unread,
      title: n.subject?.title,
      type: n.subject?.type,
      url: n.subject?.url,
      repository: n.repository?.full_name,
    }));
  }

  async createComment({ owner, repo, issueNumber, body }: CreateCommentArgs) {
    const data = await this.post<{ id?: number; html_url?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
      { body },
    );
    return { id: data.id, html_url: data.html_url };
  }
}

export const github = new GitHubClient();
