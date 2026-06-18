import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stethoscope } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'

type FormData = { email: string; password: string }

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [error, setError] = useState('')
  const { t } = useTranslation()

  const schema = useMemo(() => z.object({
    email: z.string().email(t('auth.invalidEmail')),
    password: z.string().min(1, t('auth.passwordRequired')),
  }), [t])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      const res = await authApi.login(data)
      login(res.user, res.access_token, res.refresh_token)
      navigate(res.user.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || t('auth.invalidCredentials'))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Stethoscope className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">MediClinic</CardTitle>
          <CardDescription>{t('auth.signInDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
              {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>
          <p className="text-center text-sm text-gray-600 mt-4">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-blue-600 hover:underline font-medium">{t('auth.register')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
