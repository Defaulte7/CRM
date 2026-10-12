import { CRMData, Client, Activity, AdditionalContact, normalizeFolderLink } from '../types';

const BOM = '\uFEFF';

// =================== СЕКЦИИ CSV ===================
// Формат: ### КЛИЕНТЫ / ### АКТИВНОСТИ / ### ИЗОБРАЖЕНИЯ
// Кодировка UTF-8 с BOM, разделитель ';' — открывается в Excel двойным щелчком.

export function serializeToCSV(data: CRMData): string {
  // Собираем реестр изображений: id -> { ownerId, dataUrl }
  const imageRegistry: { id: string; owner: string; data: string }[] = [];
  const registerImages = (ownerId: string, images: string[]) => {
    for (const img of images || []) {
      if (!img) continue;
      let id = imgIds.get(img);
      if (!id) {
        id = 'img' + (imageRegistry.length + 1) + '_' + Math.random().toString(36).slice(2, 8);
        imgIds.set(img, id);
        imageRegistry.push({ id, owner: ownerId, data: img });
      }
    }
  };
  const imgIds = new Map<string, string>();

  const clientImgRefs = new Map<string, string>();
  for (const c of data.clients) {
    const before = imageRegistry.length;
    registerImages(c.id, c.images);
    const refs = imageRegistry.slice(before).map(r => r.id).join(',');
    clientImgRefs.set(c.id, refs);
  }

  const actImgRefs = new Map<string, string>();
  for (const a of data.activities) {
    const before = imageRegistry.length;
    registerImages(a.id, a.images);
    const refs = imageRegistry.slice(before).map(r => r.id).join(',');
    actImgRefs.set(a.id, refs);
  }

  let csv = BOM;
  csv += '### КЛИЕНТЫ\n';
  csv += 'ID;Наименование;Контакт;ИНН;КПП;ОГРН;Телефон;E-mail;Адрес;Сайт;Банковские реквизиты;Комментарий;Ссылка на папку;Статус;Доп.контакты;Изображения;Дата создания;Дата изменения\n';

  for (const c of data.clients) {
    const contacts = (c.additionalContacts || []).map(ac =>
      `${ac.fio}|${ac.position}|${ac.phone}|${ac.email}`
    ).join('||');

    csv += [
      escapeCSV(c.id),
      escapeCSV(c.name),
      escapeCSV(c.contactPerson),
      escapeCSV(c.inn),
      escapeCSV(c.kpp),
      escapeCSV(c.ogrn),
      escapeCSV(c.phone),
      escapeCSV(c.email),
      escapeCSV(c.address),
      escapeCSV(c.website),
      escapeCSV(c.bankDetails),
      escapeCSV(c.comment),
      escapeCSV(normalizeFolderLink(c.folderLink || '')),
      escapeCSV(c.status),
      escapeCSV(contacts),
      escapeCSV(clientImgRefs.get(c.id) || ''),
      escapeCSV(c.createdAt),
      escapeCSV(c.updatedAt || c.createdAt),
    ].join(';') + '\n';
  }

  csv += '\n### АКТИВНОСТИ\n';
  csv += 'ID;КлиентID;Дата;Время;Тип;Тема;Комментарий;Ссылка на папку;Статус;Отложено до;Изображения;Дата создания;Дата изменения\n';

  for (const a of data.activities) {
    csv += [
      escapeCSV(a.id),
      escapeCSV(a.clientId),
      escapeCSV(a.date),
      escapeCSV(a.time),
      escapeCSV(a.type),
      escapeCSV(a.subject),
      escapeCSV(a.comment),
      escapeCSV(normalizeFolderLink(a.folderLink || '')),
      escapeCSV(a.status),
      escapeCSV(a.postponedUntil || ''),
      escapeCSV(actImgRefs.get(a.id) || ''),
      escapeCSV(a.createdAt),
      escapeCSV(a.updatedAt || a.createdAt),
    ].join(';') + '\n';
  }

  csv += '\n### ИЗОБРАЖЕНИЯ\n';
  csv += 'ID;Владелец;Данные\n';
  for (const img of imageRegistry) {
    csv += escapeCSV(img.id) + ';' + escapeCSV(img.owner) + ';' + escapeCSV(img.data) + '\n';
  }

  return csv;
}

