import { INITIAL_DATA } from './schema.js';

const STORAGE_KEY = 'budget_app_data';

class Store {
  constructor() {
    this.data = this.load();
    this.listeners = [];
  }

  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_DATA;
    try {
      const data = JSON.parse(raw);
      this.validateSchema(data);
      return this.migrate(data);
    } catch (e) {
      console.error('Failed to load data (corrupted):', e);
      // バックアップを保存
      localStorage.setItem(`${STORAGE_KEY}_corrupted_backup`, raw);
      // 壊れたデータを削除
      localStorage.removeItem(STORAGE_KEY);
      
      // トースト通知（window.showToastが利用可能であることを期待、または遅延実行）
      if (window.showToast) {
        window.showToast('データが壊れていたため初期化しました（バックアップを保存済み）', 'danger');
      } else {
        // まだDOM構築前などの場合
        setTimeout(() => {
          if (window.showToast) window.showToast('データが壊れていたため初期化しました（バックアップを保存済み）', 'danger');
        }, 1000);
      }
      
      return INITIAL_DATA;
    }
  }

  validateSchema(data) {
    if (!data || typeof data !== 'object') throw new Error('Data is not an object');
    if (!data.master || typeof data.master !== 'object') throw new Error('Missing master object');
    if (!Array.isArray(data.master.items)) throw new Error('master.items must be an array');
    if (!Array.isArray(data.master.loans)) throw new Error('master.loans must be an array');
    if (!data.calendar || typeof data.calendar !== 'object') throw new Error('Missing calendar object');
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    this.notify();
  }

  migrate(data) {
    if (!data.schemaVersion) {
      data.schemaVersion = 1;
    }

    if (data.schemaVersion === 1) {
      console.log('Migrating schema v1 to v2...');
      
      // Master items migration
      if (data.master && data.master.items) {
        data.master.items = data.master.items.map(item => {
          if (!item) return item;
          if (!item.scheduleRule) {
            // day=31 を月末 (monthEnd) とみなす判定
            if (item.day === 31 || item.day === 30) {
              item.scheduleRule = { type: 'monthEnd' };
            } else {
              item.scheduleRule = { type: 'monthly', day: item.day || 1 };
            }
          }
          if (!item.amountMode) {
            item.amountMode = 'fixed';
          }
          if (!item.tag) {
            item.tag = '';
          }
          if (!item.effective) {
            item.effective = { start: null, end: null };
          }
          return item;
        }).filter(Boolean);
      }

      // Loans migration
      if (data.master && data.master.loans) {
        data.master.loans = data.master.loans.map(loan => {
          if (!loan) return loan;
          if (!loan.scheduleRule) {
            if (loan.paymentDay === 31 || loan.paymentDay === 30) {
              loan.scheduleRule = { type: 'monthEnd' };
            } else {
              loan.scheduleRule = { type: 'monthly', day: loan.paymentDay || 27 };
            }
          }
          if (!loan.bankId) loan.bankId = '';
          if (!loan.notes) loan.notes = '';
          return loan;
        }).filter(Boolean);
      }

      data.schemaVersion = 2;
      console.log('Migration to v2 completed.');
    }

    // Ensure all required top-level structures exist (for safer imports)
    if (!data.master) data.master = { items: [], loans: [] };
    if (!data.master.items) data.master.items = [];
    if (!data.master.loans) data.master.loans = [];
    if (!data.master.clients) data.master.clients = [];
    if (!data.calendar) data.calendar = { generatedMonths: {} };
    if (!data.calendar.generatedMonths) data.calendar.generatedMonths = {};
    if (!data.settings) data.settings = { ...INITIAL_DATA.settings };
    if (!Array.isArray(data.settings.syncHistory)) data.settings.syncHistory = [];
    if (!Array.isArray(data.settings.loanTypeOptions)) {
      data.settings.loanTypeOptions = [...INITIAL_DATA.settings.loanTypeOptions];
    }
    if (typeof data.settings.demoMode !== 'boolean') data.settings.demoMode = false;
    if (typeof data.settings.userDisplayName !== 'string') data.settings.userDisplayName = '';
    if (typeof data.settings.userAge !== 'number') data.settings.userAge = null;
    if (typeof data.settings.userBirthdate !== 'string') data.settings.userBirthdate = '';
    if (!Array.isArray(data.settings.analysisHistory)) data.settings.analysisHistory = [];
    if (typeof data.settings.analysisTab !== 'string') data.settings.analysisTab = 'overview';
    if (!data.settings.expenseConfirmInputs || typeof data.settings.expenseConfirmInputs !== 'object') {
      data.settings.expenseConfirmInputs = { yearMonth: '', values: {} };
    }
    if (!data.transactions) data.transactions = [];

    return data;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(l => l(this.data));
  }

  // Master CRUD
  addMasterItem(item) {
    const newItem = { ...item, id: crypto.randomUUID(), active: true };
    this.data.master.items.push(newItem);
    this.save();
  }

  updateMasterItem(id, updates) {
    const index = this.data.master.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data.master.items[index] = { ...this.data.master.items[index], ...updates };
      this.save();
    }
  }

  deleteMasterItem(id) {
    const index = this.data.master.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data.master.items.splice(index, 1);
      this.save();
    }
  }

  // Loan CRUD
  addLoan(loan) {
    const newLoan = { ...loan, id: crypto.randomUUID(), active: true };
    this.data.master.loans.push(newLoan);
    this.save();
  }

  updateLoan(id, updates) {
    const index = this.data.master.loans.findIndex(l => l.id === id);
    if (index !== -1) {
      this.data.master.loans[index] = { ...this.data.master.loans[index], ...updates };
      this.save();
    }
  }

  deleteLoan(id) {
    const index = this.data.master.loans.findIndex(loan => loan.id === id);
    if (index !== -1) {
      this.data.master.loans.splice(index, 1);
      this.save();
    }
  }

  // Client CRUD
  addClient(client) {
    const newClient = { ...client, id: crypto.randomUUID(), active: true };
    this.data.master.clients.push(newClient);
    this.save();
  }

  updateClient(id, updates) {
    const index = this.data.master.clients.findIndex(c => c.id === id);
    if (index !== -1) {
      this.data.master.clients[index] = { ...this.data.master.clients[index], ...updates };
      this.save();
    }
  }

  deleteClient(id) {
    const index = this.data.master.clients.findIndex(c => c.id === id);
    if (index !== -1) {
      this.data.master.clients.splice(index, 1);
      this.save();
    }
  }

  // Calendar Event Updates
  updateEvent(yearMonth, eventId, updates) {
    const monthEvents = this.data.calendar.generatedMonths[yearMonth];
    if (monthEvents) {
      const index = monthEvents.findIndex(e => e.id === eventId);
      if (index !== -1) {
        monthEvents[index] = { ...monthEvents[index], ...updates };
        this.save();
      }
    }
  }

  addMonthEvents(yearMonth, newEvents) {
    const existingEvents = this.data.calendar.generatedMonths[yearMonth] || [];
    // 既存のイベントからgcalEventIdを引き継ぐ（重複防止）
    const mergedEvents = newEvents.map(newEvent => {
      const existing = existingEvents.find(e => e.id === newEvent.id);
      if (existing && existing.gcalEventId) {
        return { 
          ...newEvent, 
          gcalEventId: existing.gcalEventId, 
          gcalCalendarId: existing.gcalCalendarId 
        };
      }
      return newEvent;
    });
    this.data.calendar.generatedMonths[yearMonth] = mergedEvents;
    this.save();
  }

  updateSettings(updates) {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
  }

  addSyncLog(entry) {
    if (!this.data.settings) this.data.settings = { ...INITIAL_DATA.settings };
    if (!Array.isArray(this.data.settings.syncHistory)) {
      this.data.settings.syncHistory = [];
    }
    const logEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.data.settings.syncHistory.unshift(logEntry);
    if (this.data.settings.syncHistory.length > 50) {
      this.data.settings.syncHistory = this.data.settings.syncHistory.slice(0, 50);
    }
    this.save();
  }
}

export const store = new Store();
