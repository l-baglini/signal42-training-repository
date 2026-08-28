export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center px-4">
      <span className="text-5xl mb-4">✊</span>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pagina non trovata</h1>
      <p className="text-sm text-gray-500 mb-6">La pagina che cerchi non esiste o è stata spostata.</p>
      <a
        href="/"
        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
      >
        Torna alla mappa
      </a>
    </div>
  )
}
