import { store } from '../store.js';
import { googleAuth } from '../auth/googleAuth.js';

export const calendarSync = {
  async listCalendars() {
    try {
      const token = await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch calendar list');
      const data = await response.json();
      return data.items;
    } catch (err) {
      console.error('List calendars error:', err);
      throw err;
    }
  },

  async syncMonthEvents(yearMonth) {
    try {
      const token = await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
      const events = store.data.calendar.generatedMonths[yearMonth];
      if (!events) return;

      for (const event of events) {
        const calendarId = event.type === 'income' 
          ? (store.data.settings?.incomeCalendarId || 'primary')
          : (store.data.settings?.expenseCalendarId || 'primary');

        if (!event.gcalEventId) {
          const gcalEvent = await this.createEvent(token, event, calendarId);
          store.updateEvent(yearMonth, event.id, { 
            gcalEventId: gcalEvent.id,
            gcalCalendarId: calendarId 
          });
        } else {
          await this.updateEvent(token, event, event.gcalCalendarId || calendarId);
        }
      }
      console.log(`Calendar sync completed for ${yearMonth}`);
    } catch (err) {
      console.error('Calendar sync error:', err);
      throw err;
    }
  },

  async createEvent(token, event, calendarId = 'primary') {
    const gcalEvent = {
      summary: `${event.type === 'income' ? '💰' : '💸'} ${event.name}`,
      description: `Budget App Event ID: ${event.id}\nAmount: ${event.amount}`,
      start: { date: event.originalDate },
      end: { date: event.originalDate },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 * 3 }, // 3日前
          { method: 'popup', minutes: 9 * 60 }        // 当日朝9時
        ]
      }
    };

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gcalEvent)
    });

    if (!response.ok) throw new Error('Failed to create Google Calendar event');
    return await response.json();
  },

  async updateEvent(token, event, calendarId = null) {
    if (!event.gcalEventId) return;
    
    // トークンがない場合は取得を試みる
    if (!token) {
      token = await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
    }

    const targetCalendarId = calendarId || event.gcalCalendarId || 
                             (event.type === 'income' ? (store.data.settings?.incomeCalendarId || 'primary') : (store.data.settings?.expenseCalendarId || 'primary'));

    const gcalEvent = {
      summary: `${event.status === 'paid' ? '✅' : (event.type === 'income' ? '💰' : '💸')} ${event.name}`,
      description: `Budget App Event ID: ${event.id}\nAmount: ${event.amount}\nStatus: ${event.status}`,
      start: { date: event.actualDate || event.originalDate },
      end: { date: event.actualDate || event.originalDate }
    };

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${event.gcalEventId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gcalEvent)
    });

    if (!response.ok) {
      console.warn('Failed to update Google Calendar event', event.gcalEventId);
    }
  }
};
