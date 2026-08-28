import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'

import PatientLayout from '@/components/layout/PatientLayout'
import PatientDashboard from '@/pages/patient/PatientDashboard'
import BookVisitPage from '@/pages/patient/BookVisitPage'
import ManageVisitsPage from '@/pages/patient/ManageVisitsPage'
import BookProcedurePage from '@/pages/patient/BookProcedurePage'
import ManageProceduresPage from '@/pages/patient/ManageProceduresPage'
import MedicalRecordPage from '@/pages/patient/MedicalRecordPage'

import DoctorLayout from '@/components/layout/DoctorLayout'
import DoctorDashboard from '@/pages/doctor/DoctorDashboard'
import ManageAppointmentsPage from '@/pages/doctor/ManageAppointmentsPage'
import ManageSlotsPage from '@/pages/doctor/ManageSlotsPage'
import PatientRecordPage from '@/pages/doctor/PatientRecordPage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  {
    path: '/patient',
    element: <ProtectedRoute role="patient"><PatientLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <PatientDashboard /> },
      { path: 'book-visit', element: <BookVisitPage /> },
      { path: 'visits', element: <ManageVisitsPage /> },
      { path: 'book-procedure', element: <BookProcedurePage /> },
      { path: 'procedures', element: <ManageProceduresPage /> },
      { path: 'medical-record', element: <MedicalRecordPage /> },
    ],
  },

  {
    path: '/doctor',
    element: <ProtectedRoute role="doctor"><DoctorLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <DoctorDashboard /> },
      { path: 'appointments', element: <ManageAppointmentsPage /> },
      { path: 'slots', element: <ManageSlotsPage /> },
      { path: 'patients/:patientId/record', element: <PatientRecordPage /> },
    ],
  },
])
