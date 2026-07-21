// GNode: A knowledge note (file) in the vault
export interface GNode {
  id: string;
  title: string;
  pillar: string;
  tags?: string[];
  words: number;
  in: number;
  out: number;
  phantom?: boolean;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GLink {
  source: string | GNode;
  target: string | GNode;
  weight: number;
  /** true for semantic (mutual-KNN) edges, false/absent for structural links */
  __sem?: boolean;
}
