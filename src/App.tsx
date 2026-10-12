import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from 'react';
import { CRMData, Client, Activity, TabType, ActivityFilter, ActivityType, AdditionalContact } from './types';
import { ACTIVITY_TYPE_LABELS } from './types';
import { loadData, saveData, exportJSON, importJSON } from './utils/storage';
import { serializeToCSV, parseCSV, generateId } from './utils/csv';
import { RichComment, RichCommentInput, ImageInput } from './components/RichComment';

// Error Boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto">
          <div className="bg-red-50 border-2 border-red-400 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-700 mb-2">❌ Ошибка в Мини-CRM</h2>
            <p className="text-red-600 mb-3">{this.state.error}</p>
            <p className="text-sm text-red-500">Попробуйте перезагрузить страницу (F5)</p>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              🔄 Сбросить и перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// File System Access API types
declare global {
  interface Window {
    showSaveFilePicker?: (options?: any) => Promise<any>;
    showOpenFilePicker?: (options?: any) => Promise<any>;
  }
}

function App() {
  const [data, setData] = useState<CRMData>({ clients: [], activities: [] });
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [reminderActivities, setReminderActivities] = useState<Activity[]>([]);
  const [currentReminder, setCurrentReminder] = useState<Activity | null>(null);
  const [fileHandle, setFileHandle] = useState<any>(null);
  const [fileName, setFileName] = useState<string>('');
  const [lastSync, setLastSync] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'connected' | 'disconnected' | 'syncing' | 'error'>('disconnected');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showBanner, setShowBanner] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [preselectedClientId, setPreselectedClientId] = useState<string>('');

  // Load data from localStorage on mount
  useEffect(() => {
    const loaded = loadData();
    setData(loaded);
    requestNotificationPermission();
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    saveData(data);
    scheduleFileSave();
  }, [data]);

  // Check reminders every 30 seconds
  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [data]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'denied') {
        setShowBanner(true);
      }
    }
  };

  const scheduleFileSave = useCallback(() => {
    if (!fileHandle) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToFile(), 1200);
  }, [fileHandle, data]);

  const saveToFile = async () => {
    if (!fileHandle) return;
    setSyncStatus('syncing');
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(serializeToCSV(data));
      await writable.close();
      setSyncStatus('connected');
      setLastSync(new Date().toLocaleTimeString('ru-RU'));
    } catch (e: any) {
      console.error('Save error:', e);
      setSyncStatus('error');
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => saveToFile(), 5000);
    }
  };

  const createNewFile = async () => {
    if (!window.showSaveFilePicker) {
      alert('Ваш браузер не поддерживает автосинхронизацию. Используйте ручной режим.');
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'crm_database.csv',
        types: [{ description: 'CSV файл', accept: { 'text/csv': ['.csv'] } }],
      });
      setFileHandle(handle);
      setFileName(handle.name);
      setSyncStatus('connected');
      // Save immediately
      const writable = await handle.createWritable();
      await writable.write(serializeToCSV(data));
      await writable.close();
      setLastSync(new Date().toLocaleTimeString('ru-RU'));
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    }
  };

  const openExistingFile = async () => {
    if (!window.showOpenFilePicker) {
      alert('Ваш браузер не поддерживает автосинхронизацию. Используйте ручной режим.');
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'CSV файл', accept: { 'text/csv': ['.csv'] } }],
      });
      setFileHandle(handle);
      setFileName(handle.name);
      setSyncStatus('connected');
      // Read file
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = parseCSV(text);
      setData(parsed);
      setLastSync(new Date().toLocaleTimeString('ru-RU'));
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    }
  };

  const downloadCSV = () => {
    const csv = serializeToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crm_database.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    setData(parsed);
    e.target.value = '';
  };

  const uploadJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importJSON(file);
      setData(parsed);
    } catch (err) {
      alert('Ошибка: ' + (err as Error).message);
    }
    e.target.value = '';
  };

  const checkReminders = () => {
    const now = new Date();
    const due = data.activities.filter(a => {
      if (a.status !== 'planned') return false;
      if (a.postponedUntil) {
        return new Date(a.postponedUntil) <= now;
      }
      const actTime = getActivityDateTime(a);
      if (!actTime) return false;
      return actTime <= now;
    });

    if (due.length > 0) {
      setReminderActivities(due);
      if (!currentReminder && due.length > 0) {
        setCurrentReminder(due[0]);
      }
      // Browser notification
      if (notificationPermission === 'granted') {
        const n = new Notification('🔔 Мини-CRM: Напоминание', {
          body: `${due.length} задач(и) требуют внимания`,
          tag: 'crm-reminder',
        });
        n.onclick = () => {
          window.focus();
          setCurrentReminder(due[0]);
        };
      }
    }
  };

  const getActivityDateTime = (a: Activity): Date | null => {
    if (!a.date) return null;
    const time = a.time || '09:00';
    return new Date(`${a.date}T${time}:00`);
  };

  // Client CRUD
  const saveClient = (client: Client) => {
    setData(prev => {
      const exists = prev.clients.find(c => c.id === client.id);
      if (exists) {
        return { ...prev, clients: prev.clients.map(c => c.id === client.id ? client : c) };
      }
      return { ...prev, clients: [...prev.clients, client] };
    });
    setShowClientForm(false);
    setEditingClient(null);
  };

  const archiveClient = (id: string) => {
    setData(prev => ({
      ...prev,
      clients: prev.clients.map(c => c.id === id ? { ...c, status: 'archived' as const } : c),
    }));
  };

  const restoreClient = (id: string) => {
    setData(prev => ({
      ...prev,
      clients: prev.clients.map(c => c.id === id ? { ...c, status: 'active' as const } : c),
    }));
  };

  // Activity CRUD
  const saveActivity = (activity: Activity) => {
    setData(prev => {
      const exists = prev.activities.find(a => a.id === activity.id);
      if (exists) {
        return { ...prev, activities: prev.activities.map(a => a.id === activity.id ? activity : a) };
      }
      return { ...prev, activities: [...prev.activities, activity] };
    });
    setShowActivityForm(false);
    setEditingActivity(null);
  };

  const completeActivity = (id: string, comment?: string, images?: string[]) => {
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a =>
        a.id === id ? { ...a, status: 'done' as const, comment: comment || a.comment, images: images || a.images, postponedUntil: undefined } : a
      ),
    }));
    setReminderActivities(prev => prev.filter(a => a.id !== id));
    if (currentReminder?.id === id) {
      const remaining = reminderActivities.filter(a => a.id !== id);
      setCurrentReminder(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const postponeActivity = (id: string, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a =>
        a.id === id ? { ...a, postponedUntil: until } : a
      ),
    }));
    setReminderActivities(prev => prev.filter(a => a.id !== id));
    if (currentReminder?.id === id) {
      const remaining = reminderActivities.filter(a => a.id !== id);
      setCurrentReminder(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const archiveActivity = (id: string) => {
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a =>
        a.id === id ? { ...a, status: 'archived' as const } : a
      ),
    }));
  };

  const deleteActivity = (id: string) => {
    setData(prev => ({
      ...prev,
      activities: prev.activities.filter(a => a.id !== id),
    }));
  };

  const completeAndNext = (id: string, comment?: string, images?: string[]) => {
    const activity = data.activities.find(a => a.id === id);
    if (!activity) return;
    completeActivity(id, comment, images);
    setPreselectedClientId(activity.clientId);
    setEditingActivity(null);
    setShowActivityForm(true);
  };

  // Filtered data
  const filteredClients = data.clients.filter(c => {
    if (!showArchived && c.status === 'archived') return false;
    if (showArchived && c.status !== 'archived') return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.inn.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.comment.toLowerCase().includes(q)
    );
  });

  const filteredActivities = data.activities.filter(a => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    switch (activityFilter) {
      case 'today':
        return a.date === today && a.status === 'planned';
      case 'overdue': {
        const dt = getActivityDateTime(a);
        return a.status === 'planned' && dt && dt < now && !a.postponedUntil;
      }
      case 'pending':
        return a.status === 'planned';
      case 'done':
        return a.status === 'done';
      default:
        return a.status !== 'archived';
    }
  }).sort((a, b) => {
    const da = getActivityDateTime(a);
    const db = getActivityDateTime(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  const getClientName = (clientId: string) => {
    return data.clients.find(c => c.id === clientId)?.name || 'Неизвестный клиент';
  };

  const getClientPhone = (clientId: string) => {
    return data.clients.find(c => c.id === clientId)?.phone || '';
  };

  const hasFileSystemAPI = typeof window.showSaveFilePicker === 'function';

  const todayActivities = data.activities.filter(a => {
    const today = new Date().toISOString().slice(0, 10);
    return a.date === today && a.status === 'planned';
  }).length;

  const overdueActivities = data.activities.filter(a => {
    const dt = getActivityDateTime(a);
    return a.status === 'planned' && dt && dt < new Date() && !a.postponedUntil;
  }).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold text-blue-800">📋 Мини-CRM</h1>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Reminder counter */}
            {reminderActivities.length > 0 && (
              <button
                onClick={() => setCurrentReminder(reminderActivities[0])}
                className="px-3 py-1 bg-red-500 text-white rounded-full text-sm font-bold animate-pulse"
              >
                🔔 {reminderActivities.length} сейчас
              </button>
            )}

            {/* DB Status */}
            <div className="flex items-center gap-1">
              {hasFileSystemAPI ? (
                <>
                  {!fileHandle ? (
                    <div className="flex gap-1">
                      <button onClick={createNewFile} className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                        📄 Создать файл
                      </button>
                      <button onClick={openExistingFile} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                        📂 Открыть файл
                      </button>
                    </div>
                  ) : (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      syncStatus === 'connected' ? 'bg-green-100 text-green-800' :
                      syncStatus === 'syncing' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      База: {fileName} {lastSync && `(${lastSync})`}
                    </span>
                  )}
                </>
              ) : (
                <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
                  ⚠️ Ручной режим (File System API недоступен)
                </span>
              )}
            </div>

            {/* Manual export/import */}
            <div className="flex gap-1">
              <button onClick={downloadCSV} className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300" title="Скачать CSV">
                ⬇ CSV
              </button>
              <label className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 cursor-pointer">
                ⬆ CSV
                <input type="file" accept=".csv" onChange={uploadCSV} className="hidden" />
              </label>
              <button onClick={() => exportJSON(data)} className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300" title="JSON бэкап">
                💾 JSON
              </button>
              <label className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 cursor-pointer">
                📥 JSON
                <input type="file" accept=".json" onChange={uploadJSON} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Banner for denied notifications */}
        {showBanner && (
          <div className="bg-yellow-100 border-t border-yellow-300 px-4 py-2 text-sm text-yellow-800 flex justify-between items-center">
            <span>⚠️ Уведомления браузера отключены. Напоминания будут показаны только в интерфейсе.</span>
            <button onClick={() => setShowBanner(false)} className="text-yellow-600 hover:text-yellow-800">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            📊 Панель
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'clients' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            👥 Клиенты ({data.clients.filter(c => c.status === 'active').length})
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`px-4 py-2 text-sm font-medium rounded-t relative ${activeTab === 'activities' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            📅 Активности
            {overdueActivities > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {overdueActivities}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            data={data}
            todayActivities={todayActivities}
            overdueActivities={overdueActivities}
            reminderCount={reminderActivities.length}
            onGoToActivities={() => setActiveTab('activities')}
            onGoToClients={() => setActiveTab('clients')}
          />
        )}

        {activeTab === 'clients' && (
          <ClientsView
            clients={filteredClients}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(!showArchived)}
            onNewClient={() => { setEditingClient(null); setShowClientForm(true); }}
            onEditClient={(c) => { setEditingClient(c); setShowClientForm(true); }}
            onArchiveClient={archiveClient}
            onRestoreClient={restoreClient}
            onSaveClient={saveClient}
            showForm={showClientForm}
            editingClient={editingClient}
            onCloseForm={() => { setShowClientForm(false); setEditingClient(null); }}
            data={data}
          />
        )}

        {activeTab === 'activities' && (
          <ActivitiesView
            activities={filteredActivities}
            filter={activityFilter}
            onFilterChange={setActivityFilter}
            clients={data.clients}
            onNewActivity={() => { setEditingActivity(null); setShowActivityForm(true); }}
            onEditActivity={(a) => { setEditingActivity(a); setShowActivityForm(true); }}
            onComplete={completeActivity}
            onArchive={archiveActivity}
            onDelete={deleteActivity}
            onSaveActivity={saveActivity}
            showForm={showActivityForm}
            editingActivity={editingActivity}
            onCloseForm={() => { setShowActivityForm(false); setEditingActivity(null); setPreselectedClientId(''); }}
            preselectedClientId={preselectedClientId}
            getClientName={getClientName}
          />
        )}
      </main>

      {/* Reminder Modal */}
      {currentReminder && (
        <ReminderModal
          activity={currentReminder}
          clientName={getClientName(currentReminder.clientId)}
          clientPhone={getClientPhone(currentReminder.clientId)}
          onComplete={(comment, images) => completeActivity(currentReminder.id, comment, images)}
          onCompleteAndNext={(comment, images) => completeAndNext(currentReminder.id, comment, images)}
          onPostpone15={() => postponeActivity(currentReminder.id, 15)}
          onPostpone10={() => postponeActivity(currentReminder.id, 10)}
          onSaveComment={(comment, images) => {
            setData(prev => ({
              ...prev,
              activities: prev.activities.map(a => a.id === currentReminder.id ? { ...a, comment, images } : a),
            }));
          }}
          onClose={() => {
            const remaining = reminderActivities.filter(a => a.id !== currentReminder.id);
            setCurrentReminder(remaining.length > 0 ? remaining[0] : null);
          }}
        />
      )}
    </div>
  );
}

// =================== DASHBOARD ===================
function DashboardView({ data, todayActivities, overdueActivities, reminderCount, onGoToActivities, onGoToClients }: {
  data: CRMData;
  todayActivities: number;
  overdueActivities: number;
  reminderCount: number;
  onGoToActivities: () => void;
  onGoToClients: () => void;
}) {
  const activeClients = data.clients.filter(c => c.status === 'active').length;
  const plannedActivities = data.activities.filter(a => a.status === 'planned').length;
  const doneToday = data.activities.filter(a => {
    const today = new Date().toISOString().slice(0, 10);
    return a.status === 'done' && a.date === today;
  }).length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Панель управления</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="text-3xl font-bold text-blue-600">{activeClients}</div>
          <div className="text-sm text-gray-600">Активных клиентов</div>
          <button onClick={onGoToClients} className="text-xs text-blue-500 hover:underline mt-1">Перейти →</button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-3xl font-bold text-green-600">{todayActivities}</div>
          <div className="text-sm text-gray-600">Задач на сегодня</div>
          <button onClick={onGoToActivities} className="text-xs text-green-500 hover:underline mt-1">Перейти →</button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="text-3xl font-bold text-red-600">{overdueActivities}</div>
          <div className="text-sm text-gray-600">Просроченных</div>
          <button onClick={onGoToActivities} className="text-xs text-red-500 hover:underline mt-1">Перейти →</button>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <div className="text-3xl font-bold text-purple-600">{doneToday}</div>
          <div className="text-sm text-gray-600">Выполнено сегодня</div>
        </div>
      </div>

      {reminderCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-red-700 mb-2">🔔 Требуют внимания: {reminderCount}</h3>
          <p className="text-sm text-red-600">Есть активности, время которых наступило. Нажмите на счётчик в шапке для просмотра.</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-bold text-gray-800 mb-4">📅 Ближайшие задачи</h3>
        {data.activities
          .filter(a => a.status === 'planned')
          .sort((a, b) => {
            const da = a.date + (a.time || '09:00');
            const db = b.date + (b.time || '09:00');
            return da.localeCompare(db);
          })
          .slice(0, 5)
          .map(a => {
            const client = data.clients.find(c => c.id === a.clientId);
            const isOverdue = (() => {
              if (!a.date) return false;
              const dt = new Date(`${a.date}T${a.time || '09:00'}:00`);
              return dt < new Date();
            })();
            return (
              <div key={a.id} className={`flex items-center gap-3 py-2 border-b last:border-0 ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                <span className="text-sm font-mono">{a.date} {a.time || '09:00'}</span>
                <span className="text-sm">{ACTIVITY_TYPE_LABELS[a.type]}</span>
                <span className="text-sm font-medium">{a.subject}</span>
                <span className="text-xs text-gray-500">— {client?.name || '?'}</span>
                {isOverdue && <span className="text-xs bg-red-100 text-red-700 px-1 rounded">просрочено</span>}
              </div>
            );
          })}
        {data.activities.filter(a => a.status === 'planned').length === 0 && (
          <p className="text-gray-500 text-sm">Нет запланированных задач</p>
        )}
      </div>
    </div>
  );
}

