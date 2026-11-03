import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

// API documentation: https://schedule.kpi.fei.tuke.sk/docs
const BASE_URL = 'https://schedule.kpi.fei.tuke.sk/api';

const TIMEOUT_SECONDS = 15;

// Which summer semester of the academic year applies, by `programme` setting
const SUMMER_SEMESTERS = {
    'regular': 'summer_semester',
    'bc-graduating': 'bc_graduating_summer_semester',
    'ing-graduating': 'ing_graduating_summer_semester',
};

// Event types that only concern students of the other graduating programme
const HIDDEN_EVENT_PREFIXES = {
    'regular': [],
    'bc-graduating': ['ing_'],
    'ing-graduating': ['bc_'],
};

export function isCancelled(e) {
    return e instanceof GLib.Error &&
        e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

// API dates are plain `YYYY-MM-DD` days, read here as local midnight
export function parseDate(str) {
    if (!str)
        return null;
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Rounded because a day is not always 24 hours long across a DST change
export function daysBetween(from, to) {
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export class Client {
    constructor(userAgent) {
        this._session = new Soup.Session({
            timeout: TIMEOUT_SECONDS,
            user_agent: userAgent,
        });
    }

    async _get(path, cancellable) {
        const message = Soup.Message.new('GET', `${BASE_URL}${path}`);
        const bytes = await this._session.send_and_read_async(
            message, GLib.PRIORITY_DEFAULT, cancellable);

        const status = message.get_status();
        if (status !== Soup.Status.OK)
            throw new Error(`${path}: HTTP ${status}`);

        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    async fetch(cancellable) {
        const [week, year, events] = await Promise.all([
            this._get('/current-week', cancellable),
            this._get('/academic-years/current', cancellable),
            this._get('/events', cancellable),
        ]);
        return new Schedule(week, year, events);
    }

    destroy() {
        this._session.abort();
        this._session = null;
    }
}

export class Schedule {
    constructor(week, year, events) {
        this.week = week;
        this.year = year;
        this._events = events;
    }

    // `period_type` is one of winter_teaching, winter_exams,
    // summer_teaching, summer_exams and holidays.
    get period() {
        return this.week.period_type;
    }

    get weekNumber() {
        return this.week.week_number ?? null;
    }

    // The semester that is running or, during holidays, the one the
    // next period belongs to.
    isSummer() {
        const period = this.period === 'holidays'
            ? this.week.next_period : this.period;
        return period.startsWith('summer');
    }

    semester(programme) {
        const key = this.isSummer()
            ? SUMMER_SEMESTERS[programme] ?? SUMMER_SEMESTERS.regular
            : 'winter_semester';
        const semester = this.year[key];
        return {
            teachingEnd: parseDate(semester.teaching_end),
            examsStart: parseDate(semester.exams_start),
            examsEnd: parseDate(semester.exams_end),
        };
    }

    upcomingEvents(programme, from) {
        const hidden = HIDDEN_EVENT_PREFIXES[programme] ?? [];
        return this._events
            .filter(event => !hidden.some(prefix => event.type.startsWith(prefix)))
            .map(event => ({
                title: event.title,
                start: parseDate(event.start_date),
                end: parseDate(event.end_date),
                // `HH:MM:SS`, shown without the seconds
                time: event.start_time?.slice(0, 5) ?? null,
            }))
            .filter(event => (event.end ?? event.start) >= from)
            .sort((a, b) => a.start - b.start);
    }
}
