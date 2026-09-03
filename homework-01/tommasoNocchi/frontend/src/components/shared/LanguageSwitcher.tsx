import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation()
  const current = i18n.language

  const toggle = () => {
    const next = current === 'it' ? 'en' : 'it'
    i18n.changeLanguage(next)
    localStorage.setItem('mediclinic_lang', next)
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors ${className}`}
      title={current === 'it' ? 'Switch to English' : 'Passa all\'italiano'}
    >
      <Globe className="h-3.5 w-3.5" />
      {current === 'it' ? 'EN' : 'IT'}
    </button>
  )
}