// =================== CLIENTS VIEW ===================
function ClientsView({ clients, searchQuery, onSearchChange, showArchived, onToggleArchived, onNewClient, onEditClient, onArchiveClient, onRestoreClient, onSaveClient, showForm, editingClient, onCloseForm, data }: {
  clients: Client[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  onNewClient: () => void;
  onEditClient: (c: Client) => void;
  onArchiveClient: (id: string) => void;
  onRestoreClient: (id: string) => void;
  onSaveClient: (c: Client) => void;
  showForm: boolean;
  editingClient: Client | null;
  onCloseForm: () => void;
  data: CRMData;
}) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-800">
          {showArchived ? '📦 Архив клиентов' : '👥 Клиенты'}
        </h2>
        <div className="flex gap-2">
          <button onClick={onToggleArchived} className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300">
            {showArchived ? '↩ Активные' : '📦 Архив'}
          </button>
          <button onClick={onNewClient} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            + Новый клиент
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="🔍 Поиск по названию, ИНН, телефону, контакту, адресу, комментарию..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {showForm && (
        <ClientForm
          client={editingClient}
          onSave={onSaveClient}
          onClose={onCloseForm}
        />
      )}

      {selectedClient && !showForm && (
        <ClientDetail
          client={selectedClient}
          data={data}
          onClose={() => setSelectedClient(null)}
          onEdit={() => { onEditClient(selectedClient); }}
          onArchive={() => { onArchiveClient(selectedClient.id); setSelectedClient(null); }}
          onRestore={() => { onRestoreClient(selectedClient.id); setSelectedClient(null); }}
        />
      )}

      {!selectedClient && !showForm && (
        <div className="space-y-2">
          {clients.map(c => (
            <div
              key={c.id}
              className="bg-white rounded-lg shadow p-4 hover:shadow-md transition cursor-pointer flex items-center justify-between"
              onClick={() => setSelectedClient(c)}
            >
              <div>
                <div className="font-medium text-gray-800">{c.name}</div>
                <div className="text-sm text-gray-500">
                  {c.contactPerson && <span>👤 {c.contactPerson} </span>}
                  {c.phone && <span>📞 {c.phone} </span>}
                  {c.inn && <span>ИНН: {c.inn}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {c.status === 'archived' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRestoreClient(c.id); }}
                    className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                  >
                    ↩ Восстановить
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onArchiveClient(c.id); }}
                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                  >
                    📦 В архив
                  </button>
                )}
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'Ничего не найдено' : 'Нет клиентов. Создайте первого!'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =================== CLIENT FORM ===================
function ClientForm({ client, onSave, onClose }: { client: Client | null; onSave: (c: Client) => void; onClose: () => void }) {
  const [form, setForm] = useState<Client>(client || {
    id: generateId(),
    name: '',
    contactPerson: '',
    inn: '',
    kpp: '',
    ogrn: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    bankDetails: '',
    comment: '',
    images: [],
    status: 'active',
    additionalContacts: [],
    createdAt: new Date().toISOString(),
  });

  const addContact = () => {
    setForm(prev => ({
      ...prev,
      additionalContacts: [...prev.additionalContacts, { id: generateId(), fio: '', position: '', phone: '', email: '' }],
    }));
  };

  const updateContact = (idx: number, field: keyof AdditionalContact, value: string) => {
    setForm(prev => ({
      ...prev,
      additionalContacts: prev.additionalContacts.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const removeContact = (idx: number) => {
    setForm(prev => ({
      ...prev,
      additionalContacts: prev.additionalContacts.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Наименование организации — обязательное поле');
      return;
    }
    onSave(form);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-bold mb-4">{client ? '✏️ Редактирование клиента' : '➕ Новый клиент'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Наименование *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Контактное лицо</label>
            <input value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label>
            <input value={form.inn} onChange={e => setForm(p => ({ ...p, inn: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">КПП</label>
            <input value={form.kpp} onChange={e => setForm(p => ({ ...p, kpp: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ОГРН</label>
            <input value={form.ogrn} onChange={e => setForm(p => ({ ...p, ogrn: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Сайт</label>
            <input value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Адрес (юридический)</label>
          <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Банковские реквизиты</label>
          <textarea value={form.bankDetails} onChange={e => setForm(p => ({ ...p, bankDetails: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
          <RichCommentInput
            value={form.comment}
            onChange={(val) => setForm(p => ({ ...p, comment: val }))}
            images={form.images}
            onImagesChange={(imgs) => setForm(p => ({ ...p, images: imgs }))}
            placeholder="Комментарий по работе с клиентом... (ссылки станут кликабельными)"
            rows={3}
          />
        </div>

        {/* Additional contacts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Дополнительные контакты</label>
            <button type="button" onClick={addContact} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">+ Добавить</button>
          </div>
          {form.additionalContacts.map((ac, idx) => (
            <div key={ac.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 p-2 bg-gray-50 rounded">
              <input placeholder="ФИО" value={ac.fio} onChange={e => updateContact(idx, 'fio', e.target.value)} className="px-2 py-1 border rounded text-sm" />
              <input placeholder="Должность" value={ac.position} onChange={e => updateContact(idx, 'position', e.target.value)} className="px-2 py-1 border rounded text-sm" />
              <input placeholder="Телефон" value={ac.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className="px-2 py-1 border rounded text-sm" />
              <input placeholder="E-mail" value={ac.email} onChange={e => updateContact(idx, 'email', e.target.value)} className="px-2 py-1 border rounded text-sm" />
              <button type="button" onClick={() => removeContact(idx)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
            💾 Сохранить
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

// =================== CLIENT DETAIL ===================
function ClientDetail({ client, data, onClose, onEdit, onArchive, onRestore }: {
  client: Client;
  data: CRMData;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const clientActivities = data.activities
    .filter(a => a.clientId === client.id)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">{client.name}</h3>
        <div className="flex gap-2">
          <button onClick={onEdit} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200">✏️ Редактировать</button>
          {client.status === 'active' ? (
            <button onClick={onArchive} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">📦 В архив</button>
          ) : (
            <button onClick={onRestore} className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200">↩ Восстановить</button>
          )}
          <button onClick={onClose} className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200">✕</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          {client.contactPerson && <div><span className="text-sm text-gray-500">Контактное лицо:</span> <span className="font-medium">{client.contactPerson}</span></div>}
          {client.phone && <div><span className="text-sm text-gray-500">Телефон:</span> <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">{client.phone}</a></div>}
          {client.email && <div><span className="text-sm text-gray-500">E-mail:</span> <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">{client.email}</a></div>}
          {client.website && <div><span className="text-sm text-gray-500">Сайт:</span> <a href={client.website} target="_blank" className="text-blue-600 hover:underline">{client.website}</a></div>}
          {client.address && <div><span className="text-sm text-gray-500">Адрес:</span> <span>{client.address}</span></div>}
        </div>
        <div className="space-y-2">
          {client.inn && <div><span className="text-sm text-gray-500">ИНН:</span> {client.inn}</div>}
          {client.kpp && <div><span className="text-sm text-gray-500">КПП:</span> {client.kpp}</div>}
          {client.ogrn && <div><span className="text-sm text-gray-500">ОГРН:</span> {client.ogrn}</div>}
          {client.bankDetails && <div><span className="text-sm text-gray-500">Банковские реквизиты:</span><div className="text-sm whitespace-pre-wrap">{client.bankDetails}</div></div>}
        </div>
      </div>

      {client.additionalContacts.length > 0 && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-700 mb-2">Дополнительные контакты:</h4>
          <div className="space-y-1">
            {client.additionalContacts.map(ac => (
              <div key={ac.id} className="text-sm bg-gray-50 rounded p-2">
                <span className="font-medium">{ac.fio}</span>
                {ac.position && <span className="text-gray-500"> — {ac.position}</span>}
                {ac.phone && <span className="ml-2">📞 <a href={`tel:${ac.phone}`} className="text-blue-600">{ac.phone}</a></span>}
                {ac.email && <span className="ml-2">✉️ <a href={`mailto:${ac.email}`} className="text-blue-600">{ac.email}</a></span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(client.comment || (client.images && client.images.length > 0)) && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-700 mb-1">Комментарий:</h4>
          <div className="text-sm bg-yellow-50 rounded p-3">
            <RichComment text={client.comment} images={client.images} />
          </div>
        </div>
      )}

      <div>
        <h4 className="font-medium text-gray-700 mb-2">📅 История активностей ({clientActivities.length}):</h4>
        {clientActivities.length === 0 ? (
          <p className="text-sm text-gray-500">Нет активностей</p>
        ) : (
          <div className="space-y-1">
            {clientActivities.map(a => (
              <div key={a.id} className={`text-sm p-2 rounded ${
                a.status === 'done' ? 'bg-green-50' : 'bg-blue-50'
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs">{a.date} {a.time || '09:00'}</span>
                  <span>{ACTIVITY_TYPE_LABELS[a.type]}</span>
                  <span className="font-medium">{a.subject}</span>
                  <span className={`text-xs px-1 rounded ${a.status === 'done' ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'}`}>
                    {a.status === 'done' ? '✅' : '⏳'}
                  </span>
                  {a.images && a.images.length > 0 && (
                    <span className="text-xs text-gray-500">📷 {a.images.length}</span>
                  )}
                </div>
                {(a.comment || (a.images && a.images.length > 0)) && (
                  <div className="text-xs text-gray-500 mt-1">
                    <RichComment text={a.comment} images={a.images} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =================== ACTIVITIES VIEW ===================
function ActivitiesView({ activities, filter, onFilterChange, clients, onNewActivity, onEditActivity, onComplete, onArchive, onDelete, onSaveActivity, showForm, editingActivity, onCloseForm, preselectedClientId, getClientName }: {
  activities: Activity[];
  filter: ActivityFilter;
  onFilterChange: (f: ActivityFilter) => void;
  clients: Client[];
  onNewActivity: () => void;
  onEditActivity: (a: Activity) => void;
  onComplete: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveActivity: (a: Activity) => void;
  showForm: boolean;
  editingActivity: Activity | null;
  onCloseForm: () => void;
  preselectedClientId: string;
  getClientName: (id: string) => string;
}) {
  const now = new Date();

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-800">📅 Активности</h2>
        <button onClick={onNewActivity} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          + Новая активность
        </button>
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {([['all', 'Все'], ['today', 'Сегодня'], ['overdue', 'Просроченные'], ['pending', 'Незакрытые'], ['done', 'Выполненные']] as [ActivityFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`px-3 py-1 rounded text-sm ${filter === key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <ActivityForm
          activity={editingActivity}
          clients={clients}
          onSave={onSaveActivity}
          onClose={onCloseForm}
          preselectedClientId={preselectedClientId}
        />
      )}

      {!showForm && (
        <div className="space-y-2">
          {activities.map(a => {
            const isOverdue = (() => {
              if (a.status !== 'planned') return false;
              if (!a.date) return false;
              const dt = new Date(`${a.date}T${a.time || '09:00'}:00`);
              return dt < now && !a.postponedUntil;
            })();
            const isHot = (() => {
              if (a.status !== 'planned') return false;
              if (!a.date) return false;
              const dt = new Date(`${a.date}T${a.time || '09:00'}:00`);
              const diff = dt.getTime() - now.getTime();
              return diff >= 0 && diff < 30 * 60 * 1000; // within 30 min
            })();

            return (
              <div key={a.id} className={`bg-white rounded-lg shadow p-4 flex items-center justify-between ${
                isOverdue ? 'border-l-4 border-red-500' : isHot ? 'border-l-4 border-orange-500' : 'border-l-4 border-blue-300'
              }`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-gray-600">{a.date} {a.time || '09:00'}</span>
                    <span className="text-sm">{ACTIVITY_TYPE_LABELS[a.type]}</span>
                    <span className="font-medium text-gray-800">{a.subject}</span>
                    <span className="text-xs text-gray-500">— {getClientName(a.clientId)}</span>
                    {isOverdue && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">⚠️ Просрочено</span>}
                    {isHot && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded animate-pulse">🔥 Скоро</span>}
                    {a.status === 'done' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✅</span>}
                  </div>
                  {(a.comment || (a.images && a.images.length > 0)) && (
                    <div className="text-xs text-gray-500 mt-1 max-w-md overflow-hidden">
                      <RichComment text={a.comment} images={a.images} />
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  {a.status === 'planned' && (
                    <button onClick={() => onComplete(a.id)} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200" title="Выполнено">
                      ✅
                    </button>
                  )}
                  <button onClick={() => onEditActivity(a)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200" title="Редактировать">
                    ✏️
                  </button>
                  <button onClick={() => onArchive(a.id)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200" title="В архив">
                    📦
                  </button>
                  <button onClick={() => { if (confirm('Удалить активность?')) onDelete(a.id); }} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200" title="Удалить">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
          {activities.length === 0 && (
            <div className="text-center py-8 text-gray-500">Нет активностей в этой категории</div>
          )}
        </div>
      )}
    </div>
  );
}

// =================== ACTIVITY FORM ===================
function ActivityForm({ activity, clients, onSave, onClose, preselectedClientId }: {
  activity: Activity | null;
  clients: Client[];
  onSave: (a: Activity) => void;
  onClose: () => void;
  preselectedClientId: string;
}) {
  const [form, setForm] = useState<Activity>(activity || {
    id: generateId(),
    clientId: preselectedClientId || (clients.length > 0 ? clients[0].id : ''),
    date: new Date().toISOString().slice(0, 10),
    time: '',
    type: 'call',
    subject: '',
    comment: '',
    images: [],
    status: 'planned',
    createdAt: new Date().toISOString(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId) {
      alert('Выберите клиента');
      return;
    }
    if (!form.date) {
      alert('Укажите дату');
      return;
    }
    onSave(form);
  };

  const activeClients = clients.filter(c => c.status === 'active');

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-bold mb-4">{activity ? '✏️ Редактирование активности' : '➕ Новая активность'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Клиент *</label>
            <select
              required
              value={form.clientId}
              onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Выберите клиента —</option>
              {activeClients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value as ActivityType }))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата *</label>
            <input
              required
              type="date"
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Время (для напоминания)</label>
            <input
              type="time"
              value={form.time}
              onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
              placeholder="Если пусто — сработает в 09:00"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Тема</label>
          <input
            value={form.subject}
            onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            placeholder="Короткое название"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
          <RichCommentInput
            value={form.comment}
            onChange={(val) => setForm(p => ({ ...p, comment: val }))}
            images={form.images}
            onImagesChange={(imgs) => setForm(p => ({ ...p, images: imgs }))}
            placeholder="Подробности активности... (ссылки станут кликабельными)"
            rows={3}
          />
        </div>
        <div className="flex gap-2 pt-4">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
            💾 Сохранить
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

// =================== REMINDER MODAL ===================
function ReminderModal({ activity, clientName, clientPhone, onComplete, onCompleteAndNext, onPostpone15, onPostpone10, onSaveComment, onClose }: {
  activity: Activity;
  clientName: string;
  clientPhone: string;
  onComplete: (comment: string, images: string[]) => void;
  onCompleteAndNext: (comment: string, images: string[]) => void;
  onPostpone15: () => void;
  onPostpone10: () => void;
  onSaveComment: (comment: string, images: string[]) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState(activity.comment || '');
  const [images, setImages] = useState<string[]>(activity.images || []);
  const [copied, setCopied] = useState(false);

  const copyPhone = () => {
    navigator.clipboard.writeText(clientPhone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleComplete = () => onComplete(comment, images);
  const handleCompleteAndNext = () => onCompleteAndNext(comment, images);
  const handleSaveComment = () => onSaveComment(comment, images);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-red-500 text-white px-6 py-4 rounded-t-xl">
          <h3 className="text-xl font-bold">🔔 Напоминание: {ACTIVITY_TYPE_LABELS[activity.type]}</h3>
          <p className="text-red-100 text-sm">{activity.date} {activity.time || '09:00'}</p>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <div className="text-sm text-gray-500">Клиент</div>
            <div className="text-lg font-bold text-gray-800">{clientName}</div>
          </div>

          {activity.subject && (
            <div>
              <div className="text-sm text-gray-500">Тема</div>
              <div className="font-medium">{activity.subject}</div>
            </div>
          )}

          {clientPhone && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-sm text-gray-500 mb-1">Телефон</div>
              <div className="flex items-center gap-2">
                <a href={`tel:${clientPhone}`} className="text-xl font-bold text-blue-600 hover:underline">
                  📞 {clientPhone}
                </a>
                <button
                  onClick={copyPhone}
                  className="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs hover:bg-blue-300"
                >
                  {copied ? '✓ Скопировано' : '📋 Копировать'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий по звонку</label>
            <RichCommentInput
              value={comment}
              onChange={setComment}
              images={images}
              onImagesChange={setImages}
              placeholder="Результат звонка, договорённости... (можно прикрепить изображения)"
              rows={3}
            />
          </div>
          
          {/* Показать существующий комментарий с изображениями */}
          {activity.comment && activity.comment !== comment && (
            <div className="bg-gray-50 rounded p-2 text-xs">
              <span className="text-gray-500">Предыдущий комментарий:</span>
              <RichComment text={activity.comment} images={activity.images} />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleComplete} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                ✅ Завершить
              </button>
              <button onClick={handleCompleteAndNext} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
                📅 + Следующая
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={onPostpone15} className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 text-sm">
                ⏰ +15 мин
              </button>
              <button onClick={onPostpone10} className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 text-sm">
                ⏰ +10 мин
              </button>
              <button onClick={handleSaveComment} className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                💾 Сохранить комментарий
              </button>
            </div>
            <button onClick={onClose} className="w-full px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
              ✕ Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap App in ErrorBoundary
function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithBoundary;
