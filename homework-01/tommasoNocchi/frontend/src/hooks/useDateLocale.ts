import { useTranslation } from 'react-i18next'
import { it } from 'date-fns/locale'
import { enUS } from 'date-fns/locale'

export function useDateLocale() {
  const { i18n } = useTranslation()
  return i18n.language === 'it' ? it : enUS
}
