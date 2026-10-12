import { CRMData, Client, Activity, AdditionalContact } from '../types';

const BOM = '\uFEFF';

function escapeCSV(val: string): string {
  if (!val) return '';
  if (val.includes(';') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function parseCSVField(val: string): string {
  if (!val) return '';
  val = val.trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1).replace(/""/g, '"');
  }
  return val;
}

export function serializeToCSV(data: CRMData): string {
  let csv = BOM;
  csv += '### КЛИЕНТЫ\n';
  csv += 'ID;Наименование;Контакт;ИНН;КПП;ОГРН;Телефон;E-mail;Адрес;Сайт;Банковские реквизиты;Комментарий;Статус;Доп.контакты;Дата создания\n';
  
  for (const c of data.clients) {
    const contacts = c.additionalContacts.map(ac => 
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
      escapeCSV(c.status),
      escapeCSV(contacts),
      escapeCSV(c.createdAt),
    ].join(';') + '\n';
  }

  csv += '\n### АКТИВНОСТИ\n';
  csv += 'ID;КлиентID;Дата;Время;Тип;Тема;Комментарий;Статус;Отложено до;Дата создания\n';
  
  for (const a of data.activities) {
    csv += [
      escapeCSV(a.id),
      escapeCSV(a.clientId),
      escapeCSV(a.date),
      escapeCSV(a.time),
      escapeCSV(a.type),
      escapeCSV(a.subject),
      escapeCSV(a.comment),
      escapeCSV(a.status),
      escapeCSV(a.postponedUntil || ''),
      escapeCSV(a.createdAt),
    ].join(';') + '\n';
  }

  return csv;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ';') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function parseCSV(text: string): CRMData {
  const clients: Client[] = [];
  const activities: Activity[] = [];
  
  // Remove BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  
  const lines = text.split(/\r?\n/);
  let section: 'none' | 'clients' | 'activities' = 'none';
  let headerSkipped = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      headerSkipped = false;
      continue;
    }
    
    if (trimmed === '### КЛИЕНТЫ') {
      section = 'clients';
      headerSkipped = false;
      continue;
    }
    if (trimmed === '### АКТИВНОСТИ') {
      section = 'activities';
      headerSkipped = false;
      continue;
    }
    
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    
    const fields = splitCSVLine(trimmed).map(parseCSVField);
    
    if (section === 'clients' && fields.length >= 2) {
      const contactsStr = fields[13] || '';
      const additionalContacts: AdditionalContact[] = [];
      if (contactsStr) {
        const parts = contactsStr.split('||');
        for (const part of parts) {
          const [fio, position, phone, email] = part.split('|');
          if (fio) {
            additionalContacts.push({
              id: generateId(),
              fio: fio || '',
              position: position || '',
              phone: phone || '',
              email: email || '',
            });
          }
        }
      }
      
      clients.push({
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
        status: (fields[12] as 'active' | 'archived') || 'active',
        additionalContacts,
        createdAt: fields[14] || new Date().toISOString(),
      });
    }
    
    if (section === 'activities' && fields.length >= 2) {
      activities.push({
        id: fields[0] || generateId(),
        clientId: fields[1] || '',
        date: fields[2] || '',
        time: fields[3] || '',
        type: (fields[4] as any) || 'call',
        subject: fields[5] || '',
        comment: fields[6] || '',
        status: (fields[7] as any) || 'planned',
        postponedUntil: fields[8] || undefined,
        createdAt: fields[9] || new Date().toISOString(),
      });
    }
  }
  
  return { clients, activities };
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
