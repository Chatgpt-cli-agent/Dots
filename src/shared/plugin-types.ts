import type { ConnectionTool } from './connection-types.js';

export interface PluginServiceDeclaration {
  name: string;
  url: string;
  description?: string;
  requiresToken?: boolean;
}

export interface InstalledPluginToolService {
  name: string;
  url: string;
  description?: string;
  hasToken: boolean;
  requiresToken?: boolean;
  enabled: boolean;
  tools: ConnectionTool[];
  error: string | null;
  updatedAt: number;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  installedAt: number;
  skills: { name: string; description: string; directory: string }[];
  dotIds: string[];
  services: InstalledPluginToolService[];
  packageFingerprint?: string;
}

export interface PluginPreview {
  name: string;
  version: string;
  description: string;
  skills: { name: string; description: string }[];
  services: {
    name: string;
    url: string;
    description?: string;
    requiresToken?: boolean;
  }[];
  requiredConfiguration: string[];
  isUpdate: boolean;
  existingVersion?: string;
  packageFingerprint: string;
}

