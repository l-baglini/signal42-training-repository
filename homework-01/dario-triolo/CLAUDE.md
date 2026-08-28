# EspañolFlow – Spanish Grammar Learning App

## Project Overview
Interactive React SPA for learning Spanish grammar from CEFR levels A1 to B2.
Built entirely using Claude Code (claude-sonnet-4-6) without any manual code writing.

## Tech Stack
- React 18 + React Router v6 (SPA, client-side routing)
- Vite 5 (build tool, dev server on port 3000)
- Vanilla CSS (no UI libraries, custom CSS properties)
- localStorage (progress persistence)

## Project Structure
```
src/
  data/         — Lesson content: a1.js, a2.js, b1.js, b2.js + index.js (re-exports + LEVELS config)
  components/   — Navbar, LevelCard, LessonCard, ContentRenderer, ExerciseBlock, ProgressBar
  pages/        — Home, LevelPage, LessonPage, ProgressPage
  hooks/        — useProgress.js (localStorage-backed progress state)
  utils/        — storage.js (localStorage read/write)
```

## Running the App
```bash
./run.sh        # installs deps if needed, starts dev server
# or manually:
npm install && npm run dev
```
Dev server: http://localhost:3000

## Content Architecture
- 40 lessons total (10 per level: A1, A2, B1, B2)
- Each lesson: content blocks (text, rules, tables, examples, tips, warnings) + 5 exercises
- Exercise types: multiple-choice, fill-blank, translate
- Progress persisted in localStorage key: espanol_flow_progress

## Adding New Lessons
Add to src/data/{level}.js following the Lesson schema in src/data/index.js.
Each lesson needs: id, level, order, title, description, estimatedTime, icon, content[], exercises[] (exactly 5).

## Key Conventions
- No TypeScript (plain JS with JSDoc if needed)
- No external UI libraries
- CSS uses custom properties defined in src/index.css :root
- All routing uses React Router v6 <Routes>/<Route> pattern
