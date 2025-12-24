# Pomokanban Plugin

Pomodoro enhanced Kanban plugin in [Obsidian](https://obsidian.md/) with integrated Pomodoro timers, automatic breaks/rounds, and per‑card time logging.

## Features

### Kanban Board Management
- Create and manage markdown-backed Kanban boards
- Drag and drop cards between lanes
- Archive completed cards
- Search and filter functionality

### Pomodoro Timer Integration
- **Pomodoro Timer**: 25-minute focused work sessions (configurable)
- **Stopwatch**: Free-form timing for flexible work sessions
- **Break Timer**: Automatic short (5min) and long (15min) breaks
- **Auto Pomodoro Rounds**: Set automatic pomodoro rounds that continue after breaks
- **Time Logging**: Automatic logging of work sessions to card markdown
- **Interrupt Tracking**: Track why you stopped a session (for sessions longer than 1 minute)
- **Sound Notifications**: Audio alerts when sessions complete
- **Due Date Management**: Set due dates for tasks with visual indicators
- **Estimate Time**: Set estimated time for tasks with easy-to-use input dialog

## Auto Pomodoro Rounds

Set automatic pomodoro rounds that will automatically start after each break ends:

1. **Set Auto Rounds**: In Timer Settings, configure "Auto pomodoro rounds" to a number greater than 0
2. **Start First Pomodoro**: Begin your first pomodoro session manually
3. **Automatic Continuation**: After each pomodoro completes and break ends, the next pomodoro starts automatically
4. **Round Tracking**: The system tracks your progress and shows notifications like "Auto-starting round 2/4"
5. **Completion**: When all rounds are completed, you'll see "Completed X automatic pomodoro rounds!"

## Timer Behavior
- **1-Minute Rule**: If you stop a timer within the first minute, it stops immediately without asking for a reason
- **Session Logging**: All sessions longer than 1 minute are automatically logged to the card's markdown
- **Interrupt Reasons**: For longer sessions, you can specify why you stopped
- **Card Switching**: Switch between cards while maintaining timer state

## Due Date Management

Set due dates for tasks with visual indicators:

- **Easy Due Date Setting**: Right-click on timer button and select "Add Due Date"
- **Visual Indicators**: Due dates are displayed in red, bold text on the right side of the focused time line
- **Click to Edit**: Click on any due date to modify or remove it
- **Single Due Date Per Card**: Each card can only have one due date

## Estimate Time Management

Set estimated time for tasks to help with planning:

- **Easy Estimate Time Setting**: Right-click on timer button and select "Add Estimate Time"
- **Hour and Minute Input**: Simple dialog with separate fields for hours and minutes
- **Visual Display**: Estimate time is displayed in the card's metadata area
- **Edit and Delete**: Modify existing estimate times or delete them completely

## Timelog Display Control

Control how timelog entries are displayed:

- **Show timelog**: Controls whether timelog entries are displayed at all (global setting)
- **Hide timelog in cards**: When enabled, timelog entries are hidden in card view but remain visible in markdown view
- **Clean Card View**: Hide timelog entries in the Kanban board for a cleaner interface
- **Preserve Data**: Timelog data remains intact in the markdown source

## Theme Compatibility

The plugin automatically adapts to all Obsidian themes:

- **CSS Variables**: Uses Obsidian's standard CSS variables for consistent appearance
- **Dark/Light Mode**: Automatically adapts to your theme's dark or light mode
- **Color Harmony**: All colors, borders, and backgrounds use theme-aware variables
- **Typography**: Respects your theme's font settings and text styling

## Internationalization Support

The plugin supports multiple languages:

- **Automatic Language Detection**: Detects your Obsidian language setting
- **Complete Translation**: All timer-related interface elements are translated
- **Supported Languages**: English, Simplified Chinese, Traditional Chinese
- **Fallback Support**: Falls back to English if a translation is missing

## Installation

1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "Pomodoro Kanban"
4. Install and enable the plugin

## Plugin Compatibility

This plugin is designed to work alongside the original Kanban plugin without conflicts:

- **Unique Plugin ID**: Uses `pomodoro-kanban` to avoid conflicts with the original `obsidian-kanban` plugin
- **Unique View Type**: Uses `pomodoro-kanban` view type instead of `kanban`
- **Unique Icon**: Uses `pomodoro-tomato` icon instead of `tomato`
- **Unique Frontmatter Key**: Uses `pomodoro-kanban-plugin` instead of `kanban-plugin`

Both plugins can be enabled simultaneously without interfering with each other's functionality.

## Usage

1. **Create a Kanban Board**: Use the command palette or right-click in the file explorer
2. **Add Cards**: Click the "+" button in any lane to add new cards
3. **Start Timer**: Right-click on a card's timer button to start a pomodoro or stopwatch
4. **Set Due Dates**: Right-click on timer button and select "Add Due Date"
5. **Set Estimate Time**: Right-click on timer button and select "Add Estimate Time"
6. **Drag and Drop**: Move cards between lanes to track progress

## Settings

Configure the plugin through Obsidian Settings > Community Plugins > Pomodoro Kanban:

- **Timer Durations**: Set pomodoro, short break, and long break durations
- **Auto Pomodoro Rounds**: Configure automatic pomodoro rounds
- **Sound Notifications**: Enable/disable audio alerts
- **Interrupt Reasons**: Customize reasons for stopping timers
- **Display Options**: Control timelog visibility and card appearance

## Support

- [GitHub Issues](https://github.com/Ahhhh2016/pomodoro-kanban/issues) - Report bugs and request features

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

This plugin is based on the excellent [Obsidian Kanban Plugin](https://github.com/mgmeyers/obsidian-kanban) by [mgmeyers](https://github.com/mgmeyers). The original plugin provided the foundation for the Kanban board functionality, and this fork extends it with Pomodoro timer features.

I am grateful to the original author and contributors for their work on the base Kanban functionality.

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE.md](LICENSE.md) file for details.
