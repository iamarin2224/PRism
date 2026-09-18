export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export type FindingCategory =
  | 'security'
  | 'correctness'
  | 'performance'
  | 'error_handling'
  | 'code_quality';

export interface Finding {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  line?: number | null;
}

export interface ReviewResponse {
  findings: Finding[];
}

export interface RepositoryInfo {
  name?: string;
  fullName?: string;
  owner?: string;
  htmlUrl?: string;
}

export interface PullRequestInfo {
  number?: number;
  title?: string;
  htmlUrl?: string;
  state?: string;
  sourceBranch?: string;
  sourceSha?: string;
  targetBranch?: string;
  targetSha?: string;
  author?: string;
}

export interface PREventPayload {
  deliveryId: string | null;
  event: string;
  action: string;
  repository: RepositoryInfo;
  pullRequest: PullRequestInfo;
  sender: string | null;
  installationId: number | null;
}
