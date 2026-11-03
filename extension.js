import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Schedule from './schedule.js';
import {LibPanel, Panel} from './libs/libpanel/main.js';

// The schedule rarely changes, but the week and the countdowns move on
const REFRESH_INTERVAL_SECONDS = 60 * 60;

const MAX_EVENTS = 5;

function formatDate(date) {
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
}

function formatCountdown(date, from) {
    const days = Schedule.daysBetween(from, date);
    if (days === 0)
        return _('today');
    if (days === 1)
        return _('tomorrow');
    if (days < 0)
        return ngettext('%d day ago', '%d days ago', -days).format(-days);
    return ngettext('in %d day', 'in %d days', days).format(days);
}

function weekTitle(schedule) {
    const week = schedule.weekNumber;
    switch (schedule.period) {
    case 'winter_teaching':
    case 'summer_teaching':
        // Translators: %d is the week of the semester
        return week ? _('Week %d').format(week) : _('Teaching period');
    case 'winter_exams':
    case 'summer_exams':
        // Translators: %d is the week of the exam period
        return week ? _('Exam week %d').format(week) : _('Exam period');
    default:
        return _('Holidays');
    }
}

// Collapsed, this is all the panel shows
const Header = GObject.registerClass(
class Header extends St.Button {
    _init() {
        super._init({
            style_class: 'quick-toggle button tuke-header',
            can_focus: true,
            x_expand: true,
        });

        const box = new St.BoxLayout({x_expand: true});
        this.set_child(box);

        box.add_child(new St.Icon({
            icon_name: 'x-office-calendar-symbolic',
            style_class: 'quick-toggle-icon',
        }));

        this._label = new St.Label({
            style_class: 'quick-toggle-title',
            text: _('Loading…'),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._label);
        this.label_actor = this._label;

        this._arrow = new St.Icon({
            style_class: 'tuke-header-arrow',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._arrow);
    }

    set title(text) {
        this._label.text = text;
    }

    set collapsed(collapsed) {
        this._arrow.icon_name = collapsed ? 'pan-down-symbolic' : 'pan-up-symbolic';
        this.accessible_name = collapsed ? _('Show schedule') : _('Hide schedule');
    }
});

const Details = GObject.registerClass(
class Details extends St.BoxLayout {
    _init(refresh) {
        super._init({
            style_class: 'tuke-details',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });

        const titleBox = new St.BoxLayout({style_class: 'tuke-details-title-box'});
        this._title = new St.Label({
            style_class: 'tuke-details-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        titleBox.add_child(this._title);

        this._refreshButton = new St.Button({
            child: new St.Icon({icon_name: 'view-refresh-symbolic'}),
            style_class: 'icon-button flat',
            accessible_name: _('Refresh'),
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._refreshButton.connect('clicked', () => refresh());
        titleBox.add_child(this._refreshButton);
        this.add_child(titleBox);

        this._content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'tuke-details-content',
        });
        this.add_child(this._content);
    }

    set busy(busy) {
        this._refreshButton.reactive = !busy;
    }

    showError(message) {
        this._title.text = _('TUKE schedule');
        this._content.destroy_all_children();
        this._content.add_child(new St.Label({
            style_class: 'tuke-dim',
            text: message,
        }));
    }

    update(schedule, programme) {
        const from = Schedule.today();
        const semester = schedule.semester(programme);

        this._title.text = schedule.isSummer()
            // Translators: %s is the academic year, e.g. 2026/2027
            ? _('Summer semester %s').format(schedule.year.year)
            : _('Winter semester %s').format(schedule.year.year);

        this._content.destroy_all_children();
        this._addDate(_('End of teaching'), semester.teachingEnd, from);
        this._addDate(_('Exams start'), semester.examsStart, from);
        this._addDate(_('Exams end'), semester.examsEnd, from);

        this._content.add_child(new St.Label({
            style_class: 'tuke-section-title',
            text: _('Upcoming events'),
        }));

        const events = schedule.upcomingEvents(programme, from).slice(0, MAX_EVENTS);
        if (events.length === 0) {
            this._content.add_child(new St.Label({
                style_class: 'tuke-dim',
                text: _('No upcoming events'),
            }));
        }

        for (const event of events) {
            let when = formatDate(event.start);
            if (event.end && event.end > event.start)
                when = `${when} – ${formatDate(event.end)}`;
            if (event.time)
                when = `${when}, ${event.time}`;

            const countdown = event.start > from
                ? formatCountdown(event.start, from) : _('now');
            this._addRow(event.title, when, countdown);
        }
    }

    _addDate(label, date, from) {
        this._addRow(label, formatDate(date), formatCountdown(date, from));
    }

    _addRow(label, value, note) {
        const row = new St.BoxLayout({style_class: 'tuke-row'});

        const labelBox = new St.Label({
            text: label,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        labelBox.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        row.add_child(labelBox);

        const valueBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'tuke-row-value',
        });
        valueBox.add_child(new St.Label({
            text: value,
            x_align: Clutter.ActorAlign.END,
        }));
        valueBox.add_child(new St.Label({
            text: note,
            style_class: 'tuke-dim',
            x_align: Clutter.ActorAlign.END,
        }));
        row.add_child(valueBox);

        this._content.add_child(row);
    }
});

export default class TukeHelperExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._client = new Schedule.Client(`${this.uuid}/${this.metadata.version ?? 'dev'}`);
        this._cancellable = new Gio.Cancellable();
        this._schedule = null;

        LibPanel.enable();
        this._panel = new Panel('main');
        // Nothing in the panel has a minimum width, so match the main one
        this._panel.add_constraint(new Clutter.BindConstraint({
            coordinate: Clutter.BindCoordinate.WIDTH,
            source: LibPanel.main_panel,
        }));
        LibPanel.addPanel(this._panel);

        this._header = new Header();
        this._header.connect('clicked', () => this._settings.set_boolean(
            'collapsed', !this._settings.get_boolean('collapsed')));
        this._panel.addItem(this._header, 2);

        this._details = new Details(() => this._refresh());
        this._panel.addItem(this._details, 2);

        this._settings.connectObject(
            'changed::collapsed', () => this._syncCollapsed(),
            'changed::programme', () => this._render(),
            this);
        this._syncCollapsed();

        this._refresh();
        this._refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL_SECONDS, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
    }

    disable() {
        GLib.source_remove(this._refreshId);
        this._refreshId = null;

        this._cancellable.cancel();
        this._cancellable = null;
        this._fetching = false;
        this._client.destroy();
        this._client = null;

        this._settings.disconnectObject(this);
        this._settings = null;

        // Keeps the position the panel was dragged to
        LibPanel.removePanel(this._panel);
        this._panel.destroy();
        this._panel = null;
        this._header = null;
        this._details = null;
        LibPanel.disable();

        this._schedule = null;
    }

    _syncCollapsed() {
        const collapsed = this._settings.get_boolean('collapsed');
        this._header.collapsed = collapsed;
        this._details.visible = !collapsed;
    }

    async _refresh() {
        // A refresh still in flight answers for this one too
        if (this._fetching)
            return;
        this._fetching = true;
        this._details.busy = true;

        const cancellable = this._cancellable;
        try {
            this._schedule = await this._client.fetch(cancellable);
            this._error = null;
        } catch (e) {
            if (Schedule.isCancelled(e))
                return;
            console.error(`TUKE Helper: could not load the schedule: ${e.message}`);
            this._error = e;
        } finally {
            this._fetching = false;
        }

        if (cancellable.is_cancelled())
            return;
        this._details.busy = false;
        this._render();
    }

    _render() {
        // Old data is still more useful than an error
        if (this._schedule) {
            this._header.title = weekTitle(this._schedule);
            this._details.update(this._schedule, this._settings.get_string('programme'));
        } else if (this._error) {
            this._header.title = _('TUKE schedule unavailable');
            this._details.showError(_('Could not reach schedule.kpi.fei.tuke.sk'));
        }
    }
}
