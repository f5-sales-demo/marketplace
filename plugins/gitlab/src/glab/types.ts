export interface GlabLabel {
  name: string;
  color: string;
}

export interface GlabUser {
  username: string;
  name: string;
}

export interface GlabMilestone {
  title: string;
  iid: number;
}

export interface GlabNote {
  id: number;
  body: string;
  author: GlabUser;
  created_at: string;
  updated_at: string;
  system: boolean;
}

export interface GlabIssue {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: 'opened' | 'closed';
  labels: string[];
  assignees: GlabUser[];
  author: GlabUser;
  milestone: GlabMilestone | null;
  created_at: string;
  updated_at: string;
  web_url: string;
  references: { full: string };
  issue_type: string;
  notes?: GlabNote[];
}

export interface GlabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path_with_namespace: string;
  web_url: string;
  description: string | null;
}

export interface GlabConfig {
  project?: string;
  hostname: string;
  defaultState: 'opened' | 'closed' | 'all';
  perPage: number;
}

export interface GraphQLIssueNode {
  iid: string;
  title: string;
  state: string;
  labels: { nodes: Array<{ title: string }> };
  assignees: { nodes: Array<{ username: string }> };
  updatedAt: string;
  notes: {
    nodes: Array<{
      body: string;
      author: { username: string };
      createdAt: string;
    }>;
  };
}

export interface GraphQLSearchResponse {
  data?: {
    project?: {
      issues?: {
        nodes: GraphQLIssueNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}
