export interface AdditionalContact {
  id: string;
  fio: string;
  position: string;
  phone: string;
  email: string;
}

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  inn: string;
  kpp: string;
  ogrn: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankDetails: string;
  comment: string;
  images: string[]; // base64 data URLs
  status: 'active' | 'archived';
  additionalContacts: AdditionalContact[];
  createdAt: string;
}

export type ActivityType = 'call' | 'meeting' | 'email' | 'payment' | 'documents' | 'other';
export type ActivityStatus = 'planned' | 'done' | 'archived';

export interface Activity {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM or empty
  type: ActivityType;
  subject: string;
  comment: string;
  images: string[]; // base64 data URLs
  status: ActivityStatus;
  createdAt: string;
  postponedUntil?: string; // ISO timestamp
}

export interface CRMData {
  clients: Client[];
  activities: Activity[];
}

export type TabType = 'clients' | 'activities' | 'dashboard';
export type ActivityFilter = 'all' | 'today' | 'overdue' | 'pending' | 'done';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: '📞 Звонок',
  meeting: '🤝 Встреча',
  email: '✉️ Письмо',
  payment: '💰 Оплата',
  documents: '📄 Документы',
  other: '📌 Другое',
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  planned: 'В плане',
  done: 'Выполнено',
  archived: 'Архив',
};
