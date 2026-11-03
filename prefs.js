import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Translated where they are used, once the preferences object exists
const PROGRAMMES = [
    ['regular', N_('Regular')],
    ['bc-graduating', N_('Final year of bachelor\'s')],
    ['ing-graduating', N_('Final year of master\'s')],
];

// Only marks the strings above for extraction by xgettext
function N_(str) {
    return str;
}

export default class TukeHelperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const programmeRow = new Adw.ComboRow({
            title: _('Summer semester schedule'),
            subtitle: _('Final-year students have a shorter summer semester'),
            model: Gtk.StringList.new(PROGRAMMES.map(([, label]) => _(label))),
            selected: PROGRAMMES.findIndex(([nick]) => nick === settings.get_string('programme')),
        });
        programmeRow.connect('notify::selected',
            () => settings.set_string('programme', PROGRAMMES[programmeRow.selected][0]));

        const collapsedRow = new Adw.SwitchRow({
            title: _('Collapsed'),
            subtitle: _('Only show the current week'),
        });
        settings.bind('collapsed', collapsedRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const group = new Adw.PreferencesGroup();
        group.add(programmeRow);
        group.add(collapsedRow);

        const page = new Adw.PreferencesPage();
        page.add(group);
        window.add(page);
    }
}
