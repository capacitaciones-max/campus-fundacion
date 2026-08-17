
import { motion } from 'motion/react';
import { LogIn, LogOut, User, Users, ShieldCheck, Crown, Bell } from 'lucide-react';
import { auth, checkTeacherStatus, isPrimaryAdmin, db } from '../lib/firebase';
import { signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
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

  useEffect(() => {
    let unsubRequests: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u?.email) {
        const adminStatus = isPrimaryAdmin(u.email);
        setIsAdmin(adminStatus);
        const teacherStatus = await checkTeacherStatus(u.email);
        setIsTeacher(teacherStatus || adminStatus);

        // Si es Administrador, escuchar solicitudes pendientes
        if (adminStatus) {
          const qReqs = query(collection(db, 'access_requests'));
          unsubRequests = onSnapshot(qReqs, (snap) => {
            setPendingRequestsCount(snap.docs.length);
          }, (err) => {
            console.error("Error listening to requests count:", err);
          });
        } else if (!teacherStatus) {
          // Si es un usuario regular, verificar si es alumno o registrar solicitud automáticamente
          const emailLower = u.email.toLowerCase();
          const isDomainCrucianelli = emailLower.endsWith('@crucianelli.com') || emailLower.endsWith('@fundacioncrucianelli.com');
          
          if (!isDomainCrucianelli) {
            try {
              let isStudent = false;
              try {
                const sDoc = await getDocFromServer(doc(db, 'students', emailLower));
                isStudent = sDoc.exists();
              } catch {
                const cDoc = await getDocFromCache(doc(db, 'students', emailLower));
                isStudent = cDoc.exists();
              }

              if (!isStudent) {
                // Registrar o actualizar solicitud en access_requests para que el admin la vea
                await setDoc(doc(db, 'access_requests', emailLower), {
                  email: emailLower,
                  name: u.displayName || null,
                  photoURL: u.photoURL || null,
                  requestedAt: serverTimestamp(),
                  status: 'pending'
                }, { merge: true });
              }
            } catch (e) {
              console.error("Error al registrar solicitud de acceso:", e);
            }
          }
        }
      } else {
        setIsAdmin(false);
        setIsTeacher(false);
        setPendingRequestsCount(0);
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

  const handleLogin = async () => {
    if (isLoggingIn) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isInIframe = window.self !== window.top;

    if (isIOS && isInIframe) {
      const confirmOpen = window.confirm("Para iniciar sesión con Google en iPhone sin bloqueos de Safari, abre la aplicación en una pestaña nueva. ¿Deseas abrirla ahora?");
      if (confirmOpen) {
        window.open(window.location.href, '_blank');
      }
      return;
    }
    
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.warn("Login failed:", error);
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        alert("No se pudo iniciar sesión con Google. Si estás en iPhone, asegúrate de abrir la app directamente en Safari.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
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
    </header>
  );
}

