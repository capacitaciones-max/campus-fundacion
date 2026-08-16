
export interface LearningModule {
  id: string;
  title: string;
  order: number;
  icon?: string;
}

export type FileType = 'pdf' | 'presentation' | 'video' | 'image' | 'other';

export interface ModuleFile {
  id: string;
  moduleId: string;
  name: string;
  url: string;
  type: FileType;
  uploadedAt: string;
  size?: number;
  mimeType?: string;
  isChunked?: boolean;
  totalChunks?: number;
  isExternalLink?: boolean;
}

export interface ForumPost {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface AccessRequest {
  email: string;
  name?: string;
  photoURL?: string;
  requestedAt?: any;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface Student {
  email: string;
  name?: string;
  addedAt?: any;
  addedBy?: string;
}

export interface Teacher {
  email: string;
  name?: string;
  isPrimaryAdmin?: boolean;
  addedAt?: any;
  addedBy?: string;
}
