# App Overview
Cli dungeon crawler game. It creates a procedural file system representing the dungeon, that the user can explore using linux-based commands: the main game loop is to find all the keys in the generated filesystem before the timer ends and the maze locks forever! The keys are files that can be found navigating the rooms directories, and there will be different type of keys with decrypting methods to unlock them.
## Tech Stack & Constraints
- Frontend: Dart Cli app that parses linux-based commands to navigate a procedural filesystem
- Data storage: The game has a save/load/new commands. Every session is procedural generated.
- Styling: Just text and some ASCII art to represent the different keys
## Pages / Screens
Start Menu: options new, load if previous session is present or exit to close the app.
Maze Run Mode: timer activated (and displayed if possible with cool ascii art), run the maze using the available linux inspired commands in the simulated filesystem. 
Key Break Mode: the user has found the key. There are three key types so three key different interactions not yet planned to break them.
End Maze timer: win ascii art and the key collected, lose ascii art and the keys collected out of the total keys.
## Features List
- Must have — start new session and exit the current
- Must have — procedural file system generated at runtime
- Must have — timer to set the start and the end of game session
- Must have — basic linux command processing to navigate the procedural maze
- Must have — key break mode when the key is found
- Must have — collect keys over a session to check the win state at the end of timer
- Must have — final screen with recap of collected keys and win/lost information
- Nice to have — save/load session
- Nice to have — session generation and initialisation art ascii or animation
- Nice to have — simple ascii icon representing keys
- Nice to have — logo in ascii art 
- Nice to have — cool coloured text 
- Nice to have — different key break gameplay associated to the key type (from easy to more difficult)
## Data Model
- Maze run session has a fs system that can be navigated, an _id, keys available in the maze for the user, state of the timer, the collected keys, win/lost flag
- The key has a file name, a type (easy-medium-difficult), a cypher word generated to win the key immediately  

## Key Types

| Type   | Max time lost (forfeit) | Wrong-path penalty | Colour |
|--------|------------------------|--------------------|--------|
| Easy   | −10 s                  | −1 s               | Green  |
| Medium | −20 s                  | −2 s               | Yellow |
| Hard   | −30 s                  | −3 s               | Red    |

**Break-mode options** (same for all types, costs vary):

| Option | Action | Cost on success | Cost on failure |
|--------|--------|-----------------|-----------------|
| 1 — Cypher word | Type the thematically-related cypher word exactly | Free (no time lost) | Free (loop back) |
| 2 — Exact path  | Type the absolute path of the room containing the key | −(maxTimeLost / 2) s | −(type multiplier) s |
| 3 — Forfeit     | Force the lock open, always succeeds | −maxTimeLost s | — |
| back            | Leave the key uncollected, return to navigation | Free | — |

`type multiplier` = 1 for Easy, 2 for Medium, 3 for Hard.
## Command Reference

Navigation commands available in Maze Run Mode:

| Command       | Behaviour |
|---------------|-----------|
| `ls`          | List contents of the current room. Directories shown as `name/`, key-files shown with 🔑 icon. |
| `pwd`         | Print the absolute path of the current room (e.g. `/dungeon/crypt/vault`). |
| `cd <room>`   | Enter a named child directory. |
| `cd ..`       | Go up one level. |
| `cd /`        | Jump to dungeon root. |
| `cat <file>`  | Inspect a key-file: shows its name, type (EASY / MEDIUM / HARD), and a masked cypher hint. |
| `<key-name>`  | Typing the exact filename of a key (e.g. `ember.key`) while in its room triggers Break Mode. |
| `exit`        | Quit the current session. |
| `help`        | Print command reference in-game. |

> Key-file names must be typed exactly as shown by `ls` to trigger Break Mode.
> `cat` inspects a key without triggering Break Mode.

## User Flows
- User start the cli app and start a new maze escape session from the start menu
- The session is initialised, the timer starts and the user can navigate
- The commands will let the user advance in the maze
- The key is found listing the file to check the names 
- When typing the key name in the current room it runs the break mode
- The break mode gameplay loop should be simple and have 3 options
- The user can enter the cypher word when he knows (it’s related to key generated name)
- The user can break the key entering the exact nested path to that room
- The user can lose 10/20/30 sec to break a key based on the key type (easy-medium-strong)
- The user can type ‘back’ to exit the break mode
- When the user collect all the keys in the maze the session ends
- When the timer finishes the session ends
- The final screen shows the collected and missing keys with win or lost ascii art
## UI / Style Preferences
The terminal graphics is very limited so keep it straight but responsive using simple ascii art, icons and colours where possible.