import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import Home from './pages/Home.jsx'
import LevelPage from './pages/LevelPage.jsx'
import LessonPage from './pages/LessonPage.jsx'
import ProgressPage from './pages/ProgressPage.jsx'

export default function App() {
  return (
    <div className="page-wrapper">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/level/:levelId" element={<LevelPage />} />
        <Route path="/lesson/:lessonId" element={<LessonPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
