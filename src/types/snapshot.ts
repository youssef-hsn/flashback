export type Snapshot = {
  id: number;
  content: string;
  anchor_date: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  metadata: Record<string, any>;
};