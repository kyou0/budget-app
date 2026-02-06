import { INITIAL_DATA } from './schema.js';

const STORAGE_KEY = 'budget_app_data';

class Store {
  constructor() {
    this.data = this.load();
    this.listeners = [];
  }

  load() {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return INITIAL_DATA;
    try {
      const data = JSON.parse(json);
      return this.migrate(data);
    } catch (e) {
      console.error('Failed to load data', e);
      return INITIAL_DATA;
    }
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
    if (!data.calendar) data.calendar = { generatedMonths: {} };
    if (!data.settings) data.settings = { ...INITIAL_DATA.settings };
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
}

export const store = new Store();
