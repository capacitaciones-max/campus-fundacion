
import { motion } from 'motion/react';
import { LogIn, LogOut, User, Users, ShieldCheck, Crown, Bell } from 'lucide-react';
import { auth, checkTeacherStatus, isPrimaryAdmin, db } from '../lib/firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDocFromServer, getDocFromCache, setDoc, serverTimestamp } from 'firebase/firestore';
import StudentManager from './StudentManager';

export default function Header() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [isStudentManagerOpen, setIsStudentManagerOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualEmailInput, setManualEmailInput] = useState('');

  useEffect(() => {
    // Check manual session stored for iPhone/Safari fallback
    const savedEmail = localStorage.getItem('campus_manual_email');
    if (savedEmail) {
      const mockUser = {
        uid: 'manual_' + savedEmail,
        email: savedEmail,
        displayName: savedEmail === 'capacitaciones@fundacioncrucianelli.com' ? 'Capacitaciones Fundación' : 'Sole Petetta',
        photoURL: null,
        emailVerified: true,
        isAnonymous: false,
        tenantId: null,
        providerData: [],
      } as unknown as FirebaseUser;
      setUser(mockUser);
      const adminStatus = isPrimaryAdmin(savedEmail);
      setIsAdmin(adminStatus);
      setIsTeacher(true);
    }

    // Procesar resultado de redirección al cargar la app en iOS/móviles
    getRedirectResult(auth).catch((err) => {
      console.warn("Redirect result error:", err);
    });

    let unsubRequests: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!localStorage.getItem('campus_manual_email')) {
        setUser(u);
      }
      const activeUser = u || (localStorage.getItem('campus_manual_email') ? { email: localStorage.getItem('campus_manual_email') } as any : null);
      
      if (activeUser?.email) {
        const emailVal = activeUser.email;
        const adminStatus = isPrimaryAdmin(emailVal);
        setIsAdmin(adminStatus);
        const teacherStatus = await checkTeacherStatus(emailVal);
        setIsTeacher(teacherStatus || adminStatus);

        // Si es Administrador, escuchar solicitudes pendientes
        if (adminStatus) {
          const qReqs = query(collection(db, 'access_requests'));
          unsubRequests = onSnapshot(qReqs, (snap) => {
            setPendingRequestsCount(snap.docs.length);
          }, (err) => {
            console.error("Error listening to requests count:", err);
          });
        }
      } else {
        if (!localStorage.getItem('campus_manual_email')) {
          setIsAdmin(false);
          setIsTeacher(false);
          setPendingRequestsCount(0);
        }
        if (unsubRequests) {
          unsubRequests();
          unsubRequests = null;
        }
      }
    });

    return () => {
      unsubscribe();
      if (unsubRequests) unsubRequests();
    };
  }, []);

  const handleManualLogin = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    localStorage.setItem('campus_manual_email', trimmed);
    const mockUser = {
      uid: 'manual_' + trimmed,
      email: trimmed,
      displayName: trimmed === 'capacitaciones@fundacioncrucianelli.com' ? 'Capacitaciones Fundación' : 'Docente Autorizado',
      photoURL: null,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [],
    } as unknown as FirebaseUser;
    setUser(mockUser);
    const adminStatus = isPrimaryAdmin(trimmed);
    setIsAdmin(adminStatus);
    setIsTeacher(true);
    setIsManualModalOpen(false);
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    // Check if it's iOS Safari where redirect result is often lost due to ITP
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      setIsManualModalOpen(true);
      return;
    }

    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
      setIsLoggingIn(false);
    } catch (error: any) {
      console.warn("Popup login failed:", error);
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          console.error("Redirect fallback error:", redirectErr);
          setIsLoggingIn(false);
          setIsManualModalOpen(true);
        }
      } else {
        setIsLoggingIn(false);
      }
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('campus_manual_email');
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    setIsTeacher(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 py-6 px-4 sm:px-6 lg:px-8 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#000033] flex items-center justify-center rounded-lg shadow-inner">
            <span className="text-white font-black text-2xl leading-none">FN</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black text-[#000033] tracking-tight leading-none uppercase">Fundación</span>
            <span className="text-sm font-bold text-[#e31b23] tracking-widest leading-none uppercase">Nazareno Crucianelli</span>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="text-center md:text-right hidden sm:block">
            <h1 className="text-xl font-bold text-[#000033] leading-tight">
              Procesos Industriales Primarios
            </h1>
            <p className="text-sm text-gray-500 font-medium">
              Capacitación Técnica Profesional
            </p>
          </div>

          <div className="flex items-center gap-3 pl-6 border-l border-gray-100">
            {user ? (
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <button 
                    onClick={() => setIsStudentManagerOpen(true)}
                    className="relative flex items-center px-4 py-2 bg-white border-2 border-[#000033] text-[#000033] text-xs font-black rounded-xl hover:bg-gray-50 transition-all gap-2 uppercase tracking-tight shadow-xs cursor-pointer"
                    title="Administración de Alumnos y Docentes (Solo Admins)"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#e31b23]" />
                    <span>Usuarios & Accesos</span>
                    {pendingRequestsCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-[#e31b23] text-white text-[10px] font-black rounded-full animate-pulse shadow-xs">
                        <Bell className="w-2.5 h-2.5" />
                        {pendingRequestsCount}
                      </span>
                    )}
                  </button>
                )}
                
                <div className="text-right hidden lg:block">
                  <p className="text-xs font-bold text-gray-900">{user.displayName || user.email}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin ? 'text-amber-600' : isTeacher ? 'text-[#e31b23]' : 'text-gray-400'
                  }`}>
                    {isAdmin ? 'Administrador' : isTeacher ? 'Docente' : 'Alumno / Visitante'}
                  </p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-[#e31b23] hover:bg-red-50 rounded-lg transition-all group cursor-pointer"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={`flex items-center px-6 py-2 bg-[#000033] text-white text-xs font-black rounded-xl hover:bg-[#000044] transition-all gap-2 uppercase tracking-widest cursor-pointer ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoggingIn ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {isLoggingIn ? 'Cargando...' : 'Acceso'}
              </button>
            )}
          </div>
        </div>
      </div>

      <StudentManager 
        isOpen={isStudentManagerOpen} 
        onClose={() => setIsStudentManagerOpen(false)} 
      />

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-lg font-black text-[#000033] mb-2">Acceso Rápido en iPhone (Safari)</h3>
            <p className="text-xs text-gray-600 mb-4">
              Debido a las restricciones de seguridad y bloqueo de almacenamiento cruzado de Safari en iOS, puedes iniciar sesión instantáneamente seleccionando tu correo autorizado:
            </p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => handleManualLogin('capacitaciones@fundacioncrucianelli.com')}
                className="w-full text-left px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-[#000033]">capacitaciones@fundacioncrucianelli.com</p>
                  <p className="text-[10px] text-red-600 font-semibold">Administrador / Fundación</p>
                </div>
                <span className="text-xs font-bold text-[#e31b23]">Ingresar →</span>
              </button>

              <button
                onClick={() => handleManualLogin('sole.petetta@gmail.com')}
                className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-[#000033]">sole.petetta@gmail.com</p>
                  <p className="text-[10px] text-gray-500 font-semibold">Administrador / Docente</p>
                </div>
                <span className="text-xs font-bold text-[#000033]">Ingresar →</span>
              </button>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="block text-[11px] font-bold text-gray-700 mb-1">O ingresa otro correo autorizado:</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={manualEmailInput}
                  onChange={(e) => setManualEmailInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-hidden focus:border-[#000033]"
                />
                <button
                  onClick={() => handleManualLogin(manualEmailInput)}
                  className="px-4 py-2 bg-[#000033] text-white text-xs font-bold rounded-xl hover:bg-[#000044] cursor-pointer"
                >
                  Acceder
                </button>
              </div>
            </div>

            <div className="mt-6 text-right">
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

