"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { github } from "@/lib/integrations/github/github-client";

/** GitHub tools, read/search are pre-approved; writes (create issue / comment)
 *  always ask. Backed by GitHubClient over the OAuth proxy. */

export const githubTools: Tool[] = [
  defineTool({
    name: "github_list_issues",
    description:
      "List issues in a GitHub repository. Returns issue number, title, state, author, URL, and labels.",
    parameterSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or org)." },
        repo: { type: "string", description: "Repository name." },
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Filter by issue state (default open).",
        },
        perPage: {
          type: "integer",
          description: "Results per page, 1–100 (default 30).",
        },
      },
      required: ["owner", "repo"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const owner = String(args.owner ?? "");
        const repo = String(args.repo ?? "");
        const state = (args.state as "open" | "closed" | "all" | undefined) ?? "open";
        const perPage = Math.min(100, Math.max(1, Number(args.perPage ?? 30)));
        const issues = await github.listIssues({ owner, repo, state, perPage });
        return { count: issues.length, issues };
      } catch (e) {
        return { error: "github_list_issues_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "github_create_issue",
    description:
      "Create a new issue in a GitHub repository. Returns the new issue number and URL.",
    parameterSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or org)." },
        repo: { type: "string", description: "Repository name." },
        title: { type: "string", description: "Issue title." },
        body: { type: "string", description: "Issue body (Markdown)." },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Label names to apply.",
        },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "GitHub usernames to assign.",
        },
      },
      required: ["owner", "repo", "title"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const owner = String(args.owner ?? "");
        const repo = String(args.repo ?? "");
        const title = String(args.title ?? "");
        const body = args.body != null ? String(args.body) : undefined;
        const labels = Array.isArray(args.labels) ? args.labels.map(String) : undefined;
        const assignees = Array.isArray(args.assignees) ? args.assignees.map(String) : undefined;
        const res = await github.createIssue({ owner, repo, title, body, labels, assignees });
        return { number: res.number, url: res.html_url };
      } catch (e) {
        return { error: "github_create_issue_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "github_search_code",
    description:
      "Search code across GitHub. Supports qualifiers like language:, repo:, and path: (e.g. \"addEventListener language:js repo:owner/name path:src\"). Returns matching files with name, path, repository, and URL.",
    parameterSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Code search query, optionally with qualifiers." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const query = String(args.query ?? "").trim();
        if (!query) return { error: "empty_query", message: "query is required" };
        const res = await github.searchCode(query);
        return { total: res.total_count, items: res.items };
      } catch (e) {
        return { error: "github_search_code_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "github_search_issues",
    description:
      "Search issues and pull requests across GitHub using the issues search syntax (e.g. \"is:open is:issue assignee:@me\"). Returns matching items with number, title, state, and URL.",
    parameterSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Issue search query." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const query = String(args.query ?? "").trim();
        if (!query) return { error: "empty_query", message: "query is required" };
        const res = await github.searchIssues(query);
        return { total: res.total_count, items: res.items };
      } catch (e) {
        return { error: "github_search_issues_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "github_get_pr",
    description: "Get details for a pull request by number in a GitHub repository.",
    parameterSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or org)." },
        repo: { type: "string", description: "Repository name." },
        number: { type: "integer", description: "Pull request number." },
      },
      required: ["owner", "repo", "number"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const owner = String(args.owner ?? "");
        const repo = String(args.repo ?? "");
        const number = Number(args.number);
        const pr = await github.getPr({ owner, repo, number });
        return { pr } as Record<string, unknown>;
      } catch (e) {
        return { error: "github_get_pr_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "github_list_notifications",
    description:
      "List the authenticated user's GitHub notifications. Returns reason, unread status, subject title/type, and repository.",
    parameterSchema: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description: "Include read notifications too (default false).",
        },
      },
      required: [],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const all = Boolean(args.all ?? false);
        const notifications = await github.listNotifications({ all });
        return { count: notifications.length, notifications };
      } catch (e) {
        return { error: "github_list_notifications_failed", message: String(e) };
      }
    },
  }),
  defineTool({
    name: "github_create_comment",
    description:
      "Add a comment to an issue or pull request in a GitHub repository. Returns the comment id and URL.",
    parameterSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or org)." },
        repo: { type: "string", description: "Repository name." },
        issueNumber: { type: "integer", description: "Issue or PR number." },
        body: { type: "string", description: "Comment body (Markdown)." },
      },
      required: ["owner", "repo", "issueNumber", "body"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: "github",
    group: "GitHub",
    invoke: async (args) => {
      try {
        const owner = String(args.owner ?? "");
        const repo = String(args.repo ?? "");
        const issueNumber = Number(args.issueNumber);
        const body = String(args.body ?? "");
        const res = await github.createComment({ owner, repo, issueNumber, body });
        return { id: res.id, url: res.html_url };
      } catch (e) {
        return { error: "github_create_comment_failed", message: String(e) };
      }
    },
  }),
];
