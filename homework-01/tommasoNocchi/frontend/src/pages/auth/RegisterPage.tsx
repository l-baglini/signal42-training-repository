import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stethoscope, User, Briefcase, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { authApi } from '@/api/auth'
import { specialtiesApi } from '@/api/appointments'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import type { Specialty } from '@/types'

type PatientData = {
  email: string; password: string; confirmPassword: string
  first_name: string; last_name: string; phone?: string
  date_of_birth?: string; blood_type?: string; fiscal_code?: string; allergies?: string
}
type DoctorData = {
  email: string; password: string; confirmPassword: string
  first_name: string; last_name: string; phone?: string
  specialty_id: string; license_number?: string; bio?: string; years_experience?: string
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [step, setStep] = useState(1)
  const [role, setRole] = useState<'patient' | 'doctor' | null>(null)
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [error, setError] = useState('')
  const { t } = useTranslation()

  const patientSchema = useMemo(() => z.object({
    email: z.string().email(t('auth.invalidEmail')),
    password: z.string().min(8, t('auth.minChars')),
    confirmPassword: z.string(),
    first_name: z.string().min(1, t('auth.firstNameRequired')),
    last_name: z.string().min(1, t('auth.lastNameRequired')),
    phone: z.string().optional(),
    date_of_birth: z.string().optional(),
    blood_type: z.string().optional(),
    fiscal_code: z.string().optional(),
    allergies: z.string().optional(),
  }).refine(d => d.password === d.confirmPassword, { message: t('auth.passwordMismatch'), path: ['confirmPassword'] }), [t])

  const doctorSchema = useMemo(() => z.object({
    email: z.string().email(t('auth.invalidEmail')),
    password: z.string().min(8, t('auth.minChars')),
    confirmPassword: z.string(),
    first_name: z.string().min(1, t('auth.firstNameRequired')),
    last_name: z.string().min(1, t('auth.lastNameRequired')),
    phone: z.string().optional(),
    specialty_id: z.string().min(1, t('auth.specialtyRequired')),
    license_number: z.string().optional(),
    bio: z.string().optional(),
    years_experience: z.string().optional(),
  }).refine(d => d.password === d.confirmPassword, { message: t('auth.passwordMismatch'), path: ['confirmPassword'] }), [t])

  useEffect(() => {
    specialtiesApi.list().then(setSpecialties).catch(() => {})
  }, [])

  const patientForm = useForm<PatientData>({ resolver: zodResolver(patientSchema) })
  const doctorForm = useForm<DoctorData>({ resolver: zodResolver(doctorSchema) })

  const stepDesc = step === 1 ? t('auth.selectAccountType') : step === 2 ? t('auth.personalInfo') : t('auth.profileData')

  const handleRoleSelect = (r: 'patient' | 'doctor') => {
    setRole(r)
    setStep(2)
  }

  const handleStep2Submit = async () => {
    if (role === 'patient') {
      const valid = await patientForm.trigger(['email', 'password', 'confirmPassword', 'first_name', 'last_name'])
      if (valid) setStep(3)
    } else {
      const valid = await doctorForm.trigger(['email', 'password', 'confirmPassword', 'first_name', 'last_name'])
      if (valid) setStep(3)
    }
  }

  const submitPatient = async (data: PatientData) => {
    setError('')
    try {
      const res = await authApi.register({
        email: data.email, password: data.password, role: 'patient',
        first_name: data.first_name, last_name: data.last_name, phone: data.phone,
        date_of_birth: data.date_of_birth, blood_type: data.blood_type,
        fiscal_code: data.fiscal_code, allergies: data.allergies,
      })
      login(res.user, res.access_token, res.refresh_token)
      navigate('/patient/dashboard')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || t('auth.registrationError'))
    }
  }

  const submitDoctor = async (data: DoctorData) => {
    setError('')
    try {
      const res = await authApi.register({
        email: data.email, password: data.password, role: 'doctor',
        first_name: data.first_name, last_name: data.last_name, phone: data.phone,
        specialty_id: parseInt(data.specialty_id), license_number: data.license_number,
        bio: data.bio, years_experience: data.years_experience ? parseInt(data.years_experience) : undefined,
      })
      login(res.user, res.access_token, res.refresh_token)
      navigate('/doctor/dashboard')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || t('auth.registrationError'))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Stethoscope className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">{t('auth.createAccount')}</CardTitle>
          <CardDescription>{stepDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleRoleSelect('patient')}
                  className="flex flex-col items-center gap-3 p-6 border-2 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <User className="h-10 w-10 text-blue-600" />
                  <span className="font-semibold text-gray-700">{t('auth.patient')}</span>
                  <span className="text-xs text-gray-500 text-center">{t('auth.patientDesc')}</span>
                </button>
                <button
                  onClick={() => handleRoleSelect('doctor')}
                  className="flex flex-col items-center gap-3 p-6 border-2 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
                >
                  <Briefcase className="h-10 w-10 text-green-600" />
                  <span className="font-semibold text-gray-700">{t('auth.doctor')}</span>
                  <span className="text-xs text-gray-500 text-center">{t('auth.doctorDesc')}</span>
                </button>
              </div>
              <p className="text-center text-sm text-gray-600 mt-4">
                {t('auth.alreadyHaveAccount')}{' '}
                <Link to="/login" className="text-blue-600 hover:underline font-medium">{t('auth.signInLink')}</Link>
              </p>
            </>
          )}

          {step === 2 && role === 'patient' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('auth.firstName')}</Label>
                  <Input {...patientForm.register('first_name')} placeholder="Mario" />
                  {patientForm.formState.errors.first_name && <p className="text-xs text-red-500">{patientForm.formState.errors.first_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('auth.lastName')}</Label>
                  <Input {...patientForm.register('last_name')} placeholder="Rossi" />
                  {patientForm.formState.errors.last_name && <p className="text-xs text-red-500">{patientForm.formState.errors.last_name.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('auth.email')}</Label>
                <Input type="email" {...patientForm.register('email')} placeholder={t('auth.emailPlaceholder')} />
                {patientForm.formState.errors.email && <p className="text-xs text-red-500">{patientForm.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.password')}</Label>
                <Input type="password" {...patientForm.register('password')} />
                {patientForm.formState.errors.password && <p className="text-xs text-red-500">{patientForm.formState.errors.password.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.confirmPassword')}</Label>
                <Input type="password" {...patientForm.register('confirmPassword')} />
                {patientForm.formState.errors.confirmPassword && <p className="text-xs text-red-500">{patientForm.formState.errors.confirmPassword.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.phone')}</Label>
                <Input type="tel" {...patientForm.register('phone')} placeholder="+39 333 1234567" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t('auth.back')}
                </Button>
                <Button type="button" onClick={handleStep2Submit} className="flex-1">
                  {t('auth.next')} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && role === 'doctor' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('auth.firstName')}</Label>
                  <Input {...doctorForm.register('first_name')} placeholder="Mario" />
                  {doctorForm.formState.errors.first_name && <p className="text-xs text-red-500">{doctorForm.formState.errors.first_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('auth.lastName')}</Label>
                  <Input {...doctorForm.register('last_name')} placeholder="Rossi" />
                  {doctorForm.formState.errors.last_name && <p className="text-xs text-red-500">{doctorForm.formState.errors.last_name.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('auth.email')}</Label>
                <Input type="email" {...doctorForm.register('email')} placeholder={t('auth.emailPlaceholder')} />
                {doctorForm.formState.errors.email && <p className="text-xs text-red-500">{doctorForm.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.password')}</Label>
                <Input type="password" {...doctorForm.register('password')} />
                {doctorForm.formState.errors.password && <p className="text-xs text-red-500">{doctorForm.formState.errors.password.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.confirmPassword')}</Label>
                <Input type="password" {...doctorForm.register('confirmPassword')} />
                {doctorForm.formState.errors.confirmPassword && <p className="text-xs text-red-500">{doctorForm.formState.errors.confirmPassword.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.phone')}</Label>
                <Input type="tel" {...doctorForm.register('phone')} placeholder="+39 333 1234567" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t('auth.back')}
                </Button>
                <Button type="button" onClick={handleStep2Submit} className="flex-1">
                  {t('auth.next')} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && role === 'patient' && (
            <form onSubmit={patientForm.handleSubmit(submitPatient)} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('auth.dateOfBirth')}</Label>
                <Input type="date" {...patientForm.register('date_of_birth')} />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.bloodType')}</Label>
                <Select onValueChange={(v) => patientForm.setValue('blood_type', v)}>
                  <SelectTrigger><SelectValue placeholder={t('auth.select')} /></SelectTrigger>
                  <SelectContent>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'].map(bt => (
                      <SelectItem key={bt} value={bt}>{bt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('auth.fiscalCode')}</Label>
                <Input {...patientForm.register('fiscal_code')} placeholder="RSSMRA80A01H501X" />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.allergies')}</Label>
                <Textarea {...patientForm.register('allergies')} placeholder={t('auth.allergiesPlaceholder')} />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t('auth.back')}
                </Button>
                <Button type="submit" className="flex-1" disabled={patientForm.formState.isSubmitting}>
                  {patientForm.formState.isSubmitting ? t('auth.registering') : t('auth.registerBtn')}
                </Button>
              </div>
            </form>
          )}

          {step === 3 && role === 'doctor' && (
            <form onSubmit={doctorForm.handleSubmit(submitDoctor)} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('auth.specialty')}</Label>
                <Select onValueChange={(v) => doctorForm.setValue('specialty_id', v)}>
                  <SelectTrigger><SelectValue placeholder={t('auth.selectSpecialty')} /></SelectTrigger>
                  <SelectContent>
                    {specialties.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {doctorForm.formState.errors.specialty_id && <p className="text-xs text-red-500">{doctorForm.formState.errors.specialty_id.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t('auth.licenseNumber')}</Label>
                <Input {...doctorForm.register('license_number')} placeholder="ES12345" />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.yearsExperience')}</Label>
                <Input type="number" {...doctorForm.register('years_experience')} placeholder="10" />
              </div>
              <div className="space-y-2">
                <Label>{t('auth.professionalBio')}</Label>
                <Textarea {...doctorForm.register('bio')} placeholder={t('auth.bioPLaceholder')} />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t('auth.back')}
                </Button>
                <Button type="submit" className="flex-1" disabled={doctorForm.formState.isSubmitting}>
                  {doctorForm.formState.isSubmitting ? t('auth.registering') : t('auth.registerBtn')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