function escapeCSV(val: string): string {
  if (val === undefined || val === null) return '';
  const s = String(val);
  if (!s) return '';
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function unescapeCSVField(raw: string): string {
  let val = raw;
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1).replace(/""/g, '"');
  }
  return val;
}

/**
 * Парсер CSV-базы. Разбирает текст построчно, но поля, заключённые в кавычки,
 * могут содержать переводы строк (многострочные комментарии и base64 из Excel).
 */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ';') { endField(); i++; continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; endRecord(); i++; continue; }
    if (ch === '\n') { endRecord(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

export function parseCSV(text: string): CRMData {
  const clients: Client[] = [];
  const activities: Activity[] = [];
  const images: { id: string; owner: string; data: string }[] = [];

  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const records = parseRecords(text);
  let section: 'none' | 'clients' | 'activities' | 'images' = 'none';

  for (const rec of records) {
    // служебные пустые строки
    if (rec.length === 1 && rec[0].trim() === '') continue;

    const firstTrimmed = (rec[0] || '').trim();

    if (firstTrimmed === '### КЛИЕНТЫ') { section = 'clients'; continue; }
    if (firstTrimmed === '### АКТИВНОСТИ') { section = 'activities'; continue; }
    if (firstTrimmed === '### ИЗОБРАЖЕНИЯ') { section = 'images'; continue; }
    // строки заголовков секций
    if (firstTrimmed === 'ID' && section !== 'none') continue;

    const fields = rec.map(unescapeCSVField);

    if (section === 'clients' && fields.length >= 2) {
      const contactsStr = fields[14] || '';
      const additionalContacts: AdditionalContact[] = [];
      if (contactsStr) {
        for (const part of contactsStr.split('||')) {
          const [fio, position, phone, email] = part.split('|');
          if (fio) {
            additionalContacts.push({
              id: generateId(), fio: fio || '', position: position || '', phone: phone || '', email: email || '',
            });
          }
        }
      }
      const client: Client = {
        id: fields[0] || generateId(),
        name: fields[1] || '',
        contactPerson: fields[2] || '',
        inn: fields[3] || '',
        kpp: fields[4] || '',
        ogrn: fields[5] || '',
        phone: fields[6] || '',
        email: fields[7] || '',
        address: fields[8] || '',
        website: fields[9] || '',
        bankDetails: fields[10] || '',
        comment: fields[11] || '',
        folderLink: fields[12] || '',
        status: ((fields[13] === 'archived' ? 'archived' : 'active') as 'active' | 'archived'),
        additionalContacts,
        images: [],
        createdAt: fields[16] || new Date().toISOString(),
        updatedAt: fields[17] || fields[16] || new Date().toISOString(),
      };
      clients.push(client);
    }

    if (section === 'activities' && fields.length >= 2) {
      const activity: Activity = {
        id: fields[0] || generateId(),
        clientId: fields[1] || '',
        date: fields[2] || '',
        time: fields[3] || '',
        type: (['call', 'meeting', 'email', 'payment', 'documents', 'other'].includes(fields[4]) ? fields[4] : 'call') as Activity['type'],
        subject: fields[5] || '',
        comment: fields[6] || '',
        folderLink: fields[7] || '',
        status: (['planned', 'done', 'archived'].includes(fields[8]) ? fields[8] : 'planned') as Activity['status'],
        postponedUntil: fields[9] || undefined,
        images: [],
        createdAt: fields[11] || new Date().toISOString(),
        updatedAt: fields[12] || fields[11] || new Date().toISOString(),
      };
      activities.push(activity);
    }

    if (section === 'images' && fields.length >= 3) {
      images.push({ id: fields[0], owner: fields[1], data: fields[2] });
    }
  }

  // Сопоставление изображений с владельцами по ID (поле ID — служебное)
  const byOwner = new Map<string, string[]>();
  for (const img of images) {
    if (!img.id || !img.data) continue;
    const list = byOwner.get(img.owner) || [];
    list.push(img.data);
    byOwner.set(img.owner, list);
  }
  for (const c of clients) c.images = byOwner.get(c.id) || [];
  for (const a of activities) a.images = byOwner.get(a.id) || [];

  return { clients, activities };
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
