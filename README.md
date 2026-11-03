# TUKE Helper

A GNOME Shell extension that shows the academic calendar of the Technical
University of Košice in a panel of its own next to Quick Settings. The data
comes from the [FEI KPI schedule API](https://schedule.kpi.fei.tuke.sk/docs).

## Features

- The current week of the semester (or exam week / holidays).
- End of teaching, start and end of the exam period, with a countdown.
- Upcoming events, such as dean's days off.
- Collapsible: click the header to show only the current week. The state is
  remembered.
- A summer semester setting for final-year bachelor's and master's students,
  whose summer semester is shorter.
- The panel is provided by [libpanel](https://github.com/Rayzeq/libpanel), so it
  can be dragged around and coexists with the panels of other extensions.

The schedule is reloaded every hour and from the refresh button in the panel.

## Requirements

- GNOME Shell 49 or higher.

## Installation

```sh
./install.sh
```

Then log out and back in. To build the zip for extensions.gnome.org, run
`./pack.sh`.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
