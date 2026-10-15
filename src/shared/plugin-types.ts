export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  installedAt: number;
  skills: { name: string; description: string; directory: string }[];
  dotIds: string[];
}
