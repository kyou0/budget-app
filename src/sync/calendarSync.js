import { store as appStore } from '../store.js';
import { googleAuth } from '../auth/googleAuth.js';

const getEventSyncHash = (event) => JSON.stringify({
  name: event.name,
  type: event.type,
  amount: Number(event.amount) || 0,
  status: event.status || 'pending',
  actualDate: event.actualDate || event.originalDate,
  originalDate: event.originalDate,
  calendarId: event.gcalCalendarId || ''
});

export const calendarSync = {
  async listCalendars() {
    try {
      const token = await googleAuth.getAccessToken([
        googleAuth.getScopes().CALENDAR,
        googleAuth.getScopes().CALENDAR_LIST
      ]);
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('Calendar List API Error:', response.status, errText);
        throw new Error(`Failed to fetch calendar list: ${response.status}`);
      }
      const data = await response.json();
      return data.items || [];
    } catch (err) {
      console.error('List calendars error:', err);
      throw err;
    }
  },

  async syncMonthEvents(yearMonth, existingToken = null) {
    try {
      const token = existingToken || await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
      const events = appStore.data.calendar.generatedMonths[yearMonth];
      if (!events) return;

      for (const event of events) {
        await this.syncEvent(yearMonth, event.id, token);
      }
      console.log(`Calendar sync completed for ${yearMonth}`);
    } catch (err) {
      console.error('Calendar sync error:', err);
      throw err;
    }
  },

  async syncEvent(yearMonth, eventId, existingToken = null) {
    const token = existingToken || await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
    const events = appStore.data.calendar.generatedMonths[yearMonth] || [];
    const event = events.find(e => e.id === eventId);
    if (!event) return null;

    const calendarId = event.type === 'income'
      ? (appStore.data.settings?.incomeCalendarId || 'primary')
      : (appStore.data.settings?.expenseCalendarId || 'primary');
    const syncHash = getEventSyncHash({ ...event, gcalCalendarId: event.gcalCalendarId || calendarId });

    if (event.gcalEventId && event.gcalSyncHash === syncHash) {
      return { skipped: true };
    }

    if (!event.gcalEventId) {
      const gcalEvent = await this.createEvent(token, event, calendarId);
      appStore.updateEvent(yearMonth, event.id, {
        gcalEventId: gcalEvent.id,
        gcalCalendarId: calendarId,
        gcalSyncHash: syncHash
      });
      return gcalEvent;
    }

    await this.updateEvent(token, event, event.gcalCalendarId || calendarId);
    appStore.updateEvent(yearMonth, event.id, {
      gcalCalendarId: event.gcalCalendarId || calendarId,
      gcalSyncHash: syncHash
    });
    return { updated: true };
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
                             (event.type === 'income' ? (appStore.data.settings?.incomeCalendarId || 'primary') : (appStore.data.settings?.expenseCalendarId || 'primary'));

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
  },

  async deleteEvent(token, event, calendarId = null) {
    if (!event.gcalEventId) return;

    if (!token) {
      token = await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
    }

    const targetCalendarId = calendarId || event.gcalCalendarId || 
                             (event.type === 'income' ? (appStore.data.settings?.incomeCalendarId || 'primary') : (appStore.data.settings?.expenseCalendarId || 'primary'));

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${event.gcalEventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn('Failed to delete Google Calendar event', event.gcalEventId);
    }
  }
};
