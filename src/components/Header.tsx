
import { motion } from 'motion/react';
import { LogIn, LogOut, User, Users, ShieldCheck, Crown } from 'lucide-react';
import { auth, checkTeacherStatus, isPrimaryAdmin } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useState, useEffect } from 'react';
import StudentManager from './StudentManager';

export default function Header() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStudentManagerOpen, setIsStudentManagerOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u?.email) {
        const adminStatus = isPrimaryAdmin(u.email);
        setIsAdmin(adminStatus);
        const teacherStatus = await checkTeacherStatus(u.email);
        setIsTeacher(teacherStatus || adminStatus);
      } else {
        setIsAdmin(false);
        setIsTeacher(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.log("Login popup cancelled by user or another request.");
      } else {
        console.error("Error al iniciar sesión:", error);
        alert("No se pudo iniciar sesión. Por favor, intenta de nuevo.");
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
                    className="flex items-center px-4 py-2 bg-white border-2 border-[#000033] text-[#000033] text-xs font-black rounded-xl hover:bg-gray-50 transition-all gap-2 uppercase tracking-tight shadow-xs cursor-pointer"
                    title="Administración de Alumnos y Docentes (Solo Admins)"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#e31b23]" />
                    <span>Usuarios & Accesos</span>
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

