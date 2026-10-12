import { CRMData } from '../types';
import { serializeToCSV, parseCSV } from './csv';

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'reading' | 'error' | 'readonly';

export interface FileSyncState {
  status: SyncStatus;
  fileName: string;
  lastSync: string;
  lastError: string;
  fileLastModified: number;
  pendingWrites: number;
}

/**
 * FileSyncEngine — движок двусторонней синхронизации с файлом на диске.
 * Использует File System Access API (Chrome/Edge на Windows).
 * Работает полностью офлайн.
 */
export class FileSyncEngine {
  // Экспортируем класс для использования в компонентах
  private fileHandle: any = null;
  private data: CRMData = { clients: [], activities: [] };
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastFileModified: number = 0;
  private isWriting: boolean = false;
  private isReading: boolean = false;
  private pendingWrite: boolean = false;
  private state: FileSyncState = {
    status: 'disconnected',
    fileName: '',
    lastSync: '',
    lastError: '',
    fileLastModified: 0,
    pendingWrites: 0,
  };
  private onChange: ((state: FileSyncState) => void) | null = null;
  private onDataUpdate: ((data: CRMData) => void) | null = null;
  private debounceMs: number = 1200;
  private pollMs: number = 2000;
  private retryMs: number = 5000;
  private maxRetries: number = 10;
  private retryCount: number = 0;
  private destroyed: boolean = false;

  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';
  }

  setOnChange(cb: (state: FileSyncState) => void) {
    this.onChange = cb;
  }

  setDataUpdateCallback(cb: (data: CRMData) => void) {
    this.onDataUpdate = cb;
  }

  getState(): FileSyncState {
    return this.state;
  }

  /** Создать новый CSV файл на диске */
  async createNewFile(data: CRMData): Promise<boolean> {
    if (!FileSyncEngine.isSupported()) return false;
    this.data = data;
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: 'crm_database.csv',
        types: [{ description: 'CSV файл базы данных', accept: { 'text/csv': ['.csv'] } }],
      });
      this.fileHandle = handle;
      this.emitChange('connecting');
      
      // Записываем начальные данные
      await this.writeToFile();
      this.lastFileModified = Date.now();
      
      // Запускаем polling
      this.startPolling();
      this.emitChange('connected');
      return true;
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        this.emitChange('error', e.message);
      }
      return false;
    }
  }

  /** Открыть существующий файл */
  async openExistingFile(): Promise<CRMData | null> {
    if (!FileSyncEngine.isSupported()) return null;
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'CSV файл базы данных', accept: { 'text/csv': ['.csv'] } }],
        multiple: false,
      });
      this.fileHandle = handle;
      this.emitChange('connecting');

      // Читаем содержимое
      const fileData = await this.readFromFile();
      if (fileData) {
        this.data = fileData;
        this.lastFileModified = Date.now();
        this.startPolling();
        this.emitChange('connected');
        return fileData;
      }
      
      this.startPolling();
      this.emitChange('connected');
      return { clients: [], activities: [] };
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        this.emitChange('error', e.message);
      }
      return null;
    }
  }

  /** Обновить данные для синхронизации */
  updateData(data: CRMData) {
    this.data = data;
    this.scheduleWrite();
  }

  /** Запланировать запись с debounce */
  private scheduleWrite() {
    if (!this.fileHandle) return;
    this.pendingWrite = true;
    this.emitChange('connected');

    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.writeToFile();
    }, this.debounceMs);
  }

  /** Записать данные в файл */
  private async writeToFile() {
    if (!this.fileHandle || this.destroyed) return;
    if (this.isReading) {
      // Если сейчас читаем — отложим запись
      this.pendingWrite = true;
      return;
    }

    this.isWriting = true;
    this.emitChange('syncing');

    try {
      const writable = await this.fileHandle.createWritable();
      const csv = serializeToCSV(this.data);
      await writable.write(csv);
      await writable.close();
      
      this.isWriting = false;
      this.pendingWrite = false;
      this.retryCount = 0;
      this.lastFileModified = Date.now();
      this.emitChange('connected');
    } catch (e: any) {
      this.isWriting = false;
      console.warn('Write error:', e.message);
      
      // Файл может быть занят Excel — повторяем
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.emitChange('error', `Файл занят, повтор ${this.retryCount}/${this.maxRetries}...`);
        if (this.retryTimeout) clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => this.writeToFile(), this.retryMs);
      } else {
        this.emitChange('error', 'Не удалось записать: файл заблокирован');
        this.pendingWrite = true; // Помечаем что есть несохранённые данные
      }
    }
  }

  /** Прочитать данные из файла */
  private async readFromFile(): Promise<CRMData | null> {
    if (!this.fileHandle) return null;
    try {
      const file = await this.fileHandle.getFile();
      const text = await file.text();
      if (!text.trim()) return { clients: [], activities: [] };
      return parseCSV(text);
    } catch (e: any) {
      console.warn('Read error:', e.message);
      return null;
    }
  }

  /** Polling — проверяем, не изменился ли файл извне */
  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    
    this.pollInterval = setInterval(async () => {
      if (!this.fileHandle || this.destroyed || this.isWriting) return;
      
      try {
        const file = await this.fileHandle.getFile();
        const modified = file.lastModified;
        
        if (modified > this.lastFileModified + 1000) {
          // Файл изменился извне!
          this.lastFileModified = modified;
          this.isReading = true;
          this.emitChange('reading');
          
          const newData = await this.readFromFile();
          this.isReading = false;
          
          if (newData) {
            this.data = newData;
            if (this.onDataUpdate) {
              this.onDataUpdate(newData);
            }
          }
          
          // Если была отложенная запись — записываем
          if (this.pendingWrite) {
            this.writeToFile();
          } else {
            this.emitChange('connected');
          }
        }
      } catch (e) {
        // Файл может быть недоступен временно
      }
    }, this.pollMs);
  }

  /** Принудительная синхронизация */
  async forceSync() {
    if (!this.fileHandle) return;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    await this.writeToFile();
  }

  /** Принудительно перечитать файл */
  async forceReload(): Promise<CRMData | null> {
    if (!this.fileHandle) return null;
    this.isReading = true;
    this.emitChange('reading');
    const data = await this.readFromFile();
    this.isReading = false;
    if (data) {
      this.data = data;
      const file = await this.fileHandle.getFile();
      this.lastFileModified = file.lastModified;
    }
    this.emitChange('connected');
    return data;
  }

  /** Отключиться от файла */
  disconnect() {
    this.destroyed = true;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.fileHandle = null;
    this.emitChange('disconnected');
  }

  isConnected(): boolean {
    return !!this.fileHandle;
  }

  getFileName(): string {
    return this.fileHandle?.name || '';
  }

  private emitChange(status: SyncStatus, error: string = '') {
    this.state = {
      status,
      fileName: this.fileHandle?.name || '',
      lastSync: this.lastFileModified ? new Date(this.lastFileModified).toLocaleTimeString('ru-RU') : '',
      lastError: error,
      fileLastModified: this.lastFileModified,
      pendingWrites: this.pendingWrite ? 1 : 0,
    };
    if (this.onChange) {
      this.onChange(this.state);
    }
  }
}

// Singleton instance
const _fileSyncEngine = new FileSyncEngine();
export default _fileSyncEngine;
