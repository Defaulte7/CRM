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
  folderLink: string; // ссылка на папку (нормализуется в file:///... при сохранении)
  images: string[]; // base64 data URLs
  status: 'active' | 'archived';
  additionalContacts: AdditionalContact[];
  createdAt: string;
  updatedAt: string;
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
  folderLink: string; // ссылка на папку (нормализуется в file:///... при сохранении)
  images: string[]; // base64 data URLs
  status: ActivityStatus;
  createdAt: string;
  updatedAt: string;
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

/**
 * Нормализация ссылки на папку в корректный file:///... URL.
 * Поддерживаемые форматы входа:
 *  - локальный путь:      C:\Клиенты\Иванов  или  D:/Клиенты/Иванов
 *  - сетевая папка (UNC): \\server\share\Папка
 *  - протокол:            file:///C:/Путь/К/Папке
 *  - веб-ссылка:          https://... (остаётся как есть)
 */
export function normalizeFolderLink(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  if (!s) return '';
  // Веб-ссылки не трогаем
  if (/^https?:\/\//i.test(s)) return s;
  // Уже file:// — канонизируем обратные слеши
  if (/^file:\/\/\//i.test(s)) return s.replace(/\\/g, '/');
  // UNC \\server\share\... -> file://server/share/...
  if (s.startsWith('\\\\')) {
    s = 'file:///' + s.replace(/^\\+/, '').replace(/\\/g, '/');
    return encodeFolderPath(s);
  }
  // Локальный путь вида C:\... или C:/...
  if (/^[A-Za-z]:[\\/]/.test(s)) {
    s = 'file:///' + s.replace(/\\/g, '/');
    return encodeFolderPath(s);
  }
  // Прочее (относительный путь) — тоже пробуем как file:///
  s = 'file:///' + s.replace(/\\/g, '/').replace(/^\/+/, '');
  return encodeFolderPath(s);
}

// Кодируем пробелы и спецсимволы в путях file:// (в т.ч. кириллицу)
function encodeFolderPath(url: string): string {
  try {
    return encodeURI(decodeURI(url));
  } catch {
    try {
      return encodeURI(url);
    } catch {
      return url;
    }
  }
}

// Обратное преобразование file:/// URL в человекочитаемый путь для отображения
export function folderLinkToDisplay(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  let s = url;
  try { s = decodeURIComponent(s); } catch { /* keep as is */ }
  if (/^file:\/\/\//i.test(s)) {
    s = s.replace(/^file:\/\/\//i, '');
    if (/^[A-Za-z]\//.test(s)) s = s.slice(0, 1) + ':' + s.slice(1); // C/... -> C:/...
    s = s.replace(/\//g, '\\');
  } else if (/^file:\/\//i.test(s)) {
    s = s.replace(/^file:\/\//i, '\\\\');
    s = s.replace(/\//g, '\\');
  }
  return s;
}
